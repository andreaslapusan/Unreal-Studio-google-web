import UIKit
import Capacitor
import WebKit
import SafariServices
import QuickLook
import UniformTypeIdentifiers
import LocalAuthentication

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = AppViewController()
        window?.makeKeyAndVisible()
        connectionOptions.urlContexts.forEach { native?.open($0.url) } // abierta en frío desde un enlace

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        URLContexts.forEach { native?.open($0.url) }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        if let url = userActivity.webpageURL { native?.open(url) }
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    private var native: NativeLayers? { (window?.rootViewController as? AppViewController)?.native }
}

/// iOS: deslizar desde el borde = atrás/adelante en el historial de la web (secciones ?view=, "Ver proyecto"…).
class AppViewController: CAPBridgeViewController {
    private var documents: DocumentHandler? // los delegados de WKWebView son weak: lo retenemos aquí
    private var lock: AppLock?
    private(set) var native: NativeLayers?

    override func capacitorDidLoad() {
        webView?.allowsBackForwardNavigationGestures = true
        if let webView = webView {
            documents = DocumentHandler(webView: webView, owner: self)
            lock = AppLock(owner: self, webView: webView)
            native = NativeLayers(owner: self, webView: webView) // después de AppLock: sus vistas quedan bajo la tapa
        }
    }
}

/// Face ID. Solo con sesión iniciada en el portal: al ir a segundo plano tapa la app (tampoco se ve en el selector de
/// apps) y al abrirla de cero o volver tras más de `grace` s pide Face ID / Touch ID / código del iPhone.
/// Sin sesión, o sin código configurado en el iPhone, no bloquea nada. No guarda ni envía datos biométricos.
final class AppLock: NSObject {
    private static let sessionKey = "unreal.applock.hasSession"
    // Sesión Supabase (todos los portales) o la antigua del admin.
    private static let sessionJS = "(function(){try{return Object.keys(localStorage).some(function(k){return /^sb-.+-auth-token$/.test(k)||k==='_ust_sh_'})}catch(e){return false}})()"
    private let grace: TimeInterval = 60
    private weak var owner: UIViewController?
    private weak var webView: WKWebView?
    private var cover: UIView?
    private var backgroundAt: Date?
    private var authenticating = false
    private var observers: [NSObjectProtocol] = []

    private var hasSession: Bool {
        get { UserDefaults.standard.bool(forKey: Self.sessionKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.sessionKey) }
    }

    init(owner: UIViewController, webView: WKWebView) {
        self.owner = owner
        self.webView = webView
        super.init()
        let nc = NotificationCenter.default
        observers = [
            nc.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.refreshSession() },
            nc.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.didEnterBackground() },
            nc.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.didBecomeActive() },
        ]
        if hasSession { // arranque en frío con sesión guardada: como si volviera de un fondo largo
            showCover()
            backgroundAt = .distantPast
            if UIApplication.shared.applicationState == .active { didBecomeActive() }
        }
    }

    deinit { observers.forEach { NotificationCenter.default.removeObserver($0) } }

    // El aviso de Face ID también hace "resign active": ahí no se mira nada.
    private func refreshSession() {
        guard !authenticating, cover == nil, let webView = webView,
              webView.url?.host?.hasSuffix("unrealstudiobali.com") == true else { return } // página offline: se conserva el valor
        webView.evaluateJavaScript(Self.sessionJS) { [weak self] result, _ in
            if let value = result as? Bool { self?.hasSession = value }
        }
    }

    private func didEnterBackground() {
        backgroundAt = Date()
        if hasSession { showCover() }
    }

    private func didBecomeActive() {
        // Solo al volver de segundo plano (no tras cerrar el aviso de Face ID, que también "activa" la app: si no, bucle).
        guard cover != nil, !authenticating, let since = backgroundAt else { return }
        if Date().timeIntervalSince(since) < grace {
            hideCover()
        } else {
            authenticate()
        }
        backgroundAt = nil
    }

    @objc private func authenticate() {
        let context = LAContext()
        var error: NSError?
        // .deviceOwnerAuthentication = Face ID y, si falla, el código del iPhone (nunca deja a nadie fuera de su app).
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else { hideCover(); return }
        authenticating = true
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: Self.text("reason")) { ok, _ in
            DispatchQueue.main.async {
                self.authenticating = false
                if ok { self.hideCover() } // si cancela, la tapa se queda con el botón "Desbloquear"
            }
        }
    }

    private func showCover() {
        guard cover == nil, let host = owner?.view else { return }
        let view = UIView(frame: host.bounds)
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.backgroundColor = UIColor(red: 243 / 255, green: 229 / 255, blue: 216 / 255, alpha: 1) // crema de marca
        let button = UIButton(type: .system)
        button.setTitle(Self.text("unlock"), for: .normal)
        button.setImage(UIImage(systemName: "faceid"), for: .normal)
        button.tintColor = UIColor(red: 63 / 255, green: 35 / 255, blue: 5 / 255, alpha: 1) // marrón de marca
        button.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        button.titleLabel?.adjustsFontForContentSizeCategory = true
        button.addTarget(self, action: #selector(authenticate), for: .touchUpInside)
        button.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(button)
        NSLayoutConstraint.activate([
            button.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            button.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
        ])
        host.addSubview(view)
        cover = view
    }

    private func hideCover() {
        guard let view = cover else { return }
        cover = nil
        UIView.animate(withDuration: 0.2, animations: { view.alpha = 0 }, completion: { _ in view.removeFromSuperview() })
    }

    // Textos en el idioma del iPhone (es/en/ro/id, como el resto de la app).
    private static func text(_ key: String) -> String {
        let strings: [String: [String: String]] = [
            "es": ["unlock": "Desbloquear", "reason": "Desbloquea la app para ver tus datos"],
            "en": ["unlock": "Unlock", "reason": "Unlock the app to see your data"],
            "ro": ["unlock": "Deblochează", "reason": "Deblochează aplicația pentru a-ți vedea datele"],
            "id": ["unlock": "Buka kunci", "reason": "Buka kunci aplikasi untuk melihat data Anda"],
        ]
        let lang = Locale.preferredLanguages.first.map { String($0.prefix(2)) } ?? "en"
        return (strings[lang] ?? strings["en"]!)[key]!
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
