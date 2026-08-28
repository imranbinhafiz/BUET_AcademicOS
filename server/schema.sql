-- PostgreSQL Schema for BUET Academicos
-- Save as schema.sql and execute via:
-- psql -U postgres -d buet_academicos -f schema.sql

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';
SET default_table_access_method = heap;

--
-- Function: calculate_resource_version
--
CREATE OR REPLACE FUNCTION public.calculate_resource_version() RETURNS trigger
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

--
-- Table: departments
--
CREATE TABLE public.departments (
    dept_name character varying(255) NOT NULL,
    dept_code character varying(10) NOT NULL
);

--
-- Table: users
--
CREATE TABLE public.users (
    user_id integer NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    batch character varying(20),
    role character varying(50) DEFAULT 'student'::character varying,
    password character varying(255) NOT NULL,
    dept_code character varying(10),
    bio text,
    avatar_url text
);

CREATE SEQUENCE public."User_user_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public."User_user_id_seq" OWNED BY public.users.user_id;

--
-- Table: courses
--
CREATE TABLE public.courses (
    course_code character varying(20) NOT NULL,
    title character varying(255) NOT NULL,
    credits numeric(3,2) NOT NULL,
    level_term character varying(20),
    dept_code character varying(10)
);

--
-- Table: teachers
--
CREATE TABLE public.teachers (
    teacher_id integer NOT NULL,
    name character varying(255) NOT NULL,
    designation character varying(100),
    dept_code character varying(10)
);

CREATE SEQUENCE public.teacher_teacher_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.teacher_teacher_id_seq OWNED BY public.teachers.teacher_id;

--
-- Table: offering
--
CREATE TABLE public.offering (
    offering_id integer NOT NULL,
    semester character varying(50) NOT NULL,
    course_code character varying(20),
    teacher_id integer
);

CREATE SEQUENCE public.offering_offering_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.offering_offering_id_seq OWNED BY public.offering.offering_id;

--
-- Table: topics
--
CREATE TABLE public.topics (
    topic_id integer NOT NULL,
    name character varying(255) NOT NULL,
    course_code character varying(20)
);

CREATE SEQUENCE public.topic_topic_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.topic_topic_id_seq OWNED BY public.topics.topic_id;

--
-- Table: coursereview
--
CREATE TABLE public.coursereview (
    review_id integer NOT NULL,
    difficulty integer,
    prereq_use integer,
    comment text,
    user_id integer,
    course_code character varying(20),
    offering_id integer,
    CONSTRAINT coursereview_difficulty_check CHECK (((difficulty >= 1) AND (difficulty <= 5))),
    CONSTRAINT coursereview_prereq_use_check CHECK (((prereq_use >= 1) AND (prereq_use <= 5)))
);

CREATE SEQUENCE public.coursereview_review_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.coursereview_review_id_seq OWNED BY public.coursereview.review_id;

--
-- Table: coursereviewvote
--
CREATE TABLE public.coursereviewvote (
    user_id integer NOT NULL,
    review_id integer NOT NULL,
    value integer,
    CONSTRAINT coursereviewvote_value_check CHECK ((value = ANY (ARRAY['-1'::integer, 1])))
);

--
-- Table: resources
--
CREATE TABLE public.resources (
    res_id integer NOT NULL,
    title character varying(255) NOT NULL,
    type character varying(50) NOT NULL,
    version integer DEFAULT 1,
    parent_res_id integer,
    user_id integer,
    course_code character varying(20),
    file_path text NOT NULL,
    CONSTRAINT chk_resource_type CHECK (((type)::text = ANY ((ARRAY['Slides'::character varying, 'Previous Year Questions'::character varying, 'Notes'::character varying, 'Lab reports'::character varying])::text[])))
);

CREATE SEQUENCE public.resource_res_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.resource_res_id_seq OWNED BY public.resources.res_id;

