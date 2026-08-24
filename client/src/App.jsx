import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Resources from './pages/Resources';
import CourseReviews from './pages/CourseReviews';
import TeacherReviews from './pages/TeacherReviews';
import TopContributors from './pages/TopContributors';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Auth isSignup={false} />} />
      <Route path="/register" element={<Auth isSignup={true} />} />
      <Route path="/resources" element={<Resources />} />
      <Route path="/course-reviews" element={<CourseReviews />} />
      <Route path="/teacher-reviews" element={<TeacherReviews />} />
      <Route path="/top-contributors" element={<TopContributors />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}