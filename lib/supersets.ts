/**
 * Superset grouping rules, shared by the routine editor (what the user sees) and
 * the routine writer (what is stored), so the two cannot disagree.
 *
 * A superset is two or more CONSECUTIVE exercises sharing a key. Anything else —
 * a lone member, or a group split apart by a reorder — is not a superset and is
 * treated as ungrouped.
 *
 * Deliberately dependency-free: client components import this, so it must not
 * pull in the database layer.
 */
export function normaliseSupersetKeys(
  exercises: readonly { superset_key?: string | null }[],
): (string | null)[] {
  const keys = exercises.map((ex) => ex.superset_key ?? null);
  const out: (string | null)[] = keys.map(() => null);

  let index = 0;
  while (index < keys.length) {
    const key = keys[index];
    if (key === null) {
      index += 1;
      continue;
    }

    let end = index;
    while (end + 1 < keys.length && keys[end + 1] === key) end += 1;

    // Only a run of two or more is a real superset; a run of one drops out.
    if (end > index) {
      for (let i = index; i <= end; i += 1) out[i] = key;
    }
    index = end + 1;
  }

  return out;
}
