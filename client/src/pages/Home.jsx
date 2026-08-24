import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import './Home.css';

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(3);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse user data', e);
        setUser(null);
      }
    } else {
      setUser(null);
    }
  }, []);

  const navItems = [
    { label: 'HOME', path: '/', icon: '✦' },
    { label: 'RESOURCES', path: '/resources', icon: '📁' },
    { label: 'COURSE REVIEWS', path: '/course-reviews', icon: '📝' },
    { label: 'TEACHER REVIEWS', path: '/teacher-reviews', icon: '🎓' },
    { label: 'TOP CONTRIBUTORS', path: '/top-contributors', icon: '👑' }
  ];

  return (
    <div className="p5-layout">
      {/* LEFT NAVIGATION BAR */}
      <aside className="p5-sidebar">
        <div className="p5-sidebar-header">
          <span className="p5-brand-sub">BUET</span>
          <h1 className="p5-brand-title">ACADEMICOS</h1>
        </div>

        <nav className="p5-nav">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.label}
                to={item.path}
                className={`p5-nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="p5-nav-icon">{item.icon}</span>
                <span className="p5-nav-text">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p5-sidebar-footer">
          <span className="p5-dept-tag">
            DEPT // {user ? user.dept_code || 'N/A' : 'GUEST'}
          </span>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="p5-main-wrapper">
        {/* TOP HEADER */}
        <header className="p5-topbar">
          <div className="p5-topbar-left">
            <span className="p5-page-indicator">SYSTEM // DASHBOARD</span>
          </div>

          <div className="p5-topbar-right">
            {user ? (
              <>
                {/* NOTIFICATION BADGE */}
                <div className="p5-notification-box" title="Notifications">
                  <span className="p5-notification-icon">🔔</span>
                  {unreadNotifications > 0 && (
                    <span className="p5-notification-badge">{unreadNotifications}</span>
                  )}
                </div>

                {/* CLICKABLE USER PROFILE */}
                <div 
                  className="p5-profile-widget" 
                  onClick={() => navigate('/profile')}
                  title="View Profile"
                >
                  <div className="p5-avatar-frame">
                    <img
                      src={user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=b91522&color=fff&bold=true`}
                      alt="User Avatar"
                      className="p5-avatar-img"
                    />
                  </div>
                  <div className="p5-user-info">
                    <span className="p5-user-name">{user.name.toUpperCase()}</span>
                    <span className="p5-user-role">{user.role ? user.role.toUpperCase() : 'STUDENT'}</span>
                  </div>
                </div>
              </>
            ) : (
              /* LOGIN BUTTON WHEN LOGGED OUT */
              <Link to="/login" className="p5-topbar-login-btn">
                LOG IN
              </Link>
            )}
          </div>
        </header>

        {/* MAIN BODY CONTENT */}
        <main className="p5-content">
          <div className="p5-welcome-card">
            <div className="p5-welcome-banner">
              <h2>WELCOME {user ? `BACK, ${user.name.toUpperCase()}` : 'TO BUET ACADEMICOS'}</h2>
              <p>SYSTEM STATUS: READY // SELECT A MODULE FROM THE NAVIGATION</p>
            </div>
          </div>

          <div className="p5-grid">
            <div className="p5-grid-card">
              <h3>RECENT RESOURCES</h3>
              <p>Access notes, past papers, and version-controlled course materials.</p>
              <Link to="/resources" className="p5-card-btn">EXPLORE →</Link>
            </div>

            <div className="p5-grid-card">
              <h3>COURSE SURVIVAL</h3>
              <p>Check difficulty metrics and prerequisite advice before registering.</p>
              <Link to="/course-reviews" className="p5-card-btn">REVIEWS →</Link>
            </div>

            <div className="p5-grid-card">
              <h3>LEADERBOARD</h3>
              <p>Top contributors providing high-value academic resources this semester.</p>
              <Link to="/top-contributors" className="p5-card-btn">VIEW →</Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}