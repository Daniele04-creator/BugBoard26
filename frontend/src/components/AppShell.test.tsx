import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { api, ApiError, NetworkError } from "../api/ApiClient";
import { AppShell } from "./AppShell";

vi.mock("../features/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "admin", displayName: "Administrator", role: "ADMIN" },
    logout: async () => {},
  }),
}));
let client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  focusManager.setFocused(true);
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 15_000, gcTime: Infinity },
    },
  });
});
afterEach(() => {
  client.clear();
  focusManager.setFocused(undefined);
  vi.useRealTimers();
});
function renderShell() {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}
describe("notification polling", () => {
  it("backs off 30/60/120 seconds for network and unavailable responses, caps at 120, and resets after success", async () => {
    const unavailable = new ApiError({
      type: "about:blank",
      title: "Unavailable",
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      detail: "Unavailable",
      instance: "/api",
      requestId: "request",
      fieldErrors: [],
    });
    const get = vi
      .spyOn(api, "get")
      .mockRejectedValueOnce(new NetworkError(false))
      .mockRejectedValueOnce(unavailable)
      .mockRejectedValueOnce(new NetworkError(true))
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValue({ count: 2 });
    renderShell();
    await advance(0);
    expect(get).toHaveBeenCalledTimes(1);
    await advance(29_999);
    expect(get).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(get).toHaveBeenCalledTimes(2);
    await advance(59_999);
    expect(get).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(get).toHaveBeenCalledTimes(3);
    await advance(119_999);
    expect(get).toHaveBeenCalledTimes(3);
    await advance(1);
    expect(get).toHaveBeenCalledTimes(4);
    await advance(120_000);
    expect(get).toHaveBeenCalledTimes(5);
    await advance(29_999);
    expect(get).toHaveBeenCalledTimes(5);
    await advance(1);
    expect(get).toHaveBeenCalledTimes(6);
  });
  it("suspends hidden-tab polling, refreshes on return and stops after the shell unmounts", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ count: 0 });
    const rendered = renderShell();
    await advance(0);
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => {
      focusManager.setFocused(false);
    });
    await advance(90_000);
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => {
      focusManager.setFocused(true);
    });
    await advance(0);
    expect(get).toHaveBeenCalledTimes(2);
    rendered.unmount();
    await advance(120_000);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
