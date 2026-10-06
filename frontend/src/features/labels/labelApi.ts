import { api } from "../../api/ApiClient";
import type { Label, LabelColor, Page } from "../../api/types";
export const labelApi = {
  list: (query: string, signal?: AbortSignal) =>
    api.get<Page<Label>>(`/labels?${query}`, { signal }),
  create: (name: string, color: LabelColor) =>
    api.post<Label>("/admin/labels", { name, color }),
  update: (
    id: string,
    body: {
      name: string;
      color: LabelColor;
      active: boolean;
      expectedVersion: number;
    },
  ) => api.patch<Label>(`/admin/labels/${id}`, body),
  get: async (id: string) => {
    for (let page = 0; ; page++) {
      const result = await api.get<Page<Label>>(
        `/labels?active=all&page=${page}&size=100`,
      );
      const found = result.items.find((label) => label.id === id);
      if (found) return found;
      if (page + 1 >= result.totalPages)
        throw new Error("Etichetta non trovata nel catalogo corrente.");
    }
  },
};
