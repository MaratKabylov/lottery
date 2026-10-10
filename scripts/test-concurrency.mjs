import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// This test deliberately creates/deletes its own fixtures only on local Supabase.
const connectionString =
  process.env.EVENTDRAW_TEST_DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const host = new URL(connectionString).hostname;
if (!["127.0.0.1", "localhost", "[::1]"].includes(host))
  throw new Error(
    "Concurrency tests require a local disposable Supabase database.",
  );
const pool = new pg.Pool({
  connectionString,
  max: 20,
  connectionTimeoutMillis: 5000,
});
const userId = randomUUID();
let eventId;
async function transaction(role, query, params) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
      role === "authenticated" ? userId : "",
    ]);
    const result = await client.query(query, params);
    await client.query("commit");
    return result.rows[0].result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
try {
  await pool.query("insert into auth.users(id,email) values($1,$2)", [
    userId,
    `concurrency-${userId}@example.test`,
  ]);
  await pool.query("insert into public.profiles(id,role) values($1,'host')", [
    userId,
  ]);
  const slug = `concurrency-${randomUUID()}`;
  eventId = (
    await pool.query(
      "insert into public.events(name,slug,status) values('Concurrency test',$1,'active') returning id",
      [slug],
    )
  ).rows[0].id;
  const prizeId = (
    await pool.query(
      "insert into public.prizes(event_id,name,quantity) values($1,'Test prize',5) returning id",
      [eventId],
    )
  ).rows[0].id;
  const registrations = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      transaction(
        "service_role",
        "select public.register_participant($1,$2,$3,null) as result",
        [slug, `Guest ${i}`, `+7701${String(i).padStart(7, "0")}`],
      ),
    ),
  );
  assert.equal(new Set(registrations.map((r) => r.ticket_number)).size, 20);
  assert.deepEqual(
    registrations.map((r) => r.ticket_number).sort((a, b) => a - b),
    Array.from({ length: 20 }, (_, i) => i + 1),
  );
  console.log(
    "PASS 20 concurrent registrations produce unique sequential tickets",
  );
  const duplicates = await Promise.all(
    Array.from({ length: 20 }, () =>
      transaction(
        "service_role",
        "select public.register_participant($1,$2,$3,null) as result",
        [slug, "Duplicate", "+77010000000"],
      ),
    ),
  );
  assert.ok(
    duplicates.every(
      (r) =>
        r.already_registered &&
        r.participant_id === registrations[0].participant_id,
    ),
  );
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from public.participants where event_id=$1",
        [eventId],
      )
    ).rows[0].n,
    20,
  );
  console.log(
    "PASS concurrent duplicate phones do not allocate extra participants",
  );
  const draws = await Promise.all(
    Array.from({ length: 2 }, () =>
      transaction(
        "authenticated",
        "select to_jsonb(public.draw_winner($1,$2)) as result",
        [eventId, prizeId],
      ),
    ),
  );
  assert.equal(draws[0].id, draws[1].id);
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from public.draws where event_id=$1 and status='pending'",
        [eventId],
      )
    ).rows[0].n,
    1,
  );
  console.log("PASS two hosts receive the same pending draw");
} finally {
  try {
    if (eventId)
      await pool.query("delete from public.events where id=$1", [eventId]);
    await pool.query("delete from auth.users where id=$1", [userId]);
  } finally {
    await pool.end();
  }
}
