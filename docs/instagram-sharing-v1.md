# Instagram Sharing V1

FCN Fans accepts Instagram post, reel and profile links from the system share sheet or by pasting a link into a post/message composer. V1 stores and renders a validated link attachment only. It does not scrape Instagram, download remote media, call private APIs or publish without a final user action.

## Architecture

- iOS uses `FCNFansShareExtension`, App Group `group.dk.rasmusgunnar.fcnfans.share` and the `fcnfans://incoming-share` URL scheme. The extension validates and canonicalizes the shared text, stores one short-lived JSON payload in shared `UserDefaults`, then asks iOS to open the host app.
- Android exposes the main activity for `ACTION_SEND` + `text/plain`. The local `FCNIncomingShare` Expo module reads cold-start intents and receives warm `onNewIntent` events.
- JavaScript revalidates every native payload, deduplicates canonical URLs, expires pending shares after 10 minutes and binds a share received during an authenticated session to that account.
- The chooser never posts automatically. It sends the user to either a dedicated feed composer or an explicit conversation picker.
- Feed attachments use the existing `posts.link_preview` JSON column. Messages use the new `messages.external_share` JSON column and `send_message_v2`; the existing `send_message` contract remains unchanged.

## Apple setup

Before a device build, register these identifiers for the same Apple Developer team:

1. Main app ID: `dk.rasmusgunnar.fcnfans` with App Groups enabled.
2. Share extension app ID: `dk.rasmusgunnar.fcnfans.share` with App Groups enabled.
3. App Group: `group.dk.rasmusgunnar.fcnfans.share`, assigned to both app IDs.
4. Regenerate/download provisioning profiles if they are managed outside EAS.

The config plugin declares the EAS app-extension metadata, main/extension entitlements and Xcode extension target. A clean native generation is required for the first native build after adding the plugin. Expo Go cannot receive system shares; use a development or production build.

Opening the containing app from an iOS Share Extension is not consistently granted by iOS. The implementation first uses `NSExtensionContext.open`, then a responder-chain compatibility fallback. Revalidate this behavior on the minimum/current iOS versions and during App Store review for every release.

## Android setup

The config plugin adds one `ACTION_SEND` intent filter for `text/plain` to the existing single-task main activity. Expo Modules delivers warm intents through `OnNewIntent`; the module reads the launch intent for a cold app. No storage/media permission is added.

## Database deployment

Apply `supabase/migrations/20260811120000_add_instagram_sharing_v1.sql` before releasing the app binary. The migration:

- validates exact canonical `https://www.instagram.com/.../` shapes server-side;
- adds the feed check constraint and `messages.external_share`;
- adds external-link message types and `send_message_v2`;
- keeps the released text/image `send_message` RPC;
- returns attachments from inbox/conversation readers;
- retains active-membership, block, rate-limit, idempotency, unread and notification-job behavior.

Run the local pgTAP suite, including `supabase/tests/instagram_sharing_v1.sql`, against a reset local database before deployment.

## Physical smoke test

Test on a real iPhone and Android device with a native development/production build:

1. From Instagram, share a post to FCN Fans; choose feed; add optional text; publish.
2. Repeat for a reel and a profile.
3. Share to an existing direct conversation and a group conversation.
4. Start a new direct/group conversation from the recipient picker and send.
5. Repeat with the app terminated (cold) and already open (warm).
6. Share while logged out, log in within 10 minutes and confirm the chooser resumes without auto-posting.
7. Sign out/account-switch after receiving a share and confirm another account cannot receive the bound payload.
8. Open cards for public and private Instagram content; confirm private content falls back to Instagram access/login.
9. Try lookalike hosts, HTTP links, unsupported story URLs and malformed identifiers; confirm rejection.
10. Retry a failed DM send and confirm only one message/push job set is created.

## Official fan-club workflow

An official club account can use Instagram’s normal Share action and then deliberately choose a feed destination or conversation. V1 grants no privileged import path and never treats an “official” URL differently; the operator remains responsible for audience, caption and final publish/send confirmation.

## V1.1 boundary

Possible future work includes a compliant server-side Instagram API integration for accounts that explicitly authorize it, richer metadata obtained through approved APIs, and a supported iOS host-opening mechanism if Apple/Expo provides one. Auto-import, background polling, scraping, media mirroring and automatic publication are deliberately outside V1.
