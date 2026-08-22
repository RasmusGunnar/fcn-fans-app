# FCN Fans Demo Mode

Demo Mode er en lokal, deterministisk optagetilstand med en indbygget demo-session. Den bruger ikke produktionsdata til de understøttede flows.

## Start Demo Mode

```powershell
npm run start:demo
```

Android dev-build med separat demo-identitet:

```powershell
npm run android:demo
```

En intern EAS-demo-build kan bygges med:

```powershell
eas build --profile demo --platform android
```

EAS-profilen sætter `EXPO_PUBLIC_APP_MODE=demo`. Den dynamiske Expo-config bruger navnet `FCN Fans Demo`, scheme `fcnfans-demo`, iOS bundle-id `dk.rasmusgunnar.fcnfans.demo` og Android package `dk.fanbase.fcnfans.demo`. Et eksisterende lokalt Android-projekt skal regenereres fra den aktuelle Expo-config, før `android`-kommandoerne bruges efter et package-skift.

## Start normal Production Mode

Standardkommandoen er fortsat uændret:

```powershell
npm start
```

Den eksplicitte variant er:

```powershell
npm run start:production
```

Alt andet end den præcise værdi `EXPO_PUBLIC_APP_MODE=demo` vælger production data layer.

## Sikkerhedsmodel

- `src/config/appMode.ts` er den eneste runtime-definition af mode.
- Den lokale mode-runner slår dotenv-loading fra i Demo Mode og sætter kun sikre Supabase-placeholder-værdier. `app.config.js` og EAS-demo-profilen gentager placeholder-isolationen som failsafe, så production-værdier ikke indlejres i Demo-bundlen.
- I Demo Mode opretter `src/lib/supabase.ts` klienten med en ugyldig lokal demo-URL og demo-nøgle; produktions-URL og anon key gives ikke til runtime-klienten.
- Den eksporterede klient er desuden pakket ind af `src/lib/supabaseSafety.ts`.
- `insert`, `upsert`, `update`, `delete`, alle RPC-kald, function invokes, auth-mutationer, storage-writes og realtime-sends kaster fejlen `BLOCKED: Production write attempted while FCN Fans is running in Demo Mode`.
- Realtime-kanaler er inerte i Demo Mode.
- Like, kommentarer, replies, poll-stemmer, RSVP og check-in opdaterer kun et in-memory session-store. De nulstilles ved genstart.
- Push-sync og produktions-realtime providers startes ikke i Demo Mode.

Den nuværende Demo Mode kan derfor ikke skrive til Supabase gennem appens eksporterede klient eller de implementerede flows. En fremtidig udvikler vil kun kunne omgå barrieren ved bevidst at oprette en ny uafhængig klient eller sende direkte HTTP-kald; det findes ikke i den nuværende demoimplementering.

## Demoindhold

Indholdet ligger opdelt i `src/demo/`:

- `users.ts`: 20 fiktive profiler og demo-sessionen.
- `communities.ts`: communities, medlemstal, medlemskaber og medlemmer.
- `posts.ts`: 20 opslag, tre polls, kommentarer/replies og engagementstal.
- `matches.ts`: kommende kampe, event, bustur og fanaktiviteter.
- `discussions.ts`: seks debat-emner med varierede indlæg.
- `feed.ts`: sammensat Home-feed og feed-maps.
- `interactions.ts`: lokale session-mutationer.
- `media.ts` og `mediaAssets.ts`: logiske demo-filnavne og lokale placeholders.

IDs er faste. Tider beregnes relativt én gang ved appstart, så labels som “12 minutter siden” og sorteringen er stabile gennem hele optagelsessessionen.

## Udskift demo-medier

Følgende endelige assets mangler stadig og bruger indtil videre eksisterende, lokale FCN Fans-placeholders:

- `demo-warmup-01.jpg`
- `demo-away-trip-01.jpg`
- `demo-rorvig-goal-01.jpg`
- `demo-stand-01.jpg`
- `demo-after-match-01.jpg`

Den centrale mapping findes i `src/demo/mediaAssets.ts`. Når de endelige, rettighedscleare filer tilføjes under `assets/demo/`, ændres kun de fem `require(...)`-targets i den fil. Ingen postdata eller skærmkomponenter skal ændres.

## Klar video-navigation

- Forside med 20 varierede feed-opslag, event, bustur, kamp og fanaktivitet.
- Communities-listen med Ganløse Fans, Farum Fans, Udebaneture, Tifo & Stemning og to neutrale demo-fraktioner.
- Ganløse Fans med samkørsel og lokale kommentarer.
- Udebaneture med tog-, bil-, warm-up-, banner- og hjemtransportkoordinering.
- Kommende kamp med kampinfo, lokale deltagelsestal, fanaktiviteter og kampsnak.
- Lokale billed-/video-previewkort for warm-up, udebane, tribune, Rørvig og efter kampen.
- Seks debat-emner.
- Tre polls med realistiske stemmetal.

## Test

```powershell
npm run test:demo-mode
```

Testen dækker modevalg, demo-data, mutationsadapter, lokal like-state og den globale Supabase-failsafe.
