import Foundation
import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
  private let appGroupId = "group.dk.rasmusgunnar.fcnfans.share"
  private let pendingKey = "FCNIncomingSharePendingV1"
  private var started = false

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    let label = UILabel()
    label.translatesAutoresizingMaskIntoConstraints = false
    label.text = "Åbner FCN Fans…"
    label.font = .preferredFont(forTextStyle: .headline)
    label.textAlignment = .center
    label.numberOfLines = 0
    view.addSubview(label)
    NSLayoutConstraint.activate([
      label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
      label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
      label.centerYAnchor.constraint(equalTo: view.centerYAnchor)
    ])
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !started else { return }
    started = true
    loadSharedText { [weak self] sharedText in
      DispatchQueue.main.async {
        self?.handle(sharedText)
      }
    }
  }

  private func loadSharedText(completion: @escaping (String?) -> Void) {
    let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? [])
      .flatMap { $0.attachments ?? [] }
    load(from: providers, index: 0, completion: completion)
  }

  private func load(
    from providers: [NSItemProvider],
    index: Int,
    completion: @escaping (String?) -> Void
  ) {
    guard index < providers.count else {
      completion(nil)
      return
    }
    let provider = providers[index]
    let urlType = UTType.url.identifier
    let textType = UTType.plainText.identifier
    let type = provider.hasItemConformingToTypeIdentifier(urlType)
      ? urlType
      : provider.hasItemConformingToTypeIdentifier(textType) ? textType : nil
    guard let type else {
      load(from: providers, index: index + 1, completion: completion)
      return
    }
    provider.loadItem(forTypeIdentifier: type, options: nil) { [weak self] item, _ in
      let value: String?
      if let url = item as? URL {
        value = url.absoluteString
      } else if let string = item as? String {
        value = string
      } else if let attributed = item as? NSAttributedString {
        value = attributed.string
      } else {
        value = nil
      }
      if let value, !value.isEmpty {
        completion(value)
      } else {
        self?.load(from: providers, index: index + 1, completion: completion)
      }
    }
  }

  private func handle(_ sharedText: String?) {
    guard
      let sharedText,
      let attachment = parseInstagramShare(sharedText),
      let defaults = UserDefaults(suiteName: appGroupId)
    else {
      showInvalidShare()
      return
    }

    var payload = attachment
    payload["id"] = UUID().uuidString
    payload["receivedAt"] = ISO8601DateFormatter().string(from: Date())
    payload["source"] = "ios_share_extension"
    guard
      let data = try? JSONSerialization.data(withJSONObject: payload),
      let encoded = String(data: data, encoding: .utf8)
    else {
      showInvalidShare()
      return
    }
    defaults.set(encoded, forKey: pendingKey)
    _ = defaults.synchronize()
    openHostApp()
  }

  private func parseInstagramShare(_ value: String) -> [String: String]? {
    let pattern = #"https://[^\s<>\"'`]+"#
    let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
    let range = NSRange(value.startIndex..<value.endIndex, in: value)
    let matches = regex?.matches(in: value, range: range) ?? []
    let candidates = matches.compactMap { Range($0.range, in: value).map { String(value[$0]) } }
    for candidate in candidates + [value.trimmingCharacters(in: .whitespacesAndNewlines)] {
      if let parsed = parseInstagramURL(candidate) { return parsed }
    }
    return nil
  }

  private func parseInstagramURL(_ rawValue: String) -> [String: String]? {
    let punctuation = CharacterSet(charactersIn: "),.!?;:]} ")
    let value = rawValue.trimmingCharacters(in: punctuation.union(.whitespacesAndNewlines))
    guard value.utf8.count <= 2048, var components = URLComponents(string: value) else { return nil }
    guard
      components.scheme?.lowercased() == "https",
      ["instagram.com", "www.instagram.com"].contains(components.host?.lowercased() ?? ""),
      components.port == nil,
      components.user == nil,
      components.password == nil
    else { return nil }

    let segments = components.path.split(separator: "/").map(String.init)
    let shortcode = try? NSRegularExpression(pattern: #"^[A-Za-z0-9_-]{5,64}$"#)
    let username = try? NSRegularExpression(pattern: #"^(?!\.)(?!.*\.\.)(?!.*\.$)[A-Za-z0-9._]{1,30}$"#)
    let reserved = Set([
      "about", "accounts", "api", "challenge", "create", "developer", "direct",
      "directory", "download", "emails", "explore", "graphql", "legal", "oauth",
      "p", "press", "privacy", "reel", "reels", "security", "share", "static",
      "stories", "terms", "threads", "tv", "web"
    ])
    var resourceType: String
    var externalId: String
    var canonicalPath: String

    if segments.count == 2 {
      let route = segments[0].lowercased()
      externalId = segments[1]
      let idRange = NSRange(externalId.startIndex..<externalId.endIndex, in: externalId)
      guard shortcode?.firstMatch(in: externalId, range: idRange) != nil else { return nil }
      if route == "p" || route == "tv" {
        resourceType = "post"
        canonicalPath = "\(route)/\(externalId)/"
      } else if route == "reel" || route == "reels" {
        resourceType = "reel"
        canonicalPath = "reel/\(externalId)/"
      } else {
        return nil
      }
    } else if segments.count == 1 {
      externalId = segments[0]
      let idRange = NSRange(externalId.startIndex..<externalId.endIndex, in: externalId)
      guard
        !reserved.contains(externalId.lowercased()),
        username?.firstMatch(in: externalId, range: idRange) != nil
      else { return nil }
      resourceType = "profile"
      canonicalPath = "\(externalId)/"
    } else {
      return nil
    }

    components.query = nil
    components.fragment = nil
    let canonicalURL = "https://www.instagram.com/\(canonicalPath)"
    return [
      "provider": "instagram",
      "canonicalUrl": canonicalURL,
      "displayUrl": canonicalURL,
      "resourceType": resourceType,
      "externalId": externalId
    ]
  }

  private func openHostApp() {
    guard let url = URL(string: "fcnfans://incoming-share") else {
      completeRequest()
      return
    }
    extensionContext?.open(url) { [weak self] opened in
      DispatchQueue.main.async {
        if !opened { self?.openViaResponderChain(url) }
        self?.completeRequest()
      }
    }
  }

  // Share extensions do not consistently receive permission to open their host app.
  // This compatibility fallback must be revalidated on every iOS/App Store release.
  private func openViaResponderChain(_ url: URL) {
    let selector = NSSelectorFromString("openURL:")
    var responder: UIResponder? = self
    while let current = responder {
      if current.responds(to: selector) {
        _ = current.perform(selector, with: url)
        return
      }
      responder = current.next
    }
  }

  private func showInvalidShare() {
    guard let label = view.subviews.compactMap({ $0 as? UILabel }).first else {
      completeRequest()
      return
    }
    label.text = "FCN Fans kan kun modtage gyldige Instagram-links."
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
      self?.completeRequest()
    }
  }

  private func completeRequest() {
    extensionContext?.completeRequest(returningItems: nil)
  }
}
