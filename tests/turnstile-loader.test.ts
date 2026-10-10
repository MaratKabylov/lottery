import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  document.querySelectorAll('script[src*="challenges.cloudflare.com"]').forEach((script) => script.remove());
  delete window.turnstile;
  vi.useRealTimers();
});

async function setup() {
  vi.resetModules();
  return (await import("../src/lib/turnstile")).loadTurnstile;
}

it("shares one script and waits for API readiness across concurrent mounts", async () => {
  const load = await setup();
  const first = load();
  expect(load()).toBe(first);
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[src*="challenges.cloudflare.com"]');
  expect(scripts).toHaveLength(1);
  let ready: (() => void) | undefined;
  window.turnstile = {
    ready: (callback) => { ready = callback; },
    render: vi.fn(),
    remove: vi.fn(),
  };
  let resolved = false;
  void first.then(() => { resolved = true; });
  scripts[0].dispatchEvent(new Event("load"));
  await Promise.resolve();
  expect(resolved).toBe(false);
  ready!();
  expect(await first).toBe(window.turnstile);
  expect(load()).toBe(first);
});

it("removes failed scripts and permits a fresh load on retry", async () => {
  const load = await setup();
  const first = load();
  const rejected = expect(first).rejects.toThrow("Не удалось загрузить проверку");
  const script = document.querySelector<HTMLScriptElement>('script[src*="challenges.cloudflare.com"]')!;
  script.dispatchEvent(new Event("error"));
  await rejected;
  expect(script.isConnected).toBe(false);
  const retry = load();
  expect(retry).not.toBe(first);
  window.turnstile = { ready: (callback) => callback(), render: vi.fn(), remove: vi.fn() };
  document.querySelector('script[src*="challenges.cloudflare.com"]')!.dispatchEvent(new Event("load"));
  expect(await retry).toBe(window.turnstile);
});

it("times out a blocked script rather than leaving registration waiting indefinitely", async () => {
  const load = await setup();
  vi.useFakeTimers();
  const rejected = expect(load()).rejects.toThrow("Не удалось загрузить проверку");
  await vi.advanceTimersByTimeAsync(15_000);
  await rejected;
  expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
});
