-- Fix company_id type mismatches against public.company(company_id = character varying)
-- Root issue seen in app:
--   invalid input syntax for type uuid: "CPY-2026-001-003"
--
-- This migration aligns affected tables to use character varying company_id.

BEGIN;

-- 1) profile_change_requests.company_id: uuid -> varchar
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profile_change_requests'
      AND column_name = 'company_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.profile_change_requests
      ALTER COLUMN company_id TYPE character varying
      USING company_id::text;
  END IF;
END $$;

-- Recreate FK to company(company_id) with aligned type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'profile_change_requests'
      AND constraint_name = 'profile_change_requests_company_id_fkey'
  ) THEN
    ALTER TABLE public.profile_change_requests
      DROP CONSTRAINT profile_change_requests_company_id_fkey;
  END IF;

  ALTER TABLE public.profile_change_requests
    ADD CONSTRAINT profile_change_requests_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.company(company_id);
END $$;

-- 2) user_notifications.company_id: uuid -> varchar
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_notifications'
      AND column_name = 'company_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.user_notifications
      ALTER COLUMN company_id TYPE character varying
      USING company_id::text;
  END IF;
END $$;

-- Recreate FK to company(company_id) with aligned type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'user_notifications'
      AND constraint_name = 'user_notifications_company_id_fkey'
  ) THEN
    ALTER TABLE public.user_notifications
      DROP CONSTRAINT user_notifications_company_id_fkey;
  END IF;

  ALTER TABLE public.user_notifications
    ADD CONSTRAINT user_notifications_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.company(company_id);
END $$;

COMMIT;
