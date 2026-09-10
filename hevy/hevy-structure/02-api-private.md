# 02 — The app's private API (undocumented)

**What this is.** `hevy.com` does not use the documented `api.hevyapp.com/v1` API. It calls an
undocumented, unversioned private surface on the same host, authenticated by cookies. This doc maps
it from the app's own bundle (client definitions) and from live traffic on an authenticated account.

> **Do not build against this.** It is undocumented, unversioned, CORS-open, and changes without
> notice. It is documented here so you can see *how a real fitness app shapes its domain API*.

## 1. Client configuration [bundle]

```js
// verbatim from the _app bundle
{ env: "production", apiKey: "shelobs_hevy_web", apiUrl: "https://api.hevyapp.com/" }

axios.create({
  baseURL: apiUrl,                      // https://api.hevyapp.com/
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "shelobs_hevy_web",    // client identity, NOT a user key
    "Hevy-Platform": "web",
  },
});
```

Every private request therefore carries `x-api-key: shelobs_hevy_web` + `Hevy-Platform: web`;
token refresh adds `x-client-time` (unix seconds) [bundle].

## 2. Authentication (cookie session + refresh)

| Item | Value | Evidence |
|---|---|---|
| Session cookies | `auth2.0-token` (JSON: `access_token`, `refresh_token`, `expires_at`), `access-token`, legacy `auth-token` | [observed] cookie list; [bundle] parse code |
| Refresh call | `POST auth/refresh_token`, headers `Authorization: Bearer <access_token>` + `x-client-time`, body `{refresh_token}` | [bundle] `refreshAuthTokenApiEndpoint`, `url:"auth/refresh_token"` |
| Retry policy | On "access token expired" → force refresh → retry once; on "invalid token" only if a refresh happened since the request started (prevents retry storms) | [bundle] `isAccessTokenExpiredResponse` / `isAccessTokenInvalidResponse` |
| SSR gating | Server-side redirect to `/login?postLoginPath=<path>` without a session; `_next/data` payload carries only `{isAuthenticated, browserLanguage}` | [observed] 307 on `/`, `200` on `/login` |
| Server platform | Heroku (`Server: Heroku`, Heroku NEL `Report-To`) | [observed] headers |

Design takeaway: the app ships a **generic token-manager wrapper** (refresh-on-expiry, expire
detection, single-flight throttle) around a plain axios client, and keeps the token in a cookie so
SSR can gate routes. That trio is worth copying directly.

## 3. Endpoint inventory — 93 methods [bundle]

Extracted from the client object (`getX: () => c.get("path")`) and corroborated against live calls.
`/{…}` marks a path parameter. Client method names are Hevy's own.

