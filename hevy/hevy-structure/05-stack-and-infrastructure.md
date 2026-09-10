# 05 — Stack and infrastructure

**Sources.** Client-side: literal strings and library markers in `_app-*.js`, `main-*.js` and the 50
route chunks [bundle]. Hosting/CDN: observed HTTP response headers [observed]. Public API: Hevy's
OpenAPI doc [spec]. Marketing site: a fetched page's HTML [observed].

---

## 1. Deployables (there are three, not one)

| # | Deployable | Platform | Evidence |
|---|---|---|---|
| 1 | **Web app** — `hevy.com` | **Vercel**, Next.js | `Server: Vercel`, `X-Vercel-Cache: MISS`, `X-Matched-Path: /`, `X-Vercel-Id: sin1::iad1::…` [observed]; `X-Powered-By: Next.js` [observed] |
| 2 | **API** — `api.hevyapp.com` (private + public `/v1`) | **Heroku** (Express) | `Server: Heroku`; Heroku NEL: `Report-To: {"group":"heroku-nel",…}` [observed] |
| 3 | **Marketing site** — `www.hevyapp.com` (+ help, coach) | **WordPress behind Cloudflare** | WordPress 6.9.7, Elementor 4.0.2, Yoast 27.4, WP Rocket, Complianz 7.4.7, MonsterInsights, Site Kit [observed in page source] |
| — | **Media CDN** | **CloudFront** over S3 | `d2l9nsnmtah87f.cloudfront.net` serves exercise mp4s + thumbnails + OG images; legacy bucket `pump-app.s3.eu-west-2.amazonaws.com` [observed] |
| — | **Docs** | Swagger UI static files at `api.hevyapp.com/docs` (`swagger-ui-bundle.js`, `swagger-ui-init.js`) | [observed] |

Note the split that matters: **static media is not behind auth** (exercise mp4s return `200` with no
cookies), while **app HTML is auth-gated at the edge** (`307 → /login?postLoginPath=…`). That is the
right default for a fitness app: media is inherently shareable, user data is not.

---

## 2. Frontend stack

| Layer | Technology | Evidence |
|---|---|---|
| Framework | **Next.js 13.4.19**, **pages router** (`_next/data/…/<route>.json`, `__NEXT_DATA__`, `gssp`, `_buildManifest.js`) | literal version string in `main-*.js`; route data requests [observed] |
| UI runtime | React 18 (`hydrateRoot`, `Symbol.for("react.element")` in React prod build) | chunk `1792` |
| Styling | **styled-components** with SSR (`/*!sc*/` markers server-rendered into HTML) | SSR shell |
| State | **MobX** (`stores.*`, `observer` HOC), e.g. `stores.lifecycle.isBootstrapped` | chunks `1661`, `folder/[folderId]` |
| Data fetching | axe-based client + Next SSR/`_next/data` for page props; no GraphQL anywhere | no `graphql` literal in any chunk |
| Utilities | lodash, dayjs, classnames, `ua-parser-js@0.7.21`, `buffer`, `cookie` | chunks `6489`, `4792`, `_app` |
| i18n | 18 locales bundled in the client, keys namespaced `web.*` / `global.*` / `exerciseData.*` | 704 `web.*` keys |
| Service worker / PWA | **none found** — web is online-only | no SW registration in chunks |
| Feature flags | **no flag SDK found** | — |

**Interpretation.** This is a *2023-era, pre-App-Router* Next.js product. If you start today you
would use the App Router, and you can skip MobX for a server-state library (TanStack Query/SWR) —
the app's own code shows the cost of mixing a global MobX store with SSR (`isBootstrapped`
gymnastics).

---

## 3. Third parties (each with its proving literal)

