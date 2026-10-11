# forte native hosted shells

These are native HTTPS browser shells, not bundled copies of the Next.js server or Capacitor live-reload configurations. Both load https://forte-delta.vercel.app by default. Native versions are independently set to 1.0.0/build 1 in the Android Gradle and Xcode project. Android uses the platform WebView; iPhone and iPad use WKWebView. The dark lowercase f launcher monogram follows the web mark.

## Android personal installation

Requires JDK 21 (not the host's Java 25), Android SDK platform 36/build-tools 36.0.0, accepted SDK licenses, and ANDROID_HOME. Gradle 8.13 is downloaded by the checked-in official wrapper with a pinned distribution SHA-256; AGP is 8.13.2. Minimum Android version is 11/API 30. No local SDK paths or signing secrets belong in this directory.

From mobile/android:

- Windows: `gradlew.bat assembleDebug`
- Linux/macOS: `sh ./gradlew assembleDebug`
- Own deployment: append `-PforteOrigin=https://your-host.example` (origin only, standard HTTPS port).
- Install: `adb install -r app/build/outputs/apk/debug/app-debug.apk`

The debug APK is personally installable, not a Play release. Debug signing is local; keep the signing identity to install future updates without clearing local data. A different CI runner's debug identity can require uninstalling the previous app. Release publication needs your own protected signing setup.

## iPhone and iPad

Requires macOS and Xcode 15.3+ with an installed iOS simulator runtime. Minimum iOS/iPadOS version is 17.4: the existing web offline/auth cleanup uses `Promise.withResolvers`, introduced in [WebKit for Safari 17.4](https://webkit.org/blog/15063/webkit-features-in-safari-17-4/). Open ios/Forte.xcodeproj and select the shared Forte scheme. For an unsigned simulator build from the repository root:

```sh
xcodebuild -project mobile/ios/Forte.xcodeproj -scheme Forte -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath mobile/ios/build CODE_SIGNING_ALLOWED=NO build
```

Configure another deployment with the build setting `FORTE_HOST=your-host.example` (DNS hostname only). This single setting expands both the HTTPS launch origin and WKAppBoundDomains. For a personal physical-device install, select your Apple development team in Xcode Signing & Capabilities and run on the attached iPhone/iPad. Apple provisioning, device trust and Developer Mode are required; free-team provisioning expires and must be renewed. The unsigned simulator .app is not an IPA and cannot install on a physical device. App Store acceptance of a hosted website wrapper is not guaranteed.

## Automation

Manually run the Native mobile shells GitHub Actions workflow, optionally changing its hostname input. Separate Linux and macOS jobs publish a debug APK and unsigned simulator .app ZIP respectively. No distribution keys are needed. Workflows are not evidence of device testing until they have actually run.

## Privacy, navigation and limitations

- Cookies and website data persist in private application storage. Auth remains ordinary same-origin web auth; there is no JS/native bridge or native account database. Android disables cloud backups and excludes application data from device transfers with Android 12+ extraction rules; third-party cookies are disabled.
- Only the configured HTTPS origin stays in the shell; other HTTPS top-level links open the system browser, with its separate cookie jar. Unsafe navigation schemes and credential-bearing URLs are rejected. HTTP/mixed content and Android file/content access are disabled. TLS failures are never bypassed. No universal links or native deep-link handlers are registered.
- Native safe-area and keyboard layout keeps the web page outside system bars. Android system Back uses AndroidX's `OnBackPressedDispatcher` for legacy buttons and predictive Back; activity recreation retains the current same-origin route. iOS supports back gestures. Loading/network/server/process failures show a generic message and Retry without leaking URLs or credentials. Android WebView inspection is enabled only in debug builds.
- Hosting, authentication and the Internet remain required. Existing account-scoped web offline behavior may work where the embedded engine supports it, but these shells do not guarantee offline operation. WKAppBoundDomains plus the persistent WKWebsiteDataStore provides the best available WKWebView service-worker path; behavior must be verified on target devices. Android WebView must remain updated.
- Changing deployment changes the security origin; cookies/data do not migrate. Sign out through the web app to revoke its session. Uninstalling removes local shell data; it does not revoke a server session.
- No native camera, file picker, notifications, payments, browser download manager, or OAuth callback integration is supplied. The current email/password web login is the intended auth path. No camera, location, or storage permissions or runtime permission prompts are added.

## Verification status

The Android debug APK was built with the checked-in wrapper and exercised on an
API 35 emulator. A production-built forte server with disposable PostgreSQL was
served through an isolated HTTPS test proxy; its one-day test certificate was
trusted only by that disposable emulator. The app's TLS handling was not changed.
Verified: login, dashboard rendering, routine start, a completed set synced to the
server, system Back, persisted authentication after process restart, and route/
set preservation through portrait-to-landscape recreation. The disconnected
deployment path displayed the native Retry screen.
The final AndroidX-backed APK was reinstalled and checked for sign-in, restored
workout volume, and system Back returning to the dashboard. `lintDebug` reports
zero errors and two warnings (Gradle version availability and required WebView
JavaScript). APK Signature Scheme v2 verification passed.

This is not deployed-server verification. The cloud deployment was unreachable
from the workstation. The iOS project and macOS build workflow are provided, but
were not compiled or run here because macOS/Xcode is unavailable. Offline reload,
Apple device behavior, and the GitHub workflow artifacts remain unverified.
