import React from 'react';
import { NavLink } from 'react-router-dom';
import './sidebar.css';

export default function Sidebar() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const deptCode = user.dept_code || '6';

  return (
    <aside className="theme-sidebar">
      <div className="sidebar-brand-container">
        <span className="brand-badge-red">BUET</span>
        <h2 className="brand-title-text">ACADEMICOS</h2>
      </div>

      <nav className="sidebar-nav-list">
        <NavLink to="/" className={({ isActive }) => isActive ? 'nav-card active' : 'nav-card'}>
          <span className="nav-icon">✦</span>
          <span className="nav-label">HOME</span>
        </NavLink>

        <NavLink to="/resources" className={({ isActive }) => isActive ? 'nav-card active' : 'nav-card'}>
          <span className="nav-icon">📁</span>
          <span className="nav-label">RESOURCES</span>
        </NavLink>

        <NavLink to="/course-reviews" className={({ isActive }) => isActive ? 'nav-card active' : 'nav-card'}>
          <span className="nav-icon">📝</span>
          <span className="nav-label">COURSE REVIEWS</span>
        </NavLink>

        <NavLink to="/teacher-reviews" className={({ isActive }) => isActive ? 'nav-card active' : 'nav-card'}>
          <span className="nav-icon">🎓</span>
          <span className="nav-label">TEACHER REVIEWS</span>
        </NavLink>

        <NavLink to="/top-contributors" className={({ isActive }) => isActive ? 'nav-card active' : 'nav-card'}>
          <span className="nav-icon">👑</span>
          <span className="nav-label">TOP CONTRIBUTORS</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer-tag">
        <span>User //{role}</span>
      </div>
    </aside>
  );
}