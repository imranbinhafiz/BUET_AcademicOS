-- Fresh-install bootstrap only.
-- Run this AFTER server/schema.sql and BEFORE 003_add_cse_curriculum_performance.sql.
-- Existing databases that already have department data do not need this file.

INSERT INTO public.departments (dept_code, dept_name)
VALUES
    ('2', 'Civil Engineering'),
    ('3', 'Industrial & Production Engineering'),
    ('4', 'Mechanical Engineering'),
    ('5', 'Computer Science & Engineering'),
    ('6', 'Electrical & Electronic Engineering')
ON CONFLICT (dept_code) DO NOTHING;
