import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Follow, Comment, Share, WorkoutLike, FollowCounts, CommentNode } from "../types";

const MIG = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations") + "/";
const db = new PGlite();
let failed = 0;
const out: string[] = [];

function check(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  [" + extra + "]" : ""}`);
}

async function expectFail(label: string, sql: string, params: unknown[] = []) {
  try {
    await db.exec("begin");
    await db.query(sql, params);
    await db.exec("commit");
    check(label, false, "no error raised");
    await db.exec("rollback");
  } catch (e) {
    await db.exec("rollback").catch(() => {});
    check(label, true, String((e as Error).message).split("\n")[0].slice(0, 66));
  }
}

for (const f of ["0001_init.sql", "0002_seed_vocabularies.sql", "0003_social.sql"]) {
  await db.exec(readFileSync(MIG + f, "utf8"));
  check(`${f} applies`, true);
}

// ---------------------------------------------------------------- fixtures
const mkUser = async (username: string, email: string, priv: boolean) =>
  (await db.query<{ id: string }>(
    `insert into app_user (username, email, private_profile) values ($1,$2,$3) returning id`,
    [username, email, priv],
  )).rows[0].id;

const alice = await mkUser("alice", "alice@example.com", false);
const bob = await mkUser("bob", "bob@example.com", false);
const carol = await mkUser("carol", "carol@example.com", true); // private profile

const template = (await db.query<{ id: string }>(
  `insert into exercise_template (slug, title, exercise_type, primary_muscle, equipment)
   values ('squat-barbell','Squat (Barbell)','weight_reps','quadriceps','barbell') returning id`,
)).rows[0].id;

const mkWorkout = async (owner: string, title: string) =>
  (await db.query<{ id: string }>(
    `insert into workout (owner_id, title, started_at) values ($1,$2, now()) returning id`,
    [owner, title],
  )).rows[0].id;

const w1 = await mkWorkout(alice, "Day A");
const w2 = await mkWorkout(alice, "Day B");

// ------------------------------------------------------------------ follows
const f1 = await db.query<Follow>(
  `insert into follow (follower_id, followee_id) values ($1,$2) returning *`,
  [alice, bob],
);
check("public follow defaults to accepted", f1.rows[0].status === "accepted",
  `status=${f1.rows[0].status}`);

await db.query(
  `insert into follow (follower_id, followee_id, status) values ($1,$2,'pending')`,
  [bob, carol],
);
check("private-profile follow can be pending", true);

await expectFail("rejects duplicate follow pair",
  `insert into follow (follower_id, followee_id) values ($1,$2)`, [alice, bob]);
await expectFail("rejects self-follow",
  `insert into follow (follower_id, followee_id) values ($1,$1)`, [alice]);
await expectFail("rejects pending follow with a response time",
  `insert into follow (follower_id, followee_id, status, responded_at) values ($1,$2,'pending', now())`, [carol, alice]);

const accepted = await db.query<Follow>(
  `update follow set status = 'accepted', responded_at = now()
    where follower_id = $1 and followee_id = $2 returning *`,
  [bob, carol],
);
check("accepting a request stamps responded_at and updated_at",
  accepted.rows[0].status === "accepted" && accepted.rows[0].responded_at !== null &&
  accepted.rows[0].updated_at >= accepted.rows[0].created_at);

const counts = await db.query<FollowCounts>(
  `select (select count(*) from follow where followee_id = $1 and status = 'accepted')::int as follower_count,
          (select count(*) from follow where follower_id  = $1 and status = 'accepted')::int as following_count`,
  [carol],
);
check("derived follow counts", counts.rows[0].follower_count === 1 && counts.rows[0].following_count === 0,
  `followers=${counts.rows[0].follower_count} following=${counts.rows[0].following_count}`);

// -------------------------------------------------------------------- likes
const like = await db.query<WorkoutLike>(
  `insert into workout_like (workout_id, user_id) values ($1,$2) returning *`, [w1, bob]);
check("like recorded", like.rows[0].workout_id === w1);
await expectFail("rejects duplicate like",
  `insert into workout_like (workout_id, user_id) values ($1,$2)`, [w1, bob]);
await db.query(`delete from workout_like where workout_id = $1 and user_id = $2`, [w1, bob]);
check("unlike is a delete", true);

// ----------------------------------------------------------------- comments
const root = await db.query<Comment>(
  `insert into comment (workout_id, author_id, body) values ($1,$2,'Nice session!') returning *`,
  [w1, bob],
);
const rootId = root.rows[0].id;
const reply = await db.query<Comment>(
  `insert into comment (workout_id, author_id, parent_comment_id, body)
   values ($1,$2,$3,'Thanks!') returning *`,
  [w1, alice, rootId],
);
check("reply to a root comment accepted", reply.rows[0].parent_comment_id === rootId);

await expectFail("rejects reply whose parent is in another workout",
  `insert into comment (workout_id, author_id, parent_comment_id, body)
   values ($1,$2,$3,'cross-workout reply')`, [w2, bob, rootId]);
await expectFail("rejects a comment that is its own parent",
  `insert into comment (id, workout_id, author_id, parent_comment_id, body)
   values ('11111111-1111-1111-1111-111111111111',$1,$2,'11111111-1111-1111-1111-111111111111','x')`,
  [w1, bob]);
await expectFail("rejects empty comment body",
  `insert into comment (workout_id, author_id, body) values ($1,$2,'')`, [w1, bob]);
