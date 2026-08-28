-- AcademicOS schema migration 002
-- Synchronises an existing database with origin/tahmid's current schema.
-- Run after 001_apply_schema_updates.sql while connected to buet_academicos.

BEGIN;

-- The new schema requires these relationships to be populated. Do not guess
-- values for existing rows: abort before changing anything if cleanup is needed.
DO $$
DECLARE
    missing_count integer;
BEGIN
    SELECT COUNT(*) INTO missing_count FROM public.users WHERE dept_code IS NULL;
    IF missing_count > 0 THEN
        RAISE EXCEPTION 'Cannot set users.dept_code NOT NULL: % existing row(s) are NULL', missing_count;
    END IF;

    SELECT COUNT(*) INTO missing_count FROM public.courses WHERE dept_code IS NULL;
    IF missing_count > 0 THEN
        RAISE EXCEPTION 'Cannot set courses.dept_code NOT NULL: % existing row(s) are NULL', missing_count;
    END IF;

    SELECT COUNT(*) INTO missing_count FROM public.teachers WHERE dept_code IS NULL;
    IF missing_count > 0 THEN
        RAISE EXCEPTION 'Cannot set teachers.dept_code NOT NULL: % existing row(s) are NULL', missing_count;
    END IF;

    SELECT COUNT(*) INTO missing_count
    FROM public.offering
    WHERE course_code IS NULL OR teacher_id IS NULL;
    IF missing_count > 0 THEN
        RAISE EXCEPTION 'Cannot set offering.course_code/teacher_id NOT NULL: % existing row(s) are incomplete', missing_count;
    END IF;

    SELECT COUNT(*) INTO missing_count FROM public.topics WHERE course_code IS NULL;
    IF missing_count > 0 THEN
        RAISE EXCEPTION 'Cannot set topics.course_code NOT NULL: % existing row(s) are NULL', missing_count;
    END IF;

    SELECT COUNT(*) INTO missing_count
    FROM public.coursereview
    WHERE user_id IS NULL OR course_code IS NULL;
    IF missing_count > 0 THEN
        RAISE EXCEPTION 'Cannot set coursereview.user_id/course_code NOT NULL: % existing row(s) are incomplete', missing_count;
    END IF;

    SELECT COUNT(*) INTO missing_count
    FROM public.resources
    WHERE user_id IS NULL OR course_code IS NULL;
    IF missing_count > 0 THEN
        RAISE EXCEPTION 'Cannot set resources.user_id/course_code NOT NULL: % existing row(s) are incomplete', missing_count;
    END IF;

    SELECT COUNT(*) INTO missing_count
    FROM public.users
    WHERE role IS NULL OR role NOT IN ('student', 'moderator', 'admin');
    IF missing_count > 0 THEN
        RAISE EXCEPTION 'Cannot add users_role_check: % existing row(s) have NULL or unsupported role values', missing_count;
    END IF;
END
$$;

-- Soft-delete/archive fields.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at timestamp without time zone;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS archived_at timestamp without time zone;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS archived_at timestamp without time zone;

-- Tighten required columns and constrain roles.
ALTER TABLE public.users ALTER COLUMN role TYPE character varying(20);
ALTER TABLE public.users ALTER COLUMN role SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN dept_code SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'student';

ALTER TABLE public.courses ALTER COLUMN dept_code SET NOT NULL;
ALTER TABLE public.teachers ALTER COLUMN dept_code SET NOT NULL;
ALTER TABLE public.offering ALTER COLUMN course_code SET NOT NULL;
ALTER TABLE public.offering ALTER COLUMN teacher_id SET NOT NULL;
ALTER TABLE public.topics ALTER COLUMN course_code SET NOT NULL;
ALTER TABLE public.coursereview ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.coursereview ALTER COLUMN course_code SET NOT NULL;
ALTER TABLE public.resources ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.resources ALTER COLUMN course_code SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_role_check'
          AND conrelid = 'public.users'::regclass
    ) THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_role_check
            CHECK (role IN ('student', 'moderator', 'admin'));
    END IF;
END
$$;

-- New ERD relationships.
CREATE TABLE IF NOT EXISTS public.coursereview_topic_flag (
    review_id integer NOT NULL,
    topic_id integer NOT NULL,
    note text
);

CREATE TABLE IF NOT EXISTS public.user_course_performance (
    user_id integer NOT NULL,
    course_code character varying(20) NOT NULL,
    grade_point numeric(3,2) NOT NULL,
    CONSTRAINT ucp_grade_point_check
        CHECK (grade_point >= 0.00 AND grade_point <= 4.00)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'department_dept_code_key'
          AND conrelid = 'public.departments'::regclass
    ) THEN
        ALTER TABLE public.departments
            ADD CONSTRAINT department_dept_code_key UNIQUE (dept_code);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'coursereview_topic_flag_pkey'
          AND conrelid = 'public.coursereview_topic_flag'::regclass
    ) THEN
        ALTER TABLE public.coursereview_topic_flag
            ADD CONSTRAINT coursereview_topic_flag_pkey PRIMARY KEY (review_id, topic_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_course_performance_pkey'
          AND conrelid = 'public.user_course_performance'::regclass
    ) THEN
        ALTER TABLE public.user_course_performance
            ADD CONSTRAINT user_course_performance_pkey PRIMARY KEY (user_id, course_code);
    END IF;
