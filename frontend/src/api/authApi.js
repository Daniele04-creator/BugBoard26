import { API_BASE_URL } from "../config/api";

export async function login(email, password) {
  const base = API_BASE_URL ?? "";
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("INVALID_CREDENTIALS");
    }
    throw new Error("SERVER_ERROR");
  }

  return response.json();
}
