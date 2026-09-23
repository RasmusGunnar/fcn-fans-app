# V1.2C.1 — internal device-test handoff

Date: 2026-09-23. Starting commit dab1534, PR #21. **No signed test build created, no TestFlight submission, no public release, no physical test performed.** Offline iOS/Android bundles both compile; these are not installable apps.

Existing EAS login succeeds. Latest completed store builds inspected: iOS 0.1.12 (76), Android 0.1.12 (3), source 005c5d43a1bf71e1fbd2bc82ce89bafd73cae48f. Apple public lookup confirms released version 0.1.12, 2026-09-16. Exact currently distributed store-build linkage, especially Android, still requires console/device confirmation.

The existing preview environment points to the known production backend benmedekvstxetcomngr.supabase.co. It cannot be used for the requested staging tests. No production backend call/build submission was used as a substitute.

## Prepared build profiles

- news-engine-ios: existing production signing identity/TestFlight route and increasing remote version, but preview environment and news-engine-test channel. Existing App Store Connect app ID 6758399593 is retained. No auto-submit or public-release action.
- news-engine-android: existing preview/internal route, APK output, increasing remote version and news-engine-test channel. No Play production submission.
- Both set FCN_NEWS_ENGINE_TEST=1; app.config.js refuses missing staging config, a non-HTTPS URL, a hostname different from FCN_NEWS_ENGINE_STAGING_HOST, or the known production host. The name becomes FCN Fans Test. Existing bundle IDs, runtimeVersion 2 and updates.enabled=false stay unchanged; normal build profiles retain normal behavior.

**Required before building:** establish a real separate backend and authenticated test users; securely configure its EXPO_PUBLIC_SUPABASE_URL and publishable/anon key in preview, plus FCN_NEWS_ENGINE_STAGING_HOST containing exactly that host. Only public client keys belong in EXPO_PUBLIC variables. Puls/AI keys stay on the test backend. Preview is shared project configuration: coordinate its reassignment with other preview users. No environment values were changed during this task.

From this isolated mobile worktree, with those settings available to local config evaluation and EAS, run:

~~~powershell
node --test tests/news-engine/build-config.cjs
node node_modules/typescript/bin/tsc --noEmit
eas.cmd build --platform ios --profile news-engine-ios --non-interactive --no-wait
eas.cmd build --platform android --profile news-engine-android --non-interactive --no-wait
~~~

Wait for both builds to finish and verify their source SHA, environment and increasing build number. If signing/provisioning is unavailable, retain the precise EAS error as a blocker; don't switch to production configuration. Submit only the verified iOS test build to the existing TestFlight app:

~~~powershell
eas.cmd submit --platform ios --profile production --id <verified-ios-build-id> --non-interactive
~~~

Here production is the existing **submission profile name** containing the App Store Connect app ID, not the backend environment. EAS Submit uploads to App Store Connect/TestFlight; do not select App Store review/public release. Assign only the existing internal test group. Build/submission credentials have not been exercised this session.

## Installation (after artifacts exist)

**iPhone:** open TestFlight with the existing invited Apple account, choose FCN Fan Fællesskab, verify the supplied new build number and install. This uses the same bundle ID and replaces the installed app; sign in with the staging test account. There is currently no new build number or install link to provide.

**Android:** open the successful news-engine-android EAS build page on the device, download its APK and install through the existing internal-distribution route. Verify the new version code, then sign in to staging. Same package/signing identity is retained; don't uninstall the released app to work around a signature error. No new APK link exists yet.

Confirm the backend endpoint from the verified build configuration before creating any test engagement. Retain a separate device with the currently released app where possible for backward-compatibility checks. A production-connected released binary cannot be used to write staging test data without a separately configured test build of that source.

## Short physical checklist — every item currently NOT_RUN

1. Record device/OS, app build, source SHA, test-backend host and tester. Log in as an ordinary test user; admin controls must remain unavailable.
2. View one current approved article/social post/podcast/video. Check source/account/program, original text, marked translation, AI provenance and missing-image fallback; use all four filters and return to the mixed home feed.
3. Open original article/social, play the actual podcast and video, return to the app and check focus/back navigation. No invented duration or playback success.
4. Like on mobile; verify the same news UUID and count on staging web. Add a comment and reply across both clients; refresh/relaunch and verify a single conversation.
5. As staging admin, replay the scan, accept a provider update, and test controlled withdrawal. No duplicate public UUID, no reopened manual rejection and no lost engagement. Check the reversed cluster-approval order.
6. Verify zero automatic publications and both automation flags false. Test old source/client compatibility against the same additive test schema; don't run these mutations on production.

Results must record actual observations and errors. Simulator, browser and export success do not satisfy this checklist.

## Checks actually completed

- Mobile full-source TypeScript PASS; seven feed tests PASS; build guard PASS.
- Actual NewsCard/newsApi/filter React Native Web tests PASS, canonical UUID matches the local SQL row. Auth, OS navigation and comments transport remain fixture boundaries.
- Both offline native exports exit 0 after the configuration change; package.json restored.
- The unchanged mapper from 005c5d43 reads four additive formats and preserves IDs/URLs/summary; see release-client.json. This confirms source contract compatibility, not the installed binary.
- The previous ignored design-baseline archive contaminated the first typecheck. It was moved to temp; source typecheck then passed. The previous 28 design-check findings remain a documented baseline limitation.

Release blockers and the concrete migration/backend/web/mobile/rollback plan are in the companion web report: https://github.com/RasmusGunnar/fcn-fans-web/blob/fix/news-engine-hardening/docs/V1_2C_1_RELEASE_VALIDATION.md

Official distribution references: https://docs.expo.dev/build/internal-distribution/ and https://docs.expo.dev/submit/ios/

TEST_BUILDS_STATUS=PREPARED_NOT_CREATED
PHYSICAL_DEVICE_STATUS=NOT_RUN
RELEASED_APP_COMPATIBILITY=PASS_CONTRACT_LEVEL / INSTALLED_BINARY_NOT_VERIFIED
CRON_ENABLED=false
AUTO_PUBLISH_ENABLED=false
