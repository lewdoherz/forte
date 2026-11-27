/* Hand-written service worker: static asset & offline-shell cache + isolated private workout cache.
 *
 * - Shared static cache (`forte-static-v5`): immutable `/_next/static/*` chunks,
 *   PWA icons/manifest, built-in exercise catalog (`/offline-catalog.json`),
 *   public exercise thumbnails (`/exercise-media/thumbnails/*`), body-heatmap
 *   layers (`/body-heatmap/*`), local rest chime (`/audio/rest_chime.wav`),
 *   and the zero-user-data `/offline-app` shell (which reads account-scoped or
 *   device-local data exclusively from IndexedDB).
 * - Private route cache (`forte-private-v5`): exact `/workouts/[id]` HTML snapshot
 *   explicitly warmed by the active logger and purged on every account transition.
 * - Authenticated non-workout HTML and Next RSC/prefetch payloads are NEVER cached.
 */

const CACHE_VERSION = "v5";
const STATIC_CACHE_NAME = `forte-static-${CACHE_VERSION}`;
const PRIVATE_CACHE_NAME = `forte-private-${CACHE_VERSION}`;
const CACHE_PREFIX = "forte-";
const PRIVATE_CACHE_PREFIX = "forte-private-";

const CLEAR_PRIVATE_CACHE_MESSAGE = "clear-private-cache";
const CACHE_PRIVATE_ROUTE_MESSAGE = "cache-private-route";
const WARM_OFFLINE_SHELL_MESSAGE = "warm-offline-shell";
const OFFLINE_APP_PATH = "/offline-app";
const NAV_TIMEOUT_MS = 2500;

const CORE_STATIC_PATHS = [
  "/offline-catalog.json",
  "/audio/rest_chime.wav",
  "/body-heatmap/male_front_base.png",
  "/body-heatmap/male_back_base.png",
  "/body-heatmap/male_front_abdominals.png",
  "/body-heatmap/male_back_abdominals.png",
  "/body-heatmap/male_front_abductors.png",
  "/body-heatmap/male_back_abductors(empty).png",
  "/body-heatmap/male_front_adductors.png",
  "/body-heatmap/male_back_adductors.png",
  "/body-heatmap/male_front_biceps.png",
  "/body-heatmap/male_back_biceps.png",
  "/body-heatmap/male_front_calves.png",
  "/body-heatmap/male_back_calves.png",
  "/body-heatmap/male_front_chest.png",
  "/body-heatmap/male_back_chest(empty).png",
  "/body-heatmap/male_front_forearms.png",
  "/body-heatmap/male_back_forearms.png",
  "/body-heatmap/male_front_glutes(empty).png",
  "/body-heatmap/male_back_glutes.png",
  "/body-heatmap/male_front_hamstrings(empty).png",
  "/body-heatmap/male_back_hamstrings.png",
  "/body-heatmap/male_front_lats.png",
  "/body-heatmap/male_back_lats.png",
  "/body-heatmap/male_front_lower_back(empty).png",
  "/body-heatmap/male_back_lower_back.png",
  "/body-heatmap/male_front_neck.png",
  "/body-heatmap/male_back_neck.png",
  "/body-heatmap/male_front_quadriceps.png",
  "/body-heatmap/male_back_quadriceps.png",
  "/body-heatmap/male_front_shoulder.png",
  "/body-heatmap/male_back_shoulder.png",
  "/body-heatmap/male_front_traps.png",
  "/body-heatmap/male_back_traps.png",
  "/body-heatmap/male_front_triceps.png",
  "/body-heatmap/male_back_triceps.png",
  "/body-heatmap/male_front_upper-back.png",
  "/body-heatmap/male_back_upper-back.png",
];

let privateCacheEpoch = 0;

