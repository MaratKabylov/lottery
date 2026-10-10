import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../src/app/providers/AuthProvider";

const mock = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  getSession: vi.fn(),
  profile: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("../src/lib/supabase", () => ({
  isConfigured: true,
  supabase: {
    auth: {
      getSession: mock.getSession,
      onAuthStateChange: (listener: typeof mock.listener) => {
        mock.listener = listener;
        return { data: { subscription: { unsubscribe: mock.unsubscribe } } };
      },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mock.profile }) }) }),
  },
}));
const session = { user: { id: "admin" } };
function setup() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useAuth(), { wrapper });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mock.getSession.mockResolvedValue({ data: { session: null }, error: null });
});
afterEach(() => vi.useRealTimers());

it("discards an in-flight admin profile immediately on sign-out", async () => {
  let resolve!: (value: unknown) => void;
  mock.profile.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const hook = setup();
  await act(async () => { mock.listener?.("SIGNED_IN", session); await vi.runAllTimersAsync(); });
  expect(mock.profile).toHaveBeenCalledTimes(1);
  await act(async () => {
    mock.listener?.("SIGNED_OUT", null);
    resolve({ data: { id: "admin", role: "admin" }, error: null });
    await Promise.resolve();
  });
  expect(hook.result.current.session).toBeNull();
  expect(hook.result.current.profile).toBeNull();
  expect(hook.result.current.loading).toBe(false);
});

it("ignores a stale initial session error after a newer sign-in", async () => {
  let resolve!: (value: unknown) => void;
  mock.getSession.mockImplementation(() => new Promise((done) => { resolve = done; }));
  mock.profile.mockResolvedValue({ data: { id: "admin", role: "admin" }, error: null });
  const hook = setup();
  await act(async () => { mock.listener?.("SIGNED_IN", session); await vi.runAllTimersAsync(); });
  await act(async () => { resolve({ data: { session: null }, error: { message: "Stale error" } }); });
  expect(hook.result.current.profile?.role).toBe("admin");
  expect(hook.result.current.error).toBeNull();
});

it("shows an access error when a profile request rejects", async () => {
  mock.profile.mockRejectedValue(new Error("Network error"));
  const hook = setup();
  await act(async () => { mock.listener?.("SIGNED_IN", session); await vi.runAllTimersAsync(); });
  expect(hook.result.current.loading).toBe(false);
  expect(hook.result.current.profile).toBeNull();
  expect(hook.result.current.error).toBe("Не удалось загрузить права доступа");
});
