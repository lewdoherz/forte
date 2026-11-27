# Offline Use: Native Apps vs. Web PWA

## Native Android & iOS Apps (Self-Contained From First Launch)

Both the Android APK (`mobile/android`) and iOS app (`mobile/ios`) embed the complete offline-first Forte bundle built by `bun run mobile:bundle`:

- Full Forte Home, Workout, and Profile app shell (`/offline-app` HTML + Next.js JS/CSS chunks)
- Built-in exercise catalogue (`/offline-catalog.json`): all **450** active exercises with English & Simplified Chinese titles, muscle groups, equipment, exercise types, and How-to instructions (**431** step-by-step + **19** source placeholders)
- **448 / 450** bundled exercise demonstration illustrations (`public/exercise-media/thumbnails/*.jpg`, 7.67 MB; `climbing` and `snowboarding` have no source illustration)
- **36 / 36** bundled front/back body-heatmap muscle layers (`public/body-heatmap/*.png`, 1.35 MB)
- Local rest-timer completion chime (`rest_chime.wav`)

Because everything is bundled inside the native install and served on the real `https://<FORTE_HOST>` origin, **first-ever launch in airplane mode** opens directly into the normal Forte app (Home, Workout, Profile) with zero network wait or authentication gate.

## Web PWA (Initial Online Visit Required)

Unlike a native install, a browser-installed PWA cannot bundle assets before its first visit. For full offline use in the PWA:

1. Open Forte **once while online** and allow the service worker (`public/sw.js`, cache `forte-static-v5`) to activate and complete background warming.
2. During that first online visit, the service worker automatically caches:
   - `/offline-app` HTML and all referenced `/_next/static/*` JS/CSS chunks (committed atomically)
   - `/offline-catalog.json` (all 450 exercises + vocabularies)
   - `/body-heatmap/*` (all 36 muscle heatmap layers)
   - `/audio/rest_chime.wav` (local rest chime)
   - `/exercise-media/thumbnails/*` (public exercise demonstration illustrations, cached in batches)
3. If signed in, `OfflineSyncBridge` also populates account-scoped IndexedDB (`forte-offline`) with the user's routine folders, routines, active workout, recent completed workouts (up to 80), and previous performances.
4. Once warmed, closing the PWA, enabling airplane mode, and launching from the installed icon opens the normal Forte app immediately from cache and IndexedDB without waiting on the network.
5. Remote MP4 demonstration videos (447 exercises hosted on Vercel Blob, ~187.5 MB total) stream online and automatically fall back to the cached demonstration illustration + body heatmap when offline.
