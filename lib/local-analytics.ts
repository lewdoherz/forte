import type { DurationRecordDirection, ExerciseType } from "@/schema/types";
import type { LoggedWorkout } from "@/lib/workout-sync";
import type { OfflineCatalogExercise } from "@/lib/offline-store";
import type { PreviousPerformance } from "@/lib/previous-performance";
import {
  bestRecordCandidates,
  compareRecordCandidates,
  countEarnedRecords,
  directionFor,
  extractSetRecordCandidates,
  recordCategoriesForExerciseType,
  type RecordBaseline,
  type RecordCandidate,
  type RecordCategory,
  type RecordOutcome,
} from "@/lib/records";
import { rangeStart, type ProgressRange } from "@/lib/progress";
import { summarizeWorkout } from "@/lib/workout-stats";
import { startOfLocalDay } from "@/lib/timezone";
import { formatDayAndMonth, formatWeekdayShort } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n";

export interface LocalEarnedRecord {
  workoutId: string;
  workoutTitle: string;
  startedAt: Date;
  templateId: string;
  exerciseTitle: string;
  exerciseSlug: string;
  category: RecordCategory;
  value: number;
  previousValue: number | null;
}

export interface LocalExerciseSessionPoint {
  workoutId: string;
  workoutTitle: string;
  startedAt: Date;
  completedSets: number;
  volumeKg: number;
  totalReps: number;
  bests: Partial<Record<RecordCategory, number>>;
}

export interface LocalExercisePersonalRecord {
  category: RecordCategory;
  value: number;
  workoutId: string;
  workoutTitle: string;
  achievedAt: Date;
}

export interface LocalExerciseStats {
  allTimeCompletedSets: number;
  sessions: LocalExerciseSessionPoint[];
  totals: {
    sessions: number;
    completedSets: number;
    volumeKg: number;
    totalReps: number;
    bests: Partial<Record<RecordCategory, number>>;
  };
  personalRecords: LocalExercisePersonalRecord[];
}

export interface LocalExerciseHistorySession {
  workoutId: string;
  workoutTitle: string;
  startedAt: Date;
  notes: string | null;
  sets: LoggedWorkout["exercises"][number]["sets"];
}

export interface LocalActivityDay {
  date: Date;
  weekday: string;
  label: string;
  dayOfMonth: string;
  count: number;
  today: boolean;
}

export interface LocalDashboardSummary {
  activityDays: LocalActivityDay[];
  weekTotals: {
    workouts: number;
    sets: number;
    volumeKg: number;
    records: number;
  };
  recentRecords: LocalEarnedRecord[];
  earnedByWorkoutId: Map<string, LocalEarnedRecord[]>;
}

function durationDirectionFor(
  templateId: string,
  catalogMap: Map<string, OfflineCatalogExercise>,
): DurationRecordDirection {
  return catalogMap.get(templateId)?.duration_record_direction ?? "higher";
}

function isBetter(
  candidate: number,
  current: number,
  category: RecordCategory,
  direction: DurationRecordDirection,
): boolean {
  return directionFor(category, direction) === "higher"
    ? candidate > current
    : candidate < current;
}

function completedWorkoutsOldestFirst(workouts: LoggedWorkout[]): LoggedWorkout[] {
  return workouts
    .filter((w) => w.ended_at !== null)
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
}

/**
 * Evaluates personal records chronologically across all finished workouts on the
 * device using Forte's canonical `lib/records.ts` rules.
 */
export function computeLocalEarnedRecords(
  workouts: LoggedWorkout[],
  catalog: OfflineCatalogExercise[],
): {
  earnedByWorkoutId: Map<string, LocalEarnedRecord[]>;
  allEarnedNewestFirst: LocalEarnedRecord[];
} {
  const catalogMap = new Map(catalog.map((e) => [e.id, e]));
  const baselines = new Map<string, RecordBaseline>();
  const earnedByWorkoutId = new Map<string, LocalEarnedRecord[]>();
  const allEarned: LocalEarnedRecord[] = [];

  for (const workout of completedWorkoutsOldestFirst(workouts)) {
    const workoutEarned: LocalEarnedRecord[] = [];
    const byTemplate = new Map<
      string,
      {
        title: string;
        slug: string;
        exerciseType: ExerciseType;
        direction: DurationRecordDirection;
        candidates: RecordCandidate[];
      }
    >();

    for (const ex of workout.exercises) {
      const direction = durationDirectionFor(ex.template_id, catalogMap);
      let entry = byTemplate.get(ex.template_id);
      if (!entry) {
        entry = {
          title: ex.template.title,
          slug: ex.template.slug,
          exerciseType: ex.template.exercise_type,
          direction,
          candidates: [],
        };
        byTemplate.set(ex.template_id, entry);
      }
      for (const set of ex.sets) {
        entry.candidates.push(
          ...extractSetRecordCandidates(set, ex.template.exercise_type, direction),
        );
      }
    }

    for (const [templateId, entry] of byTemplate) {
      if (entry.candidates.length === 0) continue;
      const baseline = baselines.get(templateId) ?? {};
      const outcomes: RecordOutcome[] = compareRecordCandidates(entry.candidates, baseline);
      const nextBaseline: RecordBaseline = { ...baseline };

      for (const outcome of outcomes) {
        nextBaseline[outcome.category] = outcome.value;
        if (!outcome.firstEver) {
          const item: LocalEarnedRecord = {
            workoutId: workout.id,
            workoutTitle: workout.title,
            startedAt: new Date(workout.started_at),
            templateId,
            exerciseTitle: entry.title,
            exerciseSlug: entry.slug,
            category: outcome.category,
            value: outcome.value,
            previousValue: outcome.previousValue,
          };
          workoutEarned.push(item);
          allEarned.push(item);
        }
      }
      baselines.set(templateId, nextBaseline);
    }

    earnedByWorkoutId.set(workout.id, workoutEarned);
  }

  return {
    earnedByWorkoutId,
    allEarnedNewestFirst: allEarned.reverse(),
  };
}

