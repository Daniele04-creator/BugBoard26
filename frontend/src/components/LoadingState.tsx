export function LoadingState({ label = "Caricamento…" }: { label?: string }) {
  return (
    <div aria-busy="true" className="loading-state">
      <p role="status">{label}</p>
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
