# BUET AcademicOS

> A full-stack academic management platform built for BUET students — centralizing course resources, peer reviews, performance tracking, and community features in one place.

---

## Overview

**BUET AcademicOS** is a collaborative web application designed to support the academic life of Bangladesh University of Engineering and Technology (BUET) students. It provides a structured space where students can share study materials, write and read course reviews, track their academic performance term by term, and stay informed through real-time notifications — all within a role-based, moderated environment.

---

## Features

### 📚 Resource Hub
- Upload and download course materials — **Slides, Previous Year Questions, Notes, and Lab Reports**
- Files supported: **PDF** and **ZIP** only
- Versioned resources — updated uploads are linked to their parent, maintaining a full version history
- Community upvoting/downvoting to surface the most useful materials
- Download tracking per user per resource

### 📝 Course Reviews
- Write detailed reviews for any course with **difficulty** and **prerequisite usefulness** ratings (1–5 scale)
- Attach files to reviews (e.g., sample papers, annotated notes)
- Flag specific course **topics** as weak areas or danger zones directly within a review
- Upvote/downvote peer reviews to rank helpfulness
- Filter and browse reviews by course, offering, teacher, and semester

### 📊 Performance Tracker
- Log personal **grade points** per course per term (using official BUET grade point values)
- View term-wise GPA summaries and cumulative academic progress
- **Batch-level analytics** — anonymised cohort statistics (min. 5 students) showing grade distribution across a batch and department, so students can contextualise their standing without exposing individual data

### 🔔 Notifications
- Real-time activity notifications triggered by votes on your resources and reviews, moderation actions, and other platform events
- Mark notifications as read; unread count displayed in the navbar

### 👤 User Profiles
- Customisable profile with bio, avatar upload, and department/batch info
- Public profile pages to explore another user's contributions
- Top Contributors leaderboard highlighting the most active resource sharers

### 🛡️ Admin & Moderation
- **Admin** role can manage batch progress data and view platform-wide analytics
- **Moderator** role can review community-reported content (resources and course reviews) and take action (approve / dismiss reports)
- Content reporting system — any user can flag a resource or review with a reason; reports have `pending → reviewed / dismissed` lifecycle
- Soft-deletion for users: accounts with authored content are never hard-deleted, preserving academic data integrity

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, React Router v6, Vite |
| **Backend** | Node.js, Express 5 |
| **Database** | PostgreSQL |
| **Auth** | JWT (JSON Web Tokens), bcrypt password hashing |
| **File Uploads** | Multer (disk storage) |
| **Validation** | Joi |
| **HTTP Client** | Axios |

---


## ERD

The entity-relationship diagram for the full schema is available as [`updated_erd.svg`](./updated_erd.svg) in the project root.

---


