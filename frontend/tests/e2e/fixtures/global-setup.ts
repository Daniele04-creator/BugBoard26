import { request } from "@playwright/test";
import { adminEmail, adminPassword, apiWrite, baseURL, csrf } from "./api";

export default async function globalSetup() {
  const context = await request.newContext({ baseURL });
  try {
    const ready = await context.get("/api/v1/health/ready");
    if (!ready.ok())
      throw new Error(`Backend non pronto: HTTP ${ready.status()}`);
    let response = await context.post("/api/v1/auth/login", {
      headers: await csrf(context),
      data: { email: adminEmail, password: adminPassword },
    });
    if (response.status() === 401) {
      response = await context.post("/api/v1/auth/login", {
        headers: await csrf(context),
        data: { email: adminEmail, password: "BugBoard26-ChangeMe!" },
      });
      if (!response.ok())
        throw new Error(
          `Accesso amministratore E2E fallito: HTTP ${response.status()}`,
        );
      await apiWrite<void>(context, "/auth/password", "PUT", {
        currentPassword: "BugBoard26-ChangeMe!",
        newPassword: adminPassword,
      });
      response = await context.post("/api/v1/auth/login", {
        headers: await csrf(context),
        data: { email: adminEmail, password: adminPassword },
      });
    }
    if (!response.ok())
      throw new Error(
        `Accesso amministratore E2E fallito: HTTP ${response.status()}`,
      );
    const user = (await response.json()) as { mustChangePassword: boolean };
    if (user.mustChangePassword)
      throw new Error(
        "L’amministratore E2E richiede ancora il cambio password.",
      );
  } finally {
    await context.dispose();
  }
}
