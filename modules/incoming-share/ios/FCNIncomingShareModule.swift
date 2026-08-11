import ExpoModulesCore
import Foundation

public final class FCNIncomingShareModule: Module {
  private let pendingKey = "FCNIncomingSharePendingV1"

  public func definition() -> ModuleDefinition {
    Name("FCNIncomingShare")
    Events("onIncomingShare")

    AsyncFunction("getPendingShare") { () -> String? in
      self.defaults()?.string(forKey: self.pendingKey)
    }

    AsyncFunction("consumePendingShare") { (id: String) -> Bool in
      guard
        let defaults = self.defaults(),
        let payload = defaults.string(forKey: self.pendingKey),
        let data = payload.data(using: .utf8),
        let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        object["id"] as? String == id
      else {
        return false
      }
      defaults.removeObject(forKey: self.pendingKey)
      return true
    }
  }

  private func defaults() -> UserDefaults? {
    guard
      let groupId = Bundle.main.object(forInfoDictionaryKey: "FCNIncomingShareAppGroupId") as? String,
      !groupId.isEmpty
    else {
      return nil
    }
    return UserDefaults(suiteName: groupId)
  }
}
