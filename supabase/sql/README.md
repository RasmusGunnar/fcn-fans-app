# Supabase SQL Scripts

Denne mappe indeholder SQL-filer til manual eksekvering i Supabase Dashboard.

## 📁 Struktur

- `YYYY-MM-DD_feature_name.sql` - Individuelle SQL scripts
- Hver fil er selvstændig og idempotent (kan køres flere gange)

## 🚀 Sådan Kører Du SQL Manuelt

### Trin 1: Åbn SQL-filen

Find den relevante SQL-fil (fx `2026-01-25_communities_rbac_avatars.sql`)

### Trin 2: Kopier indhold

Åbn filen og kopier alt SQL-indhold

### Trin 3: Kør i Supabase Dashboard

1. Log ind på [Supabase Dashboard](https://supabase.com/dashboard)
2. Vælg dit projekt
3. Gå til **SQL Editor** i sidebaren
4. Opret ny query
5. Paste SQL-indholdet
6. Læs kommentarer nøje (især OPTION A/B valg)
7. Klik **Run** for at eksekvere

### Trin 4: Verificer & Opdater Changelog

1. Kør verification queries i bunden af SQL-filen
2. Tjek at alle ændringer er korrekte
3. Opdater `../CHANGELOG_MANUAL.sql`:
   - Ændr status fra `⚠️ TO RUN` til `✅ EXECUTED`
4. Commit ændringer til git

## ⚠️ Vigtige Regler

- **ALDRIG** kør `npx supabase db push` på hosted instances
- Alle SQL-filer er **additive** - de ødelægger ikke eksisterende data
- Læs altid kommentarer før eksekvering
- Kør verification queries efter hver eksekvering
- Hold CHANGELOG_MANUAL.sql opdateret

## 📝 Eksempel Workflow

```bash
# 1. Åbn SQL-fil
code supabase/sql/2026-01-25_communities_rbac_avatars.sql

# 2. Copy/paste til Supabase Dashboard SQL Editor

# 3. Kør SQL (vælg korrekt OPTION hvis der er flere)

# 4. Opdater changelog
code supabase/CHANGELOG_MANUAL.sql
# Ændr status til ✅ EXECUTED

# 5. Commit
git add supabase/
git commit -m "chore: executed communities RBAC + avatars migration"
```

## 🔍 Troubleshooting

**Fejl: "must be owner of table"**

- Du mangler rettigheder i Supabase
- Brug service role credentials eller kontakt admin

**Fejl: "constraint already exists"**

- SQL er idempotent, men du forsøger at tilføje noget der findes
- Check eksisterende constraints med introspection queries

**Fejl: "policy already exists"**

- Normalt OK - `DROP POLICY IF EXISTS` skulle håndtere det
- Hvis ikke: kør `DROP POLICY` manuelt først

## 📚 Relaterede Filer

- `../CHANGELOG_MANUAL.sql` - Master changelog med alle ændringer
- `../migrations_legacy/` - Gamle Supabase migrations (reference only)
- `../../docs/RBAC_SETUP.md` - Dokumentation om RBAC system
