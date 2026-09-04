-- AcademicOS activity-notification and resource-moderation migration.
-- Notifications are created by PostgreSQL so every API/client that changes
-- these tables receives the same behavior.

BEGIN;

DO $$
BEGIN
    IF current_database() <> 'buet_academicos' THEN
        RAISE EXCEPTION 'Migration 006 must run on buet_academicos, not %', current_database();
    END IF;

    IF to_regclass('public.notifications') IS NULL
       OR to_regclass('public.coursereviewvote') IS NULL
       OR to_regclass('public.reports') IS NULL
       OR to_regclass('public.resources') IS NULL THEN
        RAISE EXCEPTION 'Migration 006 requires the existing notification, review, report and resource tables';
    END IF;
END;
$$;

-- Existing resources were already visible to users, so they are treated as
-- approved. New uploads begin pending until an administrator reviews them.
ALTER TABLE public.resources
    ADD COLUMN IF NOT EXISTS approval_status character varying(20);

ALTER TABLE public.resources
    ADD COLUMN IF NOT EXISTS created_at timestamp without time zone;

UPDATE public.resources
SET created_at = CURRENT_TIMESTAMP
WHERE created_at IS NULL;

ALTER TABLE public.resources
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN created_at SET NOT NULL;

UPDATE public.resources
SET approval_status = 'approved'
WHERE approval_status IS NULL;

ALTER TABLE public.resources
    ALTER COLUMN approval_status SET DEFAULT 'pending',
    ALTER COLUMN approval_status SET NOT NULL;

ALTER TABLE public.resources
    DROP CONSTRAINT IF EXISTS resources_approval_status_check;

ALTER TABLE public.resources
    ADD CONSTRAINT resources_approval_status_check
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE public.resources
    ADD COLUMN IF NOT EXISTS moderated_by_user_id integer,
    ADD COLUMN IF NOT EXISTS moderated_at timestamp without time zone,
    ADD COLUMN IF NOT EXISTS moderation_note text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'resources_moderated_by_user_id_fkey'
          AND conrelid = 'public.resources'::regclass
    ) THEN
        ALTER TABLE public.resources
            ADD CONSTRAINT resources_moderated_by_user_id_fkey
            FOREIGN KEY (moderated_by_user_id) REFERENCES public.users(user_id)
            ON DELETE SET NULL;
    END IF;
END;
$$;

ALTER TABLE public.reports
    ADD COLUMN IF NOT EXISTS reviewed_by_user_id integer,
    ADD COLUMN IF NOT EXISTS reviewed_at timestamp without time zone,
    ADD COLUMN IF NOT EXISTS resolution_note text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'reports_reviewed_by_user_id_fkey'
          AND conrelid = 'public.reports'::regclass
    ) THEN
        ALTER TABLE public.reports
            ADD CONSTRAINT reports_reviewed_by_user_id_fkey
            FOREIGN KEY (reviewed_by_user_id) REFERENCES public.users(user_id)
            ON DELETE SET NULL;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_resources_approval_status
    ON public.resources(approval_status, res_id DESC);

