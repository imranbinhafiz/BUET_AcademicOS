import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation, Outlet } from 'react-router-dom';
import './Layout.css';  

const BREADCRUMBS = {
  '/': 'SYSTEM // DASHBOARD',
  '/resources': 'SYSTEM // ACADEMIC_RESOURCES',
  '/course-reviews': 'SYSTEM // COURSE_REVIEWS',
  '/top-contributors': 'SYSTEM // TOP_CONTRIBUTORS',
  '/performance': 'SYSTEM // PERFORMANCE',
  '/notifications': 'SYSTEM // NOTIFICATIONS',
  '/admin/batch-progress': 'SYSTEM // BATCH_CONTROL',
  '/admin/moderation': 'SYSTEM // MODERATION',
  '/profile': 'SYSTEM // MY_PROFILE'
};

const SERVER_ORIGIN = 'http://localhost:5000';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setUnreadNotifications(0);
      return;
    }

    try {
      const response = await fetch('http://localhost:5000/api/notifications/unread-count', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Could not load notification count.');
      const data = await response.json();
      setUnreadNotifications(Number(data.unread_count) || 0);
    } catch (err) {
      // A stale token or an offline server must not leave the old fake badge
      // visible. The notifications page will show a useful error if opened.
      setUnreadNotifications(0);
    }
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser));
        refreshUnreadCount();
      } catch (e) {
        setUser(null);
        setUnreadNotifications(0);
      }
    } else {
      setUser(null);
      setUnreadNotifications(0);
    }
  }, [refreshUnreadCount]);

  useEffect(() => {
    window.addEventListener('notifications-changed', refreshUnreadCount);
    return () => window.removeEventListener('notifications-changed', refreshUnreadCount);
  }, [refreshUnreadCount]);

  useEffect(() => {
    const refreshUser = () => {
      const storedUser = localStorage.getItem('user');
      if (storedUser) setUser(JSON.parse(storedUser));
    };
    window.addEventListener('profile-changed', refreshUser);
    return () => window.removeEventListener('profile-changed', refreshUser);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshUnreadCount();
    };
    const intervalId = window.setInterval(refreshUnreadCount, 20000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshUnreadCount, user]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
    setUnreadNotifications(0);
    navigate('/login');
  };

  // Dynamic Navigation Items
  const navItems = [
    { label: 'HOME', path: '/', icon: '✦' },
    { label: 'RESOURCES', path: '/resources', icon: '📁' },
    { label: 'COURSE REVIEWS', path: '/course-reviews', icon: '📝' },
    { label: 'PERFORMANCE', path: '/performance', icon: '⚡' },
    { label: 'TOP CONTRIBUTORS', path: '/top-contributors', icon: '👑' },
    ...(user && user.role && user.role.toLowerCase() === 'admin'
      ? [
        { label: 'BATCH CONTROL', path: '/admin/batch-progress', icon: '⚙' },
        { label: 'MODERATION', path: '/admin/moderation', icon: '🛡' }
      ]
      : [])
  ];

  const pageTitle = BREADCRUMBS[location.pathname] || 'SYSTEM // DASHBOARD';

  return (
    <div className="lay-layout">
      {/* SIDEBAR */}
      <aside className="lay-sidebar">
        <div className="lay-sidebar-header">
          <span className="lay-brand-sub">BUET</span>
          <h1 className="lay-brand-title">ACADEMICOS</h1>
        </div>

        <nav className="lay-nav">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.label}
                to={item.path}
                className={`lay-nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="lay-nav-icon">{item.icon}</span>
                <span className="lay-nav-text">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* BOTTOM LEFT FOOTER WITH LOGOUT */}
        <div className="lay-sidebar-footer">
          <span className="lay-dept-tag">
            User // {user ? user.role.toUpperCase() || 'N/A' : 'GUEST'}
          </span>
          {user && (
            <button className="lay-logout-btn" onClick={handleLogout}>
              LOGOUT
            </button>
          )}
        </div>
      </aside>

      {/* MAIN WRAPPER */}
      <div className="lay-main-wrapper">
        <header className="lay-topbar">
          <div className="lay-topbar-left">
            <span className="lay-page-indicator">{pageTitle}</span>
          </div>

          <div className="lay-topbar-right">
            {user ? (
              <>
                <button
                  type="button"
                  className="lay-notification-box"
                  title="Notifications"
                  aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`}
                  onClick={() => navigate('/notifications')}
                >
                  <span className="lay-notification-icon">🔔</span>
                  {unreadNotifications > 0 && (
                    <span className="lay-notification-badge">{unreadNotifications}</span>
                  )}
                </button>

                <div 
                  className="lay-profile-widget" 
                  onClick={() => navigate(user?.user_id ? `/profile/${user.user_id}` : '/login')}
                  title="View Profile"
                >
                  <div className="lay-avatar-frame">
                    <img
                      src={user.avatar_path ? `${SERVER_ORIGIN}${user.avatar_path}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=b91522&color=fff&bold=true`}
                      alt="User Avatar"
                      className="lay-avatar-img"
                    />
                  </div>
                  <div className="lay-user-info">
                    <span className="lay-user-name">{user.name.toUpperCase()}</span>
                    <span className="lay-user-role">{user.role ? user.role.toUpperCase() : 'STUDENT'}</span>
                  </div>
                </div>
              </>
            ) : (
              <Link to="/login" className="lay-topbar-login-btn">
                LOG IN
              </Link>
            )}
          </div>
        </header>

        <main className="lay-content">
          <div key={location.pathname} className="lay-route-transition">
            <Outlet context={{ user, unreadNotifications, refreshUnreadCount }} />
          </div>
        </main>
      </div>
    </div>
  );
}
