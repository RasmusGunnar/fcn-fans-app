-- =====================================================
-- Seed Data for Events Module (Test Data)
-- =====================================================

-- Insert fan groups
INSERT INTO public.fan_groups (id, name, description, logo_url) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Wild Tigers', 'De mest dedikerede FCN-fans. Vi organiserer busture og tifo.', 'https://via.placeholder.com/100/ff0000/ffffff?text=WT'),
  ('22222222-2222-2222-2222-222222222222', 'Red Zone', 'Aktive fans fra Farum og omegn.', 'https://via.placeholder.com/100/cc0000/ffffff?text=RZ'),
  ('33333333-3333-3333-3333-333333333333', 'Farum Fans', 'Lokalt fællesskab for FCN-supportere.', 'https://via.placeholder.com/100/990000/ffffff?text=FF')
ON CONFLICT (id) DO NOTHING;

-- Insert bus trips (some linked to fixtures, some standalone)
-- Note: Replace fixture_id with actual UUIDs from your fixtures table after sync
INSERT INTO public.bus_trips (id, title, description, start_at, expected_return_at, departure_place, departure_address, price_dkk, total_seats, seats_taken, includes, organizer_group_id, fixture_id) VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Bustur til Silkeborg',
    'Fælles bustur til udekampen mod Silkeborg IF. Stemning, sang og fællesskab hele vejen!',
    '2026-02-15 13:00:00+01',
    '2026-02-15 23:30:00+01',
    'Farum Station',
    'P-plads ved busstoppestedet, Farum',
    250,
    50,
    27,
    ARRAY[
      'Transport til og fra kampen',
      'Vand og sodavand på bussen',
      'Pausestop på vej hjem',
      'Gode stemning med andre fans'
    ],
    '11111111-1111-1111-1111-111111111111',
    NULL  -- Set this to actual fixture UUID if you have one
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Bustur til Brøndby',
    'Udekamp mod Brøndby - Byens derby! Alle pladser booket hurtigt.',
    '2026-03-10 16:30:00+01',
    '2026-03-10 23:00:00+01',
    'Farum Bytorv',
    'Ved Netto indgangen',
    300,
    45,
    45,
    ARRAY[
      'Transport til og fra Brøndby Stadion',
      'Drikkevarer på bussen',
      'Organiseret tifo',
      'Sikker hjemtransport'
    ],
    '11111111-1111-1111-1111-111111111111',
    NULL
  )
ON CONFLICT (id) DO NOTHING;

-- Insert events (free-form)
INSERT INTO public.events (id, title, description, start_at, end_at, location_name, location_address, organizer_group_id) VALUES
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'FCN Julefrokost 2026',
    'Årlig julefrokost for alle FCN-fans. Mad, drikke og hygge i fællesskab. Tilmelding påkrævet.',
    '2026-12-14 18:00:00+01',
    '2026-12-14 23:00:00+01',
    'Farum Kulturhus',
    'Farum Bytorv 1, 3520 Farum',
    '33333333-3333-3333-3333-333333333333'
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'Autografskrivning med FCN U19',
    'Mød U19-spillerne og få autografer. Gratis arrangement for hele familien.',
    '2026-02-20 15:00:00+01',
    '2026-02-20 17:00:00+01',
    'Right to Dream Park',
    'Right to Dream Park, Farum',
    '22222222-2222-2222-2222-222222222222'
  ),
  (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'Fan-Quiz: Test din FCN-viden',
    'Sjov quiz-aften hvor vi tester din viden om FCN historie, spillere og kampe. Præmier til vinderen!',
    '2026-01-25 19:00:00+01',
    '2026-01-25 22:00:00+01',
    'Farum Bryghus',
    'Frederiksborgvej 1, Farum',
    '33333333-3333-3333-3333-333333333333'
  )
ON CONFLICT (id) DO NOTHING;