| Method | Path | Client method | Params |
|---|---|---|---|
| GET | `accept_client_invite/{…}` | `acceptCoachInvite` |  |
| GET | `accept_client_invite_with_short_id/{…}` | `acceptCoachInviteWithShortId` |  |
| PUT | `account` | `updateAccount` |  |
| POST | `auth/migrate` | `authMigrate` |  |
| DELETE | `auth/session` | `logout` |  |
| GET | `become_client/{…}` | `getBecomeClient` |  |
| GET | `client_invites/{…}` | `getCoachInvites` |  |
| DELETE | `client_invites/{…}` | `declineCoachInvite` |  |
| DELETE | `client_invites_with_short_id/{…}` | `declineCoachInviteWithShortId` |  |
| GET | `clients_coach/{…}` | `getCoach` |  |
| GET | `coach/join_form_metadata/{…}` | `getCoachJoinFormMetadata` |  |
| POST | `custom_exercise_template/{…}` | `postCustomExerciseTemplate` |  |
| DELETE | `custom_exercise_template/{…}` | `deleteCustomExerciseTemplate` | query |
| PUT | `custom_exercise_template/{…}` | `updateCustomExerciseTemplate` |  |
| GET | `custom_exercise_templates/{…}` | `getCustomExerciseTemplates` |  |
| POST | `email_download_link` | `generateDownloadLinkEmail` |  |
| GET | `exercise_template_units/{…}` | `getExerciseTemplateUnits` |  |
| POST | `follow/{…}` | `followUser` |  |
| GET | `follow_counts/{…}` | `getFollowCounts` |  |
| GET | `followers_paged/{…}` | `getFollowersPaged` |  |
| GET | `followers_search/{…}` | `searchFollowers` |  |
| GET | `following/{…}` | `getFollowing` |  |
| GET | `following_statuses/{…}` | `getFollowingStatuses` |  |
| GET | `hevy_trainer/program/{…}` | `getHevyTrainerProgram` |  |
| GET | `invite/{…}` | `getCoachInfoForInvite` |  |
| POST | `link_with_gympass/{…}` | `None` |  |
| POST | `login` | `login` |  |
| POST | `login_apple_web` | `None` |  |
| POST | `login_google_web` | `signInWithGoogle` |  |
| GET | `oauth/client/{…}` | `getOAuthClient` |  |
| GET | `oauth/code?client_id=/{…}` | `getOAuthAuthorise` |  |
| GET | `paddle_prices/{…}` | `getPaddlePrices` |  |
| GET | `paddle_promo_code_details/{…}` | `getPaddlePromoCodeDetails` |  |
| POST | `presigned_url` | `getPresignedUrl` |  |
| GET | `public_user_profile/{…}` | `getPublicUserProfile` |  |
| GET | `recommended_users/{…}` | `getRecommendedUsers` |  |
| POST | `recover_password` | `generatePasswordRecoveryEmail` |  |
| POST | `routine/{…}` | `postRoutine` | query |
| DELETE | `routine/{…}` | `deleteRoutine` | query |
| GET | `routine/{…}` | `getRoutine` | query |
| PUT | `routine/{…}` | `updateRoutine` | query |
| POST | `routine_copy/{…}` | `postRoutineCopy` | query |
| POST | `routine_folder/{…}` | `postRoutineFolder` | query |
| PUT | `routine_folder/{…}` | `updateRoutineFolder` | query |
| DELETE | `routine_folder/{…}` | `deleteRoutineFolder` | query |
| PUT | `routine_folder_order` | `updateRoutineFolderOrder` | query |
| GET | `routine_folders` | `getRoutineFolders` | query |
| PUT | `routine_locations` | `updateRoutineLocations` | query |
| GET | `routine_with_short_id/{…}` | `getRoutineWithShortId` | query |
| POST | `routines_sync_batch/{…}` | `getRoutinesSync` | query |
| POST | `send_signup_verification_email` | `None` | query |
| GET | `shareable_folder/{…}` | `getShareableFolderById` |  |
| POST | `sign_up_google_web` | `signUpWithGoogle` |  |
| POST | `signup` | `None` | query |
| POST | `signup_apple_web` | `None` |  |
| POST | `signup_with_verified_email` | `None` |  |
| POST | `unfollow/{…}` | `unfollowUser` |  |
| POST | `update_password` | `updatePasswordWithToken` |  |
| PUT | `update_password_with_password` | `updatePassword` |  |
| DELETE | `user/{…}` | `deleteAccount` |  |
| GET | `user/account` | `getAccount` |  |
| POST | `user/change_paddle_plan/{…}` | `changePaddlePlan` |  |
| DELETE | `user/paddle_plan/{…}` | `cancelPaddlePlan` |  |
| GET | `user/paddle_urls/{…}` | `getPaddleUrls` |  |
| GET | `user_calendar_workouts/{…}` | `getUserCalendarWorkouts` | query |
| GET | `user_exercise_history_paged` | `getUserExerciseHistory` | query |
| GET | `user_exercise_sets/{…}` | `getUserExerciseSets` | query |
| GET | `user_key_values/{…}` | `getUserKeyValues` |  |
| PUT | `user_key_values/{…}` | `updateUserKeyValues` | query |
| PUT | `user_preferences/{…}` | `updateUserPreferences` |  |
| GET | `user_profile/{…}` | `getUserProfile` |  |
| DELETE | `user_public_api_key/{…}` | `deleteUserPublicApiKey` |  |
| GET | `user_public_api_key/{…}` | `getUserPublicApiKey` |  |
| POST | `user_public_api_key/{…}` | `createUserPublicApiKey` |  |
| GET | `user_subscription` | `getUserSubscription` |  |
| GET | `user_workout_images/{…}` | `getUserWorkoutImages` |  |
| GET | `user_workout_metrics/{…}` | `getUserWorkoutMetrics` | query |
| GET | `user_workouts_paged/{…}` | `getUserWorkoutsPaged` | query |
| PUT | `username` | `updateUsername` |  |
| GET | `users/{…}` | `userSearch` |  |
| POST | `v2/feedback/{…}` | `postFeedback` |  |
| GET | `v2/user_preferences` | `getUserPreferences` |  |
| GET | `webhook-subscription/{…}` | `getWebhookSubscription` |  |
| POST | `webhook-subscription` | `None` |  |
| GET | `workout/{…}` | `getWorkout` | query |
| POST | `workout/like/{…}` | `likeWorkout` |  |
| POST | `workout/unlike/{…}` | `unlikeWorkout` |  |
| POST | `workout_comment/{…}` | `postWorkoutComment` |  |
| DELETE | `workout_comment/{…}` | `deleteWorkoutComment` |  |
| GET | `workout_comments/{…}` | `getWorkoutComments` |  |
| GET | `workout_count/{…}` | `getWorkoutCount` |  |
| GET | `workout_likes/{…}` | `getWorkoutLikes` |  |
| GET | `workouts_batch/{…}` | `getWorkoutsBatch` |  |

