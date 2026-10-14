import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";

// Real PostgreSQL via WASM. Only the platform-owned Supabase schemas are stubbed.
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  grant usage on schema auth to anon,authenticated,service_role;
  grant execute on function auth.uid() to anon,authenticated,service_role;
  create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key,bucket_id text,name text);
  alter table storage.objects enable row level security;
  create publication supabase_realtime;
`);
for (const file of (await readdir("supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  try {
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    console.log(`Applied ${file}`);
  } catch (error) {
    console.error(`Migration failed: ${file}`);
    throw error;
  }
}
const admin = "00000000-0000-0000-0000-000000000001";
const host = "00000000-0000-0000-0000-000000000002";
const secondAdmin = "00000000-0000-0000-0000-000000000003";
const coadmin = "00000000-0000-0000-0000-000000000004";
await db.exec(`insert into auth.users values ('${admin}'),('${host}'),('${secondAdmin}'),('${coadmin}');
insert into public.profiles(id,role) values ('${admin}','admin'),('${host}','host'),('${secondAdmin}','admin'),('${coadmin}','coadmin');`);
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const asRole = async (role, user, fn) => {
  await db.exec(
    `set role ${role}; select set_config('request.jwt.claim.sub','${user || ""}',false);`,
  );
  try {
    return await fn();
  } finally {
    await db.exec(
      `reset role; select set_config('request.jwt.claim.sub','',false);`,
    );
  }
};
let checks = 0;
async function test(name, fn) {
  await fn();
  checks++;
  console.log(`PASS ${name}`);
}
const [{ id: event }] = await query(
  `insert into public.events(name,slug,status,draw_animation_seconds,created_by) values ('Test','test','active',1,$1) returning id`,
  [admin],
);
await query(`insert into public.event_staff(event_id,user_id) values ($1,$2)`, [event, host]);
await query(`insert into public.event_staff(event_id,user_id) values ($1,$2)`, [event, coadmin]);
const [{ id: prize }] = await query(
  `insert into public.prizes(event_id,name,quantity) values ($1,'Prize',10) returning id`,
  [event],
);
const register = async (phone, name = "Guest") =>
  asRole(
    "service_role",
    null,
    async () =>
      (
        await query(
          `select public.register_participant('test',$1,$2,null) as result`,
          [name, phone],
        )
      )[0].result,
  );
await test("screen advertising defaults off, requires a banner and is included in the anonymous snapshot", async () => {
  const snapshot = () => asRole("anon", null, async () =>
    (await query("select public.get_public_screen('test') as screen"))[0].screen,
  );
  assert.equal((await snapshot()).event.screen_banner_enabled, false);
  assert.equal((await snapshot()).event.screen_banner_path, null);
  await asRole("authenticated", admin, async () => {
    await assert.rejects(query("update public.events set screen_banner_enabled=true where id=$1", [event]), /events_screen_banner_required/);
    await query("update public.events set screen_banner_enabled=true,screen_banner_path=$2 where id=$1", [event, `events/${event}/screen-banner.webp`]);
  });
  const enabled = await snapshot();
  assert.equal(enabled.event.screen_banner_enabled, true);
  assert.equal(enabled.event.screen_banner_path, `events/${event}/screen-banner.webp`);
  assert.ok(enabled.state);
  assert.equal(enabled.event.created_by, undefined);
  await asRole("authenticated", admin, () => query("update public.events set screen_banner_enabled=false where id=$1", [event]));
  assert.equal((await snapshot()).event.screen_banner_enabled, false);
  assert.equal((await snapshot()).event.screen_banner_path, `events/${event}/screen-banner.webp`);
});
const first = await register("+77011234567");
await test("new registrations are active by default and duplicate registration preserves a disabled status", async () => {
  const [created] = await query("select is_active from public.participants where id=$1", [first.participant_id]);
  assert.equal(created.is_active, true);
  await query("update public.participants set is_active=false where id=$1", [first.participant_id]);
  const duplicate = await register("+77011234567");
  assert.equal(duplicate.participant_id, first.participant_id);
  const [disabled] = await query("select is_active from public.participants where id=$1", [first.participant_id]);
  assert.equal(disabled.is_active, false);
  await query("update public.participants set is_active=true where id=$1", [first.participant_id]);
});
await test("duplicate phone returns the same ticket and participant", async () => {
  const again = await register("+77011234567");
  assert.equal(again.ticket_number, first.ticket_number);
  assert.equal(again.participant_id, first.participant_id);
  assert.equal(again.already_registered, true);
});
await test("anonymous cannot read contacts or insert participants or call registration RPC", async () => {
  await asRole("anon", null, async () => {
    await assert.rejects(
      query("select phone,email from public.participants"),
      /permission denied/,
    );
    await assert.rejects(
      query(
        `insert into public.participants(event_id,name,ticket_number) values ($1,'Bad',2)`,
        [event],
      ),
      /permission denied/,
    );
    await assert.rejects(
      query(`select public.register_participant('test','Bad',null,null)`),
      /permission denied/,
    );
    assert.equal(
      (await query("select * from public.public_event_view")).length,
      1,
    );
    assert.equal(
      (await query("select * from public.event_screen_state")).length,
      1,
    );
  });
});
await test("host cannot change settings, read contacts, or elevate their role", async () => {
  await asRole("authenticated", host, async () => {
    assert.equal(
      (
        await query(
          `update public.events set name='Bad' where id=$1 returning id`,
          [event],
        )
      ).length,
      0,
    );
    assert.equal(
      (await query("select phone from public.participants")).length,
      0,
    );
    assert.equal(
      (
        await query(
          `update public.profiles set role='admin' where id=$1 returning id`,
          [host],
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await query(
          `update public.participants set is_active=false where id=$1 returning id`,
          [first.participant_id],
        )
      ).length,
      0,
    );
  });
});
let foreignEvent;
await test("event owners are isolated and hosts only see explicit assignments", async () => {
  await asRole("authenticated", secondAdmin, async () => {
    assert.equal((await query("select public.is_admin() as ok"))[0].ok, true);
  });
  const [{ event: createdEvent }] = await asRole("authenticated", secondAdmin, () =>
    query("select public.create_event('Private','private',null) as event"),
  );
  foreignEvent = createdEvent.id;
  await asRole("authenticated", admin, async () => {
    assert.equal((await query("select id from public.events where id=$1", [foreignEvent])).length, 0);
    await assert.rejects(
      query("select public.set_screen_mode($1,'paused',null)", [foreignEvent]),
      /Доступ запрещён/,
    );
  });
  await asRole("authenticated", host, async () => {
    assert.equal((await query("select id from public.events where id=$1", [foreignEvent])).length, 0);
  });
  await asRole("authenticated", secondAdmin, async () => {
    await query("insert into public.event_staff(event_id,user_id) values ($1,$2)", [foreignEvent, host]);
  });
  await asRole("authenticated", host, async () => {
    assert.equal((await query("select id from public.events where id=$1", [foreignEvent])).length, 1);
  });
  await asRole("authenticated", secondAdmin, async () => {
    await query("delete from public.event_staff where event_id=$1 and user_id=$2", [foreignEvent, host]);
  });
});
await test("co-administrators have full rights only on assigned events", async () => {
  await asRole("authenticated", coadmin, async () => {
    assert.equal((await query("select public.is_admin() as ok"))[0].ok, false);
    assert.equal((await query("select id from public.events where id=$1", [event])).length, 1);
    assert.equal((await query("select id from public.events where id=$1", [foreignEvent])).length, 0);
    assert.equal(
      (await query("update public.events set description='Managed' where id=$1 returning id", [event])).length,
      1,
    );
    assert.equal(
      (await query("update public.participants set is_active=false where id=$1 returning id", [first.participant_id])).length,
      1,
    );
    await query("update public.participants set is_active=true where id=$1", [first.participant_id]);
    const [{ id: managedPrize }] = await query(
      "insert into public.prizes(event_id,name) values($1,'Managed prize') returning id",
      [event],
    );
    await query("delete from public.prizes where id=$1", [managedPrize]);
    await query("delete from public.event_staff where event_id=$1 and user_id=$2", [event, host]);
    await query("insert into public.event_staff(event_id,user_id) values($1,$2)", [event, host]);
    assert.ok((await query("select id from public.audit_logs where event_id=$1", [event])).length > 0);
    await assert.rejects(
      query("select public.create_event('Denied','coadmin-denied',null)"),
      /Доступ запрещён/,
    );
  });
});
await test("database rejects duplicate tickets and cross-event references", async () => {
  await assert.rejects(
    query(
      `insert into public.participants(event_id,name,ticket_number) values($1,'Bad',1)`,
      [event],
    ),
    /unique/,
  );
  const [{ id: other }] = await query(
    `insert into public.events(name,slug,status,created_by) values ('Other','other','draft',$1) returning id`,
    [admin],
  );
  const [{ id: otherPrize }] = await query(
    `insert into public.prizes(event_id,name) values($1,'Other') returning id`,
    [other],
  );
  await assert.rejects(
    query(
      `insert into public.draws(event_id,prize_id,participant_id,participants_count) values($1,$2,$3,1)`,
      [event, otherPrize, first.participant_id],
    ),
    /foreign key/,
  );
  await asRole("anon", null, async () =>
    assert.equal(
      (
        await query(`select * from public.public_event_view where id=$1`, [
          other,
        ])
      ).length,
      0,
    ),
  );
});
const second = await register("+77011234568", "Eligible");
await query(`update public.participants set is_active=false where id=$1`, [
  first.participant_id,
]);
await query(`update public.events set check_in_required=true where id=$1`, [
  event,
]);
await query(
  `insert into public.participants(event_id,name,ticket_number,is_test,checked_in,checked_in_at)
