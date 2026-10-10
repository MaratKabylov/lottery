// Dashboard copy: paste this entire file into the Edge Function editor as index.ts.
import { createClient } from "npm:@supabase/supabase-js@2";
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


const allowedOrigins = (
  Deno.env.get("ALLOWED_ORIGINS") ||
  "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((s) => s.trim());

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin":
      origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowedOrigins.includes(origin))
    return reply(403, { error: "Недопустимый источник запроса" });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { error: "Используйте POST" });
  try {
    const raw = await req.text();
    if (raw.length > 4096)
      return reply(413, { error: "Запрос слишком большой" });
    const parsed = registrationSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return reply(400, { error: parsed.error.issues[0].message });
    const input = parsed.data;
    const url = Deno.env.get("SUPABASE_URL")!;
    // Secret is injected only into the Edge runtime; never prefixed with VITE_.
    const secret =
      Deno.env.get("SB_SECRET_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!secret) throw new Error("Missing server key");
    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Configure a trusted ingress before relying on forwarded client addresses.
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${secret}:${ip}:${input.event_slug}`),
    );
    const keyHash = Array.from(new Uint8Array(bytes), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
    const limit = await admin.rpc("consume_registration_limit", {
      p_key_hash: keyHash,
    });
    if (limit.error) throw new Error("Rate limit unavailable");
    if (!limit.data)
      return reply(429, { error: "Слишком много попыток. Подождите минуту." });
    const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (turnstileSecret) {
      if (!input.turnstile_token)
        return reply(400, { error: "Подтвердите, что вы не робот" });
      const verification = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          body: new URLSearchParams({
            secret: turnstileSecret,
            response: input.turnstile_token,
            remoteip: ip,
          }),
        },
      );
      const result = (await verification.json()) as { success: boolean };
      if (!result.success) return reply(400, { error: "Проверка не пройдена" });
    }
    const phone = normalizePhone(input.phone);
    const { data, error } = await admin.rpc("register_participant", {
      p_event_slug: input.event_slug,
      p_name: input.name,
      p_phone: phone,
      p_email: input.email || null,
    });
    if (error)
      return reply(400, {
        error:
          error.code === "P0001"
            ? error.message
            : "Не удалось зарегистрироваться",
      });
    return reply(200, data);
  } catch (error) {
    if (error instanceof SyntaxError)
      return reply(400, { error: "Некорректный JSON" });
    if (error instanceof RangeError)
      return reply(400, { error: error.message });
    console.error(
      "Registration failed",
      error instanceof Error ? error.name : "Unknown error",
    );
    return reply(500, {
      error: "Сервис временно недоступен. Попробуйте позже.",
    });
  }
});
