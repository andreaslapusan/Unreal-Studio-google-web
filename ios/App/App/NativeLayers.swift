import UIKit
import WebKit
import Security
import LocalAuthentication
import UserNotifications
import Network
import Capacitor

/// Capas nativas encima del portal en vivo (opción 1 "nativa por capas", 17-nov-2026). Todo sin tocar la web:
/// - Contraseña en el Llavero con Face ID (y la web deja de guardarla en localStorage dentro de la app).
/// - Barra de pestañas nativa por portal (admin, agencias, equipo; clientes es una sola página).
/// - Push: permiso tras el login, token → Supabase (register_device_token); número del icono = avisos sin leer (admin).
/// - Versión mínima / nueva (tabla app_versions), aviso sin conexión, enlaces profundos (<bundle id>://ruta), hápticos.
enum Portal {
    static let base = URL(string: "https://unrealstudiobali.com")!
    static let supabase = "https://rnielxgackkshnatvagj.supabase.co"
    // Clave pública "anon" (la misma que va en la web); los datos los protege RLS.
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaWVseGdhY2trc2huYXR2YWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MzE4NTEsImV4cCI6MjA4NjQwNzg1MX0.5X6k4TVLrH1AJMLw797l4LWTy3cROhh-Q4gAPl-GPJY"
    static var bundleId: String { Bundle.main.bundleIdentifier ?? "com.unrealstudio.clientes" }
    /// com.unrealstudio.<flavor>(.beta)
    static var flavor: String { bundleId.split(separator: ".").dropFirst(2).first.map(String.init) ?? "clientes" }
    /// Nombre del portal en la web (PortalLogin portal=…) y su página de login.
    static var webPortal: String { ["clientes": "cliente", "equipo": "empleados"][flavor] ?? flavor }
    static var loginPath: String { ["admin": "/admin/login", "agencias": "/agencias/login", "equipo": "/empleados"][flavor] ?? "/cliente" }
    static var build: Int { Int(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "") ?? 0 }
    static var lang: String { Locale.preferredLanguages.first.map { String($0.prefix(2)) }.flatMap { ["es", "en", "ro", "id"].contains($0) ? $0 : nil } ?? "en" }

    /// es/en/ro/id
    static func t(_ es: String, _ en: String, _ ro: String, _ id: String) -> String {
        ["es": es, "ro": ro, "id": id][lang] ?? en
    }

    /// Carga una ruta del portal (deep link / push). Solo rutas relativas o nuestro dominio.
    static func url(forPath path: String) -> URL? {
        guard path.hasPrefix("/") else { return nil }
        return URL(string: path, relativeTo: base)?.absoluteURL
    }
}

/// WKUserContentController retiene a su handler: este proxy evita el ciclo con NativeLayers.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) { target?.userContentController(c, didReceive: m) }
}

final class NativeLayers: NSObject, WKScriptMessageHandler, UITabBarDelegate {
    private weak var owner: CAPBridgeViewController?
    private weak var webView: WKWebView?
    private var observers: [NSObjectProtocol] = []
    private var urlObservation: NSKeyValueObservation?
    private var session: (token: String, email: String)?
    private var deviceToken: String?
    private var versionChecked = false
    private var offeredLogin = false
    private let tabBar = UITabBar()
    private let tabs: [(title: String, icon: String, path: String)]
    private let offline = UILabel()
    private let monitor = NWPathMonitor()

    // MARK: Arranque

