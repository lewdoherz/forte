/* Hand-written service worker: a narrow runtime cache, not a precache.
 *
 * Immutable build assets are shared safely across accounts. The exact workout
 * logger HTML is the only personalized response retained, in a private cache
 * purged on every account transition. Other authenticated pages and Next RSC
 * payloads always stay on the network.
 */

// Static build assets are safe across accounts. Rendered workout HTML is not:
// it lives in a separate cache that every account transition explicitly clears.
const CACHE_VERSION = "v3";
const STATIC_CACHE_NAME = `forte-static-${CACHE_VERSION}`;
const PRIVATE_CACHE_NAME = `forte-private-${CACHE_VERSION}`;
const CACHE_PREFIX = "forte-";
const PRIVATE_CACHE_PREFIX = "forte-private-";

const CLEAR_PRIVATE_CACHE_MESSAGE = "clear-private-cache";
const CACHE_PRIVATE_ROUTE_MESSAGE = "cache-private-route";

// Invalidates a private response that was fetched before sign-out but would
// otherwise be written after the private cache had been deleted.
let privateCacheEpoch = 0;

// Shown for a navigation that is neither cached nor reachable. It must be a
// real page: the browser's default offline error says nothing and cannot tell
// the user their in-progress workout is safe.
//
// A worker can neither render React nor know the reader's language server-side,
// so the page carries both blocks and an inline script picks one at runtime:
// the `forte_locale` cookie (readable here only because it is deliberately not
// httpOnly), then `navigator.language`, then English. English is the block
// present in the markup and the Chinese one starts hidden, so the page reads
// correctly with JavaScript disabled; the script swaps the visible block and
// `<html lang>` otherwise.
//
// This is a hand-written static asset with no build step, so the wording below
// is the source of truth for the page.
// lib/i18n/dictionaries/en/offline.ts and lib/i18n/dictionaries/zh-CN/offline.ts
// mirror it by hand and must be kept in step: change one, change the other.
const OFFLINE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>forte — offline</title>
  </head>
  <body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#fafafa;color:#18181b;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
    <main style="max-width:28rem;padding:1.5rem">
      <section id="offline-en" lang="en">
        <h1 style="font-size:1.125rem;margin:0 0 0.75rem">You are offline</h1>
        <p style="margin:0 0 0.75rem;line-height:1.5">forte cannot reach the network right now, and this page was not saved for offline use.</p>
        <p style="margin:0 0 0.75rem;line-height:1.5">A workout already in progress still works: log sets, edit them, and finish the workout. Everything is stored on this device and syncs the next time you are online.</p>
        <button type="button" onclick="location.reload()"
          style="margin-top:0.5rem;min-height:2.25rem;padding:0 0.75rem;border:1px solid #d4d4d8;border-radius:0.375rem;background:#fff;font:inherit;font-size:0.875rem;font-weight:500;color:#18181b;cursor:pointer">
          Try again
        </button>
      </section>
      <section id="offline-zh" lang="zh-CN" hidden>
        <h1 style="font-size:1.125rem;margin:0 0 0.75rem">当前离线</h1>
        <p style="margin:0 0 0.75rem;line-height:1.5">forte 当前无法连接网络，且此页面未保存为离线可用。</p>
        <p style="margin:0 0 0.75rem;line-height:1.5">正在进行中的训练仍可继续：记录每一组、随时修改并完成训练。所有数据保存在本设备上，联网后会自动同步。</p>
        <button type="button" onclick="location.reload()"
          style="margin-top:0.5rem;min-height:2.25rem;padding:0 0.75rem;border:1px solid #d4d4d8;border-radius:0.375rem;background:#fff;font:inherit;font-size:0.875rem;font-weight:500;color:#18181b;cursor:pointer">
          重试
        </button>
      </section>
    </main>
    <script>
      (function () {
        var match = document.cookie.match(/(?:^|;\s*)forte_locale=([^;]*)/);
        var stored = "";
        if (match) {
          try {
            stored = decodeURIComponent(match[1]);
          } catch (error) {
            stored = match[1];
          }
        }
        var preferred =
          /^en(-|$)/i.test(stored) || /^zh(-|$)/i.test(stored)
            ? stored
            : navigator.language || "";
        var locale = /^zh/i.test(preferred) ? "zh-CN" : "en";
        document.documentElement.lang = locale;
        if (locale === "zh-CN") {
          document.getElementById("offline-en").hidden = true;
          document.getElementById("offline-zh").hidden = false;
          document.title = "forte — 离线";
        }
      })();
    </script>
  </body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all([
        caches.open(STATIC_CACHE_NAME),
        caches.open(PRIVATE_CACHE_NAME),
      ]);
      // This worker has no precache list to populate, so there is nothing to
      // finish before taking over.
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
          .filter(
            (key) =>
              key.startsWith(CACHE_PREFIX) &&
              key !== STATIC_CACHE_NAME &&
              key !== PRIVATE_CACHE_NAME,
          )
          .map((key) => caches.delete(key)),
      );
      // Taking over immediately also retires the old worker that cached every
      // authenticated GET, rather than waiting for every tab to close.
      await self.clients.claim();
    })(),
  );
});

