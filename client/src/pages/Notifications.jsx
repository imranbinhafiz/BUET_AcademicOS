import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import './Notifications.css';

const API_BASE = 'http://localhost:5000/api/notifications';

function getJson(response) {
  return response.json().then((data) => {
    if (!response.ok) throw new Error(data.message || 'The request could not be completed.');
    return data;
  });
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString();
}

function notificationLabel(type) {
  if (type === 'batch_progress_advanced') return 'TERM PROGRESS';
  if (type === 'review_vote') return 'REVIEW ACTIVITY';
  if (type === 'report_created' || type === 'report_resolved') return 'MODERATION UPDATE';
  if (type === 'resource_submitted') return 'RESOURCE REVIEW';
  if (type === 'resource_approved' || type === 'resource_rejected') return 'RESOURCE STATUS';
  return 'SYSTEM UPDATE';
}

function notificationDestination(type) {
  if (type === 'batch_progress_advanced') return '/performance';
  if (type === 'review_vote' || type === 'report_created' || type === 'report_resolved') return '/course-reviews';
  if (type === 'resource_submitted') return '/admin/moderation';
  if (type === 'resource_approved' || type === 'resource_rejected') return '/resources';
  return null;
}

export default function Notifications() {
  const navigate = useNavigate();
  const { user, refreshUnreadCount } = useOutletContext();
  const token = localStorage.getItem('token');
  // Keep this object stable. Otherwise it changes on every render, which
  // changes loadNotifications and continuously restarts the loading effect.
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  const [notifications, setNotifications] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState('');

  const loadNotifications = useCallback(async (cursor = null, append = false) => {
    if (!token) {
      setLoading(false);
      return;
    }

    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');

    try {
      const url = new URL(API_BASE);
      url.searchParams.set('limit', '30');
      if (cursor) url.searchParams.set('before_id', String(cursor));
      const response = await fetch(url, { headers });
      const data = await getJson(response);
      setNotifications((current) => append ? [...current, ...data.notifications] : data.notifications);
      setNextCursor(data.next_cursor);
      await refreshUnreadCount();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [headers, refreshUnreadCount, token]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const markOneRead = async (notification) => {
    if (notification.is_read) return notification;

    const response = await fetch(`${API_BASE}/${notification.notification_id}/read`, {
      method: 'PATCH',
      headers
    });
    const data = await getJson(response);
    setNotifications((current) => current.map((item) => (
      item.notification_id === notification.notification_id ? data.notification : item
    )));
    await refreshUnreadCount();
    return data.notification;
  };

  const openNotification = async (notification) => {
    setError('');
    try {
      await markOneRead(notification);
      const destination = notificationDestination(notification.type);
      if (destination) navigate(destination);
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteAll = async () => {
    setMarkingAll(true);
    setError('');
    try {
      await getJson(await fetch(`${API_BASE}/read-all`, { method: 'DELETE', headers }));
      setNotifications([]); // Instantly clears the list in the UI
      await refreshUnreadCount();
    } catch (err) {
      setError(err.message);
    } finally {
      setMarkingAll(false);
    }
  };

  if (!user) {
    return <section className="notifications-page"><div className="notifications-login-card"><h2>NOTIFICATIONS</h2><p>Log in to see your personal notifications.</p></div></section>;
  }

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  return (
    <section className="notifications-page">
      <div className="p5-page-header notifications-header">
        <div>
          <p className="notifications-kicker">PERSONAL INBOX</p>
          <h2>NOTIFICATIONS</h2>
          <p>Only messages addressed to your account appear here. Opening one does not mark every other message as read.</p>
        </div>
        <button type="button" className="notifications-mark-all" disabled={markingAll || notifications.length === 0} onClick={deleteAll}>
          {markingAll ? 'DELETING...' : 'DELETE ALL NOTIFICATIONS'}
        </button>
      </div>

      {error && <div className="notifications-message error">{error}</div>}
      {loading && <p className="notifications-loading">Loading your notifications...</p>}
      {!loading && notifications.length === 0 && <div className="notifications-empty">You have no notifications yet.</div>}

      {!loading && notifications.length > 0 && (
        <div className="notifications-list">
          {notifications.map((notification) => (
            <button
              type="button"
              className={notification.is_read ? 'notification-item read' : 'notification-item unread'}
              key={notification.notification_id}
              onClick={() => openNotification(notification)}
            >
              <span className="notification-status" aria-label={notification.is_read ? 'Read' : 'Unread'} />
              <span className="notification-content">
                <span className="notification-meta">{notificationLabel(notification.type)}</span>
                <strong>{notification.message}</strong>
                <time>{formatDate(notification.created_at)}</time>
              </span>
              {notificationDestination(notification.type) && <span className="notification-link-hint">VIEW DETAILS →</span>}
            </button>
          ))}
        </div>
      )}

      {nextCursor && (
        <button type="button" className="notifications-load-more" disabled={loadingMore} onClick={() => loadNotifications(nextCursor, true)}>
          {loadingMore ? 'LOADING...' : 'LOAD OLDER NOTIFICATIONS'}
        </button>
      )}
    </section>
  );
}
