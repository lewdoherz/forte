# 01 — Routes and features

**Sources.** Route list and chunk graph: `_buildManifest.js` (public, 30 routes). Feature evidence:
quoted i18n keys in `_app-*.js` and the 30 route chunks — the app renders `web.<area>.<leaf>` keys,
so a route's key set *is* its UI. Counts: **30 routes**, **704 distinct `web.*` keys**, **49
`web.*` namespaces**, **18 locales**, **125 `global.*` keys**.

Evidence tags: **[manifest]** route/chunk, **[keys]** i18n in a chunk, `[INFERENCE]` reading.

---

## 1. Route table

| # | Route | Purpose | Notable features (literal keys) |
|---|---|---|---|
| 1 | `/` | Home **social feed** **[keys]** | `web.feed.leftContainer.home`, `web.feed.suggestedAthletes.title`, `web.feed.profileCard.latestActivity`; mobile funnel `web.feed.leftContainer.mobileCTA.steps.{login,downloadApp,logFirstWorkout,enjoy}` |
| 2 | `/404` | Not found | `web.metadata.404.desc` |
| 3 | `/_error` | Next error page | no `web.*` keys (hardcoded copy) |
| 4 | `/billing/update_payment` | Payment-method update `[INFERENCE]` | no route keys; purpose from path + `web.settings.subscription.updateBilling` |
| 5 | `/coach` | **Coaching** landing (gated on `stores.account.isActivelyCoached`) | `web.coach.coachingTitle`, `web.coach.coaching.desc` |
| 6 | `/coach/accept-invite/[shortId]` | Accept coach invite by short id | `web.coach.acceptInvite.{acceptInvite,acceptOrDecline,declineInvite,inviteDeclined,alreadyHaveCoachError}` |
| 7 | `/coach/[coachUsername]/accept` | Accept coach invite by username | same `web.coach.acceptInvite.*` set |
| 8 | `/coach/onboarding/[screenName]` | Coach-client onboarding wizard | `web.coach.clientOnboarding.*`, `web.coach.clientOnboardingFinish.{scanQrCode,downloadHevyApp}`, `web.coach.proIncluded.*` |
| 9 | `/create-routine/[[...destinationFolderId]]` | **Routine builder** | `web.createRoutine.{addExercise,addSet,addToSuperset,removeFromSuperset,supersetWith,restTimer,note,warnUnsavedChanges.*}`, `web.createRoutine.setIndicator.{warmUp,failure,normal}`, `web.routineSummary.{totalSets,estDuration,muscle}` |
| 10 | `/edit-routine/[routineId]` | Edit routine (same editor) | `web.createRoutine.{editRoutine,updateRoutine,updateRoutine.success}` |
| 11 | `/exercise/[[...exerciseTemplateId]]` | **Library** (no id) / **exercise detail** (id) | tabs `web.exercise.tabs.{howTo,statistics,history}`; charts `web.exercise.charts.{oneRepMax,setVolume,mostReps,bestTime,pace,totalVolume,totalTime,totalSteps,floorsPerMin,weight}`; set labels `web.exercise.setLabels.{weightReps,reps,time,distanceTime,distanceWeight,weightDuration,floorsDuration,stepsDuration}`; `web.exercise.deleteExercise.*` |
| 12 | `/folder/[folderId]` | Routine folder page | `web.folderDetail.{folderIsEmpty,folderNotFound,copyLinkToFolder,createdBy,saveFolder,saveFolderAgain.*}` |
| 13 | `/link_wellhub` | Wellhub/Gympass link (OAuth callback) | `web.metadata.linkWellhub.{success,error}` |
| 14 | `/login` | Log in | `web.login.loginCard.{title,newToHevy,signUp,forgotPassword,orWithEmail}`, `web.login.error.{apple,google,emailPassword,unknown}`, `web.login.passwordRecovery.*` |
| 15 | `/oauth/authorize` | **OAuth consent** for third-party apps | `web.oAuthAuthorize.{authorizeAccessTitle,allowAccess,chatGptRequestingPermission,permissions.*}` |
| 16 | `/onboarding/[screenName]` | Signup wizard | `web.onboarding.units.*` (kg/lbs/cm/in/km/miles), `web.onboarding.username.*`, `web.onboarding.emailVerif.*`, `web.onboarding.onboardingFinish.{enjoyHevy,bestOnMobile,continueWithWeb}` |
| 17 | `/plans` | In-app plans/paywall | `web.metadata.plans.title`, `web.paywall.cancelBtn` |
| 18 | `/pricing` | Public pricing page | `web.paywall.{pickPlan,athletesLoveHevy,cancelAnytime}`, `web.paywall.review0..6.*`, `web.paywall.comparison.*` |
| 19 | `/profile` | Own dashboard | `web.profile.timeFrame.{week,year,allTime,last12Weeks}`, `web.profile.stats.{duration,reps}`, `web.profile.calendar.seeWorkout`, `web.profile.failedToFetchWorkoutMetrics` |
| 20 | `/program/[programId]` | Hevy-authored program detail | `web.programDetail.property.{beginner,intermediate,advanced,strength,gainMuscle,loseWeight,dumbbells,gym}`, `numRoutines/numReps/numSets`, `saveProgram{,Again}.*` |
| 21 | `/routine/[shortId]` | Routine detail (share/save/delete) | `web.routineDetail.{copyRoutineLink,createdBy,editRoutine,routineNotFound,saveRoutine.*,deleteRoutine.*}` |
| 22 | `/routines` | **Routines overview** + folders | `web.routines.routinesOverview.{myRoutines,newRoutine,editRoutine,duplicateRoutine,newFolder,renameFolder,deleteFolder,createFolderModal.*,emptyState.*}` |
| 23 | `/settings` | Settings hub (largest surface, 120 keys) | see §4 |
| 24 | `/signup` | Account creation | `web.signup.{createAccount,invalidEmail,invalidPassword,emailBeingUsed}`, `web.signup.signUpCard.{termsConditions,privacyPolicy}` |
| 25 | `/trainer` | Hevy Trainer marketing | `web.trainer.subtitle`, `web.trainer.description.{withProgram,withoutProgram}` |
| 26 | `/update_password/[resetToken]` | Password reset form | `web.passwordReset.{newPassword,confirmNewPassword,success,error.*}` |
| 27 | `/user/[username]` | Public profile of another user | `web.profile.privateProfile.{privateProfile,mustApproveToSee}`, `web.profile.unauthenticated.downloadToView`, `web.profile.zeroWorkouts.hasntWorkedOut` |
| 28 | `/welcome-to-pro` | Post-purchase Pro welcome | `web.welcomeToPro.{congrats,thanksForPurchase,continueWithPro,feature.advancedMeasurements}` |
| 29 | `/workout/[workoutId]` | **Workout post detail** | `web.workoutDetails.secondColumnHeader.{reps,weightReps,weightDuration,duration,distanceTime,floorsDuration,stepsDuration,weightDistance}`, `web.workoutDetails.stats.{volume,reps,duration,distance}`, `web.workoutDetails.exercise.atRpe`, PRs `web.prTitles.{best1rm,bestWeight,bestReps,bestVolume,bestDistance,bestDuration}` |
| 30 | `/deeplink/settings/integrations` | Mobile→web deeplink into integrations | no route keys `[INFERENCE]` |

