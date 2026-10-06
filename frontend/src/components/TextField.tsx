import { useId } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
interface Common {
  label: string;
  error?: string;
  hint?: string;
}
export function TextField({
  label,
  error,
  hint,
  id: providedId,
  ...props
}: Common & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId();
  const id = providedId ?? generated;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {props.required && " *"}
      </label>
      <input
        {...props}
        id={id}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={
          [hint && `${id}-hint`, error && `${id}-error`]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
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
export function TextAreaField({
  label,
  error,
  hint,
  id: providedId,
  ...props
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generated = useId();
  const id = providedId ?? generated;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {props.required && " *"}
      </label>
      <textarea
        {...props}
        id={id}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={
          [hint && `${id}-hint`, error && `${id}-error`]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
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
