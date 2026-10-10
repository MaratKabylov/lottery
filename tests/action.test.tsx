import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useAction } from "../src/hooks/useAction";

it("allows only one action before React renders and unlocks after failure", async () => {
  let reject!: (error: Error) => void;
  const action = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  const hook = renderHook(() => useAction());
  let first!: Promise<void>;
  act(() => {
    first = hook.result.current.run(action);
    void hook.result.current.run(action);
  });
  expect(action).toHaveBeenCalledTimes(1);
  expect(hook.result.current.pending).toBe(true);
  await act(async () => {
    reject(new Error("Server unavailable"));
    await first;
  });
  expect(hook.result.current.pending).toBe(false);
  expect(hook.result.current.error).toBeInstanceOf(Error);
  const retry = vi.fn().mockResolvedValue("saved");
  const success = vi.fn();
  await act(async () => { await hook.result.current.run(retry, success); });
  expect(success).toHaveBeenCalledWith("saved");
  expect(hook.result.current.error).toBeNull();
});