Two structural notes worth copying:

- **`/exercise/[[...exerciseTemplateId]]` is a catch-all**: no id = library grid, id = detail page.
  Same chunk serves both — a cheap pattern that avoids a second route for list vs detail.
- **Column headers are typed per exercise type** (row 29): the workout table renders different
  columns (`weightReps` vs `duration` vs `distanceTime` …) from the exercise's measurement type
  rather than a fixed schema. This is the single most reusable UI idea in the app.

---

## 2. Navigation (proved in `_app`)

| Label | iconType | path | Visible when |
|---|---|---|---|
| `global.feed` | `home` | `/` | always |
| `global.routines` | `routine` | `/routines` | always (also selected on create/edit-routine) |
| `global.exercises` | `exercise` | `/exercise` | always |
| `Trainer` (hardcoded, not i18n'd) | `trainer` | `/trainer` | always |
| `web.navBar.coach` | `coach` | `/coach` | `stores.account.isActivelyCoached` |
| `web.navBar.profile` | `profile` | `/profile` | always |
| `web.navBar.settings` | `settings` | `/settings` | conditional flag |

Nav is **role-gated**, not permission-scoped: only the coach entry is conditional. Contrast with
the OAuth scope set in `03`/README §3, which *is* fine-grained.

---

## 3. Modal inventory (proved by key namespaces)

Custom-exercise create/edit · paywall/limit upsell (`routineLimit`, `historyLimit`,
`exerciseLimit`, `noApiAccess`) · delete account (type-username confirm) · exercise info
(primary/secondary muscles, equipment) · exercise picker · followers/following list · user list
(likes) · comments · coach invite · feedback · forgot password · delete routine/folder · create +
rename folder · unsaved-changes guard (`warnUnsavedChanges.{title,message,body,confirmButton,cancelButton}`)
· re-save confirmations (`saveRoutineAgain`, `saveFolderAgain`, `saveProgramAgain`) · delete custom
exercise · purchase errors (`purchase.stripe.*`, `purchase.paddle.error.*`) · revoke API key.

**Pattern:** every destructive or repeat action has an explicit second-step confirm with its own
copy — including re-saving an already-saved shared routine. Cheap to implement, high trust payoff.

---

## 4. Settings surface (`web.settings` = 120 keys)

| Section | Capability |
|---|---|
| Profile edit | name, bio, link (with invalid-link validation), profile picture upload |
| Account | private-profile toggle, change password (current + new) |
| Preferences | theme dark/light, weight unit, body unit, distance unit, preferred language |
| Subscription | current plan, change/cancel, renewal/expiry dates, update billing; methods `subMeth.{apple,google,stripe,web,wellhub}`; plans `{freeAccount,monthly,yearly,lifetime,proMonthly,proYearly,proLifetime}`; pro-via `{Coach,Gift,Wellhub}` |
| Data | export workout data (CSV), empty-state handling when no workouts |
| **Developer** | generate/revoke **API key**, links to docs, **webhooks** subscribe (url + auth header) |
| Danger | delete account (with a special path when linked to a coach account) |
| Mobile-only notice | `web.settings.changeInMobile` for features not on web |

The Developer section is the tell that the public API is a *product surface*: API keys and
webhooks are self-service, generated from account settings (Pro-gated per the paywall's
`noApiAccess` reason).

---

## 5. Cross-cutting UX states worth budgeting for

The key set names every state explicitly, which is a good checklist for your own build:

- Empty states: `folderIsEmpty`, `notFollowingAnyone`, `noLikesYet`, `noExerciseHistory`,
  `zeroWorkouts.hasntWorkedOut`, `emptyGraph.noWorkouts`, `routinesOverview.emptyState.*`
- Not found: `routineNotFound`, `folderNotFound`, `folderMayNotExists`, `workoutNotFound`,
  `editRoutine.noRoutine`
- Permission: `privateProfile.privateProfile`, `mustApproveToSee`, `onlyYou.{onlyYou,onlyYouAndCoach}`,
  `privateWorkout.title`
- Unauthenticated upsell: `web.profile.unauthenticated.{downloadToView,exploreMore}`,
  `web.pricing.unauthenticatedPaywall.getStarted`
- Errors: `genericError.title`, `fetchExerciseHistory.error`, `failedToFetchWorkoutMetrics`,
  `fetchUserContent.error`, `unfollowFail`, `listModal.*Fail`
- i18n: **18 locales bundled**; pluralization is explicit (`numRoutines.{singular,plural}`).