    init(owner: CAPBridgeViewController, webView: WKWebView) {
        self.owner = owner
        self.webView = webView
        tabs = NativeLayers.tabsForFlavor()
        super.init()
        installScripts(webView.configuration.userContentController)
        setUpTabBar()
        setUpOffline()
        let nc = NotificationCenter.default
        observers = [
            nc.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.refresh() },
            nc.addObserver(forName: .capacitorDidRegisterForRemoteNotifications, object: nil, queue: .main) { [weak self] n in
                guard let data = n.object as? Data else { return }
                self?.deviceToken = data.map { String(format: "%02x", $0) }.joined()
                self?.uploadDeviceToken()
            },
        ]
        urlObservation = webView.observe(\.url, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async { self?.refresh() }
        }
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        monitor.cancel()
    }

    /// Cada vez que cambia la página o la app vuelve a primer plano.
    private func refresh() {
        checkVersionOnce()
        readSession { [weak self] in
            guard let self = self else { return }
            self.updateTabBar()
            self.offerKeychainLoginIfNeeded()
            if self.session != nil { self.setUpPush(); self.syncBadge() } else { self.dropDeviceToken() }
        }
    }

    private func readSession(_ done: @escaping () -> Void) {
        guard let webView = webView, webView.url?.host?.hasSuffix("unrealstudiobali.com") == true else { done(); return }
        let js = "(function(){try{var k=Object.keys(localStorage).find(function(k){return /^sb-.+-auth-token$/.test(k)});if(!k)return '';var s=JSON.parse(localStorage.getItem(k));return JSON.stringify({t:s.access_token||'',e:(s.user&&s.user.email)||''})}catch(e){return ''}})()"
        webView.evaluateJavaScript(js) { [weak self] result, _ in
            if let text = result as? String, let data = text.data(using: .utf8),
               let obj = try? JSONSerialization.jsonObject(with: data) as? [String: String], let token = obj["t"], !token.isEmpty {
                self?.session = (token, obj["e"] ?? "")
            } else {
                self?.session = nil
            }
            done()
        }
    }

    // MARK: Scripts en la página

    private func installScripts(_ ucc: WKUserContentController) {
        ucc.add(WeakMessageHandler(self), name: "unrealNative")
        // La web guardaba la contraseña en localStorage (base64) con "Recordarme". En la app va al Llavero:
        // se borra lo guardado y cada setItem('ust_pw_<portal>') se desvía al nativo (solo tras un login correcto).
        let credentials = """
        (function(){
          if (window.__unrealCred) return; window.__unrealCred = 1;
          try { Object.keys(localStorage).forEach(function(k){ if (k.indexOf('ust_pw_') === 0) localStorage.removeItem(k); }); } catch (e) {}
          var set = Storage.prototype.setItem, rm = Storage.prototype.removeItem;
          function post(m){ try { window.webkit.messageHandlers.unrealNative.postMessage(m); } catch (e) {} }
          Storage.prototype.setItem = function(k, v){
            k = String(k);
            if (this === window.localStorage && k.indexOf('ust_pw_') === 0) {
              var p = k.slice(7), e = ''; try { e = localStorage.getItem('ust_email_' + p) || ''; } catch (x) {}
              var pw = ''; try { pw = atob(String(v)); } catch (x) { return; }
              post({ type: 'saveCredential', portal: p, email: e, password: pw }); return;
            }
            return set.apply(this, arguments);
          };
          Storage.prototype.removeItem = function(k){
            if (this === window.localStorage && String(k).indexOf('ust_pw_') === 0) post({ type: 'deleteCredential', portal: String(k).slice(7) });
            return rm.apply(this, arguments);
          };
        })();
        """
        ucc.addUserScript(WKUserScript(source: credentials, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        // Tocar un aviso push con { url: '/ruta' } abre esa sección.
        let pushTap = """
        (function(){
          var C = window.Capacitor, P = C && C.Plugins && C.Plugins.PushNotifications;
          if (!P || window.__unrealPushTap) return; window.__unrealPushTap = 1;
          P.addListener('pushNotificationActionPerformed', function(a){
            var u = a && a.notification && a.notification.data && a.notification.data.url;
            if (typeof u === 'string' && u.charAt(0) === '/' && u.charAt(1) !== '/') location.href = u;
          });
        })();
        """
        ucc.addUserScript(WKUserScript(source: pushTap, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
    }

    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String,
              let portal = body["portal"] as? String, portal.range(of: "^[a-z]{2,20}$", options: .regularExpression) != nil,
              message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.host.hasSuffix("unrealstudiobali.com") else { return }
        switch type {
        case "saveCredential":
            if let email = body["email"] as? String, let password = body["password"] as? String, !email.isEmpty, !password.isEmpty {
                Keychain.save(portal: portal, email: email, password: password)
            }
        case "deleteCredential":
            Keychain.delete(portal: portal)
        default: break
        }
    }

    // MARK: Login con Face ID (Llavero)

    private func offerKeychainLoginIfNeeded() {
        guard session == nil, !offeredLogin, let webView = webView, let path = webView.url?.path,
              path == Portal.loginPath, Keychain.exists(portal: Portal.webPortal) else { return }
        offeredLogin = true // una vez por arranque; si cancela, escribe la contraseña como siempre
        Keychain.read(portal: Portal.webPortal, reason: Portal.t("Entrar con Face ID", "Sign in with Face ID", "Autentificare cu Face ID", "Masuk dengan Face ID")) { [weak self] credential in
            guard let credential = credential, let webView = self?.webView,
                  let args = try? JSONSerialization.data(withJSONObject: [credential.email, credential.password]),
                  let argsJS = String(data: args, encoding: .utf8) else { return }
            let fill = """
            (function(e, p){
              var em = document.querySelector('input[type=email],input[autocomplete=username]'), pw = document.querySelector('input[type=password]');
              if (!em || !pw) return false;
              var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
              [[em, e], [pw, p]].forEach(function(x){ d.set.call(x[0], x[1]); x[0].dispatchEvent(new Event('input', { bubbles: true })); });
              setTimeout(function(){ var f = pw.form; if (f && f.requestSubmit) f.requestSubmit(); else if (f) { var b = f.querySelector('[type=submit]'); if (b) b.click(); } }, 80);
              return true;
            }).apply(null, \(argsJS))
            """
            webView.evaluateJavaScript(fill) { result, _ in
                if result as? Bool == true { UINotificationFeedbackGenerator().notificationOccurred(.success) }
            }
        }
    }

    // MARK: Barra de pestañas

    private static func tabsForFlavor() -> [(title: String, icon: String, path: String)] {
        let t = Portal.t
        switch Portal.flavor {
        case "admin":
            return [(t("Panel", "Home", "Panou", "Beranda"), "square.grid.2x2", "/admin?view=dashboard"),
                    (t("Clientes", "Clients", "Clienți", "Klien"), "person.2", "/admin?view=clients"),
                    (t("Cobros", "Payments", "Încasări", "Pembayaran"), "creditcard", "/admin?view=cobros"),
                    (t("Agenda", "Agenda", "Agendă", "Agenda"), "calendar", "/admin?view=agenda"),
                    (t("Avisos", "Alerts", "Notificări", "Notifikasi"), "bell", "/admin?view=notifications")]
        case "agencias":
            return [(t("Inicio", "Home", "Acasă", "Beranda"), "house", "/agencias/dashboard?view=dashboard"),
                    (t("Disponible", "Available", "Disponibil", "Tersedia"), "checkmark.seal", "/agencias/dashboard?view=availability"),
                    (t("Proyectos", "Projects", "Proiecte", "Proyek"), "building.2", "/agencias/dashboard?view=projects"),
                    (t("Clientes", "Clients", "Clienți", "Klien"), "person.2", "/agencias/dashboard?view=clients"),
                    (t("Perfil", "Profile", "Profil", "Profil"), "person.crop.circle", "/agencias/dashboard?view=profile")]
        case "equipo":
            return [(t("Fichar", "Check in", "Pontaj", "Absen"), "clock", "/empleados/dashboard"),
                    (t("Propiedades", "Properties", "Proprietăți", "Properti"), "house", "/empleados/propiedades"),
                    (t("Subir", "Upload", "Încarcă", "Unggah"), "square.and.arrow.up", "/empleados/upload")]
        default:
            return [] // Clientes: una sola página, sin pestañas
        }
    }

    private func setUpTabBar() {
        guard !tabs.isEmpty, let webView = webView else { return }
        tabBar.items = tabs.enumerated().map { i, tab in UITabBarItem(title: tab.title, image: UIImage(systemName: tab.icon), tag: i) }
        tabBar.delegate = self
        tabBar.tintColor = UIColor(red: 63 / 255, green: 35 / 255, blue: 5 / 255, alpha: 1) // marrón de marca
        tabBar.isHidden = true
        tabBar.translatesAutoresizingMaskIntoConstraints = false
        webView.insertSubview(tabBar, aboveSubview: webView.scrollView) // por debajo de la tapa de Face ID
        NSLayoutConstraint.activate([
            tabBar.leadingAnchor.constraint(equalTo: webView.leadingAnchor),
            tabBar.trailingAnchor.constraint(equalTo: webView.trailingAnchor),
            tabBar.bottomAnchor.constraint(equalTo: webView.bottomAnchor),
        ])
    }

    /// Visible solo con sesión y dentro del panel del portal (no en el login).
    private func updateTabBar() {
        guard !tabs.isEmpty, let url = webView?.url else { return }
        let path = url.path
        let inside: Bool
        switch Portal.flavor {
        case "admin": inside = path.hasPrefix("/admin") && path != "/admin/login"
        case "agencias": inside = path.hasPrefix("/agencias/dashboard")
        default: inside = path.hasPrefix("/empleados/")
        }
        let show = inside && session != nil
        if tabBar.isHidden == show, let scroll = webView?.scrollView {
            tabBar.isHidden = !show
            // shortcut: el contenido se desplaza por encima de la barra; lo fijo abajo en la web (position:fixed) queda
            // debajo. Si molesta en algún portal, que la web lea un --native-tabbar en html.native-app.
            scroll.contentInset.bottom = show ? 49 : 0
            scroll.verticalScrollIndicatorInsets.bottom = show ? 49 : 0
        }
        let view = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "view" }?.value
        let current = tabs.firstIndex { tab in
            let target = URLComponents(string: tab.path)
            let targetView = target?.queryItems?.first { $0.name == "view" }?.value
            return target?.path == path && (targetView == nil || targetView == (view ?? "dashboard"))
        }
        tabBar.selectedItem = current.flatMap { tabBar.items?[$0] }
    }

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        UISelectionFeedbackGenerator().selectionChanged()
        guard let path = tabs[safe: item.tag]?.path, let arg = try? JSONSerialization.data(withJSONObject: [path]),
              let argJS = String(data: arg, encoding: .utf8) else { return }
        // Navegación de la SPA (React Router escucha popstate): sin recargar la página.
        webView?.evaluateJavaScript("(function(u){history.pushState(null,'',u);dispatchEvent(new PopStateEvent('popstate',{state:null}));window.scrollTo(0,0)}).apply(null,\(argJS))")
    }

    // MARK: Push + número del icono

    private func setUpPush() {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            DispatchQueue.main.async {
                switch settings.authorizationStatus {
                case .authorized, .provisional, .ephemeral:
                    UIApplication.shared.registerForRemoteNotifications()
                case .notDetermined:
                    // Se pide una sola vez, ya dentro del portal (no al abrir la app sin contexto).
                    center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
                        if granted { DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() } }
                    }
                default: break
                }
            }
        }
    }

    private func uploadDeviceToken() {
        guard let token = deviceToken, let session = session else { return }
        rpc("register_device_token", ["p_token": token, "p_app": Portal.bundleId, "p_lang": Portal.lang], bearer: session.token) { _ in }
    }

    /// Al cerrar sesión: este iPhone deja de recibir avisos de esa cuenta.
    private func dropDeviceToken() {
        guard let token = deviceToken else { return }
        deviceToken = nil
        rpc("unregister_device_token", ["p_token": token], bearer: nil) { _ in }
        setBadge(0)
    }

    private func syncBadge() {
        guard Portal.flavor == "admin", let session = session else { setBadge(0); return }
        rpc("admin_unread_count", [:], bearer: session.token) { [weak self] data in
            guard let data = data, let text = String(data: data, encoding: .utf8), let n = Int(text.trimmingCharacters(in: .whitespacesAndNewlines)) else { return }
            DispatchQueue.main.async { self?.setBadge(n) }
        }
    }

    private func setBadge(_ n: Int) {
        if #available(iOS 16.0, *) { UNUserNotificationCenter.current().setBadgeCount(n) } else { UIApplication.shared.applicationIconBadgeNumber = n }
        if Portal.flavor == "admin" { tabBar.items?.last?.badgeValue = n > 0 ? String(n) : nil }
    }

    private func rpc(_ name: String, _ params: [String: String], bearer: String?, done: @escaping (Data?) -> Void) {
        var req = URLRequest(url: URL(string: "\(Portal.supabase)/rest/v1/rpc/\(name)")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(Portal.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(bearer ?? Portal.anonKey)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONSerialization.data(withJSONObject: params)
        URLSession.shared.dataTask(with: req) { data, response, _ in
            done((response as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } == true ? data : nil)
        }.resume()
    }

    // MARK: Versión mínima / nueva

    private func checkVersionOnce() {
        guard !versionChecked else { return }
        versionChecked = true
        var req = URLRequest(url: URL(string: "\(Portal.supabase)/rest/v1/app_versions?bundle_id=eq.\(Portal.bundleId)&select=min_build,latest_build,store_url")!)
        req.setValue(Portal.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(Portal.anonKey)", forHTTPHeaderField: "Authorization")
        URLSession.shared.dataTask(with: req) { [weak self] data, _, _ in
            guard let data = data, let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]], let row = rows.first else { return }
            let minBuild = row["min_build"] as? Int ?? 0, latest = row["latest_build"] as? Int ?? 0
            let store = (row["store_url"] as? String).flatMap(URL.init(string:))
            DispatchQueue.main.async { self?.showUpdate(force: Portal.build < minBuild, latest: latest, store: store) }
        }.resume()
    }

    private func showUpdate(force: Bool, latest: Int, store: URL?) {
        let seenKey = "unreal.update.seen"
        guard force || (Portal.build < latest && UserDefaults.standard.integer(forKey: seenKey) < latest), let owner = owner else { return }
        let alert = UIAlertController(
            title: force ? Portal.t("Actualiza la app", "Update the app", "Actualizează aplicația", "Perbarui aplikasi")
                         : Portal.t("Nueva versión disponible", "New version available", "Versiune nouă disponibilă", "Versi baru tersedia"),
            message: force ? Portal.t("Esta versión ya no es compatible.", "This version is no longer supported.", "Această versiune nu mai este acceptată.", "Versi ini sudah tidak didukung.") : nil,
            preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: Portal.t("Actualizar", "Update", "Actualizează", "Perbarui"), style: .default) { [weak self] _ in
            if let store = store { UIApplication.shared.open(store) }
            if force { self?.showUpdate(force: true, latest: latest, store: store) } // no se puede seguir sin actualizar
        })
        if !force {
            UserDefaults.standard.set(latest, forKey: seenKey)
            alert.addAction(UIAlertAction(title: Portal.t("Más tarde", "Later", "Mai târziu", "Nanti"), style: .cancel))
        }
        (owner.presentedViewController ?? owner).present(alert, animated: true)
    }

    // MARK: Sin conexión

    private func setUpOffline() {
        guard let webView = webView else { return }
        offline.text = Portal.t("Sin conexión", "No connection", "Fără conexiune", "Tidak ada koneksi")
        offline.font = .preferredFont(forTextStyle: .footnote)
        offline.adjustsFontForContentSizeCategory = true
        offline.textAlignment = .center
        offline.textColor = .white
        offline.backgroundColor = UIColor(red: 63 / 255, green: 35 / 255, blue: 5 / 255, alpha: 0.95)
        offline.isHidden = true
        offline.translatesAutoresizingMaskIntoConstraints = false
        webView.insertSubview(offline, aboveSubview: webView.scrollView)
        NSLayoutConstraint.activate([
            offline.leadingAnchor.constraint(equalTo: webView.leadingAnchor),
            offline.trailingAnchor.constraint(equalTo: webView.trailingAnchor),
            offline.topAnchor.constraint(equalTo: webView.safeAreaLayoutGuide.topAnchor),
            offline.heightAnchor.constraint(greaterThanOrEqualToConstant: 28),
        ])
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async { self?.connectionChanged(online: path.status == .satisfied) }
        }
        monitor.start(queue: DispatchQueue(label: "unreal.network"))
    }

    private func connectionChanged(online: Bool) {
        let wasOffline = !offline.isHidden
        offline.isHidden = online
        // Vuelve la conexión estando en la página offline local → recargar el portal.
        if online, wasOffline, let webView = webView, webView.url?.scheme != "https", let start = owner?.bridge?.config.serverURL {
            webView.load(URLRequest(url: start))
        }
    }

    // MARK: Enlaces profundos

    /// <bundle id>://admin?view=clients  ó  https://unrealstudiobali.com/... (enlaces universales, cuando estén activos).
    @discardableResult
    func open(_ url: URL) -> Bool {
        var target: URL?
        if url.scheme == Portal.bundleId {
            var c = URLComponents(url: url, resolvingAgainstBaseURL: false)
            let path = "/" + [c?.host, c?.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "/")
            c?.scheme = nil; c?.host = nil; c?.path = path
            target = c?.string.flatMap { Portal.url(forPath: $0) }
        } else if url.scheme == "https", url.host?.hasSuffix("unrealstudiobali.com") == true {
            target = url
        }
        guard let target = target, let webView = webView else { return false }
        webView.load(URLRequest(url: target))
        return true
    }
}

