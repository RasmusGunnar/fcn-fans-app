package dk.fcnfans.incomingshare

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import org.json.JSONObject

class FCNIncomingShareModule : Module() {
  private var pendingPayload: String? = null

  override fun definition() = ModuleDefinition {
    Name("FCNIncomingShare")
    Events("onIncomingShare")

    AsyncFunction("getPendingShare") {
      if (pendingPayload == null) {
        pendingPayload = payloadFromIntent(appContext.currentActivity?.intent)
      }
      pendingPayload
    }

    AsyncFunction("consumePendingShare") { id: String ->
      val payload = pendingPayload ?: payloadFromIntent(appContext.currentActivity?.intent)
      val matches = payloadId(payload) == id
      if (matches) {
        pendingPayload = null
        appContext.currentActivity?.intent?.let(::clearShareIntent)
      }
      matches
    }

    OnNewIntent { intent ->
      val payload = payloadFromIntent(intent) ?: return@OnNewIntent
      pendingPayload = payload
      sendEvent("onIncomingShare", mapOf("payload" to payload))
    }
  }

  private fun payloadFromIntent(intent: Intent?): String? {
    if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") return null
    val text = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getStringExtra(Intent.EXTRA_TEXT)
    } else {
      @Suppress("DEPRECATION")
      intent.getStringExtra(Intent.EXTRA_TEXT)
    }?.trim()?.take(4096)
    if (text.isNullOrEmpty()) return null

    return JSONObject()
      .put("id", UUID.randomUUID().toString())
      .put("rawText", text)
      .put("receivedAt", isoTimestamp())
      .put("source", "android_share_intent")
      .toString()
  }

  private fun payloadId(payload: String?): String? = try {
    payload?.let { JSONObject(it).optString("id").ifBlank { null } }
  } catch (_: Exception) {
    null
  }

  private fun clearShareIntent(intent: Intent) {
    intent.removeExtra(Intent.EXTRA_TEXT)
    intent.action = null
    intent.type = null
  }

  private fun isoTimestamp(): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    formatter.timeZone = TimeZone.getTimeZone("UTC")
    return formatter.format(Date())
  }
}