--
-- Table: resourcevote
--
CREATE TABLE public.resourcevote (
    user_id integer NOT NULL,
    res_id integer NOT NULL,
    value integer,
    CONSTRAINT resourcevote_value_check CHECK ((value = ANY (ARRAY['-1'::integer, 1])))
);

--
-- Table: resource_downloads
--
CREATE TABLE public.resource_downloads (
    id integer NOT NULL,
    resource_id integer,
    user_id integer,
    downloaded_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE public.resource_downloads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.resource_downloads_id_seq OWNED BY public.resource_downloads.id;

--
-- Table: notifications
--
CREATE TABLE public.notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id integer NOT NULL,
    type character varying(50) NOT NULL,
    message text NOT NULL,
    related_id integer,
    is_read boolean NOT NULL DEFAULT FALSE,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

--
-- Table: reports
--
CREATE TABLE public.reports (
    report_id SERIAL PRIMARY KEY,
    reporter_user_id integer NOT NULL,
    target_type character varying(20) NOT NULL,
    target_id integer NOT NULL,
    reason text NOT NULL,
    status character varying(20) NOT NULL DEFAULT 'pending',
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT reports_target_type_check CHECK (((target_type)::text = ANY ((ARRAY['resource'::character varying, 'coursereview'::character varying])::text[]))),
    CONSTRAINT reports_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'reviewed'::character varying, 'dismissed'::character varying])::text[])))
);

--
-- Column defaults (sequence links)
--
ALTER TABLE ONLY public.users ALTER COLUMN user_id SET DEFAULT nextval('public."User_user_id_seq"'::regclass);
ALTER TABLE ONLY public.teachers ALTER COLUMN teacher_id SET DEFAULT nextval('public.teacher_teacher_id_seq'::regclass);
ALTER TABLE ONLY public.offering ALTER COLUMN offering_id SET DEFAULT nextval('public.offering_offering_id_seq'::regclass);
ALTER TABLE ONLY public.topics ALTER COLUMN topic_id SET DEFAULT nextval('public.topic_topic_id_seq'::regclass);
ALTER TABLE ONLY public.coursereview ALTER COLUMN review_id SET DEFAULT nextval('public.coursereview_review_id_seq'::regclass);
ALTER TABLE ONLY public.resources ALTER COLUMN res_id SET DEFAULT nextval('public.resource_res_id_seq'::regclass);
ALTER TABLE ONLY public.resource_downloads ALTER COLUMN id SET DEFAULT nextval('public.resource_downloads_id_seq'::regclass);

--
-- Primary Keys & Unique Constraints
--
ALTER TABLE ONLY public.departments ADD CONSTRAINT department_pkey PRIMARY KEY (dept_code);
ALTER TABLE ONLY public.users ADD CONSTRAINT "User_pkey" PRIMARY KEY (user_id);
ALTER TABLE ONLY public.users ADD CONSTRAINT "User_email_key" UNIQUE (email);
ALTER TABLE ONLY public.courses ADD CONSTRAINT course_pkey PRIMARY KEY (course_code);
ALTER TABLE ONLY public.teachers ADD CONSTRAINT teacher_pkey PRIMARY KEY (teacher_id);
ALTER TABLE ONLY public.offering ADD CONSTRAINT offering_pkey PRIMARY KEY (offering_id);
ALTER TABLE ONLY public.topics ADD CONSTRAINT topic_pkey PRIMARY KEY (topic_id);
ALTER TABLE ONLY public.coursereview ADD CONSTRAINT coursereview_pkey PRIMARY KEY (review_id);
ALTER TABLE ONLY public.coursereviewvote ADD CONSTRAINT coursereviewvote_pkey PRIMARY KEY (user_id, review_id);
ALTER TABLE ONLY public.resources ADD CONSTRAINT resource_pkey PRIMARY KEY (res_id);
ALTER TABLE ONLY public.resourcevote ADD CONSTRAINT resourcevote_pkey PRIMARY KEY (user_id, res_id);
ALTER TABLE ONLY public.resource_downloads ADD CONSTRAINT resource_downloads_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.resource_downloads ADD CONSTRAINT unique_user_resource_download UNIQUE (resource_id, user_id);
ALTER TABLE ONLY public.departments ADD CONSTRAINT department_dept_code_key UNIQUE (dept_code);

