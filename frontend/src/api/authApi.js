export async function login(email, password) {
  const response = await fetch(`/api/auth/login`, {
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
