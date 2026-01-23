# Events Module - Implementation Documentation

## 📋 Oversigt

Dette events-modul giver FCN Fans-appen en komplet løsning til at vise **kampe**, **busture** og **events** i én unified feed.

## 🗂️ Database Schema

### Tabeller oprettet:

1. **`fan_groups`** - Grupper der arrangerer events og busture
2. **`bus_trips`** - Busture (kan linkes til kampe)
3. **`events`** - Frie events (julefrokost, autografskrivning osv.)

### Relations:

- `bus_trips.fixture_id` → `fixtures.id` (valgfri)
- `bus_trips.organizer_group_id` → `fan_groups.id`
- `events.organizer_group_id` → `fan_groups.id`

### RLS Policies:

- **Public read** for alle tre tabeller
- **Authenticated write** for events og bus_trips (TODO: Restrict til organizer medlemmer)

## 📁 Filer Oprettet

### Database

- `supabase/migrations/20260116_create_events_module.sql` - Schema + policies
- `supabase/seed.sql` - Test data (3 fan groups, 2 busture, 3 events)

### API Layer

- `src/services/eventsApi.ts` - Supabase queries + feed merge logic
  - `fetchMatchesUpcoming()` - Hent fixtures
  - `fetchBusTripsUpcoming()` - Hent busture med joins
  - `fetchEventsUpcoming()` - Hent events med joins
  - `fetchFeedUpcoming()` - **Merger alt til én sorteret feed**
  - `fetchBusTripById()`, `fetchEventById()`, `fetchFixtureById()` - Single queries

### UI Components

- `src/components/events/MatchCard.tsx` - Kamp-kort (VS format)
- `src/components/events/BusTripCard.tsx` - Bustur-kort (orange badge)
- `src/components/events/EventCard.tsx` - Event-kort (grøn badge)

### Screens

- `src/screens/EventsScreen.tsx` - **Unified feed** (FlatList med alle tre typer)
- `src/screens/BusTripDetailsScreen.tsx` - Bustur detaljer + booking UI
- `src/screens/EventDetailsScreen.tsx` - Event detaljer + påmindelse/del
- `src/screens/MatchDetailsScreen.tsx` - **Opdateret** til at acceptere fixtureId parameter

### Navigation

- `src/navigation/types.ts` - Tilføjet routes:
  - `BusTripDetails: { busTripId: string }`
  - `EventDetails: { eventId: string }`
  - `MatchDetails: { fixture?: Fixture; fixtureId?: string }`

## 🚀 Sådan bruger du det

### 1. Kør Database Migration

Kør SQL i Supabase SQL Editor:

```sql
-- Kør indholdet af:
-- supabase/migrations/20260116_create_events_module.sql
```

### 2. Seed Test Data (Valgfrit)

Kør seed data:

```sql
-- Kør indholdet af:
-- supabase/seed.sql
```

Dette opretter:

- 3 fan groups: **Wild Tigers**, **Red Zone**, **Farum Fans**
- 2 busture: Silkeborg (27/50 pladser), Brøndby (fuldt booket)
- 3 events: Julefrokost, Autografskrivning, Fan-Quiz

### 3. Test i App

Events-tabben viser nu:

- ✅ **Kampe** fra fixtures-tabellen (synket fra API-FOOTBALL)
- ✅ **Busture** fra bus_trips-tabellen
- ✅ **Events** fra events-tabellen

Sorteret efter dato (stigende).

### 4. Navigation Flow

```
EventsScreen
  ├─ Klik på Kamp → MatchDetailsScreen (eksisterende)
  ├─ Klik på Bustur → BusTripDetailsScreen (ny)
  └─ Klik på Event → EventDetailsScreen (ny)
```

## 🎨 UI Features

### EventsScreen

- Pull-to-refresh
- FlatList performance
- Empty state hvis ingen data
- Badge colors: 🔴 KAMP, 🟠 BUSTUR, 🟢 EVENT

### BusTripDetailsScreen

- Dynamisk data fra Supabase
- Viser "X pladser tilbage" (total_seats - seats_taken)
- Link til Google Maps for mødested
- "Hvad er inkluderet?" liste
- Arrangør info med logo
- **Fuldt booket** banner hvis ingen pladser

### EventDetailsScreen

- Cirkel-ikon i toppen (🎉)
- Påmindelse-knap (TODO: Calendar integration)
- Del-knap (Share API)
- Arrangør info
- Kommentarer placeholder

## 📝 TODO / Næste Skridt

### Backend

- [ ] Implementer **bus_trip_bookings** tabel for booking-system
- [ ] Implementer **event_attendees** tabel for tilmelding
- [ ] Restriktere RLS policies: Kun organizer-medlemmer kan oprette busture
- [ ] Webhook/cron til at slette forældede events (kickoff_at < now() - 7 days)

### Frontend

- [ ] Booking flow for busture (Stripe/payment integration?)
- [ ] RSVP til events
- [ ] Calendar integration (påmindelse)
- [ ] Kommentarer på kampe/busture/events
- [ ] Share functionality med deep links
- [ ] Filter/søg i events (dato, type, organizer)

### Admin

- [ ] Admin panel til at oprette/redigere busture
- [ ] Admin panel til at oprette/redigere events
- [ ] Moderering af kommentarer

## 🐛 Known Issues

- **Type mismatch**: `Fixture` type fra `fixtures.ts` vs `eventsApi.ts` - bruger `as any` cast i MatchDetailsScreen
- **Empty fixture_id**: Busture kan ikke linkes til fixture endnu fordi fixture UUIDs ikke kendes efter seed
  → **Fix**: Efter fixtures er synket fra API-FOOTBALL, opdater seed data med korrekte UUIDs

## 📊 Database Queries Performance

Alle queries bruger indexes:

- `bus_trips.start_at` (ascending index)
- `events.start_at` (ascending index)
- `fixtures.kickoff_at` (existing index)

FlatList bruger `keyExtractor={(item) => \`\${item.kind}-\${item.id}\`}` for optimal performance.

## 🔗 Integration med Eksisterende Features

### Fixtures (API-FOOTBALL Sync)

- Genbruger eksisterende `fixtures` tabel
- EventsScreen henter fra `fixtures` via `eventsApi.fetchMatchesUpcoming()`
- Busture kan linkes til fixtures via `bus_trips.fixture_id`

### Navigation

- Bevar eksisterende navigation struktur
- Tilføjet nye routes uden breaking changes

### Theme

- Genbruger `colors.fcnRed`, `spacing`, `colors.card` osv.
- Konsistent design med resten af appen

---

**Implementeret af:** GitHub Copilot  
**Dato:** 16. januar 2026  
**Status:** ✅ Komplet og klar til test
