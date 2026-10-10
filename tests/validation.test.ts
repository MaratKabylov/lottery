import { it, expect } from "vitest";
import {
  normalizePhone,
  registrationSchema,
} from "../supabase/functions/_shared/registration";
import { formatTicket } from "../src/utils/format";
import { remainingMilliseconds } from "../src/hooks/useCountdown";
it("normalizes Kazakhstan phone formats and preserves optional null", () => {
  for (const value of [
    "87011234567",
    "77011234567",
    "+77011234567",
    "8 701 123 45 67",
  ])
    expect(normalizePhone(value)).toBe("+77011234567");
  expect(normalizePhone("")).toBeNull();
});
it("rejects invalid phones and empty names on the Edge boundary", () => {
  for (const value of ["123", "+17011234567", "call +77011234567"])
    expect(() => normalizePhone(value)).toThrow();
  expect(
    registrationSchema.safeParse({ event_slug: "opening", name: "   " })
      .success,
  ).toBe(false);
});
it("ticket formatting never truncates four-digit numbers", () => {
  expect(formatTicket(1)).toBe("001");
  expect(formatTicket(1000)).toBe("1000");
});
it("animation reconstructs its remaining duration using server clock offset", () => {
  expect(
    remainingMilliseconds(
      "2026-10-10T10:00:04Z",
      5000,
      Date.parse("2026-10-10T09:59:57Z"),
    ),
  ).toBe(2000);
  expect(
    remainingMilliseconds(
      "2026-10-10T10:00:04Z",
      5000,
      Date.parse("2026-10-10T10:00:10Z"),
    ),
  ).toBe(0);
});
