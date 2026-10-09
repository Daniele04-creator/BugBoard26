import { SelectControl } from "./SelectField";
import { Button } from "./Button";
import { IconChevronLeft, IconChevronRight } from "./Icons";
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
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Paginazione" className="pagination">
      <Button
        disabled={page === 0 || totalPages === 0}
        onClick={() => onPageChange(page - 1)}
      >
        <IconChevronLeft size={20} stroke={2} aria-hidden="true" />
        Precedente
      </Button>
      <span className="pagination-summary">
        {totalPages === 0 ? (
          "0 risultati"
        ) : (
          <span className="pagination-current" aria-current="page">
            Pagina {page + 1} di {totalPages}
          </span>
        )}{" "}
        · {totalElements} risultati
      </span>
      <Button
        disabled={totalPages === 0 || page >= totalPages - 1}
        onClick={() => onPageChange(page + 1)}
      >
        Successiva
        <IconChevronRight size={20} stroke={2} aria-hidden="true" />
      </Button>
      {onSizeChange && (
        <label>
          Per pagina{" "}
          <SelectControl
            aria-label="Per pagina"
            value={size}
            onChange={(e) => onSizeChange(Number(e.target.value))}
          >
            {[20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </SelectControl>
        </label>
      )}
    </nav>
  );
}