function isPrivateWorkoutPath(pathname) {
  return /^\/workouts\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    pathname,
  );
}

function isStaticAssetPath(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/icon" ||
    pathname === "/apple-icon" ||
    pathname.startsWith("/pwa-icon/")
  );
}

async function putPrivateSnapshot(request, response, epoch) {
  if (epoch !== privateCacheEpoch) return;
  const cache = await caches.open(PRIVATE_CACHE_NAME);
  if (epoch !== privateCacheEpoch) return;
  await cache.put(request, response);
}

async function fetchPrivateSnapshot(url, epoch) {
  const request = new Request(url, {
    credentials: "same-origin",
    cache: "no-store",
  });
  const response = await fetch(request);
  const responseUrl = new URL(response.url);
  if (
    !response.ok ||
    response.redirected ||
    responseUrl.origin !== self.location.origin ||
    responseUrl.pathname !== new URL(url).pathname
  ) {
    return;
  }
  await putPrivateSnapshot(request, response.clone(), epoch);
}

async function respondToNavigation(request, url) {
  const isPrivateWorkout = isPrivateWorkoutPath(url.pathname);
  try {
    return await fetch(request);
  } catch {
    if (isPrivateWorkout) {
      const cached = await caches.match(request, { cacheName: PRIVATE_CACHE_NAME });
      if (cached) return cached;
    }
    return new Response(OFFLINE_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

async function respondToStaticAsset(event, request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type !== "opaque") {
    event.waitUntil(cache.put(request, response.clone()));
  }
  return response;
}

self.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type === CLEAR_PRIVATE_CACHE_MESSAGE) {
    privateCacheEpoch += 1;
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith(PRIVATE_CACHE_PREFIX))
              .map((key) => caches.delete(key)),
          ),
        ),
    );
    return;
  }

  if (
    message?.type === CACHE_PRIVATE_ROUTE_MESSAGE &&
    typeof message.url === "string"
  ) {
    const url = new URL(message.url);
    if (url.origin !== self.location.origin || !isPrivateWorkoutPath(url.pathname)) return;
    const epoch = privateCacheEpoch;
    event.waitUntil(fetchPrivateSnapshot(url.href, epoch));
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Writes and cross-origin traffic are never ours. Range requests (media
  // seeking) also must not be answered from a full cached response.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (request.headers.has("Range")) return;

  if (request.mode === "navigate") {
    event.respondWith(respondToNavigation(request, url));
    return;
  }

  // In particular, do not intercept Next RSC/prefetch GETs. They are dynamic,
  // user-specific payloads even though their method is GET.
  if (isStaticAssetPath(url.pathname)) {
    event.respondWith(respondToStaticAsset(event, request));
  }
});