CREATE INDEX IF NOT EXISTS idx_reports_pending
    ON public.reports(status, report_id DESC)
    WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.notify_review_vote()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_author_id integer;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.value IS NOT DISTINCT FROM OLD.value THEN
        RETURN NEW;
    END IF;

    SELECT user_id INTO v_author_id
    FROM public.coursereview
    WHERE review_id = NEW.review_id;

    IF v_author_id IS NOT NULL AND v_author_id <> NEW.user_id
       AND EXISTS (SELECT 1 FROM public.users WHERE user_id = v_author_id AND deleted_at IS NULL) THEN
        INSERT INTO public.notifications (user_id, type, message, related_id)
        VALUES (
            v_author_id,
            'review_vote',
            CASE WHEN NEW.value = 1
                THEN 'Someone upvoted your course review.'
                ELSE 'Someone downvoted your course review.'
            END,
            NEW.review_id
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_report_created()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_target_owner_id integer;
BEGIN
    IF NEW.target_type = 'coursereview' THEN
        SELECT user_id INTO v_target_owner_id
        FROM public.coursereview WHERE review_id = NEW.target_id;
    ELSIF NEW.target_type = 'resource' THEN
        SELECT user_id INTO v_target_owner_id
        FROM public.resources WHERE res_id = NEW.target_id;
    END IF;

    IF v_target_owner_id IS NOT NULL AND v_target_owner_id <> NEW.reporter_user_id
       AND EXISTS (SELECT 1 FROM public.users WHERE user_id = v_target_owner_id AND deleted_at IS NULL) THEN
        INSERT INTO public.notifications (user_id, type, message, related_id)
        VALUES (v_target_owner_id, 'report_created', 'Your content was reported and will be reviewed by an administrator.', NEW.report_id);
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_report_resolved()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_target_owner_id integer;
    v_message text;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status = 'pending' THEN
        RETURN NEW;
    END IF;

    IF NEW.target_type = 'coursereview' THEN
        SELECT user_id INTO v_target_owner_id
        FROM public.coursereview WHERE review_id = NEW.target_id;
    ELSIF NEW.target_type = 'resource' THEN
        SELECT user_id INTO v_target_owner_id
        FROM public.resources WHERE res_id = NEW.target_id;
    END IF;

    v_message := CASE NEW.status
        WHEN 'dismissed' THEN 'A report about your content was dismissed by an administrator.'
        WHEN 'reviewed' THEN 'An administrator completed the review of a report about your content.'
        ELSE 'A report about your content was updated by an administrator.'
    END;

    IF v_target_owner_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.users WHERE user_id = v_target_owner_id AND deleted_at IS NULL) THEN
        INSERT INTO public.notifications (user_id, type, message, related_id)
        VALUES (v_target_owner_id, 'report_resolved', v_message, NEW.report_id);
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_resource_submitted()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.notifications (user_id, type, message, related_id)
    SELECT u.user_id, 'resource_submitted', 'A new resource is waiting for approval: ' || NEW.title, NEW.res_id
    FROM public.users u
    WHERE u.role = 'admin'
      AND u.deleted_at IS NULL
      AND u.user_id <> NEW.user_id;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_resource_moderated()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_message text;
BEGIN
    IF NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status
       OR NEW.approval_status = 'pending' THEN
        RETURN NEW;
    END IF;

    v_message := CASE NEW.approval_status
        WHEN 'approved' THEN 'Your resource was approved and is now visible to students: ' || NEW.title
        WHEN 'rejected' THEN 'Your resource was not approved: ' || NEW.title
    END;

    IF EXISTS (SELECT 1 FROM public.users WHERE user_id = NEW.user_id AND deleted_at IS NULL) THEN
        INSERT INTO public.notifications (user_id, type, message, related_id)
        VALUES (NEW.user_id, 'resource_' || NEW.approval_status, v_message, NEW.res_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_review_vote ON public.coursereviewvote;
CREATE TRIGGER trg_notify_review_vote
AFTER INSERT OR UPDATE OF value ON public.coursereviewvote
FOR EACH ROW EXECUTE FUNCTION public.notify_review_vote();

DROP TRIGGER IF EXISTS trg_notify_report_created ON public.reports;
CREATE TRIGGER trg_notify_report_created
AFTER INSERT ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.notify_report_created();

DROP TRIGGER IF EXISTS trg_notify_report_resolved ON public.reports;
CREATE TRIGGER trg_notify_report_resolved
AFTER UPDATE OF status ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.notify_report_resolved();

DROP TRIGGER IF EXISTS trg_notify_resource_submitted ON public.resources;
CREATE TRIGGER trg_notify_resource_submitted
AFTER INSERT ON public.resources
FOR EACH ROW EXECUTE FUNCTION public.notify_resource_submitted();

DROP TRIGGER IF EXISTS trg_notify_resource_moderated ON public.resources;
CREATE TRIGGER trg_notify_resource_moderated
AFTER UPDATE OF approval_status ON public.resources
FOR EACH ROW EXECUTE FUNCTION public.notify_resource_moderated();

COMMIT;
