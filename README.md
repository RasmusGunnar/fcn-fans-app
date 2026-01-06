# FCN Fans MVP (Expo + Firebase)

Dette repo er et kørende MVP-skelet til:
- By/område-fællesskaber (fx Ganløse)
- Events (”Jeg kommer”)
- Event-chat (realtime)
- Login (email/password)

## 1) Forudsætninger
- Node.js (LTS)
- En Expo-konto (til EAS builds)
- En Firebase-projekt (Auth + Firestore)

## 2) Kør lokalt
```bash
npm install
npm run start
```

## 3) Firebase opsætning
1. Opret et Firebase projekt
2. Slå **Authentication → Email/Password** til
3. Opret **Cloud Firestore** (Production mode anbefales)

Kopiér din Firebase config ind i `src/firebase.ts` (se TODO'er).

## 4) Firestore regler (MVP)
Se `firestore.rules` (og tilpas inden produktion).

## 5) Byg til App Store (iOS) med EAS
Installér EAS CLI:
```bash
npm i -g eas-cli
eas login
```

Konfigurér credentials (kører prompts):
```bash
eas build:configure
```

Lav en dev build til test på iPhone:
```bash
eas build --platform ios --profile development
```

Lav en production build:
```bash
eas build --platform ios --profile production
```

Upload/submit til App Store Connect:
```bash
eas submit --platform ios --profile production
```

> Du skal oprette en **App Store Connect API Key** og udfylde `eas.json` under `submit.production.ios`.
