import type { ReactNode } from "react";
import { IconListDetails } from "./Icons";
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <IconListDetails
        className="empty-icon"
        size={32}
        stroke={2}
        aria-hidden="true"
      />
      <p>{title}</p>
      {children}
    </div>
  );
}