END
$$;

-- Replace the old CASCADE/SET NULL academic-data rules with the branch's
-- RESTRICT policy. Existing constraint names are stable across schema.sql versions.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS "User_dept_code_fkey";
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS course_dept_code_fkey;
ALTER TABLE public.teachers DROP CONSTRAINT IF EXISTS teacher_dept_code_fkey;
ALTER TABLE public.offering DROP CONSTRAINT IF EXISTS offering_course_code_fkey;
ALTER TABLE public.offering DROP CONSTRAINT IF EXISTS offering_teacher_id_fkey;
ALTER TABLE public.topics DROP CONSTRAINT IF EXISTS topic_course_code_fkey;
ALTER TABLE public.coursereview DROP CONSTRAINT IF EXISTS coursereview_course_code_fkey;
ALTER TABLE public.coursereview DROP CONSTRAINT IF EXISTS coursereview_user_id_fkey;
ALTER TABLE public.resources DROP CONSTRAINT IF EXISTS resource_course_code_fkey;
ALTER TABLE public.resources DROP CONSTRAINT IF EXISTS resource_user_id_fkey;

ALTER TABLE public.users
    ADD CONSTRAINT "User_dept_code_fkey" FOREIGN KEY (dept_code)
    REFERENCES public.departments(dept_code) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public.courses
    ADD CONSTRAINT course_dept_code_fkey FOREIGN KEY (dept_code)
    REFERENCES public.departments(dept_code) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public.teachers
    ADD CONSTRAINT teacher_dept_code_fkey FOREIGN KEY (dept_code)
    REFERENCES public.departments(dept_code) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public.offering
    ADD CONSTRAINT offering_course_code_fkey FOREIGN KEY (course_code)
    REFERENCES public.courses(course_code) ON DELETE RESTRICT;
ALTER TABLE public.offering
    ADD CONSTRAINT offering_teacher_id_fkey FOREIGN KEY (teacher_id)
    REFERENCES public.teachers(teacher_id) ON DELETE RESTRICT;
ALTER TABLE public.topics
    ADD CONSTRAINT topic_course_code_fkey FOREIGN KEY (course_code)
    REFERENCES public.courses(course_code) ON DELETE RESTRICT;
ALTER TABLE public.coursereview
    ADD CONSTRAINT coursereview_course_code_fkey FOREIGN KEY (course_code)
    REFERENCES public.courses(course_code) ON DELETE RESTRICT;
ALTER TABLE public.coursereview
    ADD CONSTRAINT coursereview_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users(user_id) ON DELETE RESTRICT;
ALTER TABLE public.resources
    ADD CONSTRAINT resource_course_code_fkey FOREIGN KEY (course_code)
    REFERENCES public.courses(course_code) ON DELETE RESTRICT;
ALTER TABLE public.resources
    ADD CONSTRAINT resource_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users(user_id) ON DELETE RESTRICT;

ALTER TABLE public.user_course_performance
    ADD CONSTRAINT ucp_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users(user_id) ON DELETE RESTRICT;
ALTER TABLE public.user_course_performance
    ADD CONSTRAINT ucp_course_code_fkey FOREIGN KEY (course_code)
    REFERENCES public.courses(course_code) ON DELETE RESTRICT;
ALTER TABLE public.coursereview_topic_flag
    ADD CONSTRAINT crtf_review_id_fkey FOREIGN KEY (review_id)
    REFERENCES public.coursereview(review_id) ON DELETE CASCADE;
ALTER TABLE public.coursereview_topic_flag
    ADD CONSTRAINT crtf_topic_id_fkey FOREIGN KEY (topic_id)
    REFERENCES public.topics(topic_id) ON DELETE CASCADE;

-- Ensure a review flag cannot point at a topic from another course.
CREATE OR REPLACE FUNCTION public.validate_review_topic_flag()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    review_course character varying(20);
    flagged_topic_course character varying(20);
BEGIN
    SELECT course_code INTO review_course
    FROM public.coursereview WHERE review_id = NEW.review_id;
    SELECT course_code INTO flagged_topic_course
    FROM public.topics WHERE topic_id = NEW.topic_id;

    IF review_course IS DISTINCT FROM flagged_topic_course THEN
        RAISE EXCEPTION 'Topic % does not belong to the course reviewed in review %',
            NEW.topic_id, NEW.review_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_review_topic_flag ON public.coursereview_topic_flag;
CREATE TRIGGER trg_validate_review_topic_flag
    BEFORE INSERT OR UPDATE ON public.coursereview_topic_flag
    FOR EACH ROW EXECUTE FUNCTION public.validate_review_topic_flag();

-- Convert the prior migration's unique index into the branch's named
-- table constraint when possible.
DROP INDEX IF EXISTS public.unique_user_resource_download;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_user_resource_download'
          AND conrelid = 'public.resource_downloads'::regclass
    ) THEN
        ALTER TABLE public.resource_downloads
            ADD CONSTRAINT unique_user_resource_download UNIQUE (resource_id, user_id);
    END IF;
END
$$;

-- Foreign-key performance indexes from origin/tahmid.
CREATE INDEX IF NOT EXISTS idx_crtf_topic_id ON public.coursereview_topic_flag(topic_id);
CREATE INDEX IF NOT EXISTS idx_ucp_course_code ON public.user_course_performance(course_code);

COMMIT;
