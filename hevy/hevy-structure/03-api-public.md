# 03 — The public v1 API (documented, Pro-only)

**Source:** Hevy's own OpenAPI 3.0 document, served at
[`https://api.hevyapp.com/docs`](https://api.hevyapp.com/docs) (Swagger UI; spec inlined in
`swagger-ui-init.js`). Parsed directly: **22 operations, 28 component schemas** [spec].

## 1. What Hevy says about it (verbatim)

> "Welcome to Hevy's public API! We're just starting to roll this out and depending on your
> feedback, we'll be adding more features and endpoints. Also, we make no guarantees that we won't
> completely change the structure or abandon the project entirely so use it at your own risk.
> Currently, this API is only available to Hevy Pro users. You can get your key on our web app at
> https://hevy.com/settings?developer."

Plus an operational request: *"if for whatever reason you update data from Hevy hourly or daily,
please don't send your requests exactly at xx:00. Put some random minute instead."* — i.e. they
expect polling integrations and ask for jitter. Design your own public API with the same
expectation.

## 2. Auth and transport [spec + observed]

| Aspect | Value |
|---|---|
| Auth | Required **per-operation header parameter** `api-key`, `type: string, format: uuid` |
| `securitySchemes` in spec | **none** — auth is modelled as an operation parameter, not a security scheme |
| `servers` block | **absent** — base URL implied (`https://api.hevyapp.com`) |
| Key provisioning | Self-service in Settings → Developer → `generateApiKey` / `revokeApiKey` (Pro) |
| Host | `api.hevyapp.com` — Heroku (`Server: Heroku` [observed]) |
| CORS [observed] | `Access-Control-Allow-Origin: *`, `Allow-Headers: Origin, X-Requested-With, Content-Type, Accept, api-key`, `Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS` |
| Unauthenticated response [observed] | `401`, 13-byte body |
| Versioning | Path prefix `/v1`; the private surface uses none (except `v2/user_preferences`) |

Note the CORS design: `Allow-Origin: *` with a custom `api-key` header means the key is intended for
**server-side or CLI** use — a browser could not safely hold it anyway, and the `*` prevents
credentialed use.

## 3. Operations (22)

| Method | Path | Summary | Path/query params | Request body | Response | Statuses |
|---|---|---|---|---|---|---|
| GET | `/v1/workouts` | Get a paginated list of workouts | page, pageSize | — | object | 200, 400 |
| POST | `/v1/workouts` | Create a new workout | — | PostWorkoutsRequestBody | Workout | 201, 400 |
| GET | `/v1/workouts/count` | Get the total number of workouts on the account | — | — | object | 200 |
| GET | `/v1/workouts/events` | Retrieve a paged list of workout events (updates or deletes) since a given date. Events are ordered from newest to oldest. The intention is to allow clients to keep their local cache of workouts up to date without having to fetch the entire list of workouts. | page, pageSize, since | — | PaginatedWorkoutEvents | 200, 500 |
| GET | `/v1/workouts/{workoutId}` | Get a single workout’s complete details by the workoutId | workoutId* | — | Workout | 200, 404 |
| PUT | `/v1/workouts/{workoutId}` | Update an existing workout | workoutId* | PostWorkoutsRequestBody | Workout | 200, 400 |
| GET | `/v1/user/info` | Get user info | — | — | UserInfoResponse | 200, 404 |
| GET | `/v1/routines` | Get a paginated list of routines | page, pageSize | — | object | 200, 400 |
| POST | `/v1/routines` | Create a new routine | — | PostRoutinesRequestBody | Routine | 201, 400, 403 |
| GET | `/v1/routines/{routineId}` | Get a routine by its Id | routineId* | — | object | 200, 400 |
| PUT | `/v1/routines/{routineId}` | Update an existing routine | routineId* | PutRoutinesRequestBody | Routine | 200, 400, 404 |
| GET | `/v1/exercise_templates` | Get a paginated list of exercise templates available on the account. | page, pageSize | — | object | 200, 400 |
| POST | `/v1/exercise_templates` | Create a new custom exercise template. | — | CreateCustomExerciseRequestBody | object | 200, 400, 403 |
| GET | `/v1/exercise_templates/{exerciseTemplateId}` | Get a single exercise template by id. | exerciseTemplateId* | — | ExerciseTemplate | 200, 404 |
| GET | `/v1/routine_folders` | Get a paginated list of routine folders available on the account. | page, pageSize | — | object | 200, 400 |
| POST | `/v1/routine_folders` | Create a new routine folder. The folder will be created at index 0, and all other folders will have their indexes incremented. | — | PostRoutineFolderRequestBody | RoutineFolder | 201, 400 |
| GET | `/v1/routine_folders/{folderId}` | Get a single routine folder by id. | folderId* | — | RoutineFolder | 200, 404 |
| GET | `/v1/exercise_history/{exerciseTemplateId}` | Get exercise history for a specific exercise template | exerciseTemplateId*, start_date, end_date | — | object | 200, 400 |
| GET | `/v1/body_measurements` | Get a paginated list of body measurements for the authenticated user | page, pageSize | — | object | 200, 400, 404 |
| POST | `/v1/body_measurements` | Create a body measurement entry for a given date. Returns 409 if an entry already exists for that date. | — | BodyMeasurement | — | 200, 400, 409 |
| GET | `/v1/body_measurements/{date}` | Get a single body measurement by date | date* | — | BodyMeasurement | 200, 404 |
| PUT | `/v1/body_measurements/{date}` | Update an existing body measurement entry for a given date. All fields are overwritten; omitted fields are set to null. | date* | PutBodyMeasurement | — | 200, 400, 404 |

