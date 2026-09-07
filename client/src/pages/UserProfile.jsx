import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './UserProfile.css';

const API_BASE = 'http://localhost:5000/api';

export default function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE}/users/${userId}/profile`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || 'Failed to load profile');
        }
        setProfile(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [userId]);

  return (
    <div className="prof-page">
      <button type="button" className="prof-back-btn" onClick={() => navigate(-1)}>
        ← BACK
      </button>

      {loading && <p className="prof-empty-state">Loading profile...</p>}
      {error && <p className="prof-error">{error}</p>}

      {!loading && !error && profile && (
        <>
          <div className="prof-header">
            <div className="prof-avatar">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.name} />
              ) : (
                <span className="prof-avatar-fallback">
                  {profile.name ? profile.name.charAt(0).toUpperCase() : '?'}
                </span>
              )}
            </div>
            <div>
              <h2 className="prof-name">{profile.name}</h2>
              <p className="prof-meta">
                Member since {new Date(profile.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="prof-stats">
            <div className="prof-stat">
              <span className="prof-stat-value">
                {Number(profile.points).toLocaleString()}
              </span>
              <span className="prof-stat-label">POINTS</span>
            </div>
            <div className="prof-stat">
              <span className="prof-stat-value">{profile.uploads}</span>
              <span className="prof-stat-label">UPLOADS</span>
            </div>
            <div className="prof-stat">
              <span className="prof-stat-value">{profile.review_count}</span>
              <span className="prof-stat-label">REVIEWS</span>
            </div>
          </div>

          <div className="prof-section">
            <h3>RECENT UPLOADS</h3>
            {profile.recent_resources.length === 0 ? (
              <p className="prof-empty-state">No uploads yet.</p>
            ) : (
              <ul className="prof-list">
                {profile.recent_resources.map((r) => (
                  <li key={r.resource_id} className="prof-list-item">
                    <span className="prof-list-title">{r.title}</span>
                    <span className="prof-list-meta">
                      {r.course_code} • {r.type}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="prof-section">
            <h3>RECENT REVIEWS</h3>
            {profile.recent_reviews.length === 0 ? (
              <p className="prof-empty-state">No reviews yet.</p>
            ) : (
              <ul className="prof-list">
                {profile.recent_reviews.map((r) => (
                  <li key={r.review_id} className="prof-list-item">
                    <span className="prof-list-title">{r.course_code}</span>
                    <span className="prof-list-meta">
                      Difficulty {r.difficulty}/5 • Usefulness {r.prereq_use}/5
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}