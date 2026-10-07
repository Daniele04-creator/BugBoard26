import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { Button } from "../../components/Button";

export function IssueListPagination({
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
  onSizeChange: (size: number) => void;
}) {
  return (
    <nav aria-label="Paginazione" className="issue-pagination">
      <span className="issue-total" role="status">
        {totalElements} risultati
      </span>
      <Button
        className="issue-page-previous"
        disabled={page === 0 || totalPages === 0}
        onClick={() => onPageChange(page - 1)}
      >
        <IconChevronLeft size={20} stroke={2} aria-hidden="true" />
        Precedente
      </Button>
      <span
        className="issue-page-number"
        aria-current={totalPages > 0 ? "page" : undefined}
      >
        {totalPages === 0
          ? "0 risultati"
          : `Pagina ${page + 1} di ${totalPages}`}
      </span>
      <Button
        className="issue-page-next"
        disabled={totalPages === 0 || page >= totalPages - 1}
        onClick={() => onPageChange(page + 1)}
      >
        Successiva
        <IconChevronRight size={20} stroke={2} aria-hidden="true" />
      </Button>
      <label className="issue-page-size">
        Per pagina
        <select
          value={size}
          onChange={(event) => onSizeChange(Number(event.target.value))}
        >
          {[20, 50, 100].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
    </nav>
  );
}
