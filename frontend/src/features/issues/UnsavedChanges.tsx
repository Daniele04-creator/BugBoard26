import { useEffect } from "react";
import { useBlocker } from "react-router-dom";
import { Dialog } from "../../components/Dialog";
import { Button } from "../../components/Button";
export function UnsavedChanges({
  dirty,
  onDiscard,
}: {
  dirty: boolean;
  onDiscard?: () => void;
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const before = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  return (
    <Dialog
      open={blocker.state === "blocked"}
      title="Lasciare la bozza?"
      sensitive
      onClose={() => blocker.reset?.()}
      footer={
        <>
          <Button data-cancel onClick={() => blocker.reset?.()}>
            Continua a scrivere
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onDiscard?.();
              blocker.proceed?.();
            }}
          >
            Esci senza salvare
          </Button>
        </>
      }
    >
      <p>Le modifiche non salvate andranno perse.</p>
    </Dialog>
  );
}
