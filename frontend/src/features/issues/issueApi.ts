import { api } from "../../api/ApiClient";
import type {
  Comment,
  IssueDetail,
  IssueEvent,
  IssueSummary,
  Label,
  Page,
  UserRef,
} from "../../api/types";
export interface AssignmentSuggestions {
  asOf: string;
  candidates: {
    user: UserRef;
    openIssueCount: number;
    rank: number;
    reason: string;
  }[];
}
export interface IssueFields {
  title: string;
  description: string;
  type: IssueDetail["type"];
  priority: IssueDetail["priority"];
  labelIds: string[];
}
export const issueApi = {
  candidates: (q: string, page: number, signal?: AbortSignal) =>
    api.get<Page<UserRef>>(
      `/admin/assignment-candidates?${new URLSearchParams({ q, page: String(page), size: "20" })}`,
      { signal },
    ),
  list: (query: string, signal?: AbortSignal) =>
    api.get<Page<IssueSummary>>(`/issues?${query}`, { signal }),
  detail: (id: string, signal?: AbortSignal) =>
    api.get<IssueDetail>(`/issues/${id}`, { signal }),
  create: (fields: IssueFields, image: File | null, key: string) => {
    const body = new FormData();
    body.append(
      "issue",
      new Blob([JSON.stringify(fields)], { type: "application/json" }),
    );
    if (image) body.append("image", image);
    return api.post<IssueDetail>("/issues", body, {
      idempotencyKey: key,
      timeoutMs: image ? 30_000 : 15_000,
    });
  },
  update: (id: string, fields: IssueFields, version: number) =>
    api.patch<IssueDetail>(`/issues/${id}`, {
      ...fields,
      expectedVersion: version,
    }),
  command: (
    id: string,
    name: string,
    body: Record<string, unknown>,
    version: number,
  ) =>
    api.put<IssueDetail>(`/issues/${id}/${name}`, {
      ...body,
      expectedVersion: version,
    }),
  comments: (id: string, page: number, signal?: AbortSignal) =>
    api.get<Page<Comment>>(`/issues/${id}/comments?page=${page}&size=20`, {
      signal,
    }),
  comment: (id: string, body: string, key: string) =>
    api.post<Comment>(
      `/issues/${id}/comments`,
      { body },
      { idempotencyKey: key },
    ),
  history: (id: string, page: number, signal?: AbortSignal) =>
    api.get<Page<IssueEvent>>(`/issues/${id}/history?page=${page}&size=20`, {
      signal,
    }),
  suggestions: (id: string, signal?: AbortSignal) =>
    api.get<AssignmentSuggestions>(`/issues/${id}/assignment-suggestions`, {
      signal,
    }),
  image: (id: string, signal?: AbortSignal) =>
    api.get<Blob>(`/issues/${id}/image`, {
      responseType: "blob",
      timeoutMs: 30_000,
      signal,
    }),
  putImage: (id: string, image: File, version: number) => {
    const body = new FormData();
    body.append("image", image);
    body.append("expectedVersion", String(version));
    return api.put<IssueDetail>(`/issues/${id}/image`, body, {
      timeoutMs: 30_000,
    });
  },
  deleteImage: (id: string, version: number) =>
    api.delete<IssueDetail>(`/issues/${id}/image?expectedVersion=${version}`),
  export: (query: string) =>
    api.get<Blob>(`/issues/export?${query}`, {
      responseType: "blob",
      timeoutMs: 30_000,
    }),
};
export async function allPages<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 0; ; page++) {
    const result = await api.get<Page<T>>(
      `${path}${path.includes("?") ? "&" : "?"}page=${page}&size=100`,
      { signal },
    );
    items.push(...result.items);
    if (page + 1 >= result.totalPages) return items;
  }
}
export const getLabels = (signal?: AbortSignal) =>
  allPages<Label>("/labels?active=true", signal);
export const getDirectory = (signal?: AbortSignal) =>
  allPages<UserRef>("/users/directory", signal);
