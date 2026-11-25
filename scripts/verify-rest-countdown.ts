import assert from "node:assert/strict";
import {
  adjustRestCountdown,
  advanceRestCountdown,
  dismissRestCountdown,
  emptyRestCountdown,
  markRestCountdownAlerted,
  parseRestCountdown,
  reconcileRestCountdown,
  restCountdownStorageKey,
  shouldTriggerRestAlert,
  type RestCountdownInput,
} from "../lib/rest-countdown";

const start = Date.parse("2026-01-01T00:00:00.000Z");
const input: RestCountdownInput = {
  anchor: new Date(start).toISOString(),
  anchorId: "set-1",
  validAnchorIds: ["set-1"],
  restSeconds: 90,
  workoutActive: true,
};
const running = reconcileRestCountdown(emptyRestCountdown(), input, start + 1000, true);
assert.equal(running.current?.phase, "running");
assert.equal(running.current?.deadline, start + 90_000);

const extended = adjustRestCountdown(running, 15, start + 2000);
assert.equal(extended.current?.deadline, start + 105_000);
const restored = reconcileRestCountdown(parseRestCountdown(JSON.stringify(extended)), input, start + 10_000, true);
assert.equal(restored.current?.deadline, extended.current?.deadline, "reload preserves the adjusted deadline");
assert.equal(restored.current?.phase, "running");
assert.equal(reconcileRestCountdown(restored, { ...input, restSeconds: 120 }, start + 11_000).current?.deadline,
  extended.current?.deadline, "sync and preference changes must not restart an existing rest");
assert.equal(reconcileRestCountdown(restored, { ...input, anchor: "2026-01-01T00:00:00Z" }, start + 11_000),
  restored, "equivalent timestamp serialization is the same rest");

assert.equal(reconcileRestCountdown(restored, { ...input, restSeconds: 0 }, start + 11_000).current?.phase,
  "dismissed", "turning rest Off cancels the active countdown");
const skipped = dismissRestCountdown(restored);
assert.equal(reconcileRestCountdown(parseRestCountdown(JSON.stringify(skipped)), input, start + 12_000, true).current?.phase,
  "dismissed", "skip survives reload");
const oldEntry = reconcileRestCountdown(emptyRestCountdown(), input, start + 100_000, true);
assert.equal(oldEntry.current?.phase, "dismissed", "an old completion must not show a finished cue on entry");
const finished = advanceRestCountdown(running, start + 90_000);
assert.equal(finished.current?.phase, "finished", "an observed rest ends with a visual cue");
assert.equal(reconcileRestCountdown(parseRestCountdown(JSON.stringify(finished)), input, start + 91_000, true).current?.phase,
  "dismissed", "a reload must not replay the finished cue");
assert.equal(reconcileRestCountdown(parseRestCountdown(JSON.stringify(running)), input, start + 91_000, true).current?.phase,
  "dismissed", "a rest that expired while away must not replay completion");
assert.equal(adjustRestCountdown(running, -15, start + 80_000).current?.phase, "finished");

const secondInput: RestCountdownInput = {
  ...input,
  anchor: new Date(start + 10_000).toISOString(),
  anchorId: "set-2",
  validAnchorIds: ["set-1", "set-2"],
};
const second = reconcileRestCountdown(running, secondInput, start + 11_000);
assert.equal(second.current?.anchorId, "set-2");
const undone = reconcileRestCountdown(second, input, start + 12_000);
assert.equal(undone.current?.phase, "dismissed", "undo must hide rather than revive an earlier countdown");
assert.equal(reconcileRestCountdown(parseRestCountdown(JSON.stringify(undone)), input, start + 13_000, true).current?.phase,
  "dismissed", "undo remains stopped across reload");
const unseenOlder = reconcileRestCountdown(second, {
  ...input, anchorId: "unseen", validAnchorIds: ["unseen"],
}, start + 12_000);
assert.equal(unseenOlder.current?.phase, "dismissed", "an older unseen set must not bypass the high-water mark");
assert.equal(reconcileRestCountdown(second, { ...secondInput, validAnchorIds: ["set-1"] }, start + 12_000).current?.phase,
  "dismissed", "invalid completed identities stop immediately");
assert.equal(reconcileRestCountdown(second, { ...secondInput, anchor: null }, start + 12_000).current?.phase, "dismissed");
const recompleted = reconcileRestCountdown(undone, {
  ...secondInput, anchor: new Date(start + 20_000).toISOString(),
}, start + 21_000);
assert.equal(recompleted.current?.phase, "running", "re-completing a set creates a genuinely new anchor");
assert.equal(recompleted.current?.deadline, start + 110_000);
assert.equal(reconcileRestCountdown(emptyRestCountdown(), input, start + 1000).current?.phase,
  "running", "the last exercise needs no following set to start rest");
assert.deepEqual(reconcileRestCountdown(second, { ...secondInput, workoutActive: false }, start + 12_000), emptyRestCountdown());
assert.notEqual(restCountdownStorageKey("workout", "user-1"), restCountdownStorageKey("workout", "user-2"));
assert.notEqual(restCountdownStorageKey("workout-1", "user"), restCountdownStorageKey("workout-2", "user"));
assert.deepEqual(parseRestCountdown("{invalid"), emptyRestCountdown());
assert.deepEqual(parseRestCountdown(JSON.stringify({ version: 1, current: {}, seenKeys: [] })), emptyRestCountdown());

// Fire-once alert assertions: natural expiry, skip, -15s / +15s adjustment, reload/resume.
assert.equal(shouldTriggerRestAlert(running), false, "running timer must not trigger completion alert");
assert.equal(shouldTriggerRestAlert(skipped), false, "skipped timer must never trigger completion alert");
assert.equal(shouldTriggerRestAlert(finished), true, "natural expiry triggers completion alert");
const alerted = markRestCountdownAlerted(finished);
assert.equal(shouldTriggerRestAlert(alerted), false, "alerted timer must never fire twice");
const parsedAlerted = parseRestCountdown(JSON.stringify(alerted));
assert.equal(shouldTriggerRestAlert(parsedAlerted), false, "alerted key survives serialization");
const minusExpired = adjustRestCountdown(running, -15, start + 80_000);
assert.equal(shouldTriggerRestAlert(minusExpired), true, "-15s crossing zero triggers alert once");
assert.equal(shouldTriggerRestAlert(markRestCountdownAlerted(minusExpired)), false, "-15s expiry fires only once");
const plusExtended = adjustRestCountdown(running, 15, start + 80_000);
assert.equal(shouldTriggerRestAlert(plusExtended), false, "+15s extension stays running without alerting");
assert.equal(
  shouldTriggerRestAlert(advanceRestCountdown(plusExtended, start + 105_000)),
  true,
  "extended timer alerts once when new deadline expires",
);
const resumedAfterExpiry = reconcileRestCountdown(parseRestCountdown(JSON.stringify(running)), input, start + 95_000, true);
assert.equal(shouldTriggerRestAlert(resumedAfterExpiry), false, "stale expired timer on resume must not alert");

console.log("Rest countdown assertions passed.");
