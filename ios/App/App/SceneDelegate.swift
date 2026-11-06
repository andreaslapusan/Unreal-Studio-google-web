import UIKit
import Capacitor
import WebKit
import SafariServices
import QuickLook
import UniformTypeIdentifiers

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = AppViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// iOS: deslizar desde el borde = atrás/adelante en el historial de la web (secciones ?view=, "Ver proyecto"…).
class AppViewController: CAPBridgeViewController {
    private var documents: DocumentHandler? // los delegados de WKWebView son weak: lo retenemos aquí

    override func capacitorDidLoad() {
        webView?.allowsBackForwardNavigationGestures = true
        if let webView = webView { documents = DocumentHandler(webView: webView, owner: self) }
    }
}

/// Documentos dentro de la app. Se pone delante de los delegados de Capacitor y les reenvía todo lo demás.
/// - Descargas (<a download>, blob:/data:, p. ej. los recibos que genera jsPDF): fichero temporal → vista previa
///   QuickLook (compartir, guardar en Archivos, imprimir). Antes no pasaba nada al pulsarlas.
/// - Ventana nueva (target=_blank / window.open) a nuestros dominios: ficheros (PDF, imágenes) en Safari dentro de la
///   app; páginas del portal en la misma vista (conservan la sesión). Antes todo saltaba a Safari.
///   El resto (WhatsApp, Maps, Drive…) sigue yendo al sistema como antes.
final class DocumentHandler: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, QLPreviewControllerDataSource {
    // Fijo tras init y solo se usa en el hilo principal (WebKit llama a los delegados ahí).
    nonisolated(unsafe) private let capacitor: WebViewDelegationHandler?
    private weak var owner: CAPBridgeViewController?
    private var destinations: [WKDownload: URL] = [:]
    private var previewFile: URL?

    init(webView: WKWebView, owner: CAPBridgeViewController) {
        capacitor = webView.navigationDelegate as? WebViewDelegationHandler
        self.owner = owner
        super.init()
        guard capacitor != nil else { return } // sin Capacitor delante no tocamos nada
        webView.navigationDelegate = self
        webView.uiDelegate = self
    }

    // Lo que no se implementa aquí lo sigue atendiendo Capacitor.
    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (capacitor?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if let capacitor = capacitor, capacitor.responds(to: aSelector) { return capacitor }
        return super.forwardingTarget(for: aSelector)
    }

    // MARK: Descargas → vista previa

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let scheme = navigationAction.request.url?.scheme?.lowercased()
        let blobInMainFrame = navigationAction.targetFrame?.isMainFrame == true && (scheme == "blob" || scheme == "data")
        if navigationAction.shouldPerformDownload || blobInMainFrame {
            decisionHandler(.download)
        } else if let capacitor = capacitor {
            capacitor.webView(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        var name = (suggestedFilename as NSString).lastPathComponent
        if name.isEmpty || name.hasPrefix(".") { name = "Unreal Studio" }
        if (name as NSString).pathExtension.isEmpty,
           let ext = response.mimeType.flatMap({ UTType(mimeType: $0)?.preferredFilenameExtension }) {
            name += "." + ext
        }
        // shortcut: los temporales los purga iOS; si algún día pesan, borrar la carpeta al cerrar la vista previa.
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        } catch {
            completionHandler(nil) // nil = cancelar la descarga
            return
        }
        let file = folder.appendingPathComponent(name)
        destinations[download] = file
        completionHandler(file)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let file = destinations.removeValue(forKey: download) else { return }
        previewFile = file
        let preview = QLPreviewController()
        preview.dataSource = self
        topViewController()?.present(preview, animated: true)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        destinations.removeValue(forKey: download)
    }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
        previewFile == nil ? 0 : 1
    }

    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        (previewFile ?? FileManager.default.temporaryDirectory) as NSURL
    }

    // MARK: Ventanas nuevas

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let url = navigationAction.request.url
        let scheme = url?.scheme?.lowercased()
        guard let url = url, let host = url.host, scheme == "https" || scheme == "http",
              owner?.bridge?.config.shouldAllowNavigation(to: host) == true else {
            return capacitor?.webView(webView, createWebViewWith: configuration, for: navigationAction, windowFeatures: windowFeatures)
        }
        let ext = url.pathExtension.lowercased()
        let isPage = (ext.isEmpty || ext == "html" || ext == "htm") && !host.hasSuffix("supabase.co")
        if isPage {
            webView.load(navigationAction.request)
        } else {
            let safari = SFSafariViewController(url: url)
            safari.preferredControlTintColor = UIColor(red: 63 / 255, green: 35 / 255, blue: 5 / 255, alpha: 1) // marrón de marca
            topViewController()?.present(safari, animated: true)
        }
        return nil
    }

    private func topViewController() -> UIViewController? {
        var top: UIViewController? = owner
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}
