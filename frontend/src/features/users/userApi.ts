import { api } from "../../api/ApiClient";
import type { Page, UserAdmin, UserRole } from "../../api/types";
export interface UserUpdate {
  displayName: string;
  role: UserRole;
  active: boolean;
  expectedVersion: number;
}
export const userApi = {
  list: (query: string, signal?: AbortSignal) =>
    api.get<Page<UserAdmin>>(`/admin/users?${query}`, { signal }),
  get: (id: string, signal?: AbortSignal) =>
    api.get<UserAdmin>(`/admin/users/${id}`, { signal }),
  create: (body: {
    email: string;
    displayName: string;
    password: string;
    role: UserRole;
  }) => api.post<UserAdmin>("/admin/users", body),
  update: (id: string, body: UserUpdate) =>
    api.patch<UserAdmin>(`/admin/users/${id}`, body),
  reset: (id: string, temporaryPassword: string, expectedVersion: number) =>
    api.put<void>(`/admin/users/${id}/password`, {
      temporaryPassword,
      expectedVersion,
    }),
};
