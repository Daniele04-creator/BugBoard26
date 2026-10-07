import { useState } from "react";
import type { InputHTMLAttributes } from "react";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import "./auth.css";
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
        {visible ? <IconEyeOff size={20} stroke={2} aria-hidden="true" /> : <IconEye size={20} stroke={2} aria-hidden="true" />}
      </Button>
    </div>
  );
}
