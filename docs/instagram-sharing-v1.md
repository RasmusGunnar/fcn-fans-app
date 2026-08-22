# Instagram Sharing V1

FCN Fans accepts Instagram post, reel and profile links from the system share sheet or by pasting a link into a post/message composer. The source-of-truth remains a validated link attachment. For supported public content, the app can render Meta's official tokenless Instagram oEmbed; private, deleted, unsupported or temporarily unavailable content keeps the safe link-card fallback. The implementation does not scrape Instagram, download or rehost remote media, call private APIs, request an Instagram login or publish without a final user action.

## Architecture

- iOS uses `FCNFansShareExtension`, App Group `group.dk.rasmusgunnar.fcnfans.share` and the `fcnfans://incoming-share` URL scheme. The extension validates and canonicalizes the shared text, stores one short-lived JSON payload in shared `UserDefaults`, then asks iOS to open the host app.
- Android exposes the main activity for `ACTION_SEND` + `text/plain`. The local `FCNIncomingShare` Expo module reads cold-start intents and receives warm `onNewIntent` events.
- JavaScript revalidates every native payload, deduplicates canonical URLs, expires pending shares after 10 minutes and binds a share received during an authenticated session to that account.
- The chooser never posts automatically. It sends the user to either a dedicated feed composer or an explicit conversation picker.
- Feed attachments use the existing `posts.link_preview` JSON column. Messages use the new `messages.external_share` JSON column and `send_message_v2`; the existing `send_message` contract remains unchanged.
- An authenticated `instagram_oembed` Edge Function validates the canonical URL and calls only Meta's fixed, tokenless `https://graph.facebook.com/v25.0/instagram_oembed` endpoint. It is not a generic proxy and does not follow redirects.
- The Edge Function removes scripts from Meta's returned HTML and stores the controlled result in the server-only `instagram_embed_cache`. Successful results expire after 12 hours; unavailable results expire after 10 minutes.
- The React Native client revalidates the response and renders it in an isolated `react-native-webview` shell. The shell loads only the official `https://www.instagram.com/embed.js`, applies a restrictive CSP, disables shared cookies/file access, blocks main-frame/new-window/custom-scheme navigation without external side effects and accepts only a finite, clamped height message. Instagram opens only from FCN Fans' explicit `Åbn på Instagram` CTA.
- Home mounts rich WebViews only for at most two sufficiently visible Instagram posts. Direct-message rows and composers use compact metadata/thumbnail previews and open one shared rich modal on demand.

## Official Meta integration

The implementation follows the current `facebook/meta-embeds-for-wordpress` provider model: the fixed Instagram oEmbed endpoint is registered without an access token, returned script tags are removed, and the official Instagram embed script is loaded separately. Do not add an access token, user Instagram session, undocumented endpoint, scraper or media mirroring without a new compliance review.

The rich path supports the shapes currently covered by the official provider: `/p/{shortcode}/`, `/reel/{shortcode}/` and profile URLs. Legacy `/tv/` links remain valid V1 link attachments but deliberately use the safe card because that route is not in the current official provider matcher.

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

Apply both migrations, in order, before releasing the app binary:

1. `supabase/migrations/20260811120000_add_instagram_sharing_v1.sql`
2. `supabase/migrations/20260811121000_add_instagram_embed_cache.sql`

The first migration:

- validates exact canonical `https://www.instagram.com/.../` shapes server-side;
- adds the feed check constraint and `messages.external_share`;
- adds external-link message types and `send_message_v2`;
- keeps the released text/image `send_message` RPC;
- returns attachments from inbox/conversation readers;
- retains active-membership, block, rate-limit, idempotency, unread and notification-job behavior.

The second migration creates only the separate server cache. RLS is enabled, `anon` and `authenticated` have no direct table privileges, and only `service_role` can read/write it from the Edge Function. It does not alter post or message attachment contracts.

Run the local pgTAP suite, including `supabase/tests/instagram_sharing_v1.sql` and `supabase/tests/instagram_embed_cache.sql`, against a reset local database before deployment.

## Physical smoke test

Test on a real iPhone and Android device with a native development/production build:

1. From Instagram, share a post to FCN Fans; choose feed; add optional text; publish.
2. Repeat for a reel and a profile.
3. Share to an existing direct conversation and a group conversation.
4. Start a new direct/group conversation from the recipient picker and send.
5. Repeat with the app terminated (cold) and already open (warm).
6. Share while logged out, log in within 10 minutes and confirm the chooser resumes without auto-posting.
7. Sign out/account-switch after receiving a share and confirm another account cannot receive the bound payload.
8. Confirm a public post, reel and profile render through the official rich embed in Home and the shared DM modal.
9. Confirm Home never mounts more than two Instagram WebViews and DM message rows never mount a WebView.
10. Open private/deleted/unavailable content and confirm the safe card explains the fallback and only its explicit CTA can open Instagram.
11. Disable connectivity or simulate a Meta timeout; confirm publishing/sending remains possible and the fallback appears.
12. Try lookalike hosts, HTTP links, unsupported story/TV URLs and malformed identifiers; confirm rich lookup rejection without any arbitrary fetch.
13. Retry a failed DM send and confirm only one message/push job set is created.

## Official fan-club workflow

An official club account can use Instagram’s normal Share action and then deliberately choose a feed destination or conversation. V1 grants no privileged import path and never treats an “official” URL differently; the operator remains responsible for audience, caption and final publish/send confirmation.

## Future boundary

Possible future work includes a supported iOS host-opening mechanism if Apple/Expo provides one and product-specific consent controls for third-party embeds. Access-token integrations, auto-import, background polling, scraping, media mirroring and automatic publication remain deliberately outside V1.