## 4. Response shapes actually observed (25 live calls, all HTTP 200)

Shapes are structural only — key names and types, **no personal values reproduced**.

| Endpoint | Status | Bytes | Top-level shape |
|---|---|---|---|
| `/client_invites` | 200 | 2 | [0× ?] |
| `/clients_coach` | 404 | 12 | truncated/non-json |
| `/custom_exercise_templates` | 200 | 698 | [1× {id, title, priority, is_custom, is_archived, exercise_type, equipment_category, muscle_group, other_muscles, custom_exercise_image_url, thumbnail_url, url, media_type}] |
| `/exercise_template_units` | 200 | 2 | [0× ?] |
| `/feed_workouts_paged` | 200 | 18017 | {workouts} |
| `/feed_workouts_paged/329186830` | 200 | 18860 | {workouts} |
| `/follow_counts` | 200 | 40 | {follower_count, following_count} |
| `/following_statuses` | 200 | 2 |  |
| `/hevy_trainer/program` | 200 | 2 |  |
| `/paddle_prices` | 200 | 290 | [3× {paddle_price_id, billing_period, price_usd}] |
| `/recommended_users` | 200 | 2336 | [7× {id, username, verified, full_name, profile_pic, following_status, private_profile, following, label}] |
| `/routine_folders` | 200 | 2 | [0× ?] |
| `/routine_with_short_id/2oxdt9VDsv3` | 200 | 7239 | {routine} |
| `/routines_sync_batch` | 200 | 82 | {updated, deleted, isMore, updated_at} |
| `/user/account` | 200 | 781 | {id, username, email, profile_pic, is_strava_connected, is_chatgpt_oauth_authorized, country_code, city, likes_push_enabled, follows_push_enabled, comments_push_enabled, comment_mention_push_enabled, comment_discussion_push_enabled, private_profile…} |
| `/user_calendar_workouts/2026/9` | 200 | 100 | [1× {workout_short_id, title, start_time, duration_seconds}] |
| `/user_key_values` | 200 | 154 | {hasDismissedDragAndDropRoutineTip, UPDATED_AT, SELECT_GYM_TOOLTIP_DISMISSED_KEY, MonthlyReportPushEnabled} |
| `/user_profile/lewsherz` | 200 | 2471 | {username, verified, subscribed, profile_pic, workout_count, is_blocked, following_status, is_followed_by_requester, private_profile, follower_count, following_count, routines, weekly_workout_durations, mutual_followers} |
| `/user_subscription` | 200 | 153 | {is_pro, active_subscription} |
| `/user_workout_images/lewsherz/5` | 200 | 2 | [0× ?] |
| `/user_workout_metrics/duration/1781366400/1789030998` | 200 | 361 | [3× {workout_id, type, start_time, duration_seconds}] |
| `/user_workouts_paged` | 200 | 18017 | {workouts} |
| `/v2/user_preferences` | 200 | 312 | {username, weight_unit, distance_unit, body_measurement_unit, first_weekday, superset_scrolling, plate_calculator_enabled, rpe_enabled, inline_set_timer_enabled, default_workout_visibility_public, volume_includes_warmup_sets} |
| `/workout/ZTNVLuJjSzM` | 200 | 6608 | {id, gym, name, index, media, user_id, comments, end_time, short_id, username, verified, exercises, created_at, image_urls…} |
| `/workout_count` | 200 | 19 | {workout_count} |

