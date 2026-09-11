--
-- PostgreSQL database dump
--

\restrict oLiXXhNFLUqRg3zsipxZlBJJt8PeiPkXzkIAc0UbGLvydzRC0LaXy42QIgbkfmt

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

-- Started on 2026-09-11 16:00:19

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 5 (class 2615 OID 17117)
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO postgres;

--
-- TOC entry 270 (class 1255 OID 18010)
-- Name: advance_batch_progress(integer, character varying, character varying, character varying, text, uuid); Type: PROCEDURE; Schema: public; Owner: postgres
--

CREATE PROCEDURE public.advance_batch_progress(IN p_actor_user_id integer, IN p_batch_year character varying, IN p_dept_code character varying, IN p_expected_current_term_code character varying, IN p_reason text, IN p_request_id uuid, OUT o_history_id integer, OUT o_previous_current_term_code character varying, OUT o_new_current_term_code character varying, OUT o_latest_completed_term_code character varying, OUT o_notifications_created integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_admin_role character varying(20);
    v_admin_deleted_at timestamp without time zone;
    v_curriculum_id integer;
    v_previous_current_term character varying(10);
    v_previous_completed_term character varying(10);
    v_previous_current_order smallint;
    v_new_current_term character varying(10);
    v_new_current_label character varying(50);
    v_notifications_created integer;
    v_existing_history public.batch_progress_history%ROWTYPE;
BEGIN
    IF p_request_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REQUEST_ID_REQUIRED';
    END IF;

    IF p_reason IS NULL OR btrim(p_reason) = '' OR char_length(p_reason) > 500 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ADVANCE_REASON';
    END IF;

    SELECT role, deleted_at
    INTO v_admin_role, v_admin_deleted_at
    FROM public.users
    WHERE user_id = p_actor_user_id;

    IF NOT FOUND OR v_admin_deleted_at IS NOT NULL OR v_admin_role <> 'admin' THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ACTIVE_ADMIN_REQUIRED';
    END IF;

    SELECT * INTO v_existing_history
    FROM public.batch_progress_history
    WHERE request_id = p_request_id;

    IF FOUND THEN
        IF v_existing_history.batch_year IS DISTINCT FROM p_batch_year
           OR v_existing_history.dept_code IS DISTINCT FROM p_dept_code
           OR v_existing_history.advanced_by_user_id IS DISTINCT FROM p_actor_user_id THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REQUEST_ID_ALREADY_USED';
        END IF;

        o_history_id := v_existing_history.batch_progress_history_id;
        o_previous_current_term_code := v_existing_history.previous_current_term_code;
        o_new_current_term_code := v_existing_history.new_current_term_code;
        o_latest_completed_term_code := v_existing_history.new_latest_completed_term_code;
        o_notifications_created := v_existing_history.notifications_created;
        RETURN;
    END IF;

    SELECT curriculum_id, current_term_code, latest_completed_term_code
    INTO v_curriculum_id, v_previous_current_term, v_previous_completed_term
    FROM public.batch_progress
    WHERE batch_year = p_batch_year
      AND dept_code = p_dept_code
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BATCH_NOT_CONFIGURED';
    END IF;

    -- Re-check after the row lock: a concurrent request with this same UUID
    -- may have completed while this transaction waited for the batch row.
    SELECT * INTO v_existing_history
    FROM public.batch_progress_history
    WHERE request_id = p_request_id;

    IF FOUND THEN
        IF v_existing_history.batch_year IS DISTINCT FROM p_batch_year
           OR v_existing_history.dept_code IS DISTINCT FROM p_dept_code
           OR v_existing_history.advanced_by_user_id IS DISTINCT FROM p_actor_user_id THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REQUEST_ID_ALREADY_USED';
        END IF;

        o_history_id := v_existing_history.batch_progress_history_id;
        o_previous_current_term_code := v_existing_history.previous_current_term_code;
        o_new_current_term_code := v_existing_history.new_current_term_code;
        o_latest_completed_term_code := v_existing_history.new_latest_completed_term_code;
        o_notifications_created := v_existing_history.notifications_created;
        RETURN;
    END IF;

    IF v_previous_current_term IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BATCH_ALREADY_GRADUATED';
    END IF;

    IF p_expected_current_term_code IS DISTINCT FROM v_previous_current_term THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STALE_BATCH_PROGRESS';
    END IF;

    SELECT term_order
    INTO v_previous_current_order
    FROM public.academic_terms
    WHERE term_code = v_previous_current_term;

    SELECT term_code, display_name
    INTO v_new_current_term, v_new_current_label
    FROM public.academic_terms
    WHERE term_order = v_previous_current_order + 1;

    IF v_new_current_term IS NULL AND v_previous_current_term <> '4-2' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_FINAL_TERM_TRANSITION';
    END IF;

    -- We do not open a term until the selected curriculum actually defines
    -- courses for it. This prevents a future 4th-year option design from
    -- being guessed or silently exposed.
    IF v_new_current_term IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM public.curriculum_courses
           WHERE curriculum_id = v_curriculum_id
             AND term_code = v_new_current_term
             AND is_required
       ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NEXT_TERM_NOT_CONFIGURED';
    END IF;

    UPDATE public.batch_progress
    SET current_term_code = v_new_current_term,
        latest_completed_term_code = v_previous_current_term,
        updated_by_user_id = p_actor_user_id
    WHERE batch_year = p_batch_year
      AND dept_code = p_dept_code;

    INSERT INTO public.batch_progress_history (
        request_id,
        batch_year,
        dept_code,
        curriculum_id,
        previous_current_term_code,
        previous_latest_completed_term_code,
        new_current_term_code,
        new_latest_completed_term_code,
        advanced_by_user_id,
        reason
    )
    VALUES (
        p_request_id,
        p_batch_year,
        p_dept_code,
        v_curriculum_id,
        v_previous_current_term,
        v_previous_completed_term,
        v_new_current_term,
        v_previous_current_term,
        p_actor_user_id,
        btrim(p_reason)
    )
    RETURNING batch_progress_history_id INTO o_history_id;

    INSERT INTO public.notifications (user_id, type, message, related_id)
    SELECT
        u.user_id,
        'batch_progress_advanced',
        CASE
            WHEN v_new_current_term IS NULL THEN
                format(
                    'Batch %s completed %s. Results can now be entered through %s.',
                    p_batch_year,
                    v_previous_current_term,
                    v_previous_current_term
                )
            ELSE
                format(
                    'Batch %s completed %s and is now in %s. You can enter results through %s.',
                    p_batch_year,
                    v_previous_current_term,
                    v_new_current_label,
                    v_previous_current_term
                )
        END,
        o_history_id
    FROM public.users u
    WHERE u.batch = p_batch_year
      AND u.dept_code = p_dept_code
      AND u.role = 'student'
      AND u.deleted_at IS NULL;

    GET DIAGNOSTICS v_notifications_created = ROW_COUNT;

    UPDATE public.batch_progress_history
    SET notifications_created = v_notifications_created
    WHERE batch_progress_history_id = o_history_id;

    o_previous_current_term_code := v_previous_current_term;
    o_new_current_term_code := v_new_current_term;
    o_latest_completed_term_code := v_previous_current_term;
    o_notifications_created := v_notifications_created;
END;
$$;


ALTER PROCEDURE public.advance_batch_progress(IN p_actor_user_id integer, IN p_batch_year character varying, IN p_dept_code character varying, IN p_expected_current_term_code character varying, IN p_reason text, IN p_request_id uuid, OUT o_history_id integer, OUT o_previous_current_term_code character varying, OUT o_new_current_term_code character varying, OUT o_latest_completed_term_code character varying, OUT o_notifications_created integer) OWNER TO postgres;

--
-- TOC entry 254 (class 1255 OID 17118)
-- Name: calculate_resource_version(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_resource_version() RETURNS trigger
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


ALTER FUNCTION public.calculate_resource_version() OWNER TO postgres;

--
-- TOC entry 268 (class 1255 OID 17937)
-- Name: get_batch_term_course_stats(character varying, character varying, character varying, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_batch_term_course_stats(p_batch_year character varying, p_dept_code character varying, p_term_code character varying, p_minimum_cohort integer DEFAULT 5) RETURNS TABLE(curriculum_course_id integer, course_code character varying, course_title character varying, credits numeric, completed_students integer, privacy_threshold_met boolean, average_grade_point numeric, median_grade_point numeric, pass_rate_percent numeric, fail_count integer, a_plus_count integer, standard_deviation_grade_point numeric)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_curriculum_id integer;
    v_latest_completed_term character varying(10);
    v_requested_order smallint;
    v_latest_order smallint;
BEGIN
    IF p_minimum_cohort < 1 THEN
        RAISE EXCEPTION 'Minimum cohort must be at least 1';
    END IF;

    SELECT curriculum_id, latest_completed_term_code
    INTO v_curriculum_id, v_latest_completed_term
    FROM public.batch_progress
    WHERE batch_year = p_batch_year AND dept_code = p_dept_code;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No batch progression is configured for batch % department %', p_batch_year, p_dept_code;
    END IF;

    SELECT term_order INTO v_requested_order FROM public.academic_terms WHERE term_code = p_term_code;
    SELECT term_order INTO v_latest_order FROM public.academic_terms WHERE term_code = v_latest_completed_term;
    IF v_requested_order IS NULL OR v_latest_order IS NULL OR v_requested_order > v_latest_order THEN
        RAISE EXCEPTION 'Term % is not completed for batch %', p_term_code, p_batch_year;
    END IF;

    RETURN QUERY
    WITH required_courses AS (
        SELECT cc.curriculum_course_id, cc.course_code, c.title, cc.credits_at_placement
        FROM public.curriculum_courses cc
        JOIN public.courses c ON c.course_code = cc.course_code
        WHERE cc.curriculum_id = v_curriculum_id
          AND cc.term_code = p_term_code
          AND cc.is_required
          AND c.archived_at IS NULL
    ),
    expected AS (
        SELECT COUNT(*)::integer AS expected_courses FROM required_courses
    ),
    active_students AS (
        SELECT user_id
        FROM public.users
        WHERE batch = p_batch_year AND dept_code = p_dept_code
          AND role = 'student' AND deleted_at IS NULL
    ),
    student_results AS (
        SELECT s.user_id, COUNT(ucp.curriculum_course_id)::integer AS recorded_courses
        FROM active_students s
        CROSS JOIN required_courses rc
        LEFT JOIN public.user_course_performance ucp
            ON ucp.user_id = s.user_id AND ucp.curriculum_course_id = rc.curriculum_course_id
        GROUP BY s.user_id
    ),
    complete_students AS (
        SELECT sr.user_id
        FROM student_results sr CROSS JOIN expected e
        WHERE e.expected_courses > 0 AND sr.recorded_courses = e.expected_courses
    ),
    cohort AS (
        SELECT COUNT(*)::integer AS completed_students FROM complete_students
    ),
    course_aggregate AS (
        SELECT
            rc.curriculum_course_id,
            rc.course_code,
            rc.title,
            rc.credits_at_placement,
            COUNT(ucp.user_id)::integer AS result_count,
            AVG(ucp.grade_point) AS average_value,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY ucp.grade_point) AS median_value,
            100.0 * COUNT(ucp.user_id) FILTER (WHERE ucp.grade_point >= 2.00)
                / NULLIF(COUNT(ucp.user_id), 0) AS pass_rate_value,
            COUNT(ucp.user_id) FILTER (WHERE ucp.grade_point = 0.00)::integer AS fail_value,
            COUNT(ucp.user_id) FILTER (WHERE ucp.grade_point = 4.00)::integer AS a_plus_value,
            stddev_samp(ucp.grade_point) AS stddev_value
        FROM required_courses rc
        LEFT JOIN complete_students cs ON TRUE
        LEFT JOIN public.user_course_performance ucp
            ON ucp.user_id = cs.user_id AND ucp.curriculum_course_id = rc.curriculum_course_id
        GROUP BY rc.curriculum_course_id, rc.course_code, rc.title, rc.credits_at_placement
    )
    SELECT
        ca.curriculum_course_id,
        ca.course_code,
        ca.title,
        ca.credits_at_placement,
        co.completed_students,
        co.completed_students >= p_minimum_cohort,
        CASE WHEN co.completed_students >= p_minimum_cohort THEN ROUND(ca.average_value, 2) END,
        CASE WHEN co.completed_students >= p_minimum_cohort THEN ROUND(ca.median_value::numeric, 2) END,
        CASE WHEN co.completed_students >= p_minimum_cohort THEN ROUND(ca.pass_rate_value, 2) END,
        CASE WHEN co.completed_students >= p_minimum_cohort THEN ca.fail_value END,
        CASE WHEN co.completed_students >= p_minimum_cohort THEN ca.a_plus_value END,
        CASE WHEN co.completed_students >= p_minimum_cohort THEN ROUND(ca.stddev_value, 2) END
    FROM course_aggregate ca
    CROSS JOIN cohort co
    ORDER BY ca.course_code;
END;
$$;


ALTER FUNCTION public.get_batch_term_course_stats(p_batch_year character varying, p_dept_code character varying, p_term_code character varying, p_minimum_cohort integer) OWNER TO postgres;

--
-- TOC entry 267 (class 1255 OID 17935)
-- Name: get_batch_term_summary(character varying, character varying, character varying, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_batch_term_summary(p_batch_year character varying, p_dept_code character varying, p_term_code character varying, p_minimum_cohort integer DEFAULT 5) RETURNS TABLE(registered_students integer, expected_courses integer, students_with_any_data integer, completed_students integer, privacy_threshold_met boolean, batch_average_gpa numeric, median_gpa numeric, lowest_gpa numeric, highest_gpa numeric, standard_deviation_gpa numeric, first_quartile_gpa numeric, third_quartile_gpa numeric)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_curriculum_id integer;
    v_latest_completed_term character varying(10);
    v_requested_order smallint;
    v_latest_order smallint;
BEGIN
    IF p_minimum_cohort < 1 THEN
        RAISE EXCEPTION 'Minimum cohort must be at least 1';
    END IF;

    SELECT curriculum_id, latest_completed_term_code
    INTO v_curriculum_id, v_latest_completed_term
    FROM public.batch_progress
    WHERE batch_year = p_batch_year AND dept_code = p_dept_code;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No batch progression is configured for batch % department %', p_batch_year, p_dept_code;
    END IF;

    SELECT term_order INTO v_requested_order
    FROM public.academic_terms WHERE term_code = p_term_code;
    SELECT term_order INTO v_latest_order
    FROM public.academic_terms WHERE term_code = v_latest_completed_term;

    IF v_requested_order IS NULL OR v_latest_order IS NULL OR v_requested_order > v_latest_order THEN
        RAISE EXCEPTION 'Term % is not completed for batch %', p_term_code, p_batch_year;
    END IF;

    RETURN QUERY
    WITH required_courses AS (
        SELECT cc.curriculum_course_id, cc.credits_at_placement
        FROM public.curriculum_courses cc
        JOIN public.courses c ON c.course_code = cc.course_code
        WHERE cc.curriculum_id = v_curriculum_id
          AND cc.term_code = p_term_code
          AND cc.is_required
          AND c.archived_at IS NULL
    ),
    expected AS (
        SELECT COUNT(*)::integer AS expected_courses FROM required_courses
    ),
    active_students AS (
        SELECT user_id
        FROM public.users
        WHERE batch = p_batch_year
          AND dept_code = p_dept_code
          AND role = 'student'
          AND deleted_at IS NULL
    ),
    student_results AS (
        SELECT
            s.user_id,
            COUNT(ucp.curriculum_course_id)::integer AS recorded_courses,
            SUM(ucp.grade_point * rc.credits_at_placement)
                / NULLIF(SUM(rc.credits_at_placement) FILTER (WHERE ucp.curriculum_course_id IS NOT NULL), 0) AS term_gpa
        FROM active_students s
        CROSS JOIN required_courses rc
        LEFT JOIN public.user_course_performance ucp
            ON ucp.user_id = s.user_id
           AND ucp.curriculum_course_id = rc.curriculum_course_id
        GROUP BY s.user_id
    ),
    complete_results AS (
        SELECT sr.term_gpa
        FROM student_results sr
        CROSS JOIN expected e
        WHERE e.expected_courses > 0
          AND sr.recorded_courses = e.expected_courses
    ),
    aggregate_result AS (
        SELECT
            COUNT(*)::integer AS completed_students,
            AVG(term_gpa) AS average_gpa,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY term_gpa) AS median_value,
            MIN(term_gpa) AS lowest_value,
            MAX(term_gpa) AS highest_value,
            stddev_samp(term_gpa) AS stddev_value,
            percentile_cont(0.25) WITHIN GROUP (ORDER BY term_gpa) AS first_quartile_value,
            percentile_cont(0.75) WITHIN GROUP (ORDER BY term_gpa) AS third_quartile_value
        FROM complete_results
    )
    SELECT
        (SELECT COUNT(*)::integer FROM active_students),
        e.expected_courses,
        (SELECT COUNT(*)::integer FROM student_results WHERE recorded_courses > 0),
        a.completed_students,
        a.completed_students >= p_minimum_cohort,
        CASE WHEN a.completed_students >= p_minimum_cohort THEN ROUND(a.average_gpa, 2) END,
        CASE WHEN a.completed_students >= p_minimum_cohort THEN ROUND(a.median_value::numeric, 2) END,
        CASE WHEN a.completed_students >= p_minimum_cohort THEN ROUND(a.lowest_value, 2) END,
        CASE WHEN a.completed_students >= p_minimum_cohort THEN ROUND(a.highest_value, 2) END,
        CASE WHEN a.completed_students >= p_minimum_cohort THEN ROUND(a.stddev_value, 2) END,
        CASE WHEN a.completed_students >= p_minimum_cohort THEN ROUND(a.first_quartile_value::numeric, 2) END,
        CASE WHEN a.completed_students >= p_minimum_cohort THEN ROUND(a.third_quartile_value::numeric, 2) END
    FROM expected e
    CROSS JOIN aggregate_result a;
END;
$$;


ALTER FUNCTION public.get_batch_term_summary(p_batch_year character varying, p_dept_code character varying, p_term_code character varying, p_minimum_cohort integer) OWNER TO postgres;

--
-- TOC entry 272 (class 1255 OID 18035)
-- Name: notify_report_created(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_report_created() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_target_owner_id integer;
BEGIN
    IF NEW.target_type = 'coursereview' THEN
        SELECT user_id INTO v_target_owner_id
        FROM public.coursereviews WHERE review_id = NEW.target_id;
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


ALTER FUNCTION public.notify_report_created() OWNER TO postgres;

--
-- TOC entry 273 (class 1255 OID 18036)
-- Name: notify_report_resolved(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_report_resolved() RETURNS trigger
    LANGUAGE plpgsql
    AS $$DECLARE
    v_target_owner_id integer;
    v_message text;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status = 'pending' THEN
        RETURN NEW;
    END IF;

    IF NEW.target_type = 'coursereview' THEN
        SELECT user_id INTO v_target_owner_id
        -- FIXED: Added 's' to coursereviews below
        FROM public.coursereviews WHERE review_id = NEW.target_id;
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
END;$$;


ALTER FUNCTION public.notify_report_resolved() OWNER TO postgres;

--
-- TOC entry 274 (class 1255 OID 18038)
-- Name: notify_resource_moderated(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_resource_moderated() RETURNS trigger
    LANGUAGE plpgsql
    AS $$DECLARE
    v_message text;
BEGIN
    IF NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status
       OR NEW.approval_status = 'pending' THEN
        RETURN NEW;
    END IF;

    v_message := CASE NEW.approval_status
        WHEN 'approved' THEN 'Your resource was approved and is now visible to students: ' || NEW.title
        WHEN 'rejected' THEN 'Your resource was not approved: ' || NEW.title
        ELSE 'The status of your resource was updated: ' || NEW.title -- Added fallback to prevent NOT NULL crashes
    END;

    IF EXISTS (SELECT 1 FROM public.users WHERE user_id = NEW.user_id AND deleted_at IS NULL) THEN
        INSERT INTO public.notifications (user_id, type, message, related_id)
        VALUES (NEW.user_id, 'resource_' || NEW.approval_status, v_message, NEW.res_id);
    END IF;
    
    RETURN NEW;
END;$$;


ALTER FUNCTION public.notify_resource_moderated() OWNER TO postgres;

--
-- TOC entry 275 (class 1255 OID 18037)
-- Name: notify_resource_submitted(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_resource_submitted() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN
    RETURN NEW;
END;$$;


ALTER FUNCTION public.notify_resource_submitted() OWNER TO postgres;

--
-- TOC entry 276 (class 1255 OID 18034)
-- Name: notify_review_vote(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_review_vote() RETURNS trigger
    LANGUAGE plpgsql
    AS $$DECLARE
    v_author_id integer;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.value IS NOT DISTINCT FROM OLD.value THEN
        RETURN NEW;
    END IF;

    SELECT user_id INTO v_author_id
    FROM public.coursereviews -- FIXED: Added the 's' here
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
END;$$;


ALTER FUNCTION public.notify_review_vote() OWNER TO postgres;

--
-- TOC entry 266 (class 1255 OID 17897)
-- Name: validate_batch_progress(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.validate_batch_progress() RETURNS trigger
    LANGUAGE plpgsql
    AS $$DECLARE
    v_current_order smallint;
    v_completed_order smallint;
    v_saved_max_order smallint;
    v_expected_next_term character varying(10);
BEGIN
    IF NEW.current_term_code IS NOT NULL THEN
        SELECT term_order INTO v_current_order
        FROM public.academic_terms
        WHERE term_code = NEW.current_term_code;
    END IF;

    IF NEW.latest_completed_term_code IS NOT NULL THEN
        SELECT term_order INTO v_completed_order
        FROM public.academic_terms
        WHERE term_code = NEW.latest_completed_term_code;
    END IF;

    IF NEW.current_term_code IS NOT NULL
       AND NEW.latest_completed_term_code IS NOT NULL
       AND v_completed_order >= v_current_order THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'INVALID_BATCH_STATE';
    END IF;

    IF TG_OP = 'UPDATE'
       AND (
           NEW.current_term_code IS DISTINCT FROM OLD.current_term_code
           OR NEW.latest_completed_term_code IS DISTINCT FROM OLD.latest_completed_term_code
       ) THEN
        IF OLD.current_term_code IS NULL THEN
            RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'BATCH_ALREADY_GRADUATED';
        END IF;

        IF NEW.latest_completed_term_code IS DISTINCT FROM OLD.current_term_code THEN
            RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'BATCH_PROGRESS_MUST_COMPLETE_CURRENT_TERM';
        END IF;

        SELECT next_term.term_code INTO v_expected_next_term
        FROM public.academic_terms current_term
        LEFT JOIN public.academic_terms next_term
          ON next_term.term_order = current_term.term_order + 1
        WHERE current_term.term_code = OLD.current_term_code;

        IF v_expected_next_term IS NULL THEN
            IF NEW.current_term_code IS NOT NULL THEN
                RAISE EXCEPTION USING
                    ERRCODE = 'P0001',
                    MESSAGE = 'INVALID_FINAL_TERM_TRANSITION';
            END IF;
        ELSIF NEW.current_term_code IS DISTINCT FROM v_expected_next_term THEN
            RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'BATCH_PROGRESS_MUST_ADVANCE_ONE_TERM';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.curriculum_id IS DISTINCT FROM OLD.curriculum_id
       AND EXISTS (
           SELECT 1
           FROM public.users u
           JOIN public.user_course_performance ucp ON ucp.user_id = u.user_id
           WHERE u.batch = OLD.batch_year AND u.dept_code = OLD.dept_code
       ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'CANNOT_CHANGE_BATCH_CURRICULUM';
    END IF;

    SELECT MAX(at.term_order) INTO v_saved_max_order
    FROM public.users u
    JOIN public.user_course_performance ucp ON ucp.user_id = u.user_id
    -- FIXED: Changed join condition to use course_code since ucp doesn't have curriculum_course_id
    JOIN public.curriculum_courses cc ON cc.course_code = ucp.course_code 
    JOIN public.academic_terms at ON at.term_code = cc.term_code
    WHERE u.batch = NEW.batch_year
      AND u.dept_code = NEW.dept_code;

    IF v_saved_max_order IS NOT NULL
       AND v_saved_max_order > COALESCE(v_completed_order, 0) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'SAVED_RESULTS_REQUIRE_COMPLETED_TERM';
    END IF;

    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;$$;


ALTER FUNCTION public.validate_batch_progress() OWNER TO postgres;

--
-- TOC entry 271 (class 1255 OID 17119)
-- Name: validate_review_topic_flag(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.validate_review_topic_flag() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    review_course         character varying(20);
    flagged_topic_course character varying(20);
BEGIN
    -- FIXED: Changed 'coursereview' to 'coursereviews'
    SELECT course_code INTO review_course
    FROM public.coursereviews WHERE review_id = NEW.review_id;

    SELECT course_code INTO flagged_topic_course
    FROM public.topics WHERE topic_id = NEW.topic_id;

    IF review_course IS DISTINCT FROM flagged_topic_course THEN
        RAISE EXCEPTION 'Topic % does not belong to the course reviewed in review %',
            NEW.topic_id, NEW.review_id;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.validate_review_topic_flag() OWNER TO postgres;

--
-- TOC entry 269 (class 1255 OID 17928)
-- Name: validate_user_course_performance(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.validate_user_course_performance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$DECLARE
    v_batch_year character varying(20);
    v_dept_code character varying(10);
    v_role character varying(20);
    v_deleted_at timestamp without time zone;
    v_curriculum_id integer;
    v_latest_completed_term character varying(10);
    v_latest_completed_order smallint;
    v_placement_curriculum_id integer;
    v_placement_term character varying(10);
    v_placement_term_order smallint;
    v_is_required boolean;
    v_archived_at timestamp without time zone;
BEGIN
    SELECT batch, dept_code, role, deleted_at
    INTO v_batch_year, v_dept_code, v_role, v_deleted_at
    FROM public.users
    WHERE user_id = NEW.user_id;

    IF NOT FOUND OR v_role <> 'student' OR v_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Only active student accounts can store performance results';
    END IF;

    SELECT curriculum_id, latest_completed_term_code
    INTO v_curriculum_id, v_latest_completed_term
    FROM public.batch_progress
    WHERE batch_year = v_batch_year AND dept_code = v_dept_code;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No batch progression is configured for this student';
    END IF;

    IF v_latest_completed_term IS NULL THEN
        RAISE EXCEPTION 'This batch has no completed term open for result entry';
    END IF;

    -- FIXED: We now match using NEW.course_code and v_curriculum_id 
    -- instead of the non-existent NEW.curriculum_course_id
    SELECT cc.curriculum_id, cc.term_code, at.term_order, cc.is_required, c.archived_at
    INTO v_placement_curriculum_id, v_placement_term, v_placement_term_order, v_is_required, v_archived_at
    FROM public.curriculum_courses cc
    JOIN public.academic_terms at ON at.term_code = cc.term_code
    JOIN public.courses c ON c.course_code = cc.course_code
    WHERE cc.course_code = NEW.course_code AND cc.curriculum_id = v_curriculum_id;

    IF NOT FOUND OR v_archived_at IS NOT NULL OR NOT v_is_required THEN
        RAISE EXCEPTION 'The requested curriculum course is not active and required';
    END IF;

    IF v_placement_curriculum_id <> v_curriculum_id THEN
        RAISE EXCEPTION 'The requested course does not belong to this student''s curriculum';
    END IF;

    SELECT term_order INTO v_latest_completed_order
    FROM public.academic_terms
    WHERE term_code = v_latest_completed_term;

    IF v_placement_term_order > v_latest_completed_order THEN
        RAISE EXCEPTION 'Term % is not completed for this batch; latest completed term is %',
            v_placement_term, v_latest_completed_term;
    END IF;

    -- FIXED: Removed NEW.updated_at := CURRENT_TIMESTAMP; because 
    -- user_course_performance does not have that column.
    
    RETURN NEW;
END;$$;


ALTER FUNCTION public.validate_user_course_performance() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 222 (class 1259 OID 17125)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    user_id integer NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    batch character varying(20),
    role character varying(20) DEFAULT 'student'::character varying NOT NULL,
    password character varying(255) NOT NULL,
    dept_code character varying(10) NOT NULL,
    bio text,
    avatar_path text,
    deleted_at timestamp without time zone,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY (ARRAY[('student'::character varying)::text, ('moderator'::character varying)::text, ('admin'::character varying)::text]))),
    CONSTRAINT users_student_batch_check CHECK ((((role)::text <> 'student'::text) OR ((batch IS NOT NULL) AND ((batch)::text ~ '^[0-9]{4}$'::text))))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 17138)
-- Name: User_user_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."User_user_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."User_user_id_seq" OWNER TO postgres;

--
-- TOC entry 5252 (class 0 OID 0)
-- Dependencies: 223
-- Name: User_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."User_user_id_seq" OWNED BY public.users.user_id;


--
-- TOC entry 245 (class 1259 OID 17791)
-- Name: academic_terms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.academic_terms (
    term_code character varying(10) NOT NULL,
    term_order smallint NOT NULL,
    level_no smallint NOT NULL,
    term_no smallint NOT NULL,
    display_name character varying(50) NOT NULL,
    CONSTRAINT academic_terms_code_format_check CHECK (((term_code)::text ~ '^[1-4]-[1-2]$'::text)),
    CONSTRAINT academic_terms_level_no_check CHECK (((level_no >= 1) AND (level_no <= 4))),
    CONSTRAINT academic_terms_order_check CHECK ((term_order = (((level_no - 1) * 2) + term_no))),
    CONSTRAINT academic_terms_term_no_check CHECK (((term_no >= 1) AND (term_no <= 2)))
);


ALTER TABLE public.academic_terms OWNER TO postgres;

--
-- TOC entry 250 (class 1259 OID 17871)
-- Name: batch_progress; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.batch_progress (
    batch_year character varying(4) NOT NULL,
    dept_code character varying(10) NOT NULL,
    curriculum_id integer NOT NULL,
    current_term_code character varying(10),
    latest_completed_term_code character varying(10),
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by_user_id integer,
    CONSTRAINT batch_progress_batch_year_check CHECK (((batch_year)::text ~ '^[0-9]{4}$'::text))
);


ALTER TABLE public.batch_progress OWNER TO postgres;

--
-- TOC entry 253 (class 1259 OID 17949)
-- Name: batch_progress_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.batch_progress_history (
    batch_progress_history_id integer NOT NULL,
    request_id uuid NOT NULL,
    batch_year character varying(4) NOT NULL,
    dept_code character varying(10) NOT NULL,
    curriculum_id integer NOT NULL,
    previous_current_term_code character varying(10) NOT NULL,
    previous_latest_completed_term_code character varying(10),
    new_current_term_code character varying(10),
    new_latest_completed_term_code character varying(10) NOT NULL,
    advanced_by_user_id integer NOT NULL,
    reason character varying(500) NOT NULL,
    notifications_created integer DEFAULT 0 NOT NULL,
    advanced_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT batch_progress_history_batch_year_check CHECK (((batch_year)::text ~ '^[0-9]{4}$'::text)),
    CONSTRAINT batch_progress_history_completed_current_check CHECK (((previous_current_term_code)::text = (new_latest_completed_term_code)::text)),
    CONSTRAINT batch_progress_history_notification_count_check CHECK ((notifications_created >= 0)),
    CONSTRAINT batch_progress_history_reason_not_blank CHECK ((btrim((reason)::text) <> ''::text))
);


ALTER TABLE public.batch_progress_history OWNER TO postgres;

--
-- TOC entry 252 (class 1259 OID 17948)
-- Name: batch_progress_history_batch_progress_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.batch_progress_history ALTER COLUMN batch_progress_history_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.batch_progress_history_batch_progress_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 227 (class 1259 OID 17153)
-- Name: course_offerings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.course_offerings (
    offering_id integer CONSTRAINT offering_offering_id_not_null NOT NULL,
    semester character varying(50) CONSTRAINT offering_semester_not_null NOT NULL,
    course_code character varying(20) CONSTRAINT offering_course_code_not_null NOT NULL,
    teacher_id integer CONSTRAINT offering_teacher_id_not_null NOT NULL
);


ALTER TABLE public.course_offerings OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 17168)
-- Name: coursereviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coursereviews (
    review_id integer CONSTRAINT coursereview_review_id_not_null NOT NULL,
    difficulty numeric(2,1),
    prereq_use numeric(2,1),
    comment text,
    user_id integer CONSTRAINT coursereview_user_id_not_null NOT NULL,
    course_code character varying(20) CONSTRAINT coursereview_course_code_not_null NOT NULL,
    offering_id integer,
    file_path text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT coursereview_difficulty_check CHECK (((difficulty >= (1)::numeric) AND (difficulty <= (5)::numeric))),
    CONSTRAINT coursereview_prereq_use_check CHECK (((prereq_use >= (1)::numeric) AND (prereq_use <= (5)::numeric)))
);


ALTER TABLE public.coursereviews OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 17178)
-- Name: coursereview_review_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.coursereview_review_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.coursereview_review_id_seq OWNER TO postgres;

--
-- TOC entry 5253 (class 0 OID 0)
-- Dependencies: 232
-- Name: coursereview_review_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.coursereview_review_id_seq OWNED BY public.coursereviews.review_id;


--
-- TOC entry 234 (class 1259 OID 17185)
-- Name: coursereview_topic_flag; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coursereview_topic_flag (
    review_id integer NOT NULL,
    topic_id integer NOT NULL,
    note text
);


ALTER TABLE public.coursereview_topic_flag OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 17179)
-- Name: coursereviewvote; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coursereviewvote (
    user_id integer NOT NULL,
    review_id integer NOT NULL,
    value integer,
    CONSTRAINT coursereviewvote_value_check CHECK ((value = ANY (ARRAY['-1'::integer, 1])))
);


ALTER TABLE public.coursereviewvote OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 17139)
-- Name: courses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.courses (
    course_code character varying(20) NOT NULL,
    title character varying(255) NOT NULL,
    credits numeric(3,2) NOT NULL,
    level_term character varying(20),
    dept_code character varying(10) NOT NULL,
    archived_at timestamp without time zone
);


ALTER TABLE public.courses OWNER TO postgres;

--
-- TOC entry 247 (class 1259 OID 17808)
-- Name: curricula; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.curricula (
    curriculum_id integer NOT NULL,
    dept_code character varying(10) NOT NULL,
    curriculum_version character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    source_title character varying(255),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.curricula OWNER TO postgres;

--
-- TOC entry 246 (class 1259 OID 17807)
-- Name: curricula_curriculum_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.curricula ALTER COLUMN curriculum_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.curricula_curriculum_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 249 (class 1259 OID 17833)
-- Name: curriculum_courses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.curriculum_courses (
    curriculum_course_id integer NOT NULL,
    curriculum_id integer NOT NULL,
    term_code character varying(10) NOT NULL,
    course_code character varying(20) NOT NULL,
    credits_at_placement numeric(3,2) NOT NULL,
    course_type character varying(20) NOT NULL,
    is_required boolean DEFAULT true NOT NULL,
    theory_hours numeric(4,2) DEFAULT 0 NOT NULL,
    sessional_hours numeric(4,2) DEFAULT 0 NOT NULL,
    CONSTRAINT curriculum_courses_course_type_check CHECK (((course_type)::text = ANY ((ARRAY['theory'::character varying, 'sessional'::character varying, 'project'::character varying, 'thesis'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT curriculum_courses_credits_at_placement_check CHECK ((credits_at_placement > (0)::numeric)),
    CONSTRAINT curriculum_courses_sessional_hours_check CHECK ((sessional_hours >= (0)::numeric)),
    CONSTRAINT curriculum_courses_theory_hours_check CHECK ((theory_hours >= (0)::numeric))
);


ALTER TABLE public.curriculum_courses OWNER TO postgres;

--
-- TOC entry 248 (class 1259 OID 17832)
-- Name: curriculum_courses_curriculum_course_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.curriculum_courses ALTER COLUMN curriculum_course_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.curriculum_courses_curriculum_course_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 221 (class 1259 OID 17120)
-- Name: departments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.departments (
    dept_name character varying(255) NOT NULL,
    dept_code character varying(10) NOT NULL
);


ALTER TABLE public.departments OWNER TO postgres;

--
-- TOC entry 242 (class 1259 OID 17226)
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    notification_id integer NOT NULL,
    user_id integer NOT NULL,
    type character varying(50) NOT NULL,
    message text NOT NULL,
    related_id integer,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 17225)
-- Name: notifications_notification_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notifications_notification_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.notifications_notification_id_seq OWNER TO postgres;

--
-- TOC entry 5254 (class 0 OID 0)
-- Dependencies: 241
-- Name: notifications_notification_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notifications_notification_id_seq OWNED BY public.notifications.notification_id;


--
-- TOC entry 228 (class 1259 OID 17160)
-- Name: offering_offering_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.offering_offering_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.offering_offering_id_seq OWNER TO postgres;

--
-- TOC entry 5255 (class 0 OID 0)
-- Dependencies: 228
-- Name: offering_offering_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.offering_offering_id_seq OWNED BY public.course_offerings.offering_id;


--
-- TOC entry 244 (class 1259 OID 17242)
-- Name: reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reports (
    report_id integer NOT NULL,
    reporter_user_id integer NOT NULL,
    target_type character varying(20) NOT NULL,
    target_id integer NOT NULL,
    reason text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    reviewed_by_user_id integer,
    reviewed_at timestamp without time zone,
    resolution_note text,
    CONSTRAINT reports_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('reviewed'::character varying)::text, ('dismissed'::character varying)::text]))),
    CONSTRAINT reports_target_type_check CHECK (((target_type)::text = ANY (ARRAY[('resource'::character varying)::text, ('coursereview'::character varying)::text])))
);


ALTER TABLE public.reports OWNER TO postgres;

--
-- TOC entry 243 (class 1259 OID 17241)
-- Name: reports_report_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reports_report_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reports_report_id_seq OWNER TO postgres;

--
-- TOC entry 5256 (class 0 OID 0)
-- Dependencies: 243
-- Name: reports_report_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reports_report_id_seq OWNED BY public.reports.report_id;


--
-- TOC entry 239 (class 1259 OID 17219)
-- Name: resource_downloads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resource_downloads (
    id integer NOT NULL,
    resource_id integer,
    user_id integer,
    downloaded_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.resource_downloads OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 17224)
-- Name: resource_downloads_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.resource_downloads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.resource_downloads_id_seq OWNER TO postgres;

--
-- TOC entry 5257 (class 0 OID 0)
-- Dependencies: 240
-- Name: resource_downloads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.resource_downloads_id_seq OWNED BY public.resource_downloads.id;


--
-- TOC entry 236 (class 1259 OID 17199)
-- Name: resources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resources (
    res_id integer NOT NULL,
    title character varying(255) NOT NULL,
    type character varying(50) NOT NULL,
    version integer DEFAULT 1,
    parent_res_id integer,
    user_id integer NOT NULL,
    course_code character varying(20) NOT NULL,
    file_path text NOT NULL,
    approval_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    moderated_by_user_id integer,
    moderated_at timestamp without time zone,
    moderation_note text,
    CONSTRAINT chk_resource_type CHECK (((type)::text = ANY (ARRAY[('Slides'::character varying)::text, ('Previous Year Questions'::character varying)::text, ('Notes'::character varying)::text, ('Lab reports'::character varying)::text]))),
    CONSTRAINT resources_approval_status_check CHECK (((approval_status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


ALTER TABLE public.resources OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 17212)
-- Name: resource_res_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.resource_res_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.resource_res_id_seq OWNER TO postgres;

--
-- TOC entry 5258 (class 0 OID 0)
-- Dependencies: 237
-- Name: resource_res_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.resource_res_id_seq OWNED BY public.resources.res_id;


--
-- TOC entry 238 (class 1259 OID 17213)
-- Name: resourcevote; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resourcevote (
    user_id integer NOT NULL,
    res_id integer NOT NULL,
    value integer,
    CONSTRAINT resourcevote_value_check CHECK ((value = ANY (ARRAY['-1'::integer, 1])))
);


ALTER TABLE public.resourcevote OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 17146)
-- Name: teachers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teachers (
    teacher_id integer NOT NULL,
    name character varying(255) NOT NULL,
    designation character varying(100),
    dept_code character varying(10) NOT NULL,
    archived_at timestamp without time zone
);


ALTER TABLE public.teachers OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 17152)
-- Name: teacher_teacher_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.teacher_teacher_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.teacher_teacher_id_seq OWNER TO postgres;

--
-- TOC entry 5259 (class 0 OID 0)
-- Dependencies: 226
-- Name: teacher_teacher_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.teacher_teacher_id_seq OWNED BY public.teachers.teacher_id;


--
-- TOC entry 229 (class 1259 OID 17161)
-- Name: topics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.topics (
    topic_id integer NOT NULL,
    name character varying(255) NOT NULL,
    course_code character varying(20) NOT NULL
);


ALTER TABLE public.topics OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 17167)
-- Name: topic_topic_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.topic_topic_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.topic_topic_id_seq OWNER TO postgres;

--
-- TOC entry 5260 (class 0 OID 0)
-- Dependencies: 230
-- Name: topic_topic_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.topic_topic_id_seq OWNED BY public.topics.topic_id;


--
-- TOC entry 235 (class 1259 OID 17192)
-- Name: user_course_performance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_course_performance (
    user_id integer NOT NULL,
    grade_point numeric(3,2) NOT NULL,
    curriculum_course_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    course_code character varying(20),
    CONSTRAINT ucp_grade_point_check CHECK ((grade_point = ANY (ARRAY[0.00, 2.00, 2.25, 2.50, 2.75, 3.00, 3.25, 3.50, 3.75, 4.00])))
);


ALTER TABLE public.user_course_performance OWNER TO postgres;

--
-- TOC entry 251 (class 1259 OID 17930)
-- Name: v_student_term_gpa; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_student_term_gpa AS
 SELECT ucp.user_id,
    u.batch AS batch_year,
    u.dept_code,
    cc.curriculum_id,
    cc.term_code,
    (count(*))::integer AS recorded_courses,
    sum(cc.credits_at_placement) AS recorded_credits,
    round((sum((ucp.grade_point * cc.credits_at_placement)) / NULLIF(sum(cc.credits_at_placement), (0)::numeric)), 2) AS term_gpa
   FROM ((public.user_course_performance ucp
     JOIN public.users u ON ((u.user_id = ucp.user_id)))
     JOIN public.curriculum_courses cc ON ((cc.curriculum_course_id = ucp.curriculum_course_id)))
  WHERE (u.deleted_at IS NULL)
  GROUP BY ucp.user_id, u.batch, u.dept_code, cc.curriculum_id, cc.term_code;


ALTER VIEW public.v_student_term_gpa OWNER TO postgres;

--
-- TOC entry 4917 (class 2604 OID 17262)
-- Name: course_offerings offering_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course_offerings ALTER COLUMN offering_id SET DEFAULT nextval('public.offering_offering_id_seq'::regclass);


--
-- TOC entry 4919 (class 2604 OID 17264)
-- Name: coursereviews review_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coursereviews ALTER COLUMN review_id SET DEFAULT nextval('public.coursereview_review_id_seq'::regclass);


--
-- TOC entry 4929 (class 2604 OID 17229)
-- Name: notifications notification_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications ALTER COLUMN notification_id SET DEFAULT nextval('public.notifications_notification_id_seq'::regclass);


--
-- TOC entry 4932 (class 2604 OID 17245)
-- Name: reports report_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports ALTER COLUMN report_id SET DEFAULT nextval('public.reports_report_id_seq'::regclass);


--
-- TOC entry 4927 (class 2604 OID 17266)
-- Name: resource_downloads id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_downloads ALTER COLUMN id SET DEFAULT nextval('public.resource_downloads_id_seq'::regclass);


--
-- TOC entry 4923 (class 2604 OID 17265)
-- Name: resources res_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resources ALTER COLUMN res_id SET DEFAULT nextval('public.resource_res_id_seq'::regclass);


--
-- TOC entry 4916 (class 2604 OID 17261)
-- Name: teachers teacher_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teachers ALTER COLUMN teacher_id SET DEFAULT nextval('public.teacher_teacher_id_seq'::regclass);


--
-- TOC entry 4918 (class 2604 OID 17263)
-- Name: topics topic_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.topics ALTER COLUMN topic_id SET DEFAULT nextval('public.topic_topic_id_seq'::regclass);


--
-- TOC entry 4914 (class 2604 OID 17260)
-- Name: users user_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN user_id SET DEFAULT nextval('public."User_user_id_seq"'::regclass);


--
-- TOC entry 4972 (class 2606 OID 17272)
-- Name: users User_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "User_email_key" UNIQUE (email);


--
-- TOC entry 4974 (class 2606 OID 17270)
-- Name: users User_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (user_id);


--
-- TOC entry 5025 (class 2606 OID 17804)
-- Name: academic_terms academic_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.academic_terms
    ADD CONSTRAINT academic_terms_pkey PRIMARY KEY (term_code);


--
-- TOC entry 5027 (class 2606 OID 17806)
-- Name: academic_terms academic_terms_term_order_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.academic_terms
    ADD CONSTRAINT academic_terms_term_order_key UNIQUE (term_order);


--
-- TOC entry 5043 (class 2606 OID 17976)
-- Name: batch_progress_history batch_progress_history_completed_once_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_progress_history
    ADD CONSTRAINT batch_progress_history_completed_once_key UNIQUE (batch_year, dept_code, new_latest_completed_term_code);


--
-- TOC entry 5045 (class 2606 OID 17972)
-- Name: batch_progress_history batch_progress_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_progress_history
    ADD CONSTRAINT batch_progress_history_pkey PRIMARY KEY (batch_progress_history_id);


--
-- TOC entry 5047 (class 2606 OID 17974)
-- Name: batch_progress_history batch_progress_history_request_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_progress_history
    ADD CONSTRAINT batch_progress_history_request_id_key UNIQUE (request_id);


--
-- TOC entry 5040 (class 2606 OID 17881)
-- Name: batch_progress batch_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_progress
    ADD CONSTRAINT batch_progress_pkey PRIMARY KEY (batch_year, dept_code);


--
-- TOC entry 4978 (class 2606 OID 17274)
-- Name: courses course_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT course_pkey PRIMARY KEY (course_code);


--
-- TOC entry 4991 (class 2606 OID 17282)
-- Name: coursereviews coursereview_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coursereviews
    ADD CONSTRAINT coursereview_pkey PRIMARY KEY (review_id);


--
-- TOC entry 4999 (class 2606 OID 17286)
-- Name: coursereview_topic_flag coursereview_topic_flag_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coursereview_topic_flag
    ADD CONSTRAINT coursereview_topic_flag_pkey PRIMARY KEY (review_id, topic_id);


--
-- TOC entry 4997 (class 2606 OID 17284)
-- Name: coursereviewvote coursereviewvote_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coursereviewvote
    ADD CONSTRAINT coursereviewvote_pkey PRIMARY KEY (user_id, review_id);


--
-- TOC entry 5029 (class 2606 OID 17824)
-- Name: curricula curricula_dept_version_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curricula
    ADD CONSTRAINT curricula_dept_version_key UNIQUE (dept_code, curriculum_version);


--
-- TOC entry 5031 (class 2606 OID 17826)
-- Name: curricula curricula_id_dept_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curricula
    ADD CONSTRAINT curricula_id_dept_code_key UNIQUE (curriculum_id, dept_code);


--
-- TOC entry 5033 (class 2606 OID 17822)
-- Name: curricula curricula_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curricula
    ADD CONSTRAINT curricula_pkey PRIMARY KEY (curriculum_id);


--
-- TOC entry 5035 (class 2606 OID 17853)
-- Name: curriculum_courses curriculum_courses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curriculum_courses
    ADD CONSTRAINT curriculum_courses_pkey PRIMARY KEY (curriculum_course_id);


--
-- TOC entry 5037 (class 2606 OID 17855)
-- Name: curriculum_courses curriculum_courses_unique_placement; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curriculum_courses
    ADD CONSTRAINT curriculum_courses_unique_placement UNIQUE (curriculum_id, term_code, course_code);


--
-- TOC entry 4968 (class 2606 OID 17298)
-- Name: departments department_dept_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT department_dept_code_key UNIQUE (dept_code);


--
-- TOC entry 4970 (class 2606 OID 17268)
-- Name: departments department_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT department_pkey PRIMARY KEY (dept_code);


--
-- TOC entry 5020 (class 2606 OID 17240)
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (notification_id);


--
-- TOC entry 4986 (class 2606 OID 17278)
-- Name: course_offerings offering_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course_offerings
    ADD CONSTRAINT offering_pkey PRIMARY KEY (offering_id);


--
-- TOC entry 5023 (class 2606 OID 17259)
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (report_id);


--
-- TOC entry 5013 (class 2606 OID 17294)
-- Name: resource_downloads resource_downloads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_downloads
    ADD CONSTRAINT resource_downloads_pkey PRIMARY KEY (id);


--
-- TOC entry 5009 (class 2606 OID 17290)
-- Name: resources resource_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resource_pkey PRIMARY KEY (res_id);


--
-- TOC entry 5011 (class 2606 OID 17292)
-- Name: resourcevote resourcevote_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resourcevote
    ADD CONSTRAINT resourcevote_pkey PRIMARY KEY (user_id, res_id);


--
-- TOC entry 4982 (class 2606 OID 17276)
-- Name: teachers teacher_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teacher_pkey PRIMARY KEY (teacher_id);


--
-- TOC entry 4989 (class 2606 OID 17280)
-- Name: topics topic_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topic_pkey PRIMARY KEY (topic_id);


--
-- TOC entry 5015 (class 2606 OID 17296)
-- Name: resource_downloads unique_user_resource_download; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_downloads
    ADD CONSTRAINT unique_user_resource_download UNIQUE (resource_id, user_id);


--
-- TOC entry 5003 (class 2606 OID 17922)
-- Name: user_course_performance user_course_performance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_course_performance
    ADD CONSTRAINT user_course_performance_pkey PRIMARY KEY (user_id, curriculum_course_id);


--
-- TOC entry 5041 (class 1259 OID 17940)
-- Name: idx_batch_progress_curriculum; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_batch_progress_curriculum ON public.batch_progress USING btree (curriculum_id);


--
-- TOC entry 5048 (class 1259 OID 18007)
-- Name: idx_batch_progress_history_batch_changed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_batch_progress_history_batch_changed ON public.batch_progress_history USING btree (batch_year, dept_code, advanced_at DESC);


--
-- TOC entry 4992 (class 1259 OID 17425)
-- Name: idx_coursereview_course_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_coursereview_course_code ON public.coursereviews USING btree (course_code);


--
-- TOC entry 4993 (class 1259 OID 18016)
-- Name: idx_coursereview_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_coursereview_created_at ON public.coursereviews USING btree (created_at DESC);


--
-- TOC entry 4994 (class 1259 OID 17427)
-- Name: idx_coursereview_offering_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_coursereview_offering_id ON public.coursereviews USING btree (offering_id);


--
-- TOC entry 4995 (class 1259 OID 17426)
-- Name: idx_coursereview_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_coursereview_user_id ON public.coursereviews USING btree (user_id);


--
-- TOC entry 4979 (class 1259 OID 17420)
-- Name: idx_courses_dept_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_courses_dept_code ON public.courses USING btree (dept_code);


--
-- TOC entry 5000 (class 1259 OID 17432)
-- Name: idx_crtf_topic_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_crtf_topic_id ON public.coursereview_topic_flag USING btree (topic_id);


--
-- TOC entry 5038 (class 1259 OID 17939)
-- Name: idx_curriculum_courses_curriculum_term; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_curriculum_courses_curriculum_term ON public.curriculum_courses USING btree (curriculum_id, term_code) WHERE is_required;


--
-- TOC entry 5016 (class 1259 OID 18009)
-- Name: idx_notifications_batch_progress_history; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_batch_progress_history ON public.notifications USING btree (related_id) WHERE ((type)::text = 'batch_progress_advanced'::text);


--
-- TOC entry 5017 (class 1259 OID 18008)
-- Name: idx_notifications_unread_recent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_unread_recent ON public.notifications USING btree (user_id, created_at DESC) WHERE (is_read = false);


--
-- TOC entry 5018 (class 1259 OID 17431)
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- TOC entry 4983 (class 1259 OID 17422)
-- Name: idx_offering_course_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_offering_course_code ON public.course_offerings USING btree (course_code);


--
-- TOC entry 4984 (class 1259 OID 17423)
-- Name: idx_offering_teacher_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_offering_teacher_id ON public.course_offerings USING btree (teacher_id);


--
-- TOC entry 5021 (class 1259 OID 18033)
-- Name: idx_reports_pending; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reports_pending ON public.reports USING btree (status, report_id DESC) WHERE ((status)::text = 'pending'::text);


--
-- TOC entry 5004 (class 1259 OID 18032)
-- Name: idx_resources_approval_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_resources_approval_status ON public.resources USING btree (approval_status, res_id DESC);


--
-- TOC entry 5005 (class 1259 OID 17428)
-- Name: idx_resources_course_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_resources_course_code ON public.resources USING btree (course_code);


--
-- TOC entry 5006 (class 1259 OID 17430)
-- Name: idx_resources_parent_res_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_resources_parent_res_id ON public.resources USING btree (parent_res_id);


--
-- TOC entry 5007 (class 1259 OID 17429)
-- Name: idx_resources_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_resources_user_id ON public.resources USING btree (user_id);


--
-- TOC entry 4980 (class 1259 OID 17421)
-- Name: idx_teachers_dept_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teachers_dept_code ON public.teachers USING btree (dept_code);


--
-- TOC entry 4987 (class 1259 OID 17424)
-- Name: idx_topics_course_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_topics_course_code ON public.topics USING btree (course_code);


--
-- TOC entry 5001 (class 1259 OID 17942)
-- Name: idx_ucp_curriculum_course; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ucp_curriculum_course ON public.user_course_performance USING btree (curriculum_course_id);


--
-- TOC entry 4975 (class 1259 OID 17941)
-- Name: idx_users_batch_dept_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_batch_dept_active ON public.users USING btree (batch, dept_code) WHERE (((role)::text = 'student'::text) AND (deleted_at IS NULL));


--
-- TOC entry 4976 (class 1259 OID 17419)
-- Name: idx_users_dept_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_dept_code ON public.users USING btree (dept_code);


--
-- TOC entry 5095 (class 2620 OID 18040)
-- Name: reports trg_notify_report_created; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_notify_report_created AFTER INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION public.notify_report_created();


--
-- TOC entry 5096 (class 2620 OID 18041)
-- Name: reports trg_notify_report_resolved; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_notify_report_resolved AFTER UPDATE OF status ON public.reports FOR EACH ROW EXECUTE FUNCTION public.notify_report_resolved();


--
-- TOC entry 5092 (class 2620 OID 18043)
-- Name: resources trg_notify_resource_moderated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_notify_resource_moderated AFTER UPDATE OF approval_status ON public.resources FOR EACH ROW EXECUTE FUNCTION public.notify_resource_moderated();


--
-- TOC entry 5093 (class 2620 OID 18042)
-- Name: resources trg_notify_resource_submitted; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_notify_resource_submitted AFTER INSERT ON public.resources FOR EACH ROW EXECUTE FUNCTION public.notify_resource_submitted();


--
-- TOC entry 5089 (class 2620 OID 18039)
-- Name: coursereviewvote trg_notify_review_vote; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_notify_review_vote AFTER INSERT OR UPDATE OF value ON public.coursereviewvote FOR EACH ROW EXECUTE FUNCTION public.notify_review_vote();


--
-- TOC entry 5094 (class 2620 OID 17449)
-- Name: resources trg_set_resource_version; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_set_resource_version BEFORE INSERT ON public.resources FOR EACH ROW EXECUTE FUNCTION public.calculate_resource_version();


--
-- TOC entry 5097 (class 2620 OID 17898)
-- Name: batch_progress trg_validate_batch_progress; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_validate_batch_progress BEFORE INSERT OR UPDATE ON public.batch_progress FOR EACH ROW EXECUTE FUNCTION public.validate_batch_progress();


--
-- TOC entry 5090 (class 2620 OID 17667)
-- Name: coursereview_topic_flag trg_validate_review_topic_flag; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_validate_review_topic_flag BEFORE INSERT OR UPDATE ON public.coursereview_topic_flag FOR EACH ROW EXECUTE FUNCTION public.validate_review_topic_flag();


--
-- TOC entry 5091 (class 2620 OID 17929)
-- Name: user_course_performance trg_validate_user_course_performance; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_validate_user_course_performance BEFORE INSERT OR UPDATE ON public.user_course_performance FOR EACH ROW EXECUTE FUNCTION public.validate_user_course_performance();


--
-- TOC entry 5049 (class 2606 OID 17617)
-- Name: users User_dept_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "User_dept_code_fkey" FOREIGN KEY (dept_code) REFERENCES public.departments(dept_code) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 5079 (class 2606 OID 17887)
-- Name: batch_progress batch_progress_current_term_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_progress
    ADD CONSTRAINT batch_progress_current_term_code_fkey FOREIGN KEY (current_term_code) REFERENCES public.academic_terms(term_code) ON DELETE RESTRICT;


--
-- TOC entry 5080 (class 2606 OID 17882)
-- Name: batch_progress batch_progress_dept_curriculum_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_progress
    ADD CONSTRAINT batch_progress_dept_curriculum_fkey FOREIGN KEY (curriculum_id, dept_code) REFERENCES public.curricula(curriculum_id, dept_code) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 5083 (class 2606 OID 18002)
-- Name: batch_progress_history batch_progress_history_advanced_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_progress_history
    ADD CONSTRAINT batch_progress_history_advanced_by_user_fkey FOREIGN KEY (advanced_by_user_id) REFERENCES public.users(user_id) ON DELETE RESTRICT;


--
-- TOC entry 5084 (class 2606 OID 17977)
-- Name: batch_progress_history batch_progress_history_curriculum_dept_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_progress_history
    ADD CONSTRAINT batch_progress_history_curriculum_dept_fkey FOREIGN KEY (curriculum_id, dept_code) REFERENCES public.curricula(curriculum_id, dept_code) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 5085 (class 2606 OID 17997)
-- Name: batch_progress_history batch_progress_history_new_completed_term_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_progress_history
    ADD CONSTRAINT batch_progress_history_new_completed_term_fkey FOREIGN KEY (new_latest_completed_term_code) REFERENCES public.academic_terms(term_code) ON DELETE RESTRICT;


--
-- TOC entry 5086 (class 2606 OID 17992)
-- Name: batch_progress_history batch_progress_history_new_current_term_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_progress_history
    ADD CONSTRAINT batch_progress_history_new_current_term_fkey FOREIGN KEY (new_current_term_code) REFERENCES public.academic_terms(term_code) ON DELETE RESTRICT;


--
-- TOC entry 5087 (class 2606 OID 17987)
-- Name: batch_progress_history batch_progress_history_previous_completed_term_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_progress_history
    ADD CONSTRAINT batch_progress_history_previous_completed_term_fkey FOREIGN KEY (previous_latest_completed_term_code) REFERENCES public.academic_terms(term_code) ON DELETE RESTRICT;


--
-- TOC entry 5088 (class 2606 OID 17982)
-- Name: batch_progress_history batch_progress_history_previous_current_term_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_progress_history
    ADD CONSTRAINT batch_progress_history_previous_current_term_fkey FOREIGN KEY (previous_current_term_code) REFERENCES public.academic_terms(term_code) ON DELETE RESTRICT;


--
-- TOC entry 5081 (class 2606 OID 17892)
-- Name: batch_progress batch_progress_latest_completed_term_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_progress
    ADD CONSTRAINT batch_progress_latest_completed_term_code_fkey FOREIGN KEY (latest_completed_term_code) REFERENCES public.academic_terms(term_code) ON DELETE RESTRICT;


--
-- TOC entry 5082 (class 2606 OID 17943)
-- Name: batch_progress batch_progress_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.batch_progress
    ADD CONSTRAINT batch_progress_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- TOC entry 5050 (class 2606 OID 17622)
-- Name: courses course_dept_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT course_dept_code_fkey FOREIGN KEY (dept_code) REFERENCES public.departments(dept_code) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 5055 (class 2606 OID 17647)
-- Name: coursereviews coursereview_course_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coursereviews
    ADD CONSTRAINT coursereview_course_code_fkey FOREIGN KEY (course_code) REFERENCES public.courses(course_code) ON DELETE RESTRICT;


--
-- TOC entry 5056 (class 2606 OID 17344)
-- Name: coursereviews coursereview_offering_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coursereviews
    ADD CONSTRAINT coursereview_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES public.course_offerings(offering_id) ON DELETE SET NULL;


--
-- TOC entry 5057 (class 2606 OID 17652)
-- Name: coursereviews coursereview_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coursereviews
    ADD CONSTRAINT coursereview_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE RESTRICT;


--
-- TOC entry 5058 (class 2606 OID 17364)
-- Name: coursereviewvote coursereviewvote_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coursereviewvote
    ADD CONSTRAINT coursereviewvote_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.coursereviews(review_id) ON DELETE CASCADE;


--
-- TOC entry 5059 (class 2606 OID 17369)
-- Name: coursereviewvote coursereviewvote_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coursereviewvote
    ADD CONSTRAINT coursereviewvote_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- TOC entry 5060 (class 2606 OID 17374)
-- Name: coursereview_topic_flag crtf_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coursereview_topic_flag
    ADD CONSTRAINT crtf_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.coursereviews(review_id) ON DELETE CASCADE;


--
-- TOC entry 5061 (class 2606 OID 17379)
-- Name: coursereview_topic_flag crtf_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coursereview_topic_flag
    ADD CONSTRAINT crtf_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(topic_id) ON DELETE CASCADE;


--
-- TOC entry 5075 (class 2606 OID 17827)
-- Name: curricula curricula_dept_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curricula
    ADD CONSTRAINT curricula_dept_code_fkey FOREIGN KEY (dept_code) REFERENCES public.departments(dept_code) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 5076 (class 2606 OID 17866)
-- Name: curriculum_courses curriculum_courses_course_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curriculum_courses
    ADD CONSTRAINT curriculum_courses_course_code_fkey FOREIGN KEY (course_code) REFERENCES public.courses(course_code) ON DELETE RESTRICT;


--
-- TOC entry 5077 (class 2606 OID 17856)
-- Name: curriculum_courses curriculum_courses_curriculum_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curriculum_courses
    ADD CONSTRAINT curriculum_courses_curriculum_id_fkey FOREIGN KEY (curriculum_id) REFERENCES public.curricula(curriculum_id) ON DELETE RESTRICT;


--
-- TOC entry 5078 (class 2606 OID 17861)
-- Name: curriculum_courses curriculum_courses_term_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curriculum_courses
    ADD CONSTRAINT curriculum_courses_term_code_fkey FOREIGN KEY (term_code) REFERENCES public.academic_terms(term_code) ON DELETE RESTRICT;


--
-- TOC entry 5072 (class 2606 OID 17404)
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- TOC entry 5052 (class 2606 OID 17632)
-- Name: course_offerings offering_course_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course_offerings
    ADD CONSTRAINT offering_course_code_fkey FOREIGN KEY (course_code) REFERENCES public.courses(course_code) ON DELETE RESTRICT;


--
-- TOC entry 5053 (class 2606 OID 17637)
-- Name: course_offerings offering_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course_offerings
    ADD CONSTRAINT offering_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(teacher_id) ON DELETE RESTRICT;


--
-- TOC entry 5073 (class 2606 OID 17409)
-- Name: reports reports_reporter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- TOC entry 5074 (class 2606 OID 18027)
-- Name: reports reports_reviewed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reviewed_by_user_id_fkey FOREIGN KEY (reviewed_by_user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- TOC entry 5064 (class 2606 OID 17657)
-- Name: resources resource_course_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resource_course_code_fkey FOREIGN KEY (course_code) REFERENCES public.courses(course_code) ON DELETE RESTRICT;


--
-- TOC entry 5070 (class 2606 OID 17394)
-- Name: resource_downloads resource_downloads_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_downloads
    ADD CONSTRAINT resource_downloads_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(res_id) ON DELETE CASCADE;


--
-- TOC entry 5071 (class 2606 OID 17399)
-- Name: resource_downloads resource_downloads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource_downloads
    ADD CONSTRAINT resource_downloads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- TOC entry 5065 (class 2606 OID 17414)
-- Name: resources resource_parent_res_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resource_parent_res_id_fkey FOREIGN KEY (parent_res_id) REFERENCES public.resources(res_id) ON DELETE SET NULL;


--
-- TOC entry 5066 (class 2606 OID 17662)
-- Name: resources resource_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resource_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE RESTRICT;


--
-- TOC entry 5067 (class 2606 OID 18022)
-- Name: resources resources_moderated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_moderated_by_user_id_fkey FOREIGN KEY (moderated_by_user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- TOC entry 5068 (class 2606 OID 17384)
-- Name: resourcevote resourcevote_res_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resourcevote
    ADD CONSTRAINT resourcevote_res_id_fkey FOREIGN KEY (res_id) REFERENCES public.resources(res_id) ON DELETE CASCADE;


--
-- TOC entry 5069 (class 2606 OID 17389)
-- Name: resourcevote resourcevote_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resourcevote
    ADD CONSTRAINT resourcevote_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- TOC entry 5051 (class 2606 OID 17627)
-- Name: teachers teacher_dept_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teacher_dept_code_fkey FOREIGN KEY (dept_code) REFERENCES public.departments(dept_code) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 5054 (class 2606 OID 17642)
-- Name: topics topic_course_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topic_course_code_fkey FOREIGN KEY (course_code) REFERENCES public.courses(course_code) ON DELETE RESTRICT;


--
-- TOC entry 5062 (class 2606 OID 17923)
-- Name: user_course_performance ucp_curriculum_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_course_performance
    ADD CONSTRAINT ucp_curriculum_course_id_fkey FOREIGN KEY (curriculum_course_id) REFERENCES public.curriculum_courses(curriculum_course_id) ON DELETE RESTRICT;


--
-- TOC entry 5063 (class 2606 OID 17359)
-- Name: user_course_performance ucp_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_course_performance
    ADD CONSTRAINT ucp_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE RESTRICT;


--
-- TOC entry 5251 (class 0 OID 0)
-- Dependencies: 5
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


-- Completed on 2026-09-11 16:00:19

--
-- PostgreSQL database dump complete
--

\unrestrict oLiXXhNFLUqRg3zsipxZlBJJt8PeiPkXzkIAc0UbGLvydzRC0LaXy42QIgbkfmt

