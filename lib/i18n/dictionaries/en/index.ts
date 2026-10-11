import { auth } from "./auth";
import { account } from "./account";
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
 * The English dictionary, and the shape every locale must satisfy.
 *
 * Keys are flat and dotted (`workouts.list.empty`) rather than nested: with one
 * file per area the merging is trivial, duplicate keys across areas are caught
 * by the compiler, and a key is greppable in one step without walking an object
 * path.
 *
 * A string containing `|` is a singular|plural pair, selected by
 * `Intl.PluralRules` for the active locale when `count` is passed.
 */
export const en = {
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
} as const;
