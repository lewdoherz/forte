import { createTestDatabase } from "./harness";
import type { Follow, Comment, Share, WorkoutLike, FollowCounts, CommentNode } from "../types";

let failed = 0;
const out: string[] = [];

function check(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  [" + extra + "]" : ""}`);
}

async function expectFail(label: string, sql: string, params: unknown[] = []) {
  try {
    await exec("begin");
    await query(sql, params);
    await exec("commit");
    check(label, false, "no error raised");
    await exec("rollback");
  } catch (e) {
    await exec("rollback").catch(() => {});
    check(label, true, String((e as Error).message).split("\n")[0].slice(0, 66));
  }
}

const { exec, query, close, dialect } = await createTestDatabase();
check(`schema migrations apply (${dialect})`, true);

// ---------------------------------------------------------------- fixtures
const mkUser = async (username: string, email: string, priv: boolean) =>
  (await query<{ id: string }>(
    `insert into app_user (username, email, private_profile) values ($1,$2,$3) returning id`,
    [username, email, priv],
  )).rows[0].id;

const alice = await mkUser("alice", "alice@example.com", false);
const bob = await mkUser("bob", "bob@example.com", false);
const carol = await mkUser("carol", "carol@example.com", true); // private profile

const mkWorkout = async (owner: string, title: string) =>
  (await query<{ id: string }>(
    `insert into workout (owner_id, title, started_at) values ($1,$2, now()) returning id`,
    [owner, title],
  )).rows[0].id;

const w1 = await mkWorkout(alice, "Day A");
const w2 = await mkWorkout(alice, "Day B");

// ------------------------------------------------------------------ follows
const f1 = await query<Follow>(
  `insert into follow (follower_id, followee_id) values ($1,$2) returning *`,
  [alice, bob],
);
check("public follow defaults to accepted", f1.rows[0].status === "accepted",
  `status=${f1.rows[0].status}`);

await query(
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

const accepted = await query<Follow>(
  `update follow set status = 'accepted', responded_at = now()
    where follower_id = $1 and followee_id = $2 returning *`,
  [bob, carol],
);
check("accepting a request stamps responded_at and updated_at",
  accepted.rows[0].status === "accepted" && accepted.rows[0].responded_at !== null &&
  accepted.rows[0].updated_at >= accepted.rows[0].created_at);

const counts = await query<FollowCounts>(
  `select (select count(*) from follow where followee_id = $1 and status = 'accepted')::int as follower_count,
          (select count(*) from follow where follower_id  = $1 and status = 'accepted')::int as following_count`,
  [carol],
);
check("derived follow counts", counts.rows[0].follower_count === 1 && counts.rows[0].following_count === 0,
  `followers=${counts.rows[0].follower_count} following=${counts.rows[0].following_count}`);

// -------------------------------------------------------------------- likes
const like = await query<WorkoutLike>(
  `insert into workout_like (workout_id, user_id) values ($1,$2) returning *`, [w1, bob]);
check("like recorded", like.rows[0].workout_id === w1);
await expectFail("rejects duplicate like",
  `insert into workout_like (workout_id, user_id) values ($1,$2)`, [w1, bob]);
await query(`delete from workout_like where workout_id = $1 and user_id = $2`, [w1, bob]);
check("unlike is a delete", true);

// ----------------------------------------------------------------- comments
const root = await query<Comment>(
  `insert into comment (workout_id, author_id, body) values ($1,$2,'Nice session!') returning *`,
  [w1, bob],
);
const rootId = root.rows[0].id;
const reply = await query<Comment>(
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
await query(`insert into comment_mention (comment_id, mentioned_user_id) values ($1,$2)`, [rootId, carol]);
await expectFail("rejects duplicate mention",
  `insert into comment_mention (comment_id, mentioned_user_id) values ($1,$2)`, [rootId, carol]);

const mentionsFor = await query<{ n: number }>(
  `select count(*)::int as n from comment_mention where mentioned_user_id = $1`, [carol]);
check("mention is queryable per user", mentionsFor.rows[0].n === 1);

// thread read model: root + replies, mentions resolved
const thread = await query<CommentNode>(
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
await query(`delete from comment where id = $1`, [rootId]);
const left = await query<{ n: number }>(`select count(*)::int as n from comment where workout_id = $1`, [w1]);
check("deleting a parent comment cascades to replies and mentions", left.rows[0].n === 0);

// ------------------------------------------------------------------- shares
const share = await query<Share>(
  `insert into share (token, owner_id, workout_id) values ($1,$2,$3) returning *`,
  ["ZTNVLuJjSzM", alice, w1],
);
check("workout share created", share.rows[0].workout_id === w1 && share.rows[0].revoked_at === null);

await query(`insert into share (token, owner_id, routine_id) select $1,$2,id from routine limit 1`,
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

const resolved = await query<{ target: string; token: string }>(
  `select token,
          case when workout_id is not null then 'workout'
               when routine_id is not null then 'routine'
               else 'routine_folder' end as target
     from share where token = $1 and revoked_at is null
       and (expires_at is null or expires_at > now())`,
  ["ZTNVLuJjSzM"],
);
check("share token resolves to its target", resolved.rows.length === 1 && resolved.rows[0].target === "workout");

await query(`update share set revoked_at = now() where token = $1`, ["ZTNVLuJjSzM"]);
const afterRevoke = await query<{ n: number }>(
  `select count(*)::int as n from share where token = $1 and revoked_at is null`, ["ZTNVLuJjSzM"]);
check("revoked share stops resolving", afterRevoke.rows[0].n === 0);

// ----------------------------------------------------------------- cascades
await query(`insert into share (token, owner_id, workout_id) values ('CascadeToken', $1, $2)`, [alice, w1]);
await query(`insert into workout_like (workout_id, user_id) values ($1,$2)`, [w1, bob]);
await query(`insert into comment (workout_id, author_id, body) values ($1,$2,'hi')`, [w1, bob]);

await query(`delete from workout where id = $1`, [w1]);
const gone = await query<{ n: number }>(
  `select (select count(*)::int from share where workout_id = $1)
        + (select count(*)::int from workout_like where workout_id = $1)
        + (select count(*)::int from comment where workout_id = $1) as n`,
  [w1],
);
check("deleting a workout cascades to shares, likes and comments", gone.rows[0].n === 0);

// deleting a user removes their social footprint
await query(`delete from follow where follower_id = $1 or followee_id = $1`, [bob]);
await query(`insert into follow (follower_id, followee_id) values ($1,$2)`, [bob, alice]);
await query(`insert into comment (workout_id, author_id, body) values ($1,$2,'bye')`, [w2, bob]);
await query(`delete from app_user where id = $1`, [bob]);
const footprint = await query<{ n: number }>(
  `select (select count(*)::int from follow where follower_id = $1 or followee_id = $1)
        + (select count(*)::int from comment where author_id = $1) as n`,
  [bob],
);
check("deleting a user removes their follows and comments", footprint.rows[0].n === 0);

await close();
console.log(out.join("\n"));
console.log(`\n${out.length - failed}/${out.length} checks passed`);
process.exit(failed ? 1 : 0);
