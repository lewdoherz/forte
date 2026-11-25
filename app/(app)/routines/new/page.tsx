import { db } from "@/lib/db";
import { getVocabularies, listExercises } from "@/lib/exercises";
import { listRoutineFolders } from "@/lib/routines";
import { requireSessionUserId } from "@/lib/auth-session";
import { getI18n } from "@/lib/i18n/server";
import { RoutineEditor } from "@/components/routine-editor";

export default async function NewRoutinePage() {
  const userId = await requireSessionUserId();
  const { t } = await getI18n();
  const [exercises, { muscles, equipment }, folders] = await Promise.all([
    listExercises(db, userId, {}),
    getVocabularies(db),
    listRoutineFolders(db, userId),
  ]);
  const library = exercises.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    primary_muscle: e.primary_muscle,
    secondary_muscles: e.secondary_muscles,
    exercise_type: e.exercise_type,
    equipment: e.equipment,
    how_to: e.how_to,
    media_url: e.media_url,
    duration_record_direction: e.duration_record_direction,
    is_custom: e.is_custom,
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold">{t("routines.create")}</h1>
      <RoutineEditor library={library} muscles={muscles} equipment={equipment} folders={folders} />
    </main>
  );
}
