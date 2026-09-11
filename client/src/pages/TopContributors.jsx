import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './TopContributors.css';

const API_BASE = 'http://localhost:5000/api';
const LEADERBOARD_API = `${API_BASE}/top-contributors`;
const SERVER_ORIGIN = API_BASE.replace('/api', '');

export default function TopContributors() {
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    const fetchLeaders = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${LEADERBOARD_API}?limit=20`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to load top contributors');
        }

        setLeaders(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaders();
  }, []);

  const goToProfile = (userId) => {
    navigate(`/profile/${userId}`);
  };

  return (
    <>
      <div className="p5-page-header">
        <h2>TOP ACADEMIC CONTRIBUTORS</h2>
      </div>

      {loading && (
        <div className="p5-leaderboard-table data-skeleton-leaderboard" aria-label="Loading contributors">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="p5-leader-row data-skeleton-row" key={index}>
              <span className="data-skeleton-circle" />
              <span className="data-skeleton-line name" />
              <span className="data-skeleton-line stat" />
              <span className="data-skeleton-line points" />
            </div>
          ))}
        </div>
      )}
      {error && <p className="p5-error">{error}</p>}

      {!loading && !error && (
        <div className="p5-leaderboard-table">
          {leaders.map((item, index) => (
            <button
              key={item.user_id}
              type="button"
              className="p5-leader-row"
              onClick={() => goToProfile(item.user_id)}
            >
              <span className="p5-rank">
                #{String(index + 1).padStart(2, '0')}
              </span>

              <span className="p5-leader-avatar">
                {item.avatar_path ? (
                  <img src={`${SERVER_ORIGIN}${item.avatar_path}`} alt={item.name} />
                ) : (
                  <span className="p5-leader-avatar-fallback">
                    {item.name ? item.name.charAt(0).toUpperCase() : '?'}
                  </span>
                )}
              </span>

              <span className="p5-leader-name">{item.name}</span>
              <span className="p5-leader-uploads">{item.uploads} UPLOADS</span>
              <span className="p5-leader-points">
                {Number(item.points).toLocaleString()} PTS
              </span>
            </button>
          ))}

          {leaders.length === 0 && (
            <p className="p5-empty-state">No contributors yet.</p>
          )}
        </div>
      )}
    </>
  );
}