/**
 * Messages for the "dashboard" area: the home page's greeting, next-session
 * hero, seven-day activity strip, weekly totals, quick start, recent history
 * and recent PRs.
 *
 * Flat, dotted keys. A key whose text differs by count is written as
 * "singular|plural" and rendered with `t(key, { count })`, which selects
 * the form with Intl.PluralRules for the active locale.
 */
export const dashboard = {
  /* The page header and its greeting. */
  "dashboard.title": "Dashboard",
  "dashboard.greeting.named": "Welcome, {name}. Your next workout starts here.",
  "dashboard.greeting.guest": "Welcome to forte. Your next workout starts here.",
  "dashboard.viewProgress": "View progress",

  /* The next-session hero. */
  "dashboard.hero.eyebrowActive": "Workout in progress",
  "dashboard.hero.eyebrowIdle": "Make time for your next session",
  "dashboard.hero.titleIdle": "Ready when you are.",
  "dashboard.hero.bodyActive": "Pick up where you left off. Your workout is ready to continue.",
  "dashboard.hero.bodyIdle":
    "Start with a blank workout, or choose a routine below to bring your planned exercises along.",
  "dashboard.hero.started": "Started {date}",
  "dashboard.hero.resume": "Resume workout",
  "dashboard.hero.startEmpty": "Start empty workout",
  "dashboard.hero.chooseRoutine": "Choose a routine",

  /* The seven-day strip and the week's totals. */
  "dashboard.activity.title": "Last 7 days",
  "dashboard.activity.listLabel": "Finished workouts by day",
  /* The strip cell's accessible name: weekday, date, then the count. `{today}`
     is the locale's own ", today" suffix, empty on every other day. */
  "dashboard.activity.dayLabel":
    "{weekday}, {date}{today}: {count} finished workout|{weekday}, {date}{today}: {count} finished workouts",
  "dashboard.activity.todaySuffix": ", today",
  "dashboard.activity.footnote": "Finished sessions · {timeZone}",
  "dashboard.metric.workouts": "Workouts",
  "dashboard.metric.sets": "Completed sets",
  "dashboard.metric.volume": "Volume",
  "dashboard.metric.records": "Records",
  "dashboard.moreActive.label": "Other workouts in progress",

  /* Quick start: the routines offered as one-tap starts. */
  "dashboard.quickStart.title": "Quick start",
  "dashboard.quickStart.subtitle": "Your routines, ready to train.",
  "dashboard.quickStart.allRoutines": "All routines",
  "dashboard.quickStart.routineHint": "Add exercises to this routine, or start and build as you go.",
  "dashboard.quickStart.start": "Start routine",
  "dashboard.quickStart.startLabel": "Start {title}",
  "dashboard.quickStart.emptyTitle": "Build a routine that fits you",
  "dashboard.quickStart.emptyBody":
    "Pick your exercises once, then start your next session with the plan already in place.",
  "dashboard.quickStart.emptyCta": "Create your first routine",

  /* Recent history. */
  "dashboard.recent.title": "Recent workouts",
  "dashboard.recent.all": "All workouts",
  "dashboard.recent.emptyTitle": "Your training history starts here",
  "dashboard.recent.emptyBody":
    "Finish a workout to see its exercises, completed sets and summary here. Sessions in progress stay at the top of your dashboard.",
  "dashboard.recent.emptyCta": "Find exercises for your first session",

  /* Recent PRs. The category names come from the shared records vocabulary. */
  "dashboard.records.title": "Recent PRs",
  "dashboard.records.subtitle": "Earned in recent workouts",
  "dashboard.records.unknownExercise": "Exercise",
  "dashboard.records.viewWorkout": "View workout",
  "dashboard.records.viewWorkoutLabel": "View workout for {title}: {category}",
  "dashboard.records.emptyTitle": "Progress worth remembering",
  "dashboard.records.emptyBody":
    "A PR appears when a finished workout beats an earlier performance for the same exercise. Your first performance sets the baseline, not a record to beat.",
  "dashboard.records.emptyCta": "Explore your exercise statistics",

  /* The shortcut list at the foot of the page. */
  "dashboard.tools.title": "Make your next session easier",
  "dashboard.tools.createRoutine.title": "Create a routine",
  "dashboard.tools.createRoutine.body": "Plan exercises and sets for next time.",
  "dashboard.tools.browseExercises.title": "Browse exercises",
  "dashboard.tools.browseExercises.body": "Find movements and review how to do them.",
} as const;
