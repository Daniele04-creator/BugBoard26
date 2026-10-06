import { useId } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
export function SelectField({
  label,
  error,
  hint,
  id: providedId,
  children,
  ...props
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  const generated = useId();
  const id = providedId ?? generated;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {props.required && " *"}
      </label>
      <select
        {...props}
        id={id}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={
          [hint && `${id}-hint`, error && `${id}-error`]
            .filter(Boolean)
            .join(" ") || undefined
        }
      >
        {children}
      </select>
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
