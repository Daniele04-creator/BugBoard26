import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Avatar } from "./Avatar";
import { AuthLayout } from "./AuthLayout";
import { Dialog } from "./Dialog";
import { Button } from "./Button";

describe("shared presentation", () => {
  it("preserves the action label while exposing busy status and preventing repeated submission", () => {
    const { rerender } = render(<Button>Esporta CSV</Button>);
    const button = screen.getByRole("button", { name: "Esporta CSV" });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-busy");
    rerender(<Button busy>Esporta CSV</Button>);
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Esporta CSV");
    expect(screen.getByText("Invio…")).toHaveClass("sr-only");
    expect(button.querySelector(".busy-indicator")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    rerender(<Button>Esporta CSV</Button>);
    expect(button).toBeEnabled();
    expect(screen.queryByText("Invio…")).not.toBeInTheDocument();
    expect(button.querySelector(".busy-indicator")).toBeNull();
  });
  it("keeps Unicode initials decorative and bounded while retaining the requested avatar size", () => {
    const { container, rerender } = render(
      <Avatar
        name="Éva 👩‍💻"
        id="00000001-0000-0000-0000-000000000000"
        size={36}
      />,
    );
    const avatar = container.querySelector(".avatar")!;
    expect(avatar).toHaveTextContent("É👩‍💻");
    expect(avatar).toHaveAttribute("aria-hidden", "true");
    expect(avatar).toHaveStyle({ width: "36px", height: "36px" });
    rerender(
      <Avatar name="ßeta Beta" id="00000001-0000-0000-0000-000000000000" />,
    );
    expect([
      ...new Intl.Segmenter("it", { granularity: "grapheme" }).segment(
        avatar.textContent!,
      ),
    ]).toHaveLength(2);
  });
  it("provides one anonymous main and local decorative brand without authenticated navigation", () => {
    render(
      <AuthLayout>
        <h1>Accedi al progetto</h1>
        <label>
          Email
          <input />
        </label>
      </AuthLayout>,
    );
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Accedi al progetto",
    );
    const image = document.querySelector(".auth-brand .brand-mark")!;
    expect(image).toHaveAttribute("aria-hidden", "true");
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("src", expect.stringContaining("bugboard-symbol.png"));
  });
  it("keeps the safe action initially focused in a sensitive dialog with an accessible icon close control", () => {
    const { rerender } = render(<button>Apri</button>);
    screen.getByRole("button", { name: "Apri" }).focus();
    rerender(
      <>
        <button>Apri</button>
        <Dialog
          open
          title="Archivia"
          sensitive
          onClose={() => {}}
          footer={
            <>
              <button data-cancel>Annulla</button>
              <button>Conferma</button>
            </>
          }
        >
          Confermi?
        </Dialog>
      </>,
    );
    expect(screen.getByRole("button", { name: "Annulla" })).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Chiudi Archivia" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), {
      key: "Tab",
      shiftKey: true,
    });
    expect(document.activeElement?.closest("dialog")).not.toBeNull();
    rerender(<button>Apri</button>);
    expect(screen.getByRole("button", { name: "Apri" })).toHaveFocus();
  });
});
