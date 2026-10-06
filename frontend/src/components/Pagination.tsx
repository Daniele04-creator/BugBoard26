import { Button } from "./Button";
export function Pagination({
  page,
  totalPages,
  size,
  totalElements,
  onPageChange,
  onSizeChange,
}: {
  page: number;
  totalPages: number;
  size: number;
  totalElements: number;
  onPageChange: (page: number) => void;
  onSizeChange?: (size: number) => void;
}) {
  return (
    <nav aria-label="Paginazione" className="pagination">
      <Button
        disabled={page === 0 || totalPages === 0}
        onClick={() => onPageChange(page - 1)}
      >
        Precedente
      </Button>
      <span>
        {totalPages === 0
          ? "0 risultati"
          : `Pagina ${page + 1} di ${totalPages}`}{" "}
        · {totalElements} risultati
      </span>
      <Button
        disabled={totalPages === 0 || page >= totalPages - 1}
        onClick={() => onPageChange(page + 1)}
      >
        Successiva
      </Button>
      {onSizeChange && (
        <label>
          Per pagina{" "}
          <select
            value={size}
            onChange={(e) => onSizeChange(Number(e.target.value))}
          >
            {[20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
    </nav>
  );
}
