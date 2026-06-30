import UIKit
import WebKit

struct NeteaseLoginOutcome {
    let cookie: String
    let diagnostics: [String: Any]
}

final class NeteaseLoginViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKHTTPCookieStoreObserver {
    private enum LoginError {
        static func cancelled() -> NSError {
            NSError(
                domain: "MineradioIOS.NeteaseLogin",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "网易云登录未完成"]
            )
        }
    }

    private let completion: (Result<NeteaseLoginOutcome, Error>) -> Void
    private var webView: WKWebView!
    private var statusLabel: UILabel!
    private var didComplete = false
    private var currentURL = ""
    private var lastNavigationError = ""
    private var lastCookieNames: [String] = []
    private let desktopUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"

    init(completion: @escaping (Result<NeteaseLoginOutcome, Error>) -> Void) {
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func loadView() {
        view = UIView()
        view.backgroundColor = UIColor(red: 0.015, green: 0.018, blue: 0.028, alpha: 1)

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.customUserAgent = desktopUserAgent
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.backgroundColor = view.backgroundColor
        self.webView = webView

        let topBar = UIVisualEffectView(effect: UIBlurEffect(style: .systemChromeMaterialDark))
        topBar.translatesAutoresizingMaskIntoConstraints = false

        let title = UILabel()
        title.translatesAutoresizingMaskIntoConstraints = false
        title.text = "网易云音乐登录"
        title.textColor = .white
        title.font = .systemFont(ofSize: 16, weight: .semibold)

        let statusLabel = UILabel()
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.text = "正在打开网易云官方登录页..."
        statusLabel.textColor = UIColor(white: 1, alpha: 0.68)
        statusLabel.font = .systemFont(ofSize: 11, weight: .regular)
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 1
        self.statusLabel = statusLabel

        let closeButton = UIButton(type: .system)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        closeButton.setTitle("取消", for: .normal)
        closeButton.tintColor = UIColor(red: 1, green: 0.43, blue: 0.48, alpha: 1)
        closeButton.addTarget(self, action: #selector(cancelLogin), for: .touchUpInside)

        let doneButton = UIButton(type: .system)
        doneButton.translatesAutoresizingMaskIntoConstraints = false
        doneButton.setTitle("完成", for: .normal)
        doneButton.tintColor = UIColor(red: 0.56, green: 0.84, blue: 1, alpha: 1)
        doneButton.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
        doneButton.addTarget(self, action: #selector(manuallyCheckLogin), for: .touchUpInside)

        view.addSubview(topBar)
        view.addSubview(webView)
        topBar.contentView.addSubview(title)
        topBar.contentView.addSubview(statusLabel)
        topBar.contentView.addSubview(closeButton)
        topBar.contentView.addSubview(doneButton)

        NSLayoutConstraint.activate([
            topBar.topAnchor.constraint(equalTo: view.topAnchor),
            topBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            topBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            topBar.heightAnchor.constraint(equalToConstant: 58),

            title.centerXAnchor.constraint(equalTo: topBar.contentView.centerXAnchor),
            title.bottomAnchor.constraint(equalTo: topBar.contentView.bottomAnchor, constant: -22),

            statusLabel.leadingAnchor.constraint(equalTo: topBar.contentView.leadingAnchor, constant: 70),
            statusLabel.trailingAnchor.constraint(equalTo: topBar.contentView.trailingAnchor, constant: -70),
            statusLabel.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 2),

            closeButton.leadingAnchor.constraint(equalTo: topBar.contentView.leadingAnchor, constant: 14),
            closeButton.centerYAnchor.constraint(equalTo: title.centerYAnchor),

            doneButton.trailingAnchor.constraint(equalTo: topBar.contentView.trailingAnchor, constant: -14),
            doneButton.centerYAnchor.constraint(equalTo: title.centerYAnchor),

            webView.topAnchor.constraint(equalTo: topBar.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.configuration.websiteDataStore.httpCookieStore.add(self)
        if let url = URL(string: "https://music.163.com/#/login") {
            webView.load(URLRequest(url: url))
        }
        checkCookies()
    }

    deinit {
        webView?.configuration.websiteDataStore.httpCookieStore.remove(self)
    }

    func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
        checkCookies()
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        currentURL = webView.url?.absoluteString ?? currentURL
        updateStatus("正在加载网易云登录页...")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        currentURL = webView.url?.absoluteString ?? currentURL
        lastNavigationError = ""
        updateStatus("页面已加载，等待网页登录完成...")
        checkCookies()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        currentURL = webView.url?.absoluteString ?? currentURL
        lastNavigationError = error.localizedDescription
        updateStatus("网页加载失败: \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        currentURL = webView.url?.absoluteString ?? currentURL
        lastNavigationError = error.localizedDescription
        updateStatus("网页加载失败: \(error.localizedDescription)")
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
    }

    @objc private func cancelLogin() {
        finish(.failure(LoginError.cancelled()))
    }

    @objc private func manuallyCheckLogin() {
        updateStatus("正在检查网易云登录状态...")
        checkCookies(showMissingCookieMessage: true)
    }

    private func checkCookies() {
        checkCookies(showMissingCookieMessage: false)
    }

    private func checkCookies(showMissingCookieMessage: Bool) {
        webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
            guard let self else { return }
            self.lastCookieNames = cookies.map(\.name).sorted()
            guard cookies.contains(where: { $0.name == "MUSIC_U" && !$0.value.isEmpty }) else {
                if showMissingCookieMessage {
                    self.updateStatus("未检测到登录 Cookie，请在网易云页面完成登录后再点完成")
                } else {
                    self.updateStatus("等待网易云 Cookie... 已检测 \(cookies.count) 项")
                }
                return
            }
            let cookieString = self.cookieHeader(from: cookies)
            guard cookieString.contains("MUSIC_U=") else { return }
            self.updateStatus("已获取网易云 Cookie，正在返回播放器...")
            self.finish(.success(NeteaseLoginOutcome(cookie: cookieString, diagnostics: self.loginDiagnostics(hasCookie: true))))
        }
    }

    private func cookieHeader(from cookies: [HTTPCookie]) -> String {
        cookies
            .filter { cookie in
                let domain = cookie.domain.lowercased()
                return domain.contains("music.163.com") || domain.contains("163.com")
            }
            .map { "\($0.name)=\($0.value)" }
            .joined(separator: "; ")
    }

    private func updateStatus(_ text: String) {
        DispatchQueue.main.async { [weak self] in
            self?.statusLabel?.text = text
        }
    }

    private func loginDiagnostics(hasCookie: Bool) -> [String: Any] {
        [
            "currentURL": currentURL,
            "lastNavigationError": lastNavigationError,
            "cookieNames": lastCookieNames,
            "hasCookie": hasCookie
        ]
    }

    private func finish(_ result: Result<NeteaseLoginOutcome, Error>) {
        guard !didComplete else { return }
        didComplete = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.webView.configuration.websiteDataStore.httpCookieStore.remove(self)
            self.dismiss(animated: true) {
                self.completion(result)
            }
        }
    }
}