// Fallback HTML when neither the exact private workout route nor `/offline-app`
// has been cached yet (e.g. a browser that has not finished warming).
// lib/i18n/dictionaries/en/offline.ts and zh-CN/offline.ts mirror this copy.
const OFFLINE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>forte — offline</title>
  </head>
  <body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#0d1512;color:#eef5ef;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
    <main style="max-width:28rem;padding:1.5rem">
      <section id="offline-en" lang="en">
        <h1 style="font-size:1.25rem;margin:0 0 0.75rem">You are offline</h1>
        <p style="margin:0 0 0.75rem;line-height:1.5;color:#b0c0b4">forte cannot reach the network right now, and this page was not saved for offline use.</p>
        <p style="margin:0 0 0.75rem;line-height:1.5;color:#b0c0b4">A workout already in progress still works: log sets, edit them, and finish the workout. Everything is stored on this device and syncs the next time you are online.</p>
        <button type="button" onclick="location.reload()"
          style="margin-top:0.5rem;min-height:2.75rem;padding:0 1rem;border:none;border-radius:0.75rem;background:#d6f077;font:inherit;font-size:0.875rem;font-weight:600;color:#142017;cursor:pointer">
          Try again
        </button>
      </section>
      <section id="offline-zh" lang="zh-CN" hidden>
        <h1 style="font-size:1.25rem;margin:0 0 0.75rem">当前离线</h1>
        <p style="margin:0 0 0.75rem;line-height:1.5;color:#b0c0b4">forte 当前无法连接网络，且此页面未保存为离线可用。</p>
        <p style="margin:0 0 0.75rem;line-height:1.5;color:#b0c0b4">正在进行中的训练仍可继续：记录每一组、随时修改并完成训练。所有数据保存在本设备上，联网后会自动同步。</p>
        <button type="button" onclick="location.reload()"
          style="margin-top:0.5rem;min-height:2.75rem;padding:0 1rem;border:none;border-radius:0.75rem;background:#d6f077;font:inherit;font-size:0.875rem;font-weight:600;color:#142017;cursor:pointer">
          重试
        </button>
      </section>
    </main>
    <script>
      (function () {
        var match = document.cookie.match(/(?:^|;\\s*)forte_locale=([^;]*)/);
        var stored = "";
        if (match) {
          try { stored = decodeURIComponent(match[1]); } catch (e) { stored = match[1]; }
        }
        var preferred = /^en(-|$)/i.test(stored) || /^zh(-|$)/i.test(stored) ? stored : (navigator.language || "");
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
    pathname.startsWith("/exercise-media/thumbnails/") ||
    pathname.startsWith("/body-heatmap/") ||
    pathname.startsWith("/audio/") ||
    pathname === "/offline-catalog.json" ||
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

async function cacheUrlsInBatches(cache, paths, batchSize = 8) {
  for (let i = 0; i < paths.length; i += batchSize) {
    await Promise.all(
      paths.slice(i, i + batchSize).map(async (rawPath) => {
        const assetUrl = new URL(rawPath, self.location.origin).href;
        if (await cache.match(assetUrl)) return;
        try {
          const res = await fetch(new Request(assetUrl, { credentials: "omit" }));
          if (res.ok && res.type !== "opaque") await cache.put(assetUrl, res);
        } catch {
          // Non-fatal: transient drop.
        }
      }),
    );
  }
}

/**
 * Fetches `/offline-app` WITHOUT credentials (so it can never carry user data),
 * caches its HTML plus every `/_next/static/*` script/stylesheet it references,
 * caches the built-in catalog, body-heatmap art, audio chime, and public thumbnails.
 */
async function warmOfflineShellAssets(thumbnails) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const shellUrl = new URL(OFFLINE_APP_PATH, self.location.origin).href;
  try {
    const shellReq = new Request(shellUrl, { credentials: "omit", cache: "no-store" });
    const shellRes = await fetch(shellReq);
    if (shellRes.ok && !shellRes.redirected && shellRes.type !== "opaque") {
      const shellCopy = shellRes.clone();
      const html = await shellRes.text();
      const assets = new Set();
      const regex = /\/_next\/static\/[^"'\s<>()\\,;]+/g;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const clean = match[0].replace(/[.,;]+$/, "");
        if (/\.(?:js|css|woff2|woff|png|svg|ico|json)(?:\?[^"']*)?$/i.test(clean)) {
          assets.add(new URL(clean, self.location.origin).href);
        }
      }
      let allAssetsCached = true;
      await Promise.all(
        [...assets].map(async (assetUrl) => {
          if (await cache.match(assetUrl)) return;
          try {
            const res = await fetch(new Request(assetUrl, { credentials: "omit" }));
            if (res.ok && res.type !== "opaque") {
              await cache.put(assetUrl, res);
            } else {
              allAssetsCached = false;
            }
          } catch {
            allAssetsCached = false;
          }
        }),
      );
      if (allAssetsCached) {
        await cache.put(shellUrl, shellCopy);
      }
    }
  } catch {
    // Offline or unreachable during warm; retry on next online visit.
  }

  await cacheUrlsInBatches(cache, CORE_STATIC_PATHS, 8);

  if (Array.isArray(thumbnails)) {
    const valid = thumbnails.filter(
      (rawPath) => typeof rawPath === "string" && rawPath.startsWith("/exercise-media/thumbnails/"),
    );
    await cacheUrlsInBatches(cache, valid, 12);
  }
}

async function fetchWithShortTimeout(request, timeoutMs) {
  if (typeof AbortController === "undefined") return fetch(request);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function respondToNavigation(request, url) {
  const isPrivateWorkout = isPrivateWorkoutPath(url.pathname);
  const fallback = async () => {
    if (isPrivateWorkout) {
      const cached = await caches.match(request, { cacheName: PRIVATE_CACHE_NAME });
      if (cached) return cached;
    }
    const shellUrl = new URL(OFFLINE_APP_PATH, self.location.origin).href;
    const cachedShell = await caches.match(shellUrl, { cacheName: STATIC_CACHE_NAME });
    if (cachedShell) return cachedShell;

    return new Response(OFFLINE_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  };

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return fallback();
  }

  try {
    return await fetchWithShortTimeout(request, NAV_TIMEOUT_MS);
  } catch {
    return fallback();
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
    return;
  }

  if (message?.type === WARM_OFFLINE_SHELL_MESSAGE) {
    event.waitUntil(warmOfflineShellAssets(message.thumbnails));
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (request.headers.has("Range")) return;

  if (request.mode === "navigate") {
    event.respondWith(respondToNavigation(request, url));
    return;
  }

  if (isStaticAssetPath(url.pathname)) {
    event.respondWith(respondToStaticAsset(event, request));
  }
});
