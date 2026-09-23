# V1.2C.1 — integrated news formats (mobile)

Isolated branch: `fix/news-engine-hardening`, based on `a1c87ccd45f4e36c8712020f5b9621b0b291bb88`. The draft PR targets the new immutable review anchor `review/news-engine-base` so unrelated earlier work is excluded. Primary dirty checkout unchanged; no main merge or deployment.

The existing NewsCard, CardRoot, ArticlePreview, newsApi and home filters now consume additive `news_items.engine_metadata` for article, social, podcast and video. No new engagement object: likes/comments/replies retain `target_type=news` and the existing row UUID. Existing discovery story aliases remain intact. Source/account/program, original social text, marked machine translation, evidence label and playback action are presented without requiring an external embed. Titles/descriptions remain visible when an image is missing. A withdrawn item keeps its conversation and cannot open the removed source.

Home preserves unchanged list/item references, limits social bursts before other content, and supplements the latest page with up to five recent items per format so a social burst does not hide the newest podcast/video/article. Filters are a bounded current feed, not a complete historical archive. Old schemas without engine_metadata retain their original query path. No changes to app/native configuration, carpool, weekly-fan implementation or social storage.

Validation:

- Full `tsc --noEmit` passed.
- Seven existing home-feed tests passed, including reference preservation and weekly-fan compatibility.
- Real NewsCard, ArticlePreview, CardRoot, HomeFeedFilters and newsApi rendered with React Native Web at 360/390 pixels: four format filters, same SQL-published UUID as web, no horizontal overflow/runtime exceptions.
- Offline Expo iOS and Android exports passed. The export helper temporarily uses an isolated App entry to avoid a node_modules-junction resolution problem and restores package.json in finally. No EAS upload/release.
- Browser fixture adapts OS navigation, menu/icons and comments backend; **physical-device playback and end-to-end native comments remain acceptance items**. Shared comment/reply/like retention was separately tested in the web branch's real local Postgres fixture.

Screenshots: [article](news-engine/screenshots/mobile-article-360.png), [social](news-engine/screenshots/mobile-social-360.png), [podcast](news-engine/screenshots/mobile-podcast-360.png), [video](news-engine/screenshots/mobile-video-360.png).

Reproduce: `npm run test:home-feed-filter`; `node tests/news-engine/build.mjs`; `node tests/news-engine/browser.mjs`; `node tests/news-engine/export.mjs`. `ESBUILD_PATH` and `NEWS_WEB_WORKTREE` can override local tooling/worktree paths. The browser test reads the companion local SQL publication fixture; no hosted credentials or writes.

Distribution requires a **new store build**: the committed configuration has `updates.enabled=false`, runtimeVersion `2`. No OTA activation or runtime change is included.

Deployment: first accept the companion backend migration/functions on staging, then web, then this mobile client on internal physical devices. Existing released clients can keep reading the additive schema. Roll back the client release if necessary without deleting shared news/engagement data. Cron and auto-publication remain false; no mobile control activates them.

Full diagnosis, backend tests, guarded future deployment sequence, rollback and hosted acceptance plan: [companion web report](https://github.com/RasmusGunnar/fcn-fans-web/blob/fix/news-engine-hardening/docs/V1_2C_1_VALIDATION.md).

MOBILE_PRESENTATION = PASS (local browser + native compilation)
SHARED_SOCIAL_IDENTITY = PASS (local DB/client contract)
PRODUCTION_VALIDATION = NOT_RUN
CRON_ENABLED = false
AUTO_PUBLISH_ENABLED = false

Commit-hook limitation: `design:check` reports 28 pre-existing hardcoded-style matches. Running the unchanged script against an archived `a1c87cc` source tree and this branch produced **byte-identical findings and exit 1**; see `news-engine/design-baseline.json`. No new finding was introduced. The existing hook explicitly documents `git commit --no-verify` as its escape hatch; that option was used for this scoped commit instead of changing unrelated screens/components. Typecheck, feed tests, browser checks and native exports were run separately and passed.

## Release validation follow-up

See [device-test handoff](V1_2C_1_DEVICE_TEST.md) for prepared guarded testbuild profiles, missing staging configuration, released-client mapper evidence and installation/checklist instructions. No installable build or physical test is claimed.
