import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectControl, SelectField } from "./SelectField";
import { Dialog } from "./Dialog";

describe("shared select interactions", () => {
  it("announces the field and current value, preserves form data and restores focus after choosing", async () => {
    function Form() {
      const [role, setRole] = useState("MEMBER");
      return <form aria-label="Account"><SelectField label="Ruolo" name="role" value={role} onChange={event => setRole(event.target.value)}><option value="MEMBER">Membro</option><option value="VIEWER">Sola lettura</option></SelectField></form>;
    }
    render(<Form />);
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Ruolo Membro" });
    await user.click(trigger);
    expect(screen.getByRole("listbox", { name: "Ruolo" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Sola lettura" }));
    expect(trigger).toHaveAccessibleName("Ruolo Sola lettura");
    expect(trigger).toHaveFocus();
    expect(new FormData(screen.getByRole("form") as HTMLFormElement).get("role")).toBe("VIEWER");
  });
  it("supports keyboard navigation and Escape inside a dialog without closing the dialog", async () => {
    const onClose = vi.fn();
    render(<Dialog open title="Responsabile" onClose={onClose}><SelectField label="Persona" defaultValue="a"><option value="a">Anna</option><option value="b" disabled>Bruno</option><option value="c">Chiara</option></SelectField></Dialog>);
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Persona Anna" });
    trigger.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(trigger).toHaveAccessibleName("Persona Chiara");
    await user.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });
  it("filters long menus and keeps them within the viewport near its lower edge", async () => {
    render(<SelectControl aria-label="Etichetta" defaultValue="0">{Array.from({ length: 10 }, (_, i) => <option value={i} key={i}>Etichetta {i}</option>)}</SelectControl>);
    const trigger = screen.getByRole("button", { name: "Etichetta: Etichetta 0" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({ x: 120, y: 700, top: 700, bottom: 736, left: 120, right: 300, width: 180, height: 36, toJSON: () => ({}) });
    const user = userEvent.setup();
    await user.click(trigger);
    const panel = document.querySelector<HTMLElement>(".select-popover")!;
    expect(parseFloat(panel.style.top) + parseFloat(panel.style.maxHeight)).toBeLessThanOrEqual(window.innerHeight - 6);
    await user.type(screen.getByRole("textbox", { name: "Cerca in Etichetta" }), "9");
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(1);
    await user.click(screen.getByRole("option", { name: "Etichetta 9" }));
    expect(trigger).toHaveAccessibleName("Etichetta: Etichetta 9");
  });
  it("starts ArrowUp from search at the last enabled option and wraps in both directions", async () => {
    render(<SelectControl aria-label="Etichetta" defaultValue="0">{Array.from({ length: 10 }, (_, i) => <option value={i} key={i} disabled={i === 9}>Etichetta {i}</option>)}</SelectControl>);
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Etichetta: Etichetta 0" });
    await user.click(trigger);
    const search = screen.getByRole("textbox", { name: "Cerca in Etichetta" });
    expect(search).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("option", { name: "Etichetta 8" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "Etichetta 0" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("option", { name: "Etichetta 8" })).toHaveFocus();
    await user.click(search);
    await user.type(search, "inesistente");
    await user.keyboard("{ArrowUp}{ArrowDown}{Escape}");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("closes an anchored popup on outside scroll and does not submit its containing form", async () => {
    const submit = vi.fn(event => event.preventDefault());
    render(<form onSubmit={submit}><SelectField label="Ordine" defaultValue="title"><option value="title">Titolo</option><option value="date">Data</option></SelectField></form>);
    await userEvent.setup().click(screen.getByRole("button", { name: "Ordine Titolo" }));
    fireEvent.scroll(window);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });
});