| Purpose | Provider | Evidence |
|---|---|---|
| Product analytics | **Amplitude** — events `[WEB]-appLaunch`, `$identify`, unsent-queue keys in localStorage | [bundle + observed] live POSTs to `api.amplitude.com` |
| Web analytics | **Google Analytics** `UA-141954737-2` (+ GA4 tag `_ga_T2V8M5EB4V`) | [observed] live `/j/collect` beacons |
| Error tracking | **Sentry** `o276807.ingest.sentry.io` | [bundle] |
| Web hosting vitals | **Vercel** `vitals.vercel-insights.com` | [bundle] |
| Payments (web) | **Paddle** — `cdn.paddle.com/paddle/v2/paddle.js`, bootstrap log `Error initializing Paddle`, keys `web.settings.subscription.purchase.paddle.*`, endpoint `paddle_prices` | [observed HTML + bundle] |
| Payments (mobile) | App Store / Google Play IAP; UI copy `manageSub.{appStore,playStore}` | [bundle] |
| Payments (benefit) | **Wellhub / Gympass** — `/link_wellhub`, `link_with_gympass`, `proViaWellhub` | [bundle] |
| Sign-in | **Google Identity Services** (`accounts.google.com/gsi/client`), **Apple** (`AppleID.auth.init({clientId:'com.hevyapp.web'})`), **Facebook SDK**, **reCAPTCHA Enterprise** | [observed HTML + bundle] |
| Fitness integration | **Strava** (`is_strava_connected` on the account) | [observed + bundle] |
| Third-party API access | **OAuth provider** (`/oauth/authorize`; ChatGPT named in copy) | [bundle] |
| Affiliate / attribution | **FirstPromoter**, **Adjust/Branch** deep links (`hevyapp.app.link/…`) | [bundle] |
| Support | **Zendesk** (help centre), `hello@hevyapp.com` | [observed] |
| Marketing analytics | TikTok pixel, GTM, MonsterInsights, GA on the WordPress site | [observed in marketing HTML] |

**Not found:** Stripe/Braintree/Chargebee/RevenueCat client SDKs, any feature-flag SDK, GraphQL,
service worker. Web payments are Paddle-only; mobile payments go through the stores. (A scout
initially reported no payment SDK; the page HTML and bundle strings above show Paddle is present —
the contradiction is resolved in Paddle's favour since both are direct evidence.)

---

## 4. Observed HTTP headers

```
GET https://hevy.com/                          -> 307 Temporary Redirect
  Location: /login?postLoginPath=%2F
  Server: Vercel
  X-Vercel-Cache: MISS          X-Matched-Path: /
  X-Vercel-Id: sin1::iad1::…
  Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
  Strict-Transport-Security: max-age=63072000

GET https://hevy.com/login                     -> 200
  X-Powered-By: Next.js         Etag: "oueqvbxp6a8g5"
  Content-Type: text/html; charset=utf-8

GET https://api.hevyapp.com/v1/workouts        -> 401 Unauthorized
  Server: Heroku
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Headers: Origin, X-Requested-With, Content-Type, Accept, api-key
  Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
  Nel / Report-To: heroku-nel

GET https://d2l9nsnmtah87f.cloudfront.net/exercise-assets/….mp4   -> 200 (no cookies required)
```

---

## 5. What to reuse vs avoid when you build

**Reuse these choices** — they are load-bearing and cheap:

1. **Edge-gated HTML + open media CDN.** Auth lives in SSR middleware; assets do not. Keeps sharing
   (workout links, routine links) working without signed URLs.
2. **Documented public API as a separate surface**, with key management and webhooks exposed in
   Settings → Developer. It turned a fitness tracker into a platform.
3. **Polling-friendly sync** (`workout events` + `count`) with an explicit request for jittered
   schedules — designed for integrations, not just for their own clients.
4. **Media pipeline on object storage + CDN, with predictable keys**
   (`exercise-assets/<code>-<Name>_<Muscle>.mp4`). Predictable keys made the whole exercise library
   trivially cacheable — and, incidentally, trivially enumerable.

**Avoid these:**

1. **Three muscle-group vocabularies** and two casing schemes for the same concept (04 §4).
2. **Two id spaces per aggregate** (`id` + `short_id`) leaking into URLs *and* API payloads; if you
   need share ids, keep them in the sharing layer only.
3. **Private API as the primary client contract** with no versioning — the web bundle freezes a
   `x-api-key: shelobs_hevy_web` client constant, so every client change is a server-compatible
   change forever.
4. **Analytics heavy for a single-purpose app**: Amplitude + GA + Sentry + Vercel vitals + pixels
   (5+ beacons on first paint; observed 45 Amplitude POSTs in one 15-route pass).

---

## 6. Unknowns

- Exact Heroku plan/topology and database engine (Postgres is `[INFERENCE]` from `X-Replica-Read`
  and replica-style headers; not observed directly).
- Deployment pipeline, CI, and whether the mobile app shares the private API (highly likely —
  `Hevy-Platform`/`Hevy-App-Version` headers exist, but mobile traffic was not observed).
- Marketing site's exact Cloudflare configuration beyond presence.
