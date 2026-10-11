"use client";

import { useActionState } from "react";
import {
  DURATION_RECORD_DIRECTIONS,
  EXERCISE_TYPES,
  type DurationRecordDirection,
  type ExerciseType,
} from "@/schema/types";
import { exerciseTypeLabel } from "@/lib/exercise-types";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n";
import type { ExerciseActionState } from "@/lib/exercise-actions";

type FormAction = (
  prev: ExerciseActionState | null,
  formData: FormData,
) => Promise<ExerciseActionState>;

/**
 * The message key for a stored `duration_record_direction`. The code is the key
 * suffix, so the three labels are not listed a second time here — and the
 * wording says what improves the record ("longer"/"shorter") rather than
 * exposing the persisted encoding.
 */
function durationDirectionKey(direction: DurationRecordDirection): MessageKey {
  return `exercises.durationDirection.${direction}`;
}

interface ExerciseFormProps {
  action: FormAction;
  muscles: { code: string; display_name: string }[];
  equipment: { code: string; display_name: string }[];
  submitLabel: string;
  initial?: {
    title: string;
    exercise_type: ExerciseType;
    primary_muscle: string;
    secondary_muscles: string[];
    equipment: string;
    media_url: string | null;
    how_to: string | null;
    duration_record_direction: DurationRecordDirection;
  };
}

/**
 * The create/edit form, shared by the modal route and a direct visit.
 *
 * `secondary_muscles` is a multi-select in the form of checkboxes writing the
 * existing `secondary_muscles text[]` column — the library catalog's rows were
 * imported with it, so there is no separate join table and none is needed.
 *
 * "Add Image" is a URL field rather than an upload: the app has no runtime blob
 * upload path (the only uploader is a script requiring a token the app does not
 * hold), and no dependency may be added. The URL is stored in `media_url`, which
 * the detail page renders as an image when the path is not a video.
 */
export function ExerciseForm({ action, muscles, equipment, submitLabel, initial }: ExerciseFormProps) {
  const [state, formAction, pending] = useActionState(action, null);
  const { t, locale } = useI18n();
  const selectedSecondary = new Set(initial?.secondary_muscles ?? []);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      {state?.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("exercises.field.image")}</span>
        <input
          name="media_url"
          type="url"
          defaultValue={initial?.media_url ?? ""}
          placeholder="https://example.com/image.jpg"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <span className="block text-xs text-zinc-500">{t("exercises.form.imageHint")}</span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("exercises.field.name")}</span>
        <input
          name="title"
          defaultValue={initial?.title}
          required
          maxLength={120}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("exercises.field.type")}</span>
        <select
          name="exercise_type"
          defaultValue={initial?.exercise_type ?? "weight_reps"}
          required
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          {EXERCISE_TYPES.map((type) => (
            <option key={type} value={type}>
              {exerciseTypeLabel(type, locale)}
            </option>
          ))}
        </select>
      </label>

      {/* One field, directly under the type it qualifies: the direction only
          changes what a `duration` exercise counts as a record. The select is
          always submitted, so create and update write the same explicit value
          and the input schema's default is only a backstop. */}
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("exercises.field.durationRecord")}</span>
        <select
          name="duration_record_direction"
          defaultValue={initial?.duration_record_direction ?? "higher"}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          {DURATION_RECORD_DIRECTIONS.map((direction) => (
            <option key={direction} value={direction}>
              {t(durationDirectionKey(direction))}
            </option>
          ))}
        </select>
        <span className="block text-xs text-zinc-500">
          {t("exercises.form.durationRecordHint")}
        </span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("exercises.field.equipment")}</span>
        <select
          name="equipment"
          defaultValue={initial?.equipment ?? ""}
          required
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="" disabled>
            {t("exercises.form.selectEquipment")}
          </option>
          {equipment.map((e) => (
            <option key={e.code} value={e.code}>
              {e.display_name}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("exercises.field.primaryMuscle")}</span>
        <select
          name="primary_muscle"
          defaultValue={initial?.primary_muscle ?? ""}
          required
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="" disabled>
            {t("exercises.form.selectMuscle")}
          </option>
          {muscles.map((m) => (
            <option key={m.code} value={m.code}>
              {m.display_name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">{t("exercises.field.secondaryMuscles")}</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-zinc-300 p-3 sm:grid-cols-3">
          {muscles.map((m) => (
            <label key={m.code} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="secondary_muscles"
                value={m.code}
                defaultChecked={selectedSecondary.has(m.code)}
              />
              {m.display_name}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("exercises.field.howTo")}</span>
        <textarea
          name="how_to"
          defaultValue={initial?.how_to ?? ""}
          rows={6}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? t("common.saving") : submitLabel}
      </button>
    </form>
  );
}
