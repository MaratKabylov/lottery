import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

try { loadEnvFile(".env"); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const required = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "EVENTDRAW_TEST_ADMIN_EMAIL", "EVENTDRAW_TEST_ADMIN_PASSWORD", "EVENTDRAW_TEST_HOST_EMAIL", "EVENTDRAW_TEST_HOST_PASSWORD"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Integration test requires: ${missing.join(", ")}. Set them in ignored .env; credentials are never logged.`);
  process.exit(1);
}
if (process.env.VITE_TURNSTILE_SITE_KEY) {
  console.error("Use a dedicated Supabase test project without Turnstile for automated registration; do not disable protection on a live event.");
  process.exit(1);
}
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init = {}) => fetch(input, {
    ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
  }) },
};
const makeClient = () => createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const admin = makeClient(), host = makeClient(), anon = makeClient();
function value(result, label) {
  // Suppress upstream messages, which can include fixture fields or credentials.
  if (result.error) throw new Error(`${label} failed (${result.error.code || result.error.name || "unknown"})`);
  return result.data;
}
const slug = `integration-${randomUUID()}`;
let eventId, assetPath, channel;
try {
  for (const [client, role] of [[admin, "admin"], [host, "host"]]) {
    const session = value(await client.auth.signInWithPassword({
      email: process.env[`EVENTDRAW_TEST_${role.toUpperCase()}_EMAIL`],
      password: process.env[`EVENTDRAW_TEST_${role.toUpperCase()}_PASSWORD`],
    }), `${role} login`);
    const profile = value(await client.from("profiles").select("role").eq("id", session.user.id).single(), `${role} profile`);
    assert.equal(profile.role, role);
  }
  console.log("PASS Auth and database roles for admin/host");
  const event = value(await admin.from("events").insert({ name: "Integration verification", slug, status: "active", draw_animation_seconds: 1, require_phone: false }).select().single(), "create fixture event");
  eventId = event.id;
  const prize = value(await admin.from("prizes").insert({ event_id: eventId, name: "Integration prize", quantity: 2 }).select().single(), "create fixture prize");

  // Establish a real anonymous Realtime subscription before any registration.
  let changes = 0;
  const subscribed = new Promise((resolve, reject) => {
    channel = anon.channel(`integration-${eventId}`).on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "event_screen_state", filter: `event_id=eq.${eventId}`,
    }, () => { changes++; }).subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
      if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) reject(new Error(`Realtime ${status}`));
    });
  });
  let subscriptionTimer;
  try {
    await Promise.race([subscribed, new Promise((_, reject) => {
      subscriptionTimer = setTimeout(() => reject(new Error("Realtime subscription timeout")), 15_000);
    })]);
  } finally { clearTimeout(subscriptionTimer); }
  async function waitForChange(previous) {
    const deadline = Date.now() + 10_000;
    while (changes <= previous && Date.now() < deadline) await delay(100);
    assert.ok(changes > previous, "Realtime must deliver a screen state change");
  }
  async function register() {
    return value(await anon.functions.invoke("register-participant", { body: { event_slug: slug, name: "Integration guest", phone: "", email: "" } }), "Edge registration");
  }
  const beforeRegistration = changes;
  const registrations = await Promise.all(Array.from({ length: 3 }, register));
  assert.deepEqual(registrations.map((r) => r.ticket_number).sort((a, b) => a - b), [1, 2, 3]);
  await waitForChange(beforeRegistration);
  let screen = value(await anon.rpc("get_public_screen", { p_slug: slug }), "public screen");
  assert.equal(screen.participant_count, 3);
  console.log("PASS concurrent Edge registrations, sequential tickets and Realtime counter");

  const duplicateBody = { event_slug: slug, name: "Duplicate verification", phone: "+77010000000", email: "" };
  const duplicateResults = await Promise.all(Array.from({ length: 2 }, () => anon.functions.invoke("register-participant", { body: duplicateBody })));
  const duplicates = duplicateResults.map((r) => value(r, "duplicate registration"));
  assert.equal(duplicates[0].participant_id, duplicates[1].participant_id);
  assert.equal(duplicates[0].ticket_number, 4);
  assert.equal(duplicates[0].ticket_number, duplicates[1].ticket_number);
  assert.equal(duplicates.filter((r) => r.already_registered).length, 1);
  console.log("PASS concurrent duplicate phone returns one participant and ticket");

  // Five requests already used this unique event's rate-limit window.
  for (let i = 0; i < 5; i++) value(await anon.functions.invoke("register-participant", { body: duplicateBody }), "rate-limit allowance");
  const throttled = await anon.functions.invoke("register-participant", { body: duplicateBody });
  assert.equal(throttled.error?.context?.status, 429);
  console.log("PASS Edge HTTP rate limit rejects the eleventh request");

  const hidden = await host.from("participants").select("phone,email").eq("event_id", eventId);
  assert.ok(hidden.error || hidden.data.length === 0, "host must not read contacts");
  const forbidden = await host.from("events").update({ name: "Forbidden change" }).eq("id", eventId).select();
  assert.ok(forbidden.error || forbidden.data.length === 0, "host must not change settings");
  assert.equal(value(await admin.from("events").select("name").eq("id", eventId).single(), "verify host restriction").name, event.name);
  console.log("PASS live host restrictions");

  const args = { p_event_id: eventId, p_prize_id: prize.id };
  const beforeDraw = changes;
  const draws = await Promise.all([host.rpc("draw_winner", args), admin.rpc("draw_winner", args)]);
  const draw = value(draws[0], "host draw");
  assert.equal(value(draws[1], "concurrent admin draw").id, draw.id);
  await waitForChange(beforeDraw);
  screen = value(await anon.rpc("get_public_screen", { p_slug: slug }), "drawing snapshot");
  assert.equal(screen.state.current_draw_id, draw.id);
  assert.equal(screen.state.mode, "drawing");
  assert.equal(screen.winner.ticket_number, [...registrations, duplicates[0]].find((r) => r.participant_id === draw.participant_id).ticket_number);
  assert.ok(!("phone" in screen.winner) && !("email" in screen.winner));
  // Use server timestamps so a local clock offset cannot make confirmation premature.
  await delay(Math.max(0, Date.parse(screen.state.countdown_end) - Date.parse(screen.server_time)) + 250);
  const beforeConfirm = changes;
  assert.equal(value(await host.rpc("confirm_draw", { p_draw_id: draw.id }), "confirm").status, "confirmed");
  await waitForChange(beforeConfirm);
  const next = value(await host.rpc("draw_winner", args), "next draw");
  assert.notEqual(next.participant_id, draw.participant_id);
  assert.equal(value(await host.rpc("cancel_draw", { p_draw_id: next.id }), "cancel").status, "cancelled");
  assert.equal(value(await anon.rpc("get_public_screen", { p_slug: slug }), "restored snapshot").state.mode, "waiting");
  console.log("PASS concurrent draw, public snapshot, confirmation, winner exclusion and cancellation");

  assetPath = `events/${eventId}/integration-${randomUUID()}.png`;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64");
  value(await admin.storage.from("event-assets").upload(assetPath, png, { contentType: "image/png" }), "Storage upload");
  const assetUrl = anon.storage.from("event-assets").getPublicUrl(assetPath).data.publicUrl;
  const response = await fetch(assetUrl, { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  console.log("PASS Storage admin upload and public image download");

} catch (error) {
  console.error(error instanceof assert.AssertionError ? `FAIL ${error.message.split("\n")[0]}` : `FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  if (channel) await anon.removeChannel(channel);
  if (assetPath) {
    const result = await admin.storage.from("event-assets").remove([assetPath]);
    if (result.error) { console.error("FAIL fixture asset cleanup"); process.exitCode = 1; }
  }
  // Delete only the exact UUID and unique slug created by this invocation.
  // Audit history remains in the database intentionally.
  if (eventId) {
    const result = await admin.from("events").delete().eq("id", eventId).eq("slug", slug).select("id");
    if (result.error || result.data.length !== 1) { console.error(`FAIL fixture cleanup; event ID: ${eventId}`); process.exitCode = 1; }
  }
  for (const client of [admin, host]) await client.auth.signOut({ scope: "local" });
}