values ($1,'Test guest',99,true,true,now())`,
  [event],
);
await test("inactive, unchecked and test participants never enter the draw", async () => {
  await asRole("authenticated", host, async () => {
    await assert.rejects(
      query(`select public.draw_winner($1,$2)`, [event, prize]),
      /Нет подходящих/,
    );
    await query(`select public.staff_check_in($1,$2,true)`, [
      event,
      second.ticket_number,
    ]);
    const [{ d }] = await query(
      `select to_jsonb(public.draw_winner($1,$2)) as d`,
      [event, prize],
    );
    assert.equal(d.participant_id, second.participant_id);
    assert.equal(d.participants_count, 1);
  });
});
let pending = (
  await query(`select * from public.draws where status='pending'`)
)[0];
await test("retries return the existing pending draw", async () => {
  await asRole("authenticated", host, async () => {
    const [{ d }] = await query(
      `select to_jsonb(public.draw_winner($1,$2)) as d`,
      [event, prize],
    );
    assert.equal(d.id, pending.id);
  });
  assert.equal(
    (
      await query(
        `select count(*)::int as n from public.draws where status='pending'`,
      )
    )[0].n,
    1,
  );
});
await test("cancelled draw does not consume a prize or exclude its participant", async () => {
  await asRole("authenticated", host, async () => {
    await query(`select public.cancel_draw($1)`, [pending.id]);
    const [{ d }] = await query(
      `select to_jsonb(public.draw_winner($1,$2)) as d`,
      [event, prize],
    );
    assert.equal(d.participant_id, second.participant_id);
    pending = d;
  });
});
await test("confirmation waits for the server animation deadline", async () => {
  await asRole("authenticated", host, async () =>
    assert.rejects(
      query(`select public.confirm_draw($1)`, [pending.id]),
      /анимации/,
    ),
  );
});
// Advance state deadline rather than sleep: deterministic integration test.
await query(
  `update public.event_screen_state set countdown_end=now()-interval '1 second' where event_id=$1`,
  [event],
);
await test("confirmed winner cannot win again, confirmation is idempotent", async () => {
  await asRole("authenticated", host, async () => {
    await query(`select public.confirm_draw($1)`, [pending.id]);
    await query(`select public.confirm_draw($1)`, [pending.id]);
    await assert.rejects(
      query(`select public.draw_winner($1,$2)`, [event, prize]),
      /Нет подходящих/,
    );
  });
});
await test("public screen honours name/ticket visibility and never exposes contacts", async () => {
  await query(
    `update public.events set show_participant_name=false,show_ticket_number=false where id=$1`,
    [event],
  );
  await asRole("anon", null, async () => {
    const [{ s }] = await query(`select public.get_public_screen('test') as s`);
    assert.equal(s.winner.name, null);
    assert.equal(s.winner.ticket_number, null);
    assert.equal(s.participant_count, 2);
    assert.equal(JSON.stringify(s).includes("+7701"), false);
    assert.equal(JSON.stringify(s).includes("participant_id"), false);
    await assert.rejects(
      query(`select public.draw_winner($1,$2)`, [event, prize]),
      /permission denied/,
    );
  });
});
await test("inventory constraint prevents lowering quantity below awarded count", async () => {
  await query(`update public.prizes set quantity=1 where id=$1`, [prize]);
  await query(`update public.events set allow_multiple_wins=true where id=$1`, [
    event,
  ]);
  await asRole("authenticated", host, async () =>
    assert.rejects(
      query(`select public.draw_winner($1,$2)`, [event, prize]),
      /уже выданы/,
    ),
  );
});
await test("audit is transactional and hidden from host/anon", async () => {
  const actions = (await query("select action from public.audit_logs")).map(
    (r) => r.action,
  );
  for (const action of [
    "event_created",
    "participant_created",
    "participant_disabled",
    "check_in",
    "draw_started",
    "draw_cancelled",
    "draw_confirmed",
  ])
    assert.ok(actions.includes(action), action);
  await asRole("authenticated", host, async () =>
    assert.equal((await query("select * from public.audit_logs")).length, 0),
  );
});
await test("persistent registration throttle allows ten requests per minute", async () => {
  await asRole("service_role", null, async () => {
    for (let i = 0; i < 10; i++)
      assert.equal(
        (
          await query("select public.consume_registration_limit($1) as ok", [
            "a".repeat(64),
          ])
        )[0].ok,
        true,
      );
    assert.equal(
      (
        await query("select public.consume_registration_limit($1) as ok", [
          "a".repeat(64),
        ])
      )[0].ok,
      false,
    );
  });
});
await test("test participant tools are admin-only and allocate unique tickets", async () => {
  await asRole("authenticated", host, async () =>
    assert.rejects(
      query("select public.manage_test_participants($1,10,false)", [event]),
      /Доступ запрещён/,
    ),
  );
  await asRole("authenticated", admin, async () => {
    assert.equal(
      (
        await query(
          "select public.manage_test_participants($1,10,false) as n",
          [event],
        )
      )[0].n,
      10,
    );
    assert.equal(
      (
        await query(
          "select count(distinct ticket_number)::int as n from public.participants where event_id=$1",
          [event],
        )
      )[0].n,
      13,
    );
    assert.equal(
      (
        await query("select public.manage_test_participants($1,0,true) as n", [
          event,
        ])
      )[0].n,
      11,
    );
  });
});
await test("optional phone allows distinct participants without a phone", async () => {
  await query("update public.events set require_phone=false where id=$1", [
    event,
  ]);
  const a = await register(null, "No phone A");
  const b = await register(null, "No phone B");
  assert.notEqual(a.ticket_number, b.ticket_number);
  assert.equal(b.already_registered, false);
});
await test("prize quantity cannot drop below confirmed plus reserved inventory", async () => {
  await query("update public.prizes set quantity=2 where id=$1", [prize]);
  await asRole("authenticated", host, async () => {
    const [{ d }] = await query(
      "select to_jsonb(public.draw_winner($1,$2)) as d",
      [event, prize],
    );
    pending = d;
  });
  await assert.rejects(
    query("update public.prizes set quantity=1 where id=$1", [prize]),
    /зарезервированных/,
  );
  await asRole("authenticated", host, async () =>
    query("select public.cancel_draw($1)", [pending.id]),
  );
});
await test("phone check-in normalizes Kazakhstan numbers and hides contact data", async () => {
  await asRole("authenticated", host, async () => {
    for (const phone of ["87011234568", "77011234568", "+77011234568", "8 (701) 123-45-68"]) {
      const [{ p }] = await query("select public.staff_check_in_by_phone($1,$2,true) as p", [event, phone]);
      assert.equal(p.id, second.participant_id);
      assert.equal(p.checked_in, true);
      assert.equal(p.phone, null);
      assert.equal(p.email, null);
    }
  });
});
await test("check-in retries preserve timestamps and audit count; cancellation clears the timestamp", async () => {
  const before = (await query("select checked_in_at,updated_at from public.participants where id=$1", [second.participant_id]))[0];
  const audits = (await query("select count(*)::int as n from public.audit_logs"))[0].n;
  await asRole("authenticated", admin, async () => {
    await query("select public.staff_check_in($1,$2,true)", [event, second.ticket_number]);
    await query("select public.staff_check_in_by_phone($1,$2,true)", [event, "+77011234568"]);
  });
  assert.deepEqual((await query("select checked_in_at,updated_at from public.participants where id=$1", [second.participant_id]))[0], before);
  assert.equal((await query("select count(*)::int as n from public.audit_logs"))[0].n, audits);
  await asRole("authenticated", host, async () => {
    const [{ p }] = await query("select public.staff_check_in_by_phone($1,$2,false) as p", [event, "87011234568"]);
    assert.equal(p.checked_in, false);
    assert.equal(p.checked_in_at, null);
  });
  assert.equal((await query("select count(*)::int as n from public.audit_logs where action='check_in' and entity_id=$1 and user_id=$2", [second.participant_id, host]))[0].n, 2);
});
await test("check-in rejects anonymous users and authenticated users without a staff profile", async () => {
  for (const [role, user, message] of [["anon", null, /permission denied/], ["authenticated", null, /Доступ запрещён/], ["authenticated", "00000000-0000-0000-0000-000000000099", /Доступ запрещён/]]) {
    await asRole(role, user, async () => {
      await assert.rejects(query("select public.staff_check_in($1,$2,true)", [event, second.ticket_number]), message);
      await assert.rejects(query("select public.staff_check_in_by_phone($1,$2,true)", [event, "+77011234568"]), message);
    });
  }
});
await test("check-in validates input and scopes phone lookup to its event", async () => {
  const [{ id: other }] = await query("insert into public.events(name,slug,created_by) values ('Check-in other','check-in-other',$1) returning id", [admin]);
  await query("insert into public.event_staff(event_id,user_id) values ($1,$2)", [other, host]);
  await asRole("authenticated", host, async () => {
    for (const phone of [null, "", "7011234568", "abc77011234568", "+12025550123", "7".repeat(41)]) {
      await assert.rejects(query("select public.staff_check_in_by_phone($1,$2,true)", [event, phone]), /Укажите телефон/);
    }
    await assert.rejects(query("select public.staff_check_in_by_phone($1,$2,true)", [other, "+77011234568"]), /Участник не найден/);
    await assert.rejects(query("select public.staff_check_in_by_phone($1,$2,true)", [event, "+77019999999"]), /Участник не найден/);
    await assert.rejects(query("select public.staff_check_in($1,0,true)", [event]), /корректный номер/);
    await assert.rejects(query("select public.staff_check_in($1,$2,null)", [event, second.ticket_number]), /состояние присутствия/);
  });
});
await test("screen commands reject anonymous and non-staff callers", async () => {
  for (const [role, user, message] of [["anon", null, /permission denied/], ["authenticated", null, /Доступ запрещён/], ["authenticated", "00000000-0000-0000-0000-000000000099", /Доступ запрещён/]]) {
    await asRole(role, user, async () => {
      await assert.rejects(query("select public.set_screen_mode($1,'paused',null)", [event]), message);
    });
  }
});
await test("screen commands are audited, protect pending draws and enforce pause/countdown on the server", async () => {
  const [{ id: controlled }] = await query("insert into public.events(name,slug,status,require_phone,created_by) values ('Screen controls','screen-controls','active',false,$1) returning id", [admin]);
  await query("insert into public.event_staff(event_id,user_id) values ($1,$2)", [controlled, host]);
  const [{ id: gift }] = await query("insert into public.prizes(event_id,name) values ($1,'Gift') returning id", [controlled]);
  await asRole("service_role", null, async () => query("select public.register_participant('screen-controls','Guest',null,null)"));
  await asRole("authenticated", host, async () => {
    for (const [mode, seconds] of [[null, null], ['winner', null], ['drawing', null], ['countdown', null], ['countdown', 0], ['countdown', 601], ['paused', 30]]) {
      await assert.rejects(query("select public.set_screen_mode($1,$2,$3)", [controlled, mode, seconds]), /режим|длительность|Длительность/);
    }
    await query("select public.set_screen_mode($1,'paused',null)", [controlled]);
    await assert.rejects(query("select public.draw_winner($1,$2)", [controlled, gift]), /паузы/);
    assert.equal((await query("select count(*)::int as n from public.draws where event_id=$1", [controlled]))[0].n, 0);
    await query("select public.set_screen_mode($1,'countdown',30)", [controlled]);
    await assert.rejects(query("select public.draw_winner($1,$2)", [controlled, gift]), /обратного отсчёта/);
  });
  const [{ s }] = await asRole("anon", null, async () => query("select public.get_public_screen('screen-controls') as s"));
  assert.equal(s.state.mode, 'countdown');
  assert.equal(s.winner, null);
  assert.ok(Date.parse(s.state.countdown_end) > Date.parse(s.server_time));
  await query("update public.event_screen_state set countdown_end=clock_timestamp()-interval '1 second' where event_id=$1", [controlled]);
  await asRole("authenticated", host, async () => {
    const [{ d }] = await query("select public.draw_winner($1,$2) as d", [controlled, gift]);
    for (const mode of ['paused', 'waiting', 'countdown']) {
      await assert.rejects(query("select public.set_screen_mode($1,$2,$3)", [controlled, mode, mode === 'countdown' ? 30 : null]), /завершите текущий/);
    }
    assert.equal((await query("select current_draw_id from public.event_screen_state where event_id=$1", [controlled]))[0].current_draw_id, d.id);
    await query("select public.cancel_draw($1)", [d.id]);
  });
  await asRole("authenticated", admin, async () => query("select public.set_screen_mode($1,'waiting',null)", [controlled]));
  assert.equal((await query("select count(*)::int as n from public.audit_logs where event_id=$1 and action='screen_mode_changed'", [controlled]))[0].n, 3);
  const state = (await query("select * from public.event_screen_state where event_id=$1", [controlled]))[0];
  assert.equal(state.mode, 'waiting');
  assert.equal(state.current_draw_id, null);
  assert.equal(state.current_prize_id, null);
  assert.equal(state.countdown_end, null);
  await query("update public.events set status='finished' where id=$1", [controlled]);
  await asRole("authenticated", host, async () => {
    await assert.rejects(query("select public.set_screen_mode($1,'paused',null)", [controlled]), /не активно/);
    await assert.rejects(query("select public.set_screen_mode('00000000-0000-0000-0000-000000000099','paused',null)"), /Доступ запрещён/);
  });
});
await test("rehearsal mode rejects anon, non-staff and direct screen writes", async () => {
  await asRole("anon", null, async () => {
    await assert.rejects(query("select public.set_rehearsal_mode($1,true)", [event]), /permission denied/);
  });
  await asRole("authenticated", "00000000-0000-0000-0000-000000000099", async () => {
    await assert.rejects(query("select public.set_rehearsal_mode($1,true)", [event]), /Доступ запрещён/);
  });
  await asRole("authenticated", host, async () => {
    await assert.rejects(query("update public.event_screen_state set rehearsal_mode=true where event_id=$1", [event]), /permission denied/);
    await assert.rejects(query("select public.set_rehearsal_mode($1,null)", [event]), /Укажите режим/);
  });
});

await test("rehearsals isolate test guests, preserve inventory, reset the screen and leave production winners unchanged", async () => {
  const [{ id: rehearsalEvent }] = await query("insert into public.events(name,slug,status,require_phone,check_in_required,draw_animation_seconds,created_by) values('Rehearsal','rehearsal','active',false,true,1,$1) returning id", [admin]);
  await query("insert into public.event_staff(event_id,user_id) values ($1,$2)", [rehearsalEvent, host]);
  const [{ id: rehearsalPrize }] = await query("insert into public.prizes(event_id,name,quantity) values($1,'Rehearsal prize',1) returning id", [rehearsalEvent]);
  const [{ r: real }] = await asRole("service_role", null, async () => query("select public.register_participant('rehearsal','Real guest',null,null) as r"));
  await asRole("authenticated", admin, async () => query("select public.manage_test_participants($1,10,false)", [rehearsalEvent]));
  const [{ id: testGuest }] = await query("select id from public.participants where event_id=$1 and is_test order by ticket_number limit 1", [rehearsalEvent]);
  await query("update public.participants set is_active=false where event_id=$1 and is_test and id<>$2", [rehearsalEvent, testGuest]);
  await asRole("authenticated", host, async () => query("select public.staff_check_in($1,$2,true)", [rehearsalEvent, real.ticket_number]));
  assert.equal((await query("select rehearsal_mode from public.event_screen_state where event_id=$1", [rehearsalEvent]))[0].rehearsal_mode, false);
  await asRole("authenticated", host, async () => query("select public.set_rehearsal_mode($1,true)", [rehearsalEvent]));
  const snapshot = (await asRole("anon", null, async () => query("select public.get_public_screen('rehearsal') as s")))[0].s;
  assert.equal(snapshot.state.rehearsal_mode, true);
  assert.equal(snapshot.participant_count, 10);
  const draw = (await asRole("authenticated", host, async () => query("select public.draw_winner($1,$2) as d", [rehearsalEvent, rehearsalPrize])))[0].d;
  assert.equal(draw.is_test, true);
  assert.equal(draw.participant_id, testGuest);
  assert.equal(draw.participants_count, 1);
  const retried = (await asRole("authenticated", admin, async () => query("select public.draw_winner($1,$2) as d", [rehearsalEvent, rehearsalPrize])))[0].d;
  assert.equal(retried.id, draw.id);
  await asRole("authenticated", host, async () => {
    await assert.rejects(query("select public.set_rehearsal_mode($1,false)", [rehearsalEvent]), /Сначала завершите/);
    await assert.rejects(query("select public.confirm_draw($1)", [draw.id]), /Дождитесь/);
  });
  await query("update public.event_screen_state set countdown_end=clock_timestamp()-interval '1 second' where event_id=$1", [rehearsalEvent]);
  await asRole("authenticated", host, async () => query("select public.confirm_draw($1)", [draw.id]));
  // Normal repeat-win rules also apply within a rehearsal, independently of production.
  await asRole("authenticated", host, async () => {
    await assert.rejects(query("select public.draw_winner($1,$2)", [rehearsalEvent, rehearsalPrize]), /Нет подходящих/);
  });
  await query("update public.events set allow_multiple_wins=true where id=$1", [rehearsalEvent]);
  const second = (await asRole("authenticated", host, async () => query("select public.draw_winner($1,$2) as d", [rehearsalEvent, rehearsalPrize])))[0].d;
  await query("update public.event_screen_state set countdown_end=clock_timestamp()-interval '1 second' where event_id=$1", [rehearsalEvent]);
  await asRole("authenticated", host, async () => query("select public.confirm_draw($1)", [second.id]));
  // Two confirmed rehearsals may exceed prize quantity without reserving inventory.
  await query("update public.prizes set quantity=1 where id=$1", [rehearsalPrize]);
  const stats = (await asRole("authenticated", admin, async () => query("select awarded_count from public.prize_stats where id=$1", [rehearsalPrize])))[0];
  assert.equal(Number(stats.awarded_count), 0);
  assert.equal((await asRole("authenticated", admin, async () => query("select * from public.confirmed_winners where event_id=$1", [rehearsalEvent]))).length, 0);
  const eventStats = (await asRole("authenticated", admin, async () => query("select * from public.event_stats where event_id=$1", [rehearsalEvent])))[0];
  assert.equal(Number(eventStats.confirmed_winners_count), 0);
  assert.equal(Number(eventStats.remaining_prizes_count), 1);
  await query("update public.events set allow_multiple_wins=false where id=$1", [rehearsalEvent]);
  await asRole("authenticated", host, async () => query("select public.set_rehearsal_mode($1,false)", [rehearsalEvent]));
  const normal = (await asRole("anon", null, async () => query("select public.get_public_screen('rehearsal') as s")))[0].s;
  assert.equal(normal.state.mode, "waiting");
  assert.equal(normal.state.current_draw_id, null);
  assert.equal(normal.winner, null);
  assert.equal(normal.participant_count, 1);
  const staffStats = (await asRole("authenticated", host, async () => query("select public.get_staff_stats($1) as s", [rehearsalEvent])))[0].s;
  assert.equal(staffStats.confirmed_winners_count, 0);
  assert.equal(staffStats.participants_count, 1);
  const production = (await asRole("authenticated", host, async () => query("select public.draw_winner($1,$2) as d", [rehearsalEvent, rehearsalPrize])))[0].d;
  assert.equal(production.is_test, false);
  assert.equal(production.participant_id, real.participant_id);
  await asRole("authenticated", host, async () => query("select public.cancel_draw($1)", [production.id]));
  const audit = (await query("select count(*)::int as n from public.audit_logs where event_id=$1 and action='rehearsal_mode_changed'", [rehearsalEvent]))[0];
  assert.equal(audit.n, 2);
});

await test("random prize assignment is server-side and excludes exhausted inventory", async () => {
  const [{ id: randomEvent }] = await query(
    "insert into public.events(name,slug,status,require_phone,random_prize_assignment,draw_animation_seconds,created_by) values('Random prizes','random-prizes','active',false,true,1,$1) returning id",
    [admin],
  );
  await query("insert into public.event_staff(event_id,user_id) values ($1,$2)", [randomEvent, host]);
  const [{ id: exhaustedPrize }] = await query(
    "insert into public.prizes(event_id,name,quantity) values($1,'Exhausted',1) returning id",
    [randomEvent],
  );
  const [{ id: availablePrize }] = await query(
    "insert into public.prizes(event_id,name,quantity) values($1,'Available',1) returning id",
    [randomEvent],
  );
  const [{ id: previousWinner }] = await query(
    "insert into public.participants(event_id,name,ticket_number) values($1,'Previous winner',1) returning id",
    [randomEvent],
  );
  await query(
    "insert into public.participants(event_id,name,ticket_number) values($1,'Eligible guest',2)",
    [randomEvent],
  );
  await query(
    "insert into public.draws(event_id,prize_id,participant_id,status,participants_count,confirmed_at) values($1,$2,$3,'confirmed',2,clock_timestamp())",
    [randomEvent, exhaustedPrize, previousWinner],
  );
  const [{ d: randomDraw }] = await asRole("authenticated", host, async () =>
    query("select public.draw_winner($1,null) as d", [randomEvent]),
  );
  assert.equal(randomDraw.prize_id, availablePrize);
  const [{ metadata }] = await query(
    "select metadata from public.audit_logs where entity_id=$1 and action='draw_started'",
    [randomDraw.id],
  );
  assert.equal(metadata.random_prize_assignment, true);
  assert.equal(metadata.prize_id, availablePrize);
});

await test("seed is valid and test guests cannot leak into the public counter", async () => {
  await db.exec(await readFile("supabase/seed.sql", "utf8"));
  const [{ s }] = await asRole("anon", null, async () =>
    query("select public.get_public_screen('opening-2026') as s"),
  );
  assert.equal(s.participant_count, 0);
  const [{ r }] = await asRole("service_role", null, async () =>
    query(
      "select public.register_participant('opening-2026','Real guest','+77011234999',null) as r",
    ),
  );
  assert.equal(r.ticket_number, 11);
});
console.log(
  `${checks} database checks passed. Network/Auth/Realtime and concurrent connections require Supabase integration testing.`,
);
await db.close();
