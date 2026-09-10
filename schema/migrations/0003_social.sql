-- ---------------------------------------------------------------------------
-- 0003_social.sql — follows, likes, comments, mentions, share links
--
-- Shape follows the surface documented in ../hevy-structure/01-routes-and-features.md
-- and the payloads in ../hevy-structure/02-api-private.md:
--   * follow requests exist  -> followButton.{follow,followBack,unfollow,pending,pendingApproval}
--   * mentions exist         -> account payload has comment_mention_push_enabled
--   * sharing is link-based  -> routineDetail.copyRoutineLink / shareable_folder / short ids
--
-- Target: PostgreSQL 13+. Transactional; applies on top of 0001_init.sql.
-- Mutable tables get an updated_at trigger; immutable event tables (likes,
-- mentions, shares) deliberately have no updated_at.
-- ---------------------------------------------------------------------------

begin;

-- ===========================================================================
-- Follows (with the pending state a private profile requires)
-- ===========================================================================

create type follow_status as enum ('pending', 'accepted');

create table follow (
  id           uuid primary key default gen_random_uuid(),
  follower_id  uuid not null references app_user (id) on delete cascade,
  followee_id  uuid not null references app_user (id) on delete cascade,
  -- Public followee -> 'accepted' immediately; private followee -> 'pending'
  -- until they approve. Public API/UI exposes pending + pendingApproval states.
  status       follow_status not null default 'accepted',
  responded_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- *INVARIANT*: one relationship per direction; flipping direction is a new row.
  constraint follow_pair_key unique (follower_id, followee_id),

  constraint follow_no_self_chk check (follower_id <> followee_id),

  -- A request that has not been answered cannot carry a response time.
  constraint follow_pending_response_chk
    check (responded_at is null or status <> 'pending')
);

-- Followers list of a user (also drives the "requests" view).
create index follow_followee_status_idx on follow (followee_id, status, created_at desc);
-- Following list of a user.
create index follow_follower_status_idx on follow (follower_id, status, created_at desc);

comment on table follow is
  'Follower counts are DERIVED (count(*) where followee_id = $1 and status = '
  '''accepted''), not stored, so an unfollow cannot leave a counter wrong.';

-- ===========================================================================
-- Likes (on workouts)
-- ===========================================================================

create table workout_like (
  id         uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workout (id) on delete cascade,
  user_id    uuid not null references app_user (id) on delete cascade,
  created_at timestamptz not null default now(),

  -- *INVARIANT*: double-tap cannot create a second like; unlike is a DELETE.
  constraint workout_like_pair_key unique (workout_id, user_id)
);

create index workout_like_user_idx on workout_like (user_id, created_at desc);

comment on table workout_like is
  'Deliberately NOT polymorphic (no target_type column): a real foreign key '
  'beats a convention. If you later want routine likes, add routine_like, not a '
  'second meaning for workout_id.';

-- ===========================================================================
-- Comments (one level of replies, @mentions extracted at write time)
-- ===========================================================================

create table comment (
  id                uuid primary key default gen_random_uuid(),
  workout_id        uuid not null references workout (id) on delete cascade,
  author_id         uuid not null references app_user (id) on delete cascade,
  parent_comment_id uuid,
  body              text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint comment_body_length_chk check (char_length(body) between 1 and 2000),
  constraint comment_not_own_parent_chk check (parent_comment_id is null or parent_comment_id <> id),

  -- Enables the composite FK below (parent and reply must share a workout).
  constraint comment_id_workout_key unique (id, workout_id),

  -- *INVARIANT*: a reply can never hang off a comment from a different workout.
  -- Deleting a parent deletes its replies (both FK columns live in the child).
  constraint comment_parent_same_workout_fk
    foreign key (parent_comment_id, workout_id)
    references comment (id, workout_id) on delete cascade
);

-- Thread load for a workout; the partial index keeps the root query cheap.
create index comment_workout_created_idx on comment (workout_id, created_at);
create index comment_root_idx on comment (workout_id, created_at) where parent_comment_id is null;
create index comment_parent_idx on comment (parent_comment_id) where parent_comment_id is not null;
create index comment_author_idx on comment (author_id, created_at desc);

-- Reply depth is intentionally unconstrained. If you want one level only, add a
-- `depth smallint not null default 0 check (depth between 0 and 1)` column and
-- carry parent_depth+1 from the application.

create table comment_mention (
  comment_id       uuid not null references comment (id) on delete cascade,
  mentioned_user_id uuid not null references app_user (id) on delete cascade,
  created_at       timestamptz not null default now(),

  primary key (comment_id, mentioned_user_id)
);

-- Powers "who mentioned me" (the account payload exposes mention push prefs).
create index comment_mention_user_idx on comment_mention (mentioned_user_id, created_at desc);

comment on table comment_mention is
  'Rows are written when a comment is parsed for @handles. Storing them (rather '
  'than re-parsing body text) is what makes mention notifications queryable and '
  'survive a username change.';

-- ===========================================================================
-- Share links (opaque tokens, revocable, expirable)
-- ===========================================================================

create table share (
  id                uuid primary key default gen_random_uuid(),
  token             text not null,
  owner_id          uuid not null references app_user (id) on delete cascade,
  -- Exclusive arc: exactly one target. Nullable FKs keep referential integrity,
  -- which a polymorphic (target_type, target_id) pair would give up.
  workout_id        uuid references workout (id) on delete cascade,
  routine_id        uuid references routine (id) on delete cascade,
  routine_folder_id uuid references routine_folder (id) on delete cascade,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz,
  revoked_at        timestamptz,

  constraint share_token_key unique (token),
  constraint share_exactly_one_target_chk
    check (num_nonnulls(workout_id, routine_id, routine_folder_id) = 1),
  constraint share_expiry_chk check (expires_at is null or expires_at > created_at),
  -- Guard against sequential/guessable tokens; generate >= 64 bits of entropy
  -- app-side (Hevy's are ~12 base62 chars, e.g. 'ZTNVLuJjSzM').
  constraint share_token_length_chk check (char_length(token) >= 10)
);

create index share_owner_idx   on share (owner_id, created_at desc);
create index share_workout_idx on share (workout_id);
create index share_routine_idx on share (routine_id);
create index share_folder_idx  on share (routine_folder_id);

comment on table share is
  'A share is a capability: possession of the token grants read access to one '
  'target until revoked_at/expires_at. View counts are intentionally not stored '
  'here (that would be an aggregate); log view events separately if you need them.';

-- ===========================================================================
-- updated_at maintenance (mutable social tables only)
-- ===========================================================================

create trigger follow_touch_updated_at
  before update on follow
  for each row execute function set_updated_at();
create trigger comment_touch_updated_at
  before update on comment
  for each row execute function set_updated_at();

commit;
