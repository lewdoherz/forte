import UIKit
import WebKit
import AuthenticationServices
import AVFoundation
import AudioToolbox
import CryptoKit
import Network
import Security
import UserNotifications

@main
final class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = ShellController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }
}

/// Serves bundled exercise thumbnails, body-heatmap PNGs, catalog JSON, and local audio
/// from `Forte.app/OfflineBundle/` on the custom `forte-asset://` scheme so the offline
/// HTML document can run on the real `https://<FORTE_HOST>` origin with shared IndexedDB.
private final class BundledAssetSchemeHandler: NSObject, WKURLSchemeHandler {
    private let bundleRoot: URL?

    override init() {
        self.bundleRoot = Bundle.main.resourceURL?.appendingPathComponent("OfflineBundle", isDirectory: true)
        super.init()
    }

    private static func mimeType(for path: String) -> String {
        let lower = path.lowercased()
        if lower.hasSuffix(".json") { return "application/json; charset=utf-8" }
        if lower.hasSuffix(".jpg") || lower.hasSuffix(".jpeg") { return "image/jpeg" }
        if lower.hasSuffix(".png") { return "image/png" }
        if lower.hasSuffix(".svg") { return "image/svg+xml" }
        if lower.hasSuffix(".wav") { return "audio/wav" }
        if lower.hasSuffix(".css") { return "text/css; charset=utf-8" }
        if lower.hasSuffix(".js") { return "application/javascript; charset=utf-8" }
        return "application/octet-stream"
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let root = bundleRoot,
              let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist))
            return
        }
        let rawPath = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !rawPath.isEmpty, !rawPath.contains("..") else {
            urlSchemeTask.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorNoPermissionsToReadFile))
            return
        }
        let fileURL = root.appendingPathComponent(rawPath)
        guard let data = try? Data(contentsOf: fileURL) else {
            urlSchemeTask.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist))
            return
        }
        let headers: [String: String] = [
            "Content-Type": Self.mimeType(for: rawPath),
            "Content-Length": String(data.count),
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store"
        ]
        if let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers) {
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } else {
            urlSchemeTask.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorCannotParseResponse))
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

final class ShellController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, ASWebAuthenticationPresentationContextProviding {
    private static let restNotificationId = "com.lewdoherz.forte.rest-timer"
    private static let offlineAppPath = "/offline-app"

