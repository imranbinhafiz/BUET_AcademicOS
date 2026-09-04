import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './topbar.css';

export default function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const [showDropdown, setShowDropdown] = useState(false);

  const getBreadcrumb = (path) => {
    switch (path) {
      case '/': return 'DASHBOARD';
      case '/resources': return 'ACADEMIC_RESOURCES';
      case '/course-reviews': return 'COURSE_REVIEWS';
      case '/teacher-reviews': return 'TEACHER_REVIEWS';
      case '/top-contributors': return 'TOP_CONTRIBUTORS';
      default: return 'SYSTEM';
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const getInitials = (name) => {
    if (!name) return 'HE';
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <header className="theme-topbar">
      <div className="topbar-breadcrumb">
        <span className="breadcrumb-red">SYSTEM // </span>
        <span className="breadcrumb-title">{getBreadcrumb(location.pathname)}</span>
      </div>

      <div className="topbar-right-actions">
        {/* Notification Icon Box */}
        <div className="notif-square-btn">
          <span>🔔</span>
          <span className="notif-red-badge">3</span>
        </div>

        {/* User Badge / Logout Dropdown */}
        {user ? (
          <div className="user-profile-container">
            <div className="user-badge-box" onClick={() => setShowDropdown(!showDropdown)}>
              <div className="user-avatar-red">{getInitials(user.name)}</div>
              <div className="user-text-meta">
                <span className="user-name-label">{(user.name || 'HEII').toUpperCase()}</span>
                <span className="user-role-subtext">{(user.role || 'STUDENT').toUpperCase()}</span>
              </div>
            </div>

            {showDropdown && (
              <div className="profile-dropdown-menu">
                <button onClick={handleLogout} className="logout-action-btn">
                  LOGOUT
                </button>
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => navigate('/login')} className="topbar-login-red-btn">
            LOG IN
          </button>
        )}
      </div>
    </header>
  );
}