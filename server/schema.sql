CREATE DATABASE buet_academicos;

-- Core Academic Catalog Entities
CREATE TABLE Department (
    dept_id SERIAL PRIMARY KEY,
    dept_name VARCHAR(255) NOT NULL,
    dept_code VARCHAR(10) UNIQUE NOT NULL
);

CREATE TABLE Teacher (
    teacher_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    designation VARCHAR(100),
    dept_id INT REFERENCES Department(dept_id) ON DELETE CASCADE
);

CREATE TABLE Course (
    course_code VARCHAR(20) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    credits NUMERIC(3, 2) NOT NULL,
    level_term VARCHAR(20),
    dept_id INT REFERENCES Department(dept_id) ON DELETE CASCADE
);

CREATE TABLE Offering (
    offering_id SERIAL PRIMARY KEY,
    semester VARCHAR(50) NOT NULL,
    course_code VARCHAR(20) REFERENCES Course(course_code) ON DELETE CASCADE,
    teacher_id INT REFERENCES Teacher(teacher_id) ON DELETE CASCADE
);

CREATE TABLE Topic (
    topic_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    course_code VARCHAR(20) REFERENCES Course(course_code) ON DELETE CASCADE
);

-- Community Entities
CREATE TABLE "User" (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    batch VARCHAR(20),
    role VARCHAR(50) DEFAULT 'student',
    dept_id INT REFERENCES Department(dept_id) ON DELETE SET NULL
);

CREATE TABLE CourseReview (
    review_id SERIAL PRIMARY KEY,
    difficulty INT CHECK (difficulty BETWEEN 1 AND 5),
    prereq_use INT CHECK (prereq_use BETWEEN 1 AND 5),
    comment TEXT,
    user_id INT REFERENCES "User"(user_id) ON DELETE CASCADE,
    course_code VARCHAR(20) REFERENCES Course(course_code) ON DELETE CASCADE
);

CREATE TABLE TeacherReview (
    review_id SERIAL PRIMARY KEY,
    comment TEXT,
    user_id INT REFERENCES "User"(user_id) ON DELETE CASCADE,
    offering_id INT REFERENCES Offering(offering_id) ON DELETE CASCADE
);

CREATE TABLE Resource (
    res_id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    version INT DEFAULT 1,
    parent_res_id INT REFERENCES Resource(res_id) ON DELETE SET NULL,
    user_id INT REFERENCES "User"(user_id) ON DELETE CASCADE,
    course_code VARCHAR(20) REFERENCES Course(course_code) ON DELETE CASCADE
);

-- Upvote/Vote Junction Tables
CREATE TABLE CourseReviewVote (
    user_id INT REFERENCES "User"(user_id) ON DELETE CASCADE,
    review_id INT REFERENCES CourseReview(review_id) ON DELETE CASCADE,
    value INT CHECK (value IN (-1, 1)),
    PRIMARY KEY (user_id, review_id)
);

CREATE TABLE TeacherReviewVote (
    user_id INT REFERENCES "User"(user_id) ON DELETE CASCADE,
    review_id INT REFERENCES TeacherReview(review_id) ON DELETE CASCADE,
    value INT CHECK (value IN (-1, 1)),
    PRIMARY KEY (user_id, review_id)
);

CREATE TABLE ResourceVote (
    user_id INT REFERENCES "User"(user_id) ON DELETE CASCADE,
    res_id INT REFERENCES Resource(res_id) ON DELETE CASCADE,
    value INT CHECK (value IN (-1, 1)),
    PRIMARY KEY (user_id, res_id)
);