    private var web: WKWebView!
    private var errorPanel: UIStackView!
    private var lastPage: URL!
    private var origin: URL!
    private var chimePlayer: AVAudioPlayer?
    private let pathMonitor = NWPathMonitor()
    private var networkSatisfied = true
    private var loadedInitialPage = false
    private struct PendingAuth {
        let state: String
        let verifier: String
        let expires: Date
    }
    private var pendingAuth: PendingAuth?
    private var authSession: ASWebAuthenticationSession?
    private var exchangeSession: URLSession?
    private var authTimeout: DispatchWorkItem?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 13.0/255.0, green: 21.0/255.0, blue: 18.0/255.0, alpha: 1)
        guard let host = Bundle.main.object(forInfoDictionaryKey: "ForteHost") as? String,
              let url = URL(string: "https://" + host), url.host == host,
              url.user == nil, url.password == nil, url.port == nil, url.path.isEmpty else {
            fatalError("ForteHost must be a DNS hostname without scheme, port, or path")
        }
        origin = url
        lastPage = url
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.limitsNavigationsToAppBoundDomains = true
        config.applicationNameForUserAgent = "ForteIOS/2"
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.userContentController.add(self, name: "forteRestTimer")
        config.setURLSchemeHandler(BundledAssetSchemeHandler(), forURLScheme: "forte-asset")
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor)
        ])
        let message = UILabel()
        message.text = NSLocalizedString("load_error", comment: "Message shown when the hosted app cannot load")
        message.textColor = .white
        message.numberOfLines = 0
        message.textAlignment = .center
        let retry = UIButton(type: .system)
        retry.setTitle(NSLocalizedString("retry", comment: "Button that reloads the hosted app"), for: .normal)
        retry.addTarget(self, action: #selector(reloadPage), for: .touchUpInside)
        errorPanel = UIStackView(arrangedSubviews: [message, retry])
        errorPanel.axis = .vertical
        errorPanel.spacing = 16
        errorPanel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(errorPanel)
        NSLayoutConstraint.activate([
            errorPanel.centerYAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerYAnchor),
            errorPanel.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            errorPanel.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24)
        ])
        web.allowsBackForwardNavigationGestures = true
        errorPanel.isHidden = true

        // Check reachability immediately so offline launches open the bundled normal Forte app
        // with zero network timeout or auth wait.
        pathMonitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                guard let self else { return }
                self.networkSatisfied = (path.status == .satisfied)
                if !self.loadedInitialPage {
                    self.loadedInitialPage = true
                    if self.networkSatisfied {
                        self.reloadPage()
                    } else {
                        self.showBundledOfflineApp()
                    }
                }
            }
        }
        pathMonitor.start(queue: DispatchQueue(label: "com.lewdoherz.forte.net"))

        // Safety fallback if NWPathMonitor does not emit synchronously on launch.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            guard let self, !self.loadedInitialPage else { return }
            self.loadedInitialPage = true
            self.reloadPage()
        }
    }

    deinit {
        pathMonitor.cancel()
    }

    private func safeHTTPS(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" && url.host != nil && url.user == nil && url.password == nil
    }

    private func sameOrigin(_ url: URL) -> Bool {
        safeHTTPS(url) && url.host?.lowercased() == origin.host?.lowercased() && (url.port == nil || url.port == 443)
    }

    @objc private func reloadPage() {
        errorPanel.isHidden = true
        web.isHidden = false
        if !networkSatisfied {
            showBundledOfflineApp()
            return
        }
        web.load(URLRequest(url: lastPage))
    }

    private func showError() { web.isHidden = true; errorPanel.isHidden = false }

    private func showBundledOfflineApp() {
        errorPanel.isHidden = true
        web.isHidden = false
        if let bundleHTML = Bundle.main.resourceURL?
            .appendingPathComponent("OfflineBundle", isDirectory: true)
            .appendingPathComponent("offline-app.html"),
           let html = try? String(contentsOf: bundleHTML, encoding: .utf8) {
            let base = origin.appendingPathComponent("offline-app")
            web.loadHTMLString(html, baseURL: base)
            return
        }
        showError()
    }

    private func playLocalChime() {
        guard let url = Bundle.main.url(forResource: "rest_chime", withExtension: "wav") else {
            AudioServicesPlaySystemSound(1007)
            return
        }
        do {
            // `.ambient` respects the hardware Silent/Ring switch and Focus/DND modes.
            try AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            let player = try AVAudioPlayer(contentsOf: url)
            player.prepareToPlay()
            player.play()
            chimePlayer = player
        } catch {
            AudioServicesPlaySystemSound(1007)
        }
    }

    private func emitNotificationStatus() {
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            DispatchQueue.main.async {
                guard let self else { return }
                let authorized = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
                let js = """
                window.dispatchEvent(new CustomEvent('forte:native-alert-status', { detail: {
                  platform: 'ios',
                  notificationsEnabled: \(authorized ? "true" : "false"),
                  postNotificationsGranted: \(authorized ? "true" : "false"),
                  channelBlocked: false,
                  dndBlocking: false,
                  ringerMode: 'unknown',
                  notificationVolumeZero: false,
                  hasVibrator: true,
                  exactAlarmsAllowed: true
                }}));
                """
                self.web.evaluateJavaScript(js, completionHandler: nil)
            }
        }
    }

    // Tightly scoped non-token message handler for rest-timer sound/vibration/background notifications only.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "forteRestTimer",
              let frameURL = message.frameInfo.request.url, sameOrigin(frameURL),
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        let center = UNUserNotificationCenter.current()
        if action == "status" {
            emitNotificationStatus()
            return
        }
        if action == "requestPermission" {
            center.requestAuthorization(options: [.alert, .sound]) { [weak self] _, _ in
                self?.emitNotificationStatus()
            }
            return
        }
        if action == "cancel" {
            center.removePendingNotificationRequests(withIdentifiers: [Self.restNotificationId])
            center.removeDeliveredNotifications(withIdentifiers: [Self.restNotificationId])
            return
        }
        if action == "preview" {
            let sound = (body["sound"] as? Bool) ?? true
            let vibrate = (body["vibrate"] as? Bool) ?? true
            if sound { playLocalChime() }
            if vibrate {
                let generator = UINotificationFeedbackGenerator()
                generator.notificationOccurred(.success)
                AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
            }
            return
        }
        if action == "schedule" {
            center.removePendingNotificationRequests(withIdentifiers: [Self.restNotificationId])
            let sound = (body["sound"] as? Bool) ?? true
            let vibrate = (body["vibrate"] as? Bool) ?? true
            guard sound || vibrate,
                  let triggerAtMs = body["triggerAtMs"] as? Double else { return }
            let delay = (triggerAtMs / 1000.0) - Date().timeIntervalSince1970
            guard delay > 0.5 else { return }
            let title = (body["title"] as? String) ?? "Rest finished"
            let subtitle = (body["body"] as? String) ?? "Ready for your next set."
            center.requestAuthorization(options: [.alert, .sound]) { [weak self] granted, _ in
                self?.emitNotificationStatus()
                guard granted else { return }
                let content = UNMutableNotificationContent()
                content.title = title
                content.body = subtitle
                if sound {
                    content.sound = UNNotificationSound(named: UNNotificationSoundName("rest_chime.wav"))
                }
                let trigger = UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
                let req = UNNotificationRequest(identifier: Self.restNotificationId, content: content, trigger: trigger)
                center.add(req, withCompletionHandler: nil)
            }
        }
    }

    private func randomToken() -> String? {
        var bytes = Data(count: 32)
        let result = bytes.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, 32, buffer.baseAddress!)
        }
        return result == errSecSuccess ? base64URL(bytes) : nil
    }

    private func base64URL(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    private func validToken(_ value: String) -> Bool {
        value.utf8.count == 43 && value.utf8.allSatisfy {
            (65...90).contains($0) || (97...122).contains($0) ||
            (48...57).contains($0) || $0 == 45 || $0 == 95
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        view.window!
    }

    private func finishAuth(showFailure: Bool, notifyPage: Bool = true) {
        authTimeout?.cancel()
        authTimeout = nil
        pendingAuth = nil
        let session = authSession
        authSession = nil
        session?.cancel()
        exchangeSession?.invalidateAndCancel()
        exchangeSession = nil
        if notifyPage, let currentURL = web.url, sameOrigin(currentURL) {
            web.evaluateJavaScript("window.dispatchEvent(new Event('forte:auth-cancelled'))", completionHandler: nil)
        }
        if showFailure, presentedViewController == nil {
            let alert = UIAlertController(title: NSLocalizedString("auth_error_title", comment: "Authentication failure title"),
                                          message: NSLocalizedString("auth_error", comment: "Authentication failure message"),
                                          preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: NSLocalizedString("dismiss", comment: "Dismiss alert"), style: .default))
            present(alert, animated: true)
        }
    }

    private func startAuth(_ url: URL) {
        guard pendingAuth == nil else { return }
        guard view.window != nil,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.fragment == nil,
              let items = components.queryItems, items.count == 1,
              items[0].name == "provider", let provider = items[0].value,
              ["google", "apple", "facebook", "linkedin"].contains(provider),
              let verifier = randomToken(), let state = randomToken() else {
            finishAuth(showFailure: true)
            return
        }
        let challenge = base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
        var start = URLComponents(url: origin.appendingPathComponent("auth/native/start"), resolvingAgainstBaseURL: false)!
        start.queryItems = [
            URLQueryItem(name: "provider", value: provider),
            URLQueryItem(name: "platform", value: "ios"),
            URLQueryItem(name: "challenge", value: challenge),
            URLQueryItem(name: "state", value: state)
        ]
        guard let startURL = start.url else { finishAuth(showFailure: true); return }
        pendingAuth = PendingAuth(state: state, verifier: verifier, expires: Date().addingTimeInterval(300))
        let session = ASWebAuthenticationSession(url: startURL, callbackURLScheme: "forte") { [weak self] callback, error in
            DispatchQueue.main.async {
                guard let self, self.pendingAuth?.state == state else { return }
                self.authSession = nil
                if let error {
                    let cancelled = (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin
                    self.finishAuth(showFailure: !cancelled)
                } else if let callback {
                    self.receiveAuth(callback, state: state)
                } else {
                    self.finishAuth(showFailure: true)
                }
            }
        }
        session.presentationContextProvider = self
        authSession = session
        let timeout = DispatchWorkItem { [weak self] in
            guard let self, self.pendingAuth?.state == state else { return }
            self.finishAuth(showFailure: true)
        }
        authTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 300, execute: timeout)
        if !session.start() { finishAuth(showFailure: true) }
    }

    private func receiveAuth(_ url: URL, state: String) {
        guard let pending = pendingAuth, pending.state == state, pending.expires > Date(),
              url.scheme == "forte", url.host == "auth", url.path == "/callback",
              url.user == nil, url.password == nil, url.port == nil, url.fragment == nil,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.percentEncodedPath == "/callback",
              let items = components.queryItems, items.count == 2,
              items.filter({ $0.name == "state" }).count == 1,
              items.filter({ $0.name == "code" }).count == 1,
              let returnedState = items.first(where: { $0.name == "state" })?.value,
              let code = items.first(where: { $0.name == "code" })?.value,
              validToken(returnedState), validToken(code), returnedState == pending.state else {
            finishAuth(showFailure: true)
            return
        }
        var request = URLRequest(url: origin.appendingPathComponent("api/auth/native/exchange"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "code": code, "verifier": pending.verifier, "platform": "ios"
        ])
        request.timeoutInterval = 30
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.urlCache = nil
        let session = URLSession(configuration: config, delegate: NativeExchangeDelegate(), delegateQueue: nil)
        exchangeSession = session
        session.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self, self.pendingAuth?.state == state else { return }
                guard self.pendingAuth!.expires > Date(), error == nil,
                      let response = response as? HTTPURLResponse, response.statusCode == 200,
                      let responseURL = response.url, self.sameOrigin(responseURL),
                      responseURL.path == "/api/auth/native/exchange",
                      let data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      json["ok"] as? Bool == true else {
                    self.finishAuth(showFailure: true)
                    return
                }
                var headers: [String: String] = [:]
                for (key, value) in response.allHeaderFields {
                    if let key = key as? String { headers[key] = String(describing: value) }
                }
                let cookies = HTTPCookie.cookies(withResponseHeaderFields: headers, for: responseURL)
                let cookieHeader = headers.first(where: { $0.key.lowercased() == "set-cookie" })?.value ?? ""
                guard cookies.count == 1, let cookie = cookies.first,
                      cookie.name == "__Secure-better-auth.session_token",
                      cookie.domain.lowercased() == self.origin.host?.lowercased(), cookie.path == "/",
                      cookie.isSecure, cookie.isHTTPOnly,
                      cookie.expiresDate == nil || cookie.expiresDate! > Date(),
                      cookieHeader.range(of: "(?i)(?:^|;)\\s*domain\\s*=", options: .regularExpression) == nil else {
                    self.finishAuth(showFailure: true)
                    return
                }
                self.authTimeout?.cancel()
                self.authTimeout = nil
                self.web.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) { [weak self] in
                    DispatchQueue.main.async {
                        guard let self, self.pendingAuth?.state == state else { return }
                        self.finishAuth(showFailure: false, notifyPage: false)
                        self.lastPage = self.origin.appendingPathComponent("auth/complete")
                        self.reloadPage()
                    }
                }
            }
        }.resume()
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if sameOrigin(url) {
            if url.path == "/auth/native/start" {
                decisionHandler(.cancel)
                if action.targetFrame?.isMainFrame != false { startAuth(url) }
                return
            }
            if url.path == "/auth/native/manage" {
                decisionHandler(.cancel)
                if action.targetFrame?.isMainFrame != false {
                    UIApplication.shared.open(origin.appendingPathComponent("account"), options: [:])
                }
                return
            }
            if action.targetFrame == nil { web.load(action.request); decisionHandler(.cancel) }
            else { decisionHandler(.allow) }
        } else {
            decisionHandler(.cancel)
            if safeHTTPS(url) && (action.targetFrame?.isMainFrame != false) {
                UIApplication.shared.open(url, options: [:]) { [weak self] success in
                    if !success { self?.showError() }
                }
            }
        }
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        if let url = webView.url, sameOrigin(url), url.path != Self.offlineAppPath { lastPage = url }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let code = (error as NSError).code
        if code == NSURLErrorCancelled { return }
        if [NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorTimedOut].contains(code) {
            showBundledOfflineApp()
        } else {
            showError()
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { showError() }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if response.isForMainFrame, let http = response.response as? HTTPURLResponse, http.statusCode >= 500 {
            showError(); decisionHandler(.cancel)
        } else { decisionHandler(.allow) }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { showError() }
}

// The one-time code and verifier must never follow an HTTP redirect.
private final class NativeExchangeDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
