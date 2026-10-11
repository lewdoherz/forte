import UIKit
import WebKit

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

final class ShellController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private var web: WKWebView!
    private var errorPanel: UIStackView!
    private var lastPage: URL!
    private var origin: URL!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(white: 0.095, alpha: 1)
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
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
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
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if sameOrigin(url) {
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
        if let url = webView.url, sameOrigin(url) { lastPage = url }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { showError() }
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
