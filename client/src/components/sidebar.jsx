import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Sidebar() {
  const location = useLocation();
  const [user, setUser] = useState(null);

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('user');
      const token = localStorage.getItem('token');
      if (storedUser && token) {
        setUser(JSON.parse(storedUser));
      }
    } catch (e) {
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
          DEPT // {user?.dept_code || 'GUEST'}
        </span>
      </div>
    </aside>
  );
}