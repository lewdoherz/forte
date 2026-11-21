# forte native hosted shells

These native HTTPS shells load https://forte-delta.vercel.app, not a bundled Next.js server. Android uses WebView; iPhone and iPad use WKWebView. Native version 1.1.0/build 2 is independent of the web package version. The lowercase f launcher monogram follows the web mark.

## Localization

Native load, retry and authentication-error strings use Android `values`/`values-zh-rCN` and iOS `en.lproj`/`zh-Hans.lproj` platform resources. The device locale selects these strings. The shared web UI has its own EN/zh-CN language setting; changing it does not change the native fallback language.

## Android personal installation

Requires JDK 21, Android SDK platform 36/build-tools 36.0.0, accepted SDK licenses and `ANDROID_HOME`. The official Gradle 8.13 wrapper pins its distribution SHA-256; AGP is 8.13.2. Minimum Android version is 11/API 30. Keep SDK paths and signing secrets outside Git.

From `mobile/android`:

- Debug: `gradlew.bat assembleDebug` on Windows, `sh ./gradlew assembleDebug` on Linux/macOS.
- Release: set `FORTE_KEYSTORE_PATH`, `FORTE_KEYSTORE_PASSWORD`, `FORTE_KEY_ALIAS`, `FORTE_KEY_PASSWORD` through your secret manager/shell, then run `gradlew.bat assembleRelease` or `sh ./gradlew assembleRelease`. Missing signing configuration fails the build; no unsigned fallback is published.
- Own deployment: append `-PforteOrigin=https://your-host.example` (origin only, standard HTTPS port).
- Install Release: `adb install -r app/build/outputs/apk/release/app-release.apk`.

The release workflow reuses the original personal-install signing identity, which is an Android debug certificate. This preserves update compatibility; it is **not a Play distribution identity**. Release WebView inspection is disabled. Never replace the identity or uninstall an existing personal installation merely to work around a signing mismatch.

## iPhone and iPad

Requires macOS, Xcode 15.3+ and an installed simulator runtime. Minimum iOS/iPadOS version is 17.4: the existing offline/auth cleanup uses `Promise.withResolvers`, introduced in [WebKit 17.4](https://webkit.org/blog/15063/webkit-features-in-safari-17-4/).

Open `ios/Forte.xcodeproj` and select the shared Forte scheme. From the repository root:

```sh
xcodebuild -project mobile/ios/Forte.xcodeproj -scheme Forte -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath mobile/ios/build CODE_SIGNING_ALLOWED=NO build
```

`FORTE_HOST=your-host.example` changes both the HTTPS origin and `WKAppBoundDomains`. Physical installation requires the existing owner's Apple Team ID, signing certificate/private key and matching provisioning profile for `com.lewdoherz.forte`, plus device trust/Developer Mode where applicable. An unsigned simulator app runs only in Simulator; an unsigned device app ZIP is **not an installable IPA**. Hosted-wrapper App Store acceptance and guideline 4.8 compliance are not implied by compilation.

## System-browser authentication

Email/username and password remain ordinary same-origin web authentication, independent of social providers. Google authorization never runs inside WebView/WKWebView.

For an enabled social provider, Android launches Custom Tabs and iOS uses `ASWebAuthenticationSession`. The app generates a random verifier/state and SHA-256 PKCE challenge. The authenticated browser returns a single-use, 60-second code through `forte://auth/callback`; only the pending app can exchange it over HTTPS, bound to its platform and verifier. The shell installs only the configured host's Secure/HttpOnly session cookie. Session tokens never enter URLs or JavaScript. Cancellation clears the pending flow and sends a nonsecret event to reset the web button without discarding a workout draft.

Account linking opens the normal account page in the system browser. Its cookie jar is separate: authenticate the same Forte account there before linking. Matching email is never sufficient to merge accounts. Missing provider credentials/readiness keep the button and backend provider disabled; see [DEPLOYMENT.md](../DEPLOYMENT.md).

## Automation and artifacts

Run **Native mobile shells** (`mobile.yml`) manually, optionally choosing another hostname. GitHub Secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` supply the existing Android identity; temporary key material is removed after building.

- `forte-android-release-signed`: signed personal-install Release APK, verified with `apksigner`.
- `forte-ios-simulator-release`: unsigned Release simulator app ZIP.
- `forte-ios-device-release-UNSIGNED-NOT-INSTALLABLE`: unsigned Release device app ZIP, not an IPA.
- `forte-ios-build-logs`: Xcode build logs.
- `forte-ios-sign-in-smoke`: booted Simulator installation/launch, screenshots and OCR evidence of the actual Email/Password sign-in screen. A Retry/error screen does not pass.

The simulator smoke is not authentication, workout, keyboard, physical-device or App Store verification. Consult the release notes for the jobs and runtime checks that actually succeeded for a particular commit.

## Privacy and navigation

- Cookies and website data persist in private app storage; there is no native account database or token-bearing JavaScript bridge. Android disables backups/device transfers and third-party cookies.
- Only the configured HTTPS origin remains inside the shell. Other HTTPS links open externally; unsafe schemes, credential-bearing URLs, HTTP/mixed content and Android file/content access are rejected. TLS failures are never bypassed. The custom auth callback is state/PKCE-bound, not a general navigation bypass.
- Native safe-area/keyboard layout excludes system bars and the software keyboard. Android system Back uses AndroidX `OnBackPressedDispatcher`; activity recreation retains a same-origin route. iOS supports back gestures. Load/server/process failures offer a generic Retry without exposing credentials.
- Existing account-scoped web offline storage/sync is shared. A fresh installation still requires connectivity; service-worker behavior must be tested on each embedded engine.
- Changing deployment changes the storage origin. Sign-out revokes the web session and clears private web data. Uninstalling removes local data but does not revoke a server session.
- No native camera, location, storage permissions, notifications, payments or general browser download manager are added.

## Workout verification evidence

The local redesign check used an Android 15/API 35 emulator, WebView 124.0.6367.219, a 412 × 842 CSS-pixel WebView and a production-built server with disposable PostgreSQL. Its isolated HTTPS test CA is trusted only by the debug fixture, never by Release configuration.

Actual WebView interactions covered system-browser credential-broker return/session installation, keyboard-open multi-selection with a reachable Add action, manual barbell input, system Back hiding the keyboard then minimizing, draft resume, set-type selection, rest adjustment/reload/Skip, and Play/Pause with explicit timed-set completion. Finish explicitly retained one unchecked set as uncompleted. History showed only the three completed sets: 60 kg × 8, 12 reps and an actually stopped 2-second plank, with 480 kg volume. Deterministic elapsed-time hydration and filter-result scroll reset have browser regressions. Screenshots are in `screenshots/native-review/`.

These fixture checks are distinct from a production-targeted Release APK install and from browser viewport checks in `screenshots/training-review/`. Release notes report production artifact and macOS CI results separately. Real Google/Apple/Facebook/LinkedIn approval and iOS auth return still require verified provider setup; no physical iPhone/iPad result is claimed here.

