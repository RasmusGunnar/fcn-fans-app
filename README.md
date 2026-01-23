# FCN Fans MVP (Expo + Supabase)

Dette repo er et kørende MVP-skelet til:

- By/område-fællesskaber (fx Ganløse)
- Events ("Jeg kommer")
- News sharing med URL preview
- Login (email OTP via Supabase Auth)
- Image/video upload via Supabase Storage
- RBAC (Role-Based Access Control)

## ⚠️ Database Management (Hosted)

**This project uses manual DB management for hosted Supabase.**

```bash
# Helper reminder:
npm run db:hosted
```

**See full guide:** [supabase/SETUP_HOSTED.md](supabase/SETUP_HOSTED.md)

**Do NOT use** `npx supabase db push/pull` without Docker setup.

## 1) Forudsætninger

- Node.js (LTS)
- En Expo-konto (til EAS builds)
- Et Supabase projekt (hosted)

## 2) Kør lokalt

```bash
npm install
npm run start
```

## 3) Supabase opsætning

**⚠️ See detailed setup guide:** [supabase/SETUP_HOSTED.md](supabase/SETUP_HOSTED.md)

### Quick checklist:
1. Run migrations manually in Supabase Dashboard SQL Editor
2. Create storage buckets: `post-media`, `avatars`
3. Configure storage policies in Dashboard
4. Seed first system admin
5. Deploy Edge Functions
6. Update environment variables in `src/lib/supabase.ts`

### Database changes workflow:
- All changes via Dashboard → SQL Editor
- Document in `supabase/CHANGELOG_MANUAL.sql`
- Commit to git

## 4) Firebase opsætning (Legacy - Not Used)

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
