/* Hand-written service worker: a runtime cache, not a build-time precache.
 *
 * The logging route is dynamic (/workouts/[id]) and its JS chunks are
 * content-hashed, so there is nothing meaningful to enumerate at install time.
 * Instead the worker caches same-origin GETs as they are fetched. The honest
 * consequence: offline works once the app has been opened online at least once.
 */

// Bump on every deploy. The worker only checks this by name, so a new value
// renames the cache and activate() drops the old one instead of serving stale
// code forever.
const CACHE_VERSION = "v1";
const CACHE_NAME = `forte-${CACHE_VERSION}`;

// Prefix shared by every cache this worker owns, so activate() never deletes a
// cache that belongs to something else on the origin.
const CACHE_PREFIX = "forte-";

// Shown for a navigation that is neither cached nor reachable. It must be a
// real page: the browser's default offline error says nothing and cannot tell
// the user their in-progress workout is safe.
const OFFLINE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>forte — offline</title>
  </head>
  <body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#fafafa;color:#18181b;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
    <main style="max-width:28rem;padding:1.5rem">
      <h1 style="font-size:1.125rem;margin:0 0 0.75rem">You are offline</h1>
      <p style="margin:0 0 0.75rem;line-height:1.5">
        forte cannot reach the network right now, and this page was not saved for
        offline use.
      </p>
      <p style="margin:0 0 0.75rem;line-height:1.5">
        A workout already in progress still works: log sets, edit them, and finish
        the workout. Everything is stored on this device and syncs the next time
        you are online.
      </p>
      <button type="button" onclick="location.reload()"
        style="margin-top:0.5rem;min-height:2.25rem;padding:0 0.75rem;border:1px solid #d4d4d8;border-radius:0.375rem;background:#fff;font:inherit;font-size:0.875rem;font-weight:500;color:#18181b;cursor:pointer">
        Try again
      </button>
    </main>
  </body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await caches.open(CACHE_NAME);
      // This worker has no precache list to populate, so there is nothing to
      // finish before taking over — activating on the next navigation is the
      // cheap way to make a new deploy take effect.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      // Take over pages that are already open rather than waiting for a reload.
      await self.clients.claim();
    })(),
  );
});

async function respond(event, request) {
  const cache = await caches.open(CACHE_NAME);

  // Cache-first: a successful earlier visit wrote the shell and its chunks
  // here, which is exactly what lets the app open with no signal.
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Only store real, same-origin responses. `opaque` is a cross-origin
    // no-cors reply whose status and body are unreadable — caching it would
    // pin a failure. Non-OK responses are not the shell either.
    if (response.ok && response.type !== "opaque") {
      // Keep the write off the response path: the page should not wait on the
      // cache, and a failed put must not fail a fetch that succeeded.
      event.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  } catch {
    // No cache and no network.
    if (request.mode === "navigate") {
      return new Response(OFFLINE_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    // A non-navigation asset for a page that was never cached has no useful
    // substitute, so let the failure propagate instead of fabricating a body.
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only same-origin GETs are ours to serve. Writes (POST/PUT/PATCH/DELETE)
  // belong to the app's reconciliation path — a worker that queued them would
  // be a second, conflicting outbox — and /api/ must always reach the network
  // so the sync action sees a real success or failure. Cross-origin requests
  // are left alone entirely.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  // Range requests (media seeking) must not be satisfied from a full cached
  // copy, and partial responses are not cacheable.
  if (request.headers.has("Range")) return;

  event.respondWith(respond(event, request));
});
