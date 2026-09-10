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