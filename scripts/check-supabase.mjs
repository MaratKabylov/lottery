import { loadEnvFile } from "node:process";

try { loadEnvFile(".env"); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env");

// Read-only checks: never print keys, response data, or personal information.
const checks = [
  ["Auth", "/auth/v1/health"],
  ["Public events", "/rest/v1/public_event_view?select=id&limit=1"],
  ...["profiles", "events", "participants", "prizes", "draws", "audit_logs", "event_ticket_counters", "registration_rate_limits"].map(
    (table) => [`${table} protected from anon`, `/rest/v1/${table}?select=*&limit=1`, "protected"],
  ),
  ["Public screen RPC", "/rest/v1/rpc/get_public_screen", "rpc"],
  ["Registration Edge Function", "/functions/v1/register-participant", "edge"],
  ...[
    ["draw_winner", { p_event_id: "00000000-0000-0000-0000-000000000000", p_prize_id: "00000000-0000-0000-0000-000000000000" }],
    ["set_screen_mode", { p_event_id: "00000000-0000-0000-0000-000000000000", p_mode: "waiting", p_seconds: null }],
    ["register_participant", { p_event_slug: "eventdraw-connectivity-check-missing-event", p_name: "Connectivity check", p_phone: null, p_email: null }],
  ].map(([rpc, body]) => [`${rpc} protected from anon`, `/rest/v1/rpc/${rpc}`, "denied-rpc", body]),
];
let failures = 0;
for (const [name, path, kind, requestBody] of checks) {
  try {
    const response = await fetch(new URL(path, url), {
      method: kind === "rpc" || kind === "denied-rpc" ? "POST" : "GET",
      headers: { apikey: key, "Content-Type": "application/json" },
      ...(kind === "rpc" || kind === "denied-rpc" ? { body: JSON.stringify(requestBody || { p_slug: "eventdraw-connectivity-check-missing-event" }) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => null);
    const ok = kind === "protected"
      ? [401, 403].includes(response.status) || (response.ok && Array.isArray(body) && body.length === 0)
      : kind === "denied-rpc" ? [401, 403].includes(response.status) && body?.code === "42501"
      : kind === "edge" ? response.status === 405
      : kind === "rpc" ? response.ok || body?.code === "P0001"
      : response.ok;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}: HTTP ${response.status}${body?.code ? ` (${body.code})` : ""}`);
    if (!ok) failures++;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.cause?.code || error.name}`);
    failures++;
  }
}
process.exitCode = failures ? 1 : 0;
