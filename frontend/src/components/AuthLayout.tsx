import type { ReactNode } from "react";
import mark from "../assets/brand/bugboard-mark.png";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout">
      <div className="auth-brand">
        <img src={mark} width={36} height={36} alt="" />
        <span>BugBoard26</span>
      </div>
      <section className="panel auth-panel">{children}</section>
    </main>
  );
}
