import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <div className="auth-brand">
          <BrandMark />
          <span>BugBoard26</span>
        </div>
        {children}
      </section>
    </main>
  );
}
