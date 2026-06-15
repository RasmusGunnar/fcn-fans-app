-- =====================================================
-- Seed Data for Events Module (Test Data)
-- =====================================================

-- Insert fan groups
INSERT INTO public.fan_groups (id, name, description, logo_url) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Wild Tigers', 'De mest dedikerede FCN-fans. Vi organiserer busture og tifo.', 'https://via.placeholder.com/100/ff0000/ffffff?text=WT'),
  ('22222222-2222-2222-2222-222222222222', 'Red Zone', 'Aktive fans fra Farum og omegn.', 'https://via.placeholder.com/100/cc0000/ffffff?text=RZ'),
  ('33333333-3333-3333-3333-333333333333', 'Farum Fans', 'Lokalt fællesskab for FCN-supportere.', 'https://via.placeholder.com/100/990000/ffffff?text=FF')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Development media_article posts
-- Uses the first existing auth user so no test identity is hard-coded.
-- =====================================================

DO $$
DECLARE
  seed_author_id uuid;
BEGIN
  SELECT id
  INTO seed_author_id
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1;

  IF seed_author_id IS NULL THEN
    RAISE NOTICE 'Skipping media_article seeds because auth.users is empty.';
    RETURN;
  END IF;

  INSERT INTO public.posts (
    id,
    author_id,
    text,
    created_at,
    post_type,
    link_preview
  )
  VALUES
    (
      'a1000000-0000-4000-8000-000000000001',
      seed_author_id,
      'Akademiet fortsætter med at sætte retningen for fremtidens FCN-hold.',
      now() - interval '20 minutes',
      'media_article',
      jsonb_build_object(
        'url', 'https://fcn.dk/nyheder/',
        'title', 'Nyt fra FC Nordsjælland',
        'description', 'Seneste historier og opdateringer fra klubben.',
        'siteName', 'FC Nordsjælland'
      )
    ),
    (
      'a1000000-0000-4000-8000-000000000002',
      seed_author_id,
      'Et kig på udviklingen i truppen frem mod næste kamp.',
      now() - interval '2 hours',
      'media_article',
      jsonb_build_object(
        'url', 'https://superliga.dk/',
        'title', 'Superligaen tæt på',
        'description', 'Nyheder, kampe og perspektiver fra 3F Superliga.',
        'siteName', '3F Superliga'
      )
    ),
    (
      'a1000000-0000-4000-8000-000000000003',
      seed_author_id,
      'Right to Dream-miljøet får international opmærksomhed.',
      now() - interval '1 day',
      'media_article',
      jsonb_build_object(
        'url', 'https://www.righttodream.com/',
        'title', 'Talentudvikling med et større formål',
        'description', 'Læs mere om filosofien og arbejdet bag Right to Dream.',
        'siteName', 'Right to Dream'
      )
    )
  ON CONFLICT (id) DO UPDATE
  SET
    author_id = excluded.author_id,
    text = excluded.text,
    created_at = excluded.created_at,
    post_type = excluded.post_type,
    link_preview = excluded.link_preview;
END $$;

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

-- Insert events (free-form). Events require a creator after the organizer migration.
DO $$
DECLARE
  seed_creator_id uuid;
BEGIN
  SELECT id
  INTO seed_creator_id
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1;

  IF seed_creator_id IS NULL THEN
    RAISE NOTICE 'Skipping event seeds because auth.users is empty.';
    RETURN;
  END IF;

  INSERT INTO public.events (
    id,
    title,
    description,
    start_at,
    end_at,
    location_name,
    location_address,
    organizer_group_id,
    created_by,
    creator_user_id,
    organizer_type,
    organizer_id
  )
  VALUES
    (
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'FCN Julefrokost 2026',
      'Årlig julefrokost for alle FCN-fans. Mad, drikke og hygge i fællesskab. Tilmelding påkrævet.',
      '2026-12-14 18:00:00+01',
      '2026-12-14 23:00:00+01',
      'Farum Kulturhus',
      'Farum Bytorv 1, 3520 Farum',
      '33333333-3333-3333-3333-333333333333',
      seed_creator_id,
      seed_creator_id,
      'community',
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
      '22222222-2222-2222-2222-222222222222',
      seed_creator_id,
      seed_creator_id,
      'community',
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
      '33333333-3333-3333-3333-333333333333',
      seed_creator_id,
      seed_creator_id,
      'community',
      '33333333-3333-3333-3333-333333333333'
    )
  ON CONFLICT (id) DO NOTHING;
END $$;