/// Contraseñas de los portales en el Llavero, solo en este iPhone y protegidas con Face ID / código.
enum Keychain {
    private static func service(_ portal: String) -> String { "unreal.portal.\(portal)" }

    static func save(portal: String, email: String, password: String) {
        delete(portal: portal)
        guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .userPresence, nil) else { return }
        let item: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service(portal),
                                   kSecAttrAccount as String: email, kSecValueData as String: Data(password.utf8),
                                   kSecAttrAccessControl as String: access]
        SecItemAdd(item as CFDictionary, nil) // sin código en el iPhone falla y no se guarda: entra escribiendo, como en la web
    }

    static func delete(portal: String) {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service(portal)] as CFDictionary)
    }

    /// ¿Hay contraseña guardada? (sin pedir Face ID)
    static func exists(portal: String) -> Bool {
        let context = LAContext()
        context.interactionNotAllowed = true
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service(portal),
                                    kSecUseAuthenticationContext as String: context, kSecReturnAttributes as String: true]
        let status = SecItemCopyMatching(query as CFDictionary, nil)
        return status == errSecSuccess || status == errSecInteractionNotAllowed
    }

    /// Pide Face ID / código y devuelve email + contraseña (en el hilo principal).
    static func read(portal: String, reason: String, done: @escaping ((email: String, password: String)?) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let context = LAContext()
            context.localizedReason = reason
            let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service(portal),
                                        kSecUseAuthenticationContext as String: context, kSecReturnAttributes as String: true,
                                        kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
            var out: CFTypeRef?
            let status = SecItemCopyMatching(query as CFDictionary, &out)
            var result: (email: String, password: String)?
            if status == errSecSuccess, let item = out as? [String: Any], let email = item[kSecAttrAccount as String] as? String,
               let data = item[kSecValueData as String] as? Data, let password = String(data: data, encoding: .utf8) {
                result = (email, password)
            }
            DispatchQueue.main.async { done(result) }
        }
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
