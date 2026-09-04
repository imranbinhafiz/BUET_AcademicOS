-- AcademicOS course-review integration migration 005
--
-- The review UI supports decimal ratings, attachment downloads and displayed
-- review dates. This forward migration adds those fields to the existing
-- singular coursereview table without renaming the table or losing data.

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'buet_academicos' THEN
        RAISE EXCEPTION 'Migration 005 must run on buet_academicos, not %', current_database();
    END IF;

    IF to_regclass('public.coursereview') IS NULL
       OR to_regclass('public.offering') IS NULL
       OR to_regclass('public.teachers') IS NULL
       OR to_regclass('public.reports') IS NULL THEN
        RAISE EXCEPTION 'Migration 005 requires the existing course-review schema';
    END IF;
END;
$$;

-- Optional server-owned file path. A nullable value keeps text-only reviews
-- valid and never exposes a browser-provided path directly.
ALTER TABLE public.coursereview
    ADD COLUMN IF NOT EXISTS file_path text;

ALTER TABLE public.coursereview
    ADD COLUMN IF NOT EXISTS created_at timestamp without time zone;

UPDATE public.coursereview
SET created_at = CURRENT_TIMESTAMP
WHERE created_at IS NULL;

ALTER TABLE public.coursereview
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN created_at SET NOT NULL;

-- The review page intentionally accepts ratings such as 3.5. Converting
-- integer values to NUMERIC is lossless for existing rows.
ALTER TABLE public.coursereview
    ALTER COLUMN difficulty TYPE numeric(2,1) USING difficulty::numeric(2,1),
    ALTER COLUMN prereq_use TYPE numeric(2,1) USING prereq_use::numeric(2,1);

CREATE INDEX IF NOT EXISTS idx_coursereview_created_at
    ON public.coursereview(created_at DESC);

COMMIT;
