import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "../../api/ApiClient";
import type { Label } from "../../api/types";
import { LabelsPage } from "./LabelsPage";
import { labelApi } from "./labelApi";
const label: Label = {
  id: "label-1",
  name: "Frontend",
  color: "blue",
  active: true,
  version: 0,
};
function show() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider
        router={createMemoryRouter(
          [{ path: "/admin/labels", element: <LabelsPage /> }],
          { initialEntries: ["/admin/labels"] },
        )}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(labelApi, "list").mockResolvedValue({
    items: [label],
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });
});
describe("label catalog", () => {
  it("starts with active labels, can include inactive labels and confirms deactivation before changing associations", async () => {
    const update = vi
      .spyOn(labelApi, "update")
      .mockResolvedValue({ ...label, active: false, version: 1 });
    show();
    await screen.findByRole("table", { name: "Catalogo etichette" });
    expect(labelApi.list).toHaveBeenCalledWith(
      expect.stringContaining("active=true"),
      expect.any(AbortSignal),
    );
    await userEvent.setup().click(screen.getByRole("button", { name: /^Stato etichetta/ }));
    await userEvent.setup().click(screen.getByRole("option", { name: "Tutte" }));
    expect(labelApi.list).toHaveBeenLastCalledWith(expect.stringContaining("active=all"), expect.any(AbortSignal));
    await userEvent.setup().click(
      screen.getAllByRole("button", {
        name: "Disattiva etichetta Frontend",
      })[0],
    );
    expect(update).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", {
      name: "Disattiva etichetta",
    });
    expect(dialog).toHaveTextContent(
      "Le associazioni di Frontend già presenti restano",
    );
    await userEvent
      .setup()
      .click(
        within(dialog).getByRole("button", { name: "Conferma disattivazione" }),
      );
    await screen.findByText(
      "Etichetta disattivata. Le associazioni esistenti restano.",
    );
    expect(update).toHaveBeenCalledWith(label.id, {
      name: "Frontend",
      color: "blue",
      active: false,
      expectedVersion: 0,
    });
  });
  it("preserves a duplicate-name creation and exposes the field error", async () => {
    vi.spyOn(labelApi, "create").mockRejectedValue(
      new ApiError({
        type: "urn:test",
        title: "Conflitto",
        status: 409,
        detail: "Etichetta esistente",
        instance: "/admin/labels",
        code: "LABEL_ALREADY_EXISTS",
        requestId: "",
        fieldErrors: [],
      }),
    );
    show();
    await screen.findByRole("table", { name: "Catalogo etichette" });
    const input = screen.getByLabelText(/^Nome nuova etichetta/);
    await userEvent.setup().type(input, "Frontend");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Crea etichetta" }));
    await screen.findByText("Esiste già un'etichetta con questo nome.");
    expect(input).toHaveValue("Frontend");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
  it("shows creation beside the catalog and previews the current draft", async () => {
    show();
    await screen.findByRole("table", { name: "Catalogo etichette" });
    const input = screen.getByLabelText(/^Nome nuova etichetta/);
    expect(input).toBeVisible();
    await userEvent.setup().type(input, "Accessibilità");
    const preview = screen.getByText("Anteprima").nextElementSibling;
    expect(preview).toHaveTextContent("Accessibilità");
    expect(preview).toHaveClass("badge-gray");
    const color = screen.getByRole("button", { name: /^Colore/ });
    await userEvent.setup().click(color);
    const purple = screen.getByRole("option", { name: "Viola" });
    expect(purple.querySelector(".label-color-swatch.color-purple")).toBeInTheDocument();
    await userEvent.setup().click(purple);
    expect(preview).toHaveClass("badge-purple");
    expect(color.querySelector(".label-color-swatch.color-purple")).toBeInTheDocument();
    expect(color).toHaveFocus();
    expect(screen.getByRole("table", { name: "Catalogo etichette" })).toBeInTheDocument();
  });
  it("preserves deactivation across a version conflict even when the current state is already inactive", async () => {
    const latest = { ...label, name: "Frontend corrente", active: false, version: 2 };
    const update = vi.spyOn(labelApi, "update")
      .mockRejectedValueOnce(new ApiError({
        type: "urn:test", title: "Conflitto", status: 409,
        detail: "Versione aggiornata", instance: "/admin/labels",
        code: "VERSION_CONFLICT", requestId: "", fieldErrors: [],
      }))
      .mockResolvedValueOnce(latest);
    vi.spyOn(labelApi, "get").mockResolvedValue(latest);
    show();
    await screen.findByRole("table", { name: "Catalogo etichette" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Disattiva etichetta Frontend" }));
    await user.click(within(screen.getByRole("dialog", { name: "Disattiva etichetta" })).getByRole("button", { name: "Conferma disattivazione" }));
    const conflict = await screen.findByRole("dialog", { name: "Etichetta aggiornata da un altro utente" });
    await user.click(await within(conflict).findByRole("button", { name: "Mantieni la bozza e usa la versione corrente" }));
    expect(update).toHaveBeenCalledTimes(1);
    const confirmation = await screen.findByRole("dialog", { name: "Disattiva etichetta" });
    await user.click(within(confirmation).getByRole("button", { name: "Conferma disattivazione" }));
    expect(update).toHaveBeenLastCalledWith(label.id, {
      name: latest.name, color: latest.color, active: false, expectedVersion: 2,
    });
    await screen.findByText("Etichetta disattivata. Le associazioni esistenti restano.");
  });
  it("requires explicit cancellation to discard a creation draft", async () => {
    show();
    await screen.findByRole("table", { name: "Catalogo etichette" });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome nuova etichetta/), "Bozza catalogo");
    expect(screen.getByLabelText(/^Nome nuova etichetta/)).toHaveValue("Bozza catalogo");
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    const dialog = await screen.findByRole("dialog", { name: "Lasciare la bozza?" });
    await user.click(within(dialog).getByRole("button", { name: "Continua a scrivere" }));
    expect(screen.getByLabelText(/^Nome nuova etichetta/)).toHaveValue("Bozza catalogo");
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    await user.click(within(screen.getByRole("dialog", { name: "Lasciare la bozza?" })).getByRole("button", { name: "Scarta bozza" }));
    expect(screen.getByLabelText(/^Nome nuova etichetta/)).toHaveValue("");
  });
  it("keeps creation and editing drafts independent with one primary editor action", async () => {
    show();
    await screen.findByRole("table", { name: "Catalogo etichette" });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome nuova etichetta/), "Nuova bozza");
    await user.click(screen.getByRole("button", { name: "Modifica etichetta Frontend" }));
    expect(screen.getByRole("button", { name: "Crea etichetta" })).toHaveClass("button-secondary");
    expect(screen.getByRole("button", { name: "Salva etichetta" })).toHaveClass("button-primary");
    await user.click(screen.getByRole("button", { name: "Annulla modifica" }));
    expect(screen.getByLabelText(/^Nome nuova etichetta/)).toHaveValue("Nuova bozza");
    expect(screen.getByRole("button", { name: "Crea etichetta" })).toHaveClass("button-primary");
  });
});
