import UIKit
import WebKit
import AuthenticationServices
import AudioToolbox
import CryptoKit
import Security
import UserNotifications

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = ShellController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

final class ShellController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, ASWebAuthenticationPresentationContextProviding {
    private static let restNotificationId = "com.lewdoherz.forte.rest-timer"
    private static let offlineStartPath = "/offline-start"

    private var web: WKWebView!
    private var errorPanel: UIStackView!
    private var lastPage: URL!
    private var origin: URL!
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
        config.applicationNameForUserAgent = "ForteIOS/1"
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.userContentController.add(self, name: "forteRestTimer")
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
        reloadPage()
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
        web.load(URLRequest(url: lastPage))
    }

    private func showError() { web.isHidden = true; errorPanel.isHidden = false }

    private func showFreshOfflineShell() {
        errorPanel.isHidden = true
        web.isHidden = false
        let base = origin.appendingPathComponent("offline-start")
        web.loadHTMLString(Self.freshOfflineHTML, baseURL: base)
    }

    // Tightly scoped non-token message handler for rest-timer sound/vibration/background notifications only.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "forteRestTimer",
              let frameURL = message.frameInfo.request.url, sameOrigin(frameURL),
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        let center = UNUserNotificationCenter.current()
        if action == "cancel" {
            center.removePendingNotificationRequests(withIdentifiers: [Self.restNotificationId])
            center.removeDeliveredNotifications(withIdentifiers: [Self.restNotificationId])
            return
        }
        if action == "preview" {
            let sound = (body["sound"] as? Bool) ?? true
            let vibrate = (body["vibrate"] as? Bool) ?? true
            if sound { AudioServicesPlaySystemSound(1007) }
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
            center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
                guard granted else { return }
                let content = UNMutableNotificationContent()
                content.title = title
                content.body = subtitle
                if sound { content.sound = .default }
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
        if let url = webView.url, sameOrigin(url), url.path != Self.offlineStartPath { lastPage = url }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let code = (error as NSError).code
        if code == NSURLErrorCancelled { return }
        if [NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorTimedOut].contains(code) {
            showFreshOfflineShell()
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

    private static let freshOfflineHTML = """
    <!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
    <title>forte — offline</title>
    <style>
      body{margin:0;padding:1.5rem;background:#0d1512;color:#eef5ef;font-family:-apple-system,system-ui,sans-serif}
      main{max-width:28rem;margin:2rem auto;display:grid;gap:1rem}
      .card{background:#17221c;border:1px solid #34463a;border-radius:1rem;padding:1rem}
      .btn{display:block;width:100%;min-height:2.75rem;border-radius:.75rem;border:0;background:#d6f077;color:#142017;font-weight:700;font-size:.95rem}
      p{color:#b0c0b4;line-height:1.5;font-size:.9rem}
    </style></head><body><main><div class="card">
      <h1 style="margin:0 0 .5rem">forte</h1>
      <p>This device has not completed first-time online setup yet. Connect once and sign in to sync your routines, exercises, and history for full offline use.</p>
      <button class="btn" onclick="location.assign(location.origin + '/')">Connect &amp; sign in</button>
    </div></main></body></html>
    """
}

// The one-time code and verifier must never follow an HTTP redirect.
private final class NativeExchangeDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
