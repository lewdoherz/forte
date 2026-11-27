"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RoutineFolder } from "@/schema/types";
import type { RoutineListItem } from "@/lib/routines";
import {
  deleteRoutineFolder,
  organizeRoutinesAction,
  saveRoutineFolder,
} from "@/lib/routine-actions";
import { startWorkoutFormAction } from "@/lib/workout-actions";
import { syncOfflineData } from "@/lib/offline-sync";
import { useI18n } from "@/lib/i18n/context";

export function RoutineFolderManager({
  folders,
  routines,
}: {
  folders: RoutineFolder[];
  routines: RoutineListItem[];
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [busy, setBusy] = useState(false);

  const grouped = new Map<string | null, RoutineListItem[]>();
  grouped.set(null, []);
  for (const f of folders) grouped.set(f.id, []);
  for (const r of routines) {
    const key = r.folder_id && grouped.has(r.folder_id) ? r.folder_id : null;
    grouped.get(key)!.push(r);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  }

  async function refreshAfterMutation() {
    void syncOfflineData();
    router.refresh();
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim() || busy) return;
    setBusy(true);
    try {
      await saveRoutineFolder({ title: newFolderName.trim() });
      setNewFolderName("");
      setNewFolderOpen(false);
      await refreshAfterMutation();
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteFolder(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await deleteRoutineFolder(id);
      await refreshAfterMutation();
    } finally {
      setBusy(false);
    }
  }

  async function handleMoveFolder(routine: RoutineListItem, nextFolderId: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      const dest = grouped.get(nextFolderId) ?? [];
      await organizeRoutinesAction([
        { id: routine.id, folder_id: nextFolderId, position: dest.length },
      ]);
      await refreshAfterMutation();
    } finally {
      setBusy(false);
    }
  }

  async function handleReorder(folderId: string | null, index: number, delta: -1 | 1) {
    if (busy) return;
    const list = [...(grouped.get(folderId) ?? [])];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const [moved] = list.splice(index, 1);
    list.splice(target, 0, moved);
    setBusy(true);
    try {
      await organizeRoutinesAction(
        list.map((r, pos) => ({ id: r.id, folder_id: folderId, position: pos })),
      );
      await refreshAfterMutation();
    } finally {
      setBusy(false);
    }
  }

  function renderRoutineCard(
    routine: RoutineListItem,
    index: number,
    total: number,
    folderId: string | null,
  ) {
    return (
      <li key={routine.id} className="training-panel flex min-w-0 flex-col rounded-2xl p-4">
        <Link
          href={`/routines/${routine.id}`}
          className="flex min-h-11 items-center break-words text-base font-semibold hover:underline"
        >
          {routine.title}
        </Link>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {t("common.plural.exercises", { count: routine.exercise_count })}
        </p>
        <p className="mt-2 line-clamp-2 break-words text-sm text-[var(--text-muted)]">
          {routine.exercise_names.length
            ? routine.exercise_names.join(" · ")
            : t("common.workoutHub.noExercises")}
        </p>

        {folders.length > 0 || total > 1 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {folders.length > 0 ? (
              <select
                aria-label={`${t("offline.folders.moveTo")} — ${routine.title}`}
                disabled={busy}
                value={routine.folder_id ?? ""}
                onChange={(e) =>
                  void handleMoveFolder(routine, e.target.value ? e.target.value : null)
                }
                className="training-input min-h-9 min-w-0 flex-1 rounded-lg px-2 text-xs"
              >
                <option value="">{t("offline.folders.default")}</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </select>
            ) : null}
            {total > 1 ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={busy || index === 0}
                  aria-label={`${t("offline.folders.moveUp")} ${routine.title}`}
                  onClick={() => void handleReorder(folderId, index, -1)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-xs hover:bg-[var(--bg-surface-hover)] disabled:opacity-35"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={busy || index === total - 1}
                  aria-label={`${t("offline.folders.moveDown")} ${routine.title}`}
                  onClick={() => void handleReorder(folderId, index, 1)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-xs hover:bg-[var(--bg-surface-hover)] disabled:opacity-35"
                >
                  ↓
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <form action={startWorkoutFormAction} className="mt-auto pt-4">
          <input type="hidden" name="routineId" value={routine.id} />
          <button
            type="submit"
            aria-label={t("common.workoutHub.startRoutineLabel", { title: routine.title })}
            className="training-elevated flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm font-semibold text-[var(--accent-text)] hover:bg-[var(--bg-surface-hover)]"
          >
            {t("common.workoutHub.startRoutine")}
            <span aria-hidden="true">→</span>
          </button>
        </form>
      </li>
    );
  }

  const unfiled = grouped.get(null) ?? [];

  return (
    <section aria-labelledby="routine-heading" className="mt-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="routine-heading" className="text-xl font-semibold">
          {t("common.workoutHub.routines")}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setNewFolderOpen((v) => !v)}
            className="min-h-10 rounded-xl border border-[var(--border-subtle)] px-3 text-xs font-semibold hover:bg-[var(--bg-surface)]"
          >
            + {t("offline.folders.new")}
          </button>
          <Link
            href="/routines"
            className="inline-flex min-h-10 items-center text-sm font-medium text-[var(--accent-text)] underline underline-offset-4"
          >
            {t("common.workoutHub.manage")}
          </Link>
        </div>
      </div>

      {newFolderOpen ? (
        <div className="training-panel flex gap-2 rounded-2xl p-3">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder={t("offline.folders.placeholder")}
            maxLength={80}
            className="training-input min-h-11 min-w-0 flex-1 rounded-xl px-3 text-sm"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleCreateFolder()}
            className="training-action min-h-11 rounded-xl px-4 text-sm font-bold disabled:opacity-50"
          >
            {t("common.save")}
          </button>
        </div>
      ) : null}

      {folders.map((folder) => {
        const list = grouped.get(folder.id) ?? [];
        return (
          <div key={folder.id} className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2">
              <h3 className="text-sm font-semibold">
                {folder.title}{" "}
                <span className="text-xs font-normal text-[var(--text-muted)]">({list.length})</span>
              </h3>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDeleteFolder(folder.id)}
                className="text-xs text-[var(--danger-text)] hover:underline"
              >
                {t("common.delete")}
              </button>
            </div>
            {list.length > 0 ? (
              <ul className="grid gap-3 md:grid-cols-2">
                {list.map((r, idx) => renderRoutineCard(r, idx, list.length, folder.id))}
              </ul>
            ) : null}
          </div>
        );
      })}

      {routines.length === 0 ? (
        <p className="training-panel rounded-2xl border-dashed p-5 text-sm leading-relaxed text-[var(--text-muted)]">
          {t("common.workoutHub.empty")}
        </p>
      ) : unfiled.length > 0 ? (
        <div className="space-y-2.5">
          {folders.length > 0 ? (
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {t("offline.folders.default")} ({unfiled.length})
            </h3>
          ) : null}
          <ul className="grid gap-3 md:grid-cols-2">
            {unfiled.map((r, idx) => renderRoutineCard(r, idx, unfiled.length, null))}
          </ul>
        </div>
      ) : null}

      <Link
        href="/routines/new"
        className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] px-4 text-sm font-semibold hover:bg-[var(--bg-surface)]"
      >
        <span aria-hidden="true">+</span>
        {t("common.workoutHub.create")}
      </Link>
    </section>
  );
}
