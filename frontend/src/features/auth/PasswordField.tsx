import { useState } from "react";
import type { InputHTMLAttributes } from "react";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
export function PasswordField({
  label,
  ...props
}: {
  label: string;
  error?: string;
  hint?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <TextField
        {...props}
        label={label}
        type={visible ? "text" : "password"}
      />
      <Button
        className="password-toggle"
        aria-pressed={visible}
        aria-label={`${visible ? "Nascondi" : "Mostra"} ${label.toLowerCase()}`}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? "Nascondi" : "Mostra"}
      </Button>
    </div>
  );
}
