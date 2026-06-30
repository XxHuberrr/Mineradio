import UIKit
import WebKit

final class ViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {
    private enum BridgeMessageName {
        static let mineradioIOS = "mineradioIOS"
    }

    private var webView: WKWebView!

    override func loadView() {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController = makeUserContentController()

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.015, green: 0.018, blue: 0.028, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.navigationDelegate = self

        self.webView = webView
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        loadMineradio()
    }

    private func makeUserContentController() -> WKUserContentController {
        let controller = WKUserContentController()
        controller.add(self, name: BridgeMessageName.mineradioIOS)

        if let compatibilityScript = bundledTextResource(named: "ios-compat", extension: "js") {
            controller.addUserScript(WKUserScript(
                source: compatibilityScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            ))
        }

        if let compatibilityStyle = bundledTextResource(named: "ios-compat", extension: "css") {
            controller.addUserScript(WKUserScript(
                source: cssInjectionScript(compatibilityStyle),
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: true
            ))
        }

        return controller
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == BridgeMessageName.mineradioIOS else { return }
        guard
            let payload = message.body as? [String: Any],
            let action = payload["action"] as? String
        else {
            return
        }

        if action == "openExternalURL", let urlString = payload["url"] as? String {
            openExternalURL(urlString)
        } else if action == "openNeteaseLogin", let requestId = payload["id"] as? String {
            openNeteaseLogin(requestId: requestId)
        }
    }

    private func openExternalURL(_ urlString: String) {
        guard let url = URL(string: urlString), UIApplication.shared.canOpenURL(url) else {
            return
        }
        UIApplication.shared.open(url)
    }

    private func openNeteaseLogin(requestId: String) {
        let controller = NeteaseLoginViewController { [weak self] result in
            switch result {
            case .success(let outcome):
                self?.resolveBridgeRequest(id: requestId, payload: [
                    "ok": true,
                    "cookie": outcome.cookie,
                    "diagnostics": outcome.diagnostics
                ])
            case .failure(let error):
                self?.resolveBridgeRequest(id: requestId, payload: [
                    "ok": false,
                    "error": error.localizedDescription
                ])
            }
        }
        controller.modalPresentationStyle = .fullScreen
        present(controller, animated: true)
    }

    private func resolveBridgeRequest(id: String, payload: [String: Any]) {
        let message: [String: Any] = [
            "id": id,
            "payload": payload
        ]
        guard
            let data = try? JSONSerialization.data(withJSONObject: message, options: []),
            let json = String(data: data, encoding: .utf8)
        else {
            return
        }
        DispatchQueue.main.async { [weak self] in
            self?.webView.evaluateJavaScript("window.__mineradioIOSBridgeResolve && window.__mineradioIOSBridgeResolve(\(json));")
        }
    }

    private func loadMineradio() {
        guard
            let publicDirectory = Bundle.main.resourceURL?.appendingPathComponent("public", isDirectory: true),
            let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "public")
        else {
            showMissingResourceScreen()
            return
        }

        webView.loadFileURL(indexURL, allowingReadAccessTo: publicDirectory)
    }

    private func bundledTextResource(named name: String, extension fileExtension: String) -> String? {
        guard let url = Bundle.main.url(forResource: name, withExtension: fileExtension) else {
            return nil
        }
        return try? String(contentsOf: url, encoding: .utf8)
    }

    private func cssInjectionScript(_ css: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [css], options: [])
        let json = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
        return """
        (function(){
          var css = \(json)[0];
          var style = document.createElement('style');
          style.setAttribute('data-mineradio-ios-compat', 'true');
          style.textContent = css;
          document.head.appendChild(style);
        })();
        """
    }

    private func showMissingResourceScreen() {
        let label = UILabel()
        label.text = "Mineradio iOS resources are missing."
        label.textColor = .white
        label.backgroundColor = UIColor(red: 0.015, green: 0.018, blue: 0.028, alpha: 1)
        label.textAlignment = .center
        label.numberOfLines = 0
        view = label
    }
}