### Conventions that differ from the public v1 API [observed]

| Concern | Private API | Public v1 API |
|---|---|---|
| Set type field | `indicator` (`normal` / `warmup` / `failure` / `dropset`) | `type` |
| Timestamps | unix seconds (e.g. `end_time: 1788672561`) | ISO-8601 strings |
| Workout title field | `name` | `title` |
| Exercise title | base `title` + 17 localized `*_title` keys | `title` alone |
| Ordering | explicit `index` on exercises and sets | array order |
| Identity | UUID `id` **plus** `short_id` for URLs/sharing | UUID only |
| Extras | `prs`, `personalRecords`, `geospatial_data`, `rpe`, `verified`, `priority`, `manual_tag`, `aka` | omitted |

## 5. Notable write and integration paths [bundle + observed]

| Capability | Endpoints |
|---|---|
| Routine sync (called on `/routines` load) | `POST routines_sync_batch` — a batch/sync-style write, not per-routine CRUD [observed: 200, 82-byte response] |
| Routine CRUD | `POST routine`, `PUT routine/{id}`, `DELETE routine/{id}`, `GET routine/{id}`, `POST routine_copy/{id}`, `GET routine_with_short_id/{id}` |
| Folders & ordering | `POST/PUT/DELETE routine_folder`, `PUT routine_folder_order`, `PUT routine_locations`, `GET routine_folders` |
| Custom exercises | `POST/PUT/DELETE custom_exercise_template`, `GET custom_exercise_templates` |
| Uploads | `POST presigned_url` — client asks for a signed URL, then uploads out-of-band |
| Public API self-service | `GET/POST/DELETE user_public_api_key` — the Developer settings UI |
| Webhooks | `GET/POST webhook-subscription` |
| Billing | `GET paddle_prices`, `GET paddle_promo_code_details`, `POST user/change_paddle_plan/{id}`, `DELETE user/paddle_plan/{id}`, `GET user/paddle_urls`, `GET user_subscription`, `POST link_with_gympass` |
| OAuth (as a provider) | `GET oauth/client/{id}`, `GET oauth/code?client_id=` |
| Coach / clients | `GET clients_coach`, `GET invite/{…}`, `GET|DELETE client_invites`, `GET accept_client_invite`, `GET become_client`, `GET coach/join_form_metadata` |
| Social | `POST follow/{id}`, `POST unfollow/{id}`, `GET followers_paged`, `GET following`, `GET following_statuses`, `POST workout/like/{id}`, `GET workout_likes/{id}`, `POST workout_comment`, `DELETE workout_comment/{id}`, `GET workout_comments/{id}`, `GET feed_workouts_paged` |
| Analytics inputs | `GET user_workout_metrics/{type}/{from}/{to}`, `GET user_calendar_workouts/{year}/{month}`, `GET user_exercise_history_paged`, `GET user_exercise_sets/{templateId}/{iso}`, `GET workout_count`, `GET workouts_batch` |

**The sync-batch pattern is the interesting one**: rather than a chatty per-entity CRUD API, the
routines page reconciles the whole collection in a single `routines_sync_batch` call — better for a
mobile client returning from offline with local edits. If your app is offline-first, design this
endpoint deliberately (idempotency key + per-item results) instead of bolting it on later.

## 6. Gaps / not verified

- All write endpoints except `routines_sync_batch` were **never invoked** (read-only survey).
- Request bodies for private writes are **UNKNOWN** except what the bundle's call signatures show
  (e.g. `login {emailOrUsername, password, gympassUserId, recaptchaToken}`).
- Error envelopes beyond the CORS/Heroku defaults were not sampled.
- `GET hevy_trainer/program` returned a 2-byte body (`{}`), i.e. empty for this account.
