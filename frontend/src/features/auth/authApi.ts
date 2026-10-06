import { api } from "../../api/ApiClient";
import type { Me } from "../../api/types";
export const authApi = {
  me: (signal?: AbortSignal) => api.get<Me>("/auth/me", { signal }),
  login: (email: string, password: string) =>
    api.post<Me>("/auth/login", { email, password }),
  logout: () => api.post<void>("/auth/logout"),
  password: (currentPassword: string, newPassword: string) =>
    api.put<void>("/auth/password", { currentPassword, newPassword }),
  profile: (displayName: string, expectedVersion: number) =>
    api.patch<Me>("/auth/profile", { displayName, expectedVersion }),
};
