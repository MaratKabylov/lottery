import { useEffect, useState } from "react";
export function remainingMilliseconds(
  deadline: string | null | undefined,
  offset: number,
  now = Date.now(),
) {
  return deadline ? Math.max(0, Date.parse(deadline) - (now + offset)) : 0;
}
export function useCountdown(
  deadline?: string | null,
  serverTime?: string,
  receivedAt?: number,
) {
  const [now, setNow] = useState(Date.now());
  const offset =
    serverTime && receivedAt ? Date.parse(serverTime) - receivedAt : 0;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);
  return remainingMilliseconds(deadline, offset, now);
}
