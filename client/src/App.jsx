import React from 'react'
import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout';
import Home from './pages/Home';
import Auth from './pages/Auth.jsx';
import Resources from './pages/Resources';
import CourseReviews from './pages/CourseReviews';
import TeacherReviews from './pages/TeacherReviews';
import TopContributors from './pages/TopContributors';

export default function App() {
  return (
    <Routes>
        <Route path="/login" element={<Auth isSignup={false}/>} />
        <Route path="/register" element={<Auth isSignup={true}/>} />

      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/resources" element={<Resources />} />
        <Route path="/course-reviews" element={<CourseReviews />} />
        <Route path="/teacher-reviews" element={<TeacherReviews />} />
        <Route path="/top-contributors" element={<TopContributors />} />
      </Route>
    </Routes>
  );
}