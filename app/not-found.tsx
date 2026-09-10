import Link from "next/link";

/**
 * Covers unmatched URLs and any `notFound()` raised outside the protected shell.
 * Rendered inside the root layout, so it carries no navigation.
 */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-20">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-zinc-600">
        That page does not exist, or it is not available to your account.
      </p>

      <Link
        href="/"
        className="mt-6 inline-flex h-11 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
