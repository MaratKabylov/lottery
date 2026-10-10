import { z } from "npm:zod@4";

export function normalizePhone(value?: string | null): string | null {
  if (!value?.trim()) return null;
  if (!/^[+\d\s()\-]+$/.test(value))
    throw new RangeError("Укажите телефон в формате +7XXXXXXXXXX");
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8"))
    digits = `7${digits.slice(1)}`;
  if (!/^7\d{10}$/.test(digits))
    throw new RangeError("Укажите телефон в формате +7XXXXXXXXXX");
  return `+${digits}`;
}

export const registrationSchema = z.object({
  event_slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(200),
  name: z.string().trim().min(1, "Укажите имя").max(120, "Имя слишком длинное"),
  phone: z.string().max(40).nullish(),
  email: z
    .union([z.email("Некорректный email").max(254), z.literal("")])
    .nullish(),
  turnstile_token: z.string().max(2048).optional(),
});
