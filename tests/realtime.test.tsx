import { it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRealtime } from "../src/hooks/useEventData";
const mock = vi.hoisted(() => ({
  status: null as null | ((s: string) => void),
  changed: null as null | (() => void),
  remove: vi.fn(),
}));
vi.mock("../src/lib/supabase", () => ({
  supabase: {
    channel: () => {
      const channel = {
        state: "joined",
        on: (_kind: unknown, _filter: unknown, cb: () => void) => {
          mock.changed = cb;
          return channel;
        },
        subscribe: (cb: (s: string) => void) => {
          mock.status = cb;
          return channel;
        },
      };
      return channel;
    },
    removeChannel: mock.remove,
  },
}));
it("Realtime invalidates database queries, reconnect refreshes, offline blocks, and cleanup unsubscribes", () => {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useRealtime("event"), { wrapper });
  expect(hook.result.current).toBe("reconnecting");
  act(() => mock.status?.("SUBSCRIBED"));
  expect(hook.result.current).toBe("online");
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["screen"] });
  invalidate.mockClear();
  act(() => mock.changed?.());
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["event", "event"] });
  act(() => window.dispatchEvent(new Event("offline")));
  expect(hook.result.current).toBe("offline");
  act(() => mock.status?.("CHANNEL_ERROR"));
  expect(hook.result.current).toBe("reconnecting");
  act(() => mock.status?.("SUBSCRIBED"));
  expect(hook.result.current).toBe("online");
  hook.unmount();
  expect(mock.remove).toHaveBeenCalled();
});
