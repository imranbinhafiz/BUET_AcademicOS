import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation, Outlet } from 'react-router-dom';
import '../pages/Home.css';
import { apiUrl, assetUrl } from '../api';

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

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const refreshUnreadCount = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setUnreadNotifications(0);
      return;
    }

    try {
      const response = await fetch(apiUrl('/notifications/unread-count'), {
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
    const syncCurrentUser = async () => {
      const storedUser = localStorage.getItem('user');
      const token = localStorage.getItem('token');

      if (!storedUser || !token) {
        setUser(null);
        setUnreadNotifications(0);
        return;
      }

      try {
        const cachedUser = JSON.parse(storedUser);
        // Render instantly from login data, then replace an old avatar path
        // with the current profile value stored in the database.
        setUser(cachedUser);
        if (cachedUser?.user_id) {
          const response = await fetch(apiUrl(`/profile/${cachedUser.user_id}`));
          if (response.ok) {
            const latestProfile = await response.json();
            const refreshedUser = { ...cachedUser, avatar_path: latestProfile.avatar_path || null, name: latestProfile.name || cachedUser.name };
            localStorage.setItem('user', JSON.stringify(refreshedUser));
            setUser(refreshedUser);
          }
        }
        refreshUnreadCount();
      } catch {
        setUser(null);
        setUnreadNotifications(0);
      }
    };

    syncCurrentUser();
  }, [refreshUnreadCount]);

  useEffect(() => {
    window.addEventListener('notifications-changed', refreshUnreadCount);
    return () => window.removeEventListener('notifications-changed', refreshUnreadCount);
  }, [refreshUnreadCount]);

  useEffect(() => {
    const refreshUser = async () => {
      const storedUser = localStorage.getItem('user');
      if (!storedUser) return;
      try {
        const cachedUser = JSON.parse(storedUser);
        setUser(cachedUser);
        if (!cachedUser?.user_id) return;
        const response = await fetch(apiUrl(`/profile/${cachedUser.user_id}`));
        if (!response.ok) return;
        const latestProfile = await response.json();
        const refreshedUser = { ...cachedUser, avatar_path: latestProfile.avatar_path || null, name: latestProfile.name || cachedUser.name };
        localStorage.setItem('user', JSON.stringify(refreshedUser));
        setUser(refreshedUser);
      } catch {
        // The profile page has already shown any useful upload error. Keep the
        // existing top-bar identity instead of clearing a valid login session.
      }
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

  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  return (
    <div className="p5-layout">
      {/* SIDEBAR */}
      {mobileNavOpen && <button className="p5-nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`p5-sidebar ${mobileNavOpen ? 'open' : ''}`}>
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

        {/* BOTTOM LEFT FOOTER WITH LOGOUT */}
        <div className="p5-sidebar-footer">
          <span className="p5-dept-tag">
            User // {user ? user.role.toUpperCase() || 'N/A' : 'GUEST'}
          </span>
          {user && (
            <button className="p5-logout-btn" onClick={handleLogout}>
              LOGOUT
            </button>
          )}
        </div>
      </aside>

      {/* MAIN WRAPPER */}
      <div className="p5-main-wrapper">
        <header className="p5-topbar">
          <div className="p5-topbar-left">
            <button className="p5-menu-btn" type="button" aria-label="Open navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(true)}><span /><span /></button>
            <span className="p5-page-indicator">{pageTitle}</span>
          </div>

          <div className="p5-topbar-right">
            {user ? (
              <>
                <button
                  type="button"
                  className="p5-notification-box"
                  title="Notifications"
                  aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`}
                  onClick={() => navigate('/notifications')}
                >
                  <span className="p5-notification-icon">🔔</span>
                  {unreadNotifications > 0 && (
                    <span className="p5-notification-badge">{unreadNotifications}</span>
                  )}
                </button>

                <button
                  type="button"
                  className="p5-profile-widget" 
                  onClick={() => navigate(user?.user_id ? `/profile/${user.user_id}` : '/login')}
                  title="View Profile"
                >
                  <div className="p5-avatar-frame">
                    <img
                      src={user.avatar_path ? assetUrl(user.avatar_path) : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=b91522&color=fff&bold=true`}
                      alt="User Avatar"
                      className="p5-avatar-img"
                    />
                  </div>
                  <div className="p5-user-info">
                    <span className="p5-user-name">{user.name.toUpperCase()}</span>
                    <span className="p5-user-role">{user.role ? user.role.toUpperCase() : 'STUDENT'}</span>
                  </div>
                </button>
              </>
            ) : (
              <Link to="/login" className="p5-topbar-login-btn">
                LOG IN
              </Link>
            )}
          </div>
        </header>

        <main className="p5-content">
          <Outlet context={{ user, unreadNotifications, refreshUnreadCount }} />
        </main>
      </div>
    </div>
  );
}