--
-- Foreign Keys
--
ALTER TABLE ONLY public.users ADD CONSTRAINT "User_dept_code_fkey" FOREIGN KEY (dept_code) REFERENCES public.departments(dept_code) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY public.courses ADD CONSTRAINT course_dept_code_fkey FOREIGN KEY (dept_code) REFERENCES public.departments(dept_code) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY public.teachers ADD CONSTRAINT teacher_dept_code_fkey FOREIGN KEY (dept_code) REFERENCES public.departments(dept_code) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY public.offering ADD CONSTRAINT offering_course_code_fkey FOREIGN KEY (course_code) REFERENCES public.courses(course_code) ON DELETE CASCADE;
ALTER TABLE ONLY public.offering ADD CONSTRAINT offering_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(teacher_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.topics ADD CONSTRAINT topic_course_code_fkey FOREIGN KEY (course_code) REFERENCES public.courses(course_code) ON DELETE CASCADE;
ALTER TABLE ONLY public.coursereview ADD CONSTRAINT coursereview_course_code_fkey FOREIGN KEY (course_code) REFERENCES public.courses(course_code) ON DELETE CASCADE;
ALTER TABLE ONLY public.coursereview ADD CONSTRAINT coursereview_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES public.offering(offering_id) ON DELETE SET NULL;
ALTER TABLE ONLY public.coursereview ADD CONSTRAINT coursereview_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.coursereviewvote ADD CONSTRAINT coursereviewvote_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.coursereview(review_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.coursereviewvote ADD CONSTRAINT coursereviewvote_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.resources ADD CONSTRAINT resource_course_code_fkey FOREIGN KEY (course_code) REFERENCES public.courses(course_code) ON DELETE CASCADE;
ALTER TABLE ONLY public.resources ADD CONSTRAINT resource_parent_res_id_fkey FOREIGN KEY (parent_res_id) REFERENCES public.resources(res_id) ON DELETE SET NULL;
ALTER TABLE ONLY public.resources ADD CONSTRAINT resource_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.resourcevote ADD CONSTRAINT resourcevote_res_id_fkey FOREIGN KEY (res_id) REFERENCES public.resources(res_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.resourcevote ADD CONSTRAINT resourcevote_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.resource_downloads ADD CONSTRAINT resource_downloads_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(res_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.resource_downloads ADD CONSTRAINT resource_downloads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reports ADD CONSTRAINT reports_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

--
-- Foreign Key Performance Indexes
--
CREATE INDEX idx_users_dept_code ON public.users(dept_code);
CREATE INDEX idx_courses_dept_code ON public.courses(dept_code);
CREATE INDEX idx_teachers_dept_code ON public.teachers(dept_code);
CREATE INDEX idx_offering_course_code ON public.offering(course_code);
CREATE INDEX idx_offering_teacher_id ON public.offering(teacher_id);
CREATE INDEX idx_topics_course_code ON public.topics(course_code);
CREATE INDEX idx_coursereview_course_code ON public.coursereview(course_code);
CREATE INDEX idx_coursereview_user_id ON public.coursereview(user_id);
CREATE INDEX idx_coursereview_offering_id ON public.coursereview(offering_id);
CREATE INDEX idx_resources_course_code ON public.resources(course_code);
CREATE INDEX idx_resources_user_id ON public.resources(user_id);
CREATE INDEX idx_resources_parent_res_id ON public.resources(parent_res_id);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);

--
-- Triggers
--
CREATE TRIGGER trg_set_resource_version
    BEFORE INSERT ON public.resources
    FOR EACH ROW EXECUTE FUNCTION public.calculate_resource_version();