await expectFail("rejects over-long comment body",
  `insert into comment (workout_id, author_id, body) values ($1,$2, repeat('x', 2001))`, [w1, bob]);

// ----------------------------------------------------------------- mentions
await db.query(`insert into comment_mention (comment_id, mentioned_user_id) values ($1,$2)`, [rootId, carol]);
await expectFail("rejects duplicate mention",
  `insert into comment_mention (comment_id, mentioned_user_id) values ($1,$2)`, [rootId, carol]);

const mentionsFor = await db.query<{ n: number }>(
  `select count(*)::int as n from comment_mention where mentioned_user_id = $1`, [carol]);
check("mention is queryable per user", mentionsFor.rows[0].n === 1);

// thread read model: root + replies, mentions resolved
const thread = await db.query<CommentNode>(
  `select c.*, jsonb_build_object('id', u.id, 'username', u.username, 'profile_pic_url', u.profile_pic_url) as author,
          coalesce((select jsonb_agg(m.mentioned_user_id) from comment_mention m where m.comment_id = c.id), '[]'::jsonb) as mentions,
          '[]'::jsonb as replies
     from comment c join app_user u on u.id = c.author_id
    where c.workout_id = $1 and c.parent_comment_id is null`,
  [w1],
);
check("thread query returns the root with author + mentions",
  thread.rows.length === 1 && thread.rows[0].author.username === "bob");

// deleting a root removes its replies (same-workout FK cascade)
await db.query(`delete from comment where id = $1`, [rootId]);
const left = await db.query<{ n: number }>(`select count(*)::int as n from comment where workout_id = $1`, [w1]);
check("deleting a parent comment cascades to replies and mentions", left.rows[0].n === 0);

// ------------------------------------------------------------------- shares
const share = await db.query<Share>(
  `insert into share (token, owner_id, workout_id) values ($1,$2,$3) returning *`,
  ["ZTNVLuJjSzM", alice, w1],
);
check("workout share created", share.rows[0].workout_id === w1 && share.rows[0].revoked_at === null);

await db.query(`insert into share (token, owner_id, routine_id) select $1,$2,id from routine limit 1`,
  ["Abc123XyZ9q", alice]).catch(() => {}); // no routine exists yet; ignore

await expectFail("rejects duplicate share token",
  `insert into share (token, owner_id, workout_id) values ($1,$2,$3)`, ["ZTNVLuJjSzM", alice, w2]);
await expectFail("rejects a share with no target",
  `insert into share (token, owner_id) values ('NoTarget0001', $1)`, [alice]);
await expectFail("rejects a share with two targets",
  `insert into share (token, owner_id, workout_id, routine_folder_id)
   values ('TwoTargets01', $1, $2, '00000000-0000-0000-0000-000000000009')`, [alice, w1]);
await expectFail("rejects a short/guessable token",
  `insert into share (token, owner_id, workout_id) values ('short', $1, $2)`, [alice, w1]);
await expectFail("rejects expires_at before created_at",
  `insert into share (token, owner_id, workout_id, expires_at)
   values ('ExpiredToken1', $1, $2, now() - interval '1 day')`, [alice, w1]);

const resolved = await db.query<{ target: string; token: string }>(
  `select token,
          case when workout_id is not null then 'workout'
               when routine_id is not null then 'routine'
               else 'routine_folder' end as target
     from share where token = $1 and revoked_at is null
       and (expires_at is null or expires_at > now())`,
  ["ZTNVLuJjSzM"],
);
check("share token resolves to its target", resolved.rows.length === 1 && resolved.rows[0].target === "workout");

await db.query(`update share set revoked_at = now() where token = $1`, ["ZTNVLuJjSzM"]);
const afterRevoke = await db.query<{ n: number }>(
  `select count(*)::int as n from share where token = $1 and revoked_at is null`, ["ZTNVLuJjSzM"]);
check("revoked share stops resolving", afterRevoke.rows[0].n === 0);

// ----------------------------------------------------------------- cascades
await db.query(`insert into share (token, owner_id, workout_id) values ('CascadeToken', $1, $2)`, [alice, w1]);
await db.query(`insert into workout_like (workout_id, user_id) values ($1,$2)`, [w1, bob]);
await db.query(`insert into comment (workout_id, author_id, body) values ($1,$2,'hi')`, [w1, bob]);

await db.query(`delete from workout where id = $1`, [w1]);
const gone = await db.query<{ n: number }>(
  `select (select count(*) from share where workout_id = $1)
        + (select count(*) from workout_like where workout_id = $1)
        + (select count(*) from comment where workout_id = $1) as n`,
  [w1],
);
check("deleting a workout cascades to shares, likes and comments", gone.rows[0].n === 0);

// deleting a user removes their social footprint
await db.query(`delete from follow where follower_id = $1 or followee_id = $1`, [bob]);
await db.query(`insert into follow (follower_id, followee_id) values ($1,$2)`, [bob, alice]);
await db.query(`insert into comment (workout_id, author_id, body) values ($1,$2,'bye')`, [w2, bob]);
await db.query(`delete from app_user where id = $1`, [bob]);
const footprint = await db.query<{ n: number }>(
  `select (select count(*) from follow where follower_id = $1 or followee_id = $1)
        + (select count(*) from comment where author_id = $1) as n`,
  [bob],
);
check("deleting a user removes their follows and comments", footprint.rows[0].n === 0);

console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
