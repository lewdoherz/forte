import type { Messages } from "../../index";

import { account } from "./account";
import { auth } from "./auth";
import { common } from "./common";
import { dashboard } from "./dashboard";
import { email } from "./email";
import { errors } from "./errors";
import { exercises } from "./exercises";
import { exerciseDetail } from "./exerciseDetail";
import { logger } from "./logger";
import { metrics } from "./metrics";
import { records } from "./records";
import { offline } from "./offline";
import { progress } from "./progress";
import { routines } from "./routines";
import { workouts } from "./workouts";

/**
 * Simplified Chinese (Mandarin).
 *
 * Typed as `Messages`, which is `Record<MessageKey, string>` over the English
 * dictionary: a key added on the English side without a Chinese counterpart is
 * a compile error, which is the only thing keeping a 700-key vocabulary
 * complete. Ordering here is irrelevant; the compiler checks membership only.
 */
export const zhCN: Messages = {
  ...common,
  ...auth,
  ...account,
  ...dashboard,
  ...exercises,
  ...exerciseDetail,
  ...routines,
  ...workouts,
  ...logger,
  ...progress,
  ...metrics,
  ...records,
  ...errors,
  ...email,
  ...offline,
};