## 4. Schema inventory (28)

| Group | Schemas |
|---|---|
| Read models | `Workout`, `Exercise` (workout-scoped), `Set`, `Routine`, `RoutineFolder`, `ExerciseTemplate`, `ExerciseHistoryEntry`, `BodyMeasurement`, `UserInfo`, `UserInfoResponse` |
| Write models | `PostWorkoutsRequestBody`, `PostWorkoutsRequestExercise`, `PostWorkoutsRequestSet`, `PutRoutinesRequestBody`, `PutRoutinesRequestExercise`, `PutRoutinesRequestSet`, `PostRoutinesRequestBody`, `PostRoutineFolderRequestBody`, `PutBodyMeasurement`, `CreateCustomExerciseRequestBody` |
| Sync/webhook envelopes | `PaginatedWorkoutEvents`, `UpdatedWorkout`, `DeletedWorkout` |
| Vocabularies (enums) | `MuscleGroup`, `EquipmentCategory`, `CustomExerciseType` |

Field-level detail is in `04-data-model.md`; the raw parsed spec is in
`data/api-public-schemas.json` and `data/api-public-endpoints.json`.

## 5. Structural observations

1. **Write models are separate from read models.** `PostWorkoutsRequestSet` vs `Set`,
   `PutRoutinesRequestExercise` vs `Routine`. This is deliberate: clients cannot accidentally post
   server-managed fields (`id`, `index`, `created_at`, `updated_at`, PRs). Copy this — it removes a
   whole class of mass-assignment bugs.
2. **A polling sync surface exists** (`GET /v1/workouts/events` + `UpdatedWorkout`/`DeletedWorkout`
   envelopes + `GET /v1/workouts/count`). Integrations discover changes by cursor, not by diffing
   the whole collection.
3. **Sets carry a nullable **rich** field set** (`distance_meters`, `duration_seconds`,
   `custom_metric`, `rep_range{start,end}`, `rpe`) — one Set row serves strength, cardio,
   timed, distance and step/floors exercises. See `04`.
4. **`GET /v1/exercise_templates` is paginated with `pageSize` max 100**; routines list caps at
   `pageSize` 10. Small, opinionated limits rather than a general cursor API.
5. **Full CRUD exists only for routines and body measurements** (`POST`/`PUT`); workouts are
   create + update (`PUT /v1/workouts/{id}`), and there is **no delete** for workouts via `v1`
   (deletion surfaces through the events feed instead).
6. **Custom exercises are readable and createable** (`POST /v1/exercise_templates`,
   `CreateCustomExerciseRequestBody`) — user-generated catalog entries sit alongside Hevy's.
