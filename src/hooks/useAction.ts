import { useState } from "react";
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function run<T>(
    action: () => Promise<T>,
    success?: (result: T) => void,
  ) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await action();
      success?.(result);
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }
  return { run, pending, error };
}