/**
 * Computes Home dashboard 7-day activity calendar, weekly totals, and recent
 * PRs from locally stored workouts using the same rules as `app/(app)/page.tsx`.
 */
export function computeLocalDashboardSummary(
  workouts: LoggedWorkout[],
  catalog: OfflineCatalogExercise[],
  locale: Locale,
  timeZone: string,
  now = new Date(),
): LocalDashboardSummary {
  const { earnedByWorkoutId, allEarnedNewestFirst } = computeLocalEarnedRecords(workouts, catalog);
  const dayBounds = Array.from({ length: 8 }, (_, index) =>
    startOfLocalDay(now, timeZone, { days: index - 6 }),
  );
  const windowStart = dayBounds[0];
  const windowEnd = dayBounds[7];

  const weekTotals = { workouts: 0, sets: 0, volumeKg: 0, records: 0 };
  const activityCounts = Array<number>(7).fill(0);

  for (const workout of workouts) {
    if (!workout.ended_at) continue;
    const endedAt = new Date(workout.ended_at);
    if (endedAt < windowStart || endedAt >= windowEnd) continue;

    const stats = summarizeWorkout(workout);
    weekTotals.workouts += 1;
    weekTotals.sets += stats.completedSets;
    weekTotals.volumeKg += stats.volumeKg;
    weekTotals.records += (earnedByWorkoutId.get(workout.id) ?? []).length;

    for (let day = 0; day < 7; day++) {
      if (endedAt >= dayBounds[day] && endedAt < dayBounds[day + 1]) {
        activityCounts[day] += 1;
        break;
      }
    }
  }

  const dayOfMonthFormatter = new Intl.DateTimeFormat(locale, { day: "numeric", timeZone });
  const activityDays: LocalActivityDay[] = dayBounds.slice(0, 7).map((date, index) => ({
    date,
    weekday: formatWeekdayShort(locale, date, timeZone),
    label: formatDayAndMonth(locale, date, timeZone),
    dayOfMonth: dayOfMonthFormatter.format(date),
    count: activityCounts[index],
    today: index === 6,
  }));

  return {
    activityDays,
    weekTotals,
    recentRecords: allEarnedNewestFirst.slice(0, 8),
    earnedByWorkoutId,
  };
}

/**
 * Computes Statistics tab totals, per-session chart points, and all-time
 * personal records for a single exercise from local device history.
 */
