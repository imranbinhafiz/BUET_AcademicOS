-- AcademicOS schema update migration
-- Run this file once while connected to the buet_academicos database.
-- This migration preserves existing tables and rows.

BEGIN;

-- New users columns
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS bio text;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS avatar_path text;

-- New course-review relationship
ALTER TABLE public.coursereview
    ADD COLUMN IF NOT EXISTS offering_id integer;

-- Resources created by the old schema did not have a file path.
-- Existing rows receive an empty value so the new NOT NULL rule can be applied.
ALTER TABLE public.resources
    ADD COLUMN IF NOT EXISTS file_path text;

UPDATE public.resources
SET file_path = ''
WHERE file_path IS NULL;

ALTER TABLE public.resources
    ALTER COLUMN file_path SET NOT NULL;

-- New tables
CREATE TABLE IF NOT EXISTS public.notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id integer NOT NULL,
    type character varying(50) NOT NULL,
    message text NOT NULL,
    related_id integer,
    is_read boolean NOT NULL DEFAULT FALSE,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.reports (
    report_id SERIAL PRIMARY KEY,
    reporter_user_id integer NOT NULL,
    target_type character varying(20) NOT NULL,
    target_id integer NOT NULL,
    reason text NOT NULL,
    status character varying(20) NOT NULL DEFAULT 'pending',
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT reports_target_type_check
        CHECK (target_type IN ('resource', 'coursereview')),
    CONSTRAINT reports_status_check
        CHECK (status IN ('pending', 'reviewed', 'dismissed'))
);

-- Add new foreign keys only when they do not already exist.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'coursereview_offering_id_fkey'
          AND conrelid = 'public.coursereview'::regclass
    ) THEN
        ALTER TABLE public.coursereview
            ADD CONSTRAINT coursereview_offering_id_fkey
            FOREIGN KEY (offering_id)
            REFERENCES public.offering(offering_id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'notifications_user_id_fkey'
          AND conrelid = 'public.notifications'::regclass
    ) THEN
        ALTER TABLE public.notifications
            ADD CONSTRAINT notifications_user_id_fkey
            FOREIGN KEY (user_id)
            REFERENCES public.users(user_id)
            ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'reports_reporter_user_id_fkey'
          AND conrelid = 'public.reports'::regclass
    ) THEN
        ALTER TABLE public.reports
            ADD CONSTRAINT reports_reporter_user_id_fkey
            FOREIGN KEY (reporter_user_id)
            REFERENCES public.users(user_id)
            ON DELETE CASCADE;
    END IF;
END
$$;

-- Prevent one user from logging the same resource download repeatedly.
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_resource_download
    ON public.resource_downloads(resource_id, user_id);

-- Supporting indexes from the updated schema.
CREATE INDEX IF NOT EXISTS idx_users_dept_code
    ON public.users(dept_code);
CREATE INDEX IF NOT EXISTS idx_courses_dept_code
    ON public.courses(dept_code);
CREATE INDEX IF NOT EXISTS idx_teachers_dept_code
    ON public.teachers(dept_code);
CREATE INDEX IF NOT EXISTS idx_offering_course_code
    ON public.offering(course_code);
CREATE INDEX IF NOT EXISTS idx_offering_teacher_id
    ON public.offering(teacher_id);
CREATE INDEX IF NOT EXISTS idx_topics_course_code
    ON public.topics(course_code);
CREATE INDEX IF NOT EXISTS idx_coursereview_course_code
    ON public.coursereview(course_code);
CREATE INDEX IF NOT EXISTS idx_coursereview_user_id
    ON public.coursereview(user_id);
CREATE INDEX IF NOT EXISTS idx_coursereview_offering_id
    ON public.coursereview(offering_id);
CREATE INDEX IF NOT EXISTS idx_resources_course_code
    ON public.resources(course_code);
CREATE INDEX IF NOT EXISTS idx_resources_user_id
    ON public.resources(user_id);
CREATE INDEX IF NOT EXISTS idx_resources_parent_res_id
    ON public.resources(parent_res_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
    ON public.notifications(user_id);

-- Resource versioning function and trigger.
CREATE OR REPLACE FUNCTION public.calculate_resource_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.version := COALESCE(
        (SELECT version FROM public.resources WHERE res_id = NEW.parent_res_id),
        0
    ) + 1;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_resource_version ON public.resources;

CREATE TRIGGER trg_set_resource_version
    BEFORE INSERT ON public.resources
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_resource_version();

COMMIT;

-- Verify the important updates.
SELECT current_database();
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
  AND column_name IN ('bio', 'avatar_path');
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'resources'
  AND column_name = 'file_path';
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('notifications', 'reports')
ORDER BY table_name;
