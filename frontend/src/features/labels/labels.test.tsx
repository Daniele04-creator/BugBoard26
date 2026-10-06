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
  it("requests inactive labels explicitly and confirms deactivation before changing associations", async () => {
    const update = vi
      .spyOn(labelApi, "update")
      .mockResolvedValue({ ...label, active: false, version: 1 });
    show();
    await screen.findByRole("table", { name: "Catalogo etichette" });
    expect(labelApi.list).toHaveBeenCalledWith(
      expect.stringContaining("active=all"),
      expect.any(AbortSignal),
    );
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
});
