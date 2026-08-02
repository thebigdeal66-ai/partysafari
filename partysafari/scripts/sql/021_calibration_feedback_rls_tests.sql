\set ON_ERROR_STOP 1

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  ELSE
    ALTER ROLE service_role BYPASSRLS;
  END IF;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION public.assert_sqlstate(
  expected_sqlstate text,
  sql_statement text,
  test_name text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE sql_statement;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE = expected_sqlstate THEN
        RETURN;
      END IF;
      RAISE EXCEPTION
        'Test "%" expected SQLSTATE %, got % (%).',
        test_name,
        expected_sqlstate,
        SQLSTATE,
        SQLERRM;
  END;

  RAISE EXCEPTION 'Test "%" expected SQLSTATE %, but statement succeeded.', test_name, expected_sqlstate;
END;
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.venues (
  id uuid PRIMARY KEY
);

INSERT INTO public.profiles (id)
VALUES
  ('02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f'::uuid),
  ('11111111-2222-4333-8444-555555555555'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.venues (id)
VALUES ('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'::uuid)
ON CONFLICT (id) DO NOTHING;

\i /workspace/db/021_calibration_feedback.sql

DO $$
DECLARE
  select_policy_count integer;
BEGIN
  SELECT count(*)
  INTO select_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'calibration_feedback'
    AND cmd = 'SELECT';

  IF select_policy_count <> 0 THEN
    RAISE EXCEPTION
      'Expected zero SELECT policies on calibration_feedback, found %.',
      select_policy_count;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

SET ROLE anon;
SET request.jwt.claim.sub = '02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f';
SELECT public.assert_sqlstate(
  '42501',
  $$INSERT INTO public.calibration_feedback (profile_id, feature, venue_id, accurate)
    VALUES ('02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f'::uuid, 'crowdPulse', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'::uuid, true)$$,
  'anonymous insert denied'
);
SELECT public.assert_sqlstate('42501', $$SELECT * FROM public.calibration_feedback$$, 'anonymous select denied');
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.sub = '02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f';

INSERT INTO public.calibration_feedback (
  profile_id,
  feature,
  venue_id,
  recommendation_category,
  displayed_party_score,
  displayed_psi_label,
  crowd_pulse_level,
  reason_codes,
  accurate,
  note
)
VALUES (
  '02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f'::uuid,
  'crowdPulse',
  'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'::uuid,
  'building',
  52,
  'Momentum building now',
  'building',
  ARRAY['checkins_rising', 'stories_rising'],
  true,
  'Looks right on-site.'
);

SELECT public.assert_sqlstate(
  '42501',
  $$INSERT INTO public.calibration_feedback (profile_id, feature, venue_id, accurate)
    VALUES ('11111111-2222-4333-8444-555555555555'::uuid, 'crowdPulse', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'::uuid, true)$$,
  'cross-profile insert denied'
);

SELECT public.assert_sqlstate('42501', $$SELECT * FROM public.calibration_feedback$$, 'authenticated own-row select denied');
SELECT public.assert_sqlstate('42501', $$UPDATE public.calibration_feedback SET accurate = false$$, 'authenticated update denied');
SELECT public.assert_sqlstate('42501', $$DELETE FROM public.calibration_feedback$$, 'authenticated delete denied');

SELECT public.assert_sqlstate(
  '23514',
  $$INSERT INTO public.calibration_feedback (profile_id, feature, venue_id, recommendation_category, accurate)
    VALUES ('02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f'::uuid, 'crowdPulse', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'::uuid, repeat('x', 65), true)$$,
  'overlong recommendation category rejected'
);

SELECT public.assert_sqlstate(
  '23514',
  $$INSERT INTO public.calibration_feedback (profile_id, feature, venue_id, displayed_psi_label, accurate)
    VALUES ('02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f'::uuid, 'aiDiscoverCards', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'::uuid, repeat('x', 121), true)$$,
  'overlong psi label rejected'
);

SELECT public.assert_sqlstate(
  '23514',
  $$INSERT INTO public.calibration_feedback (profile_id, feature, venue_id, reason_codes, accurate)
    VALUES ('02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f'::uuid, 'crowdPulse', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'::uuid,
      ARRAY['r1','r2','r3','r4','r5','r6','r7','r8','r9','r10','r11'], true)$$,
  'too many reason codes rejected'
);

SELECT public.assert_sqlstate(
  '23514',
  $$INSERT INTO public.calibration_feedback (profile_id, feature, venue_id, reason_codes, accurate)
    VALUES ('02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f'::uuid, 'crowdPulse', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'::uuid,
      ARRAY[repeat('x', 641)], true)$$,
  'excessive serialized reason-code payload rejected'
);

INSERT INTO public.calibration_feedback (
  profile_id,
  feature,
  venue_id,
  recommendation_category,
  displayed_psi_label,
  reason_codes,
  accurate,
  note
)
VALUES (
  '02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f'::uuid,
  'aiDiscoverCards',
  'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'::uuid,
  NULL,
  NULL,
  NULL,
  true,
  NULL
);

RESET ROLE;

SET ROLE service_role;
SELECT count(*) FROM public.calibration_feedback;
RESET ROLE;

DROP FUNCTION public.assert_sqlstate(text, text, text);
