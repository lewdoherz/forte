/**
 * The main pane when no exercise is selected. The Library panel beside it is
 * the actual navigation, so this only explains what a row does.
 */
export default function ExercisesPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-12 w-12 text-zinc-300"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
      <h1 className="mt-4 text-lg font-medium">Select Exercise</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Click on an exercise to see statistics about it.
      </p>
    </div>
  );
}