export function computeLocalExerciseStats(
  workouts: LoggedWorkout[],
  exercise: Pick<OfflineCatalogExercise, "id" | "slug" | "exercise_type" | "duration_record_direction">,
  range: ProgressRange,
  timeZone: string,
  now = new Date(),
): LocalExerciseStats {
  const direction = exercise.duration_record_direction ?? "higher";
  const categories = recordCategoriesForExerciseType(exercise.exercise_type, direction);
  const startCutoff = rangeStart(range, now, timeZone);

  let allTimeCompletedSets = 0;
  const allTimeBests = new Map<RecordCategory, LocalExercisePersonalRecord>();
  const sessions: LocalExerciseSessionPoint[] = [];

  for (const workout of completedWorkoutsOldestFirst(workouts)) {
    const matching = workout.exercises.filter(
      (e) => e.template_id === exercise.id || e.template.slug === exercise.slug,
    );
    if (matching.length === 0) continue;

    const completedSets = matching.flatMap((e) => e.sets.filter((s) => s.completed_at !== null));
    if (completedSets.length === 0) continue;

    allTimeCompletedSets += completedSets.length;
    const candidates: RecordCandidate[] = [];
    let volumeKg = 0;
    let totalReps = 0;
    for (const set of completedSets) {
      candidates.push(...extractSetRecordCandidates(set, exercise.exercise_type, direction));
      if (set.reps != null && set.reps > 0) totalReps += set.reps;
      const weight = set.weight_kg != null ? Number(set.weight_kg) : NaN;
      if (Number.isFinite(weight) && weight > 0 && set.reps != null && set.reps > 0) {
        volumeKg += weight * set.reps;
      }
    }

    const bests: Partial<Record<RecordCategory, number>> = {};
    for (const c of bestRecordCandidates(candidates)) {
      bests[c.category] = c.value;
      const existing = allTimeBests.get(c.category);
      if (!existing || isBetter(c.value, existing.value, c.category, direction)) {
        allTimeBests.set(c.category, {
          category: c.category,
          value: c.value,
          workoutId: workout.id,
          workoutTitle: workout.title,
          achievedAt: new Date(workout.started_at),
        });
      }
    }

    const startedAt = new Date(workout.started_at);
    if (!startCutoff || startedAt >= startCutoff) {
      sessions.push({
        workoutId: workout.id,
        workoutTitle: workout.title,
        startedAt,
        completedSets: completedSets.length,
        volumeKg,
        totalReps,
        bests,
      });
    }
  }

  const rangeBests: Partial<Record<RecordCategory, number>> = {};
  let rangeSets = 0;
  let rangeVolume = 0;
  let rangeReps = 0;
  for (const session of sessions) {
    rangeSets += session.completedSets;
    rangeVolume += session.volumeKg;
    rangeReps += session.totalReps;
    for (const category of categories) {
      const value = session.bests[category];
      if (value === undefined) continue;
      const prev = rangeBests[category];
      if (prev === undefined || isBetter(value, prev, category, direction)) {
        rangeBests[category] = value;
      }
    }
  }

  const personalRecords = categories
    .map((category) => allTimeBests.get(category))
    .filter((pr): pr is LocalExercisePersonalRecord => pr !== undefined);

  return {
    allTimeCompletedSets,
    sessions,
    totals: {
      sessions: sessions.length,
      completedSets: rangeSets,
      volumeKg: rangeVolume,
      totalReps: rangeReps,
      bests: rangeBests,
    },
    personalRecords,
  };
}

/**
 * Computes reverse-chronological set history for a single exercise from local workouts.
 */
export function computeLocalExerciseHistory(
  workouts: LoggedWorkout[],
  exercise: Pick<OfflineCatalogExercise, "id" | "slug">,
): LocalExerciseHistorySession[] {
  const result: LocalExerciseHistorySession[] = [];
  const newestFirst = workouts
    .filter((w) => w.ended_at !== null)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  for (const workout of newestFirst) {
    const matching = workout.exercises.filter(
      (e) => e.template_id === exercise.id || e.template.slug === exercise.slug,
    );
    const sets = matching.flatMap((e) => e.sets.filter((s) => s.completed_at !== null));
    if (sets.length === 0) continue;
    const notes = matching
      .map((e) => e.notes)
      .filter((n): n is string => Boolean(n && n.trim()))
      .join(" · ");
    result.push({
      workoutId: workout.id,
      workoutTitle: workout.title,
      startedAt: new Date(workout.started_at),
      notes: notes || null,
      sets,
    });
  }
  return result;
}

/**
 * Derives recent exercise template IDs (most recent first) from local workouts
 * and routines so the Exercise Picker always surfaces recent exercises offline.
 */
export function computeRecentExerciseIds(workouts: LoggedWorkout[], limit = 12): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const sorted = [...workouts].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );
  for (const workout of sorted) {
    for (const ex of workout.exercises) {
      if (!seen.has(ex.template_id)) {
        seen.add(ex.template_id);
        ordered.push(ex.template_id);
        if (ordered.length >= limit) return ordered;
      }
    }
  }
  return ordered;
}

/**
 * Computes a local `PreviousPerformance` map from finished workouts on the
 * device, merged on top of any server-bootstrapped `previousPerformances` so
 * offline workouts logged earlier immediately feed "Previous" hints in the
 * next workout!
 */
export function mergeLocalPreviousPerformances(
  serverPrevious: Record<string, PreviousPerformance> | undefined,
  workouts: LoggedWorkout[],
): Record<string, PreviousPerformance> {
  const merged: Record<string, PreviousPerformance> = { ...(serverPrevious ?? {}) };
  const finished = workouts
    .filter((w) => w.ended_at !== null)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  const seenLocally = new Set<string>();
  for (const workout of finished) {
    const workoutDate = new Date(workout.started_at);
    for (const ex of workout.exercises) {
      if (seenLocally.has(ex.template_id)) continue;
      const completed = ex.sets.filter((s) => s.completed_at !== null);
      if (completed.length === 0) continue;
      const existing = merged[ex.template_id];
      const existingTime = existing ? new Date(existing.performedAt).getTime() : 0;
      if (!existing || workoutDate.getTime() >= existingTime) {
        merged[ex.template_id] = {
          performedAt: workoutDate,
          sets: completed.map((s) => ({
            set_type: s.set_type,
            reps: s.reps,
            weight_kg: s.weight_kg,
            duration_seconds: s.duration_seconds,
            distance_meters: s.distance_meters,
            rpe: s.rpe,
            metrics: s.metrics,
          })),
        };
      }
      seenLocally.add(ex.template_id);
    }
  }
  return merged;
}

export { countEarnedRecords };
