import { useRef, useState } from "react";
export function useAction() {
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function run<T>(
    action: () => Promise<T>,
    success?: (result: T) => void,
  ) {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await action();
      success?.(result);
    } catch (e) {
      setError(e);
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  return { run, pending, error };
}
