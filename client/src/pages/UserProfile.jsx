import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './UserProfile.css'; 
import { CourseReviewsModal } from './CourseReviews';
import { apiUrl, assetUrl } from '../api';

function getAvatarUrl(avatarPath) {
  return assetUrl(avatarPath);
}

export default function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  
  // Basic Profile State
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [savingBio, setSavingBio] = useState(false);
  const [bioError, setBioError] = useState('');
  const [expandedResources, setExpandedResources] = useState(false);
  const [expandedReviews, setExpandedReviews] = useState(false);
  const [selectedReview, setSelectedReview] = useState(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const avatarInputRef = useRef(null);

  // Resources State (Search & Sort)
  const [uploads, setUploads] = useState([]);
  const [resSearch, setResSearch] = useState('');
  const [resSortBy, setResSortBy] = useState('default');
  const [resOrder, setResOrder] = useState('desc');
  const [loadingRes, setLoadingRes] = useState(false);

  // Reviews State (Search & Sort)
  const [reviews, setReviews] = useState([]);
  const [revSearch, setRevSearch] = useState('');
  const [revSortBy, setRevSortBy] = useState('date');
  const [revOrder, setRevOrder] = useState('desc');
  const [loadingRev, setLoadingRev] = useState(false);

  const isOwnProfile = currentUserId !== null && String(currentUserId) === String(userId);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      setCurrentUserId(user?.user_id ?? null);
    } catch {
      setCurrentUserId(null);
    }
  }, []);

  // 1. Fetch Basic Profile
  useEffect(() => {
    const fetchProfile = async () => {
      setLoadingProfile(true);
      setError('');
      try {
        const response = await fetch(apiUrl(`/profile/${userId}`));
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Failed to load profile');
        setProfile(data);
        setBioDraft(data.bio || '');
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingProfile(false);
      }
    };
    fetchProfile();
  }, [userId]);

  const handleBioSubmit = async (event) => {
    event.preventDefault();
    setSavingBio(true);
    setBioError('');
    try {
      const response = await fetch(apiUrl(`/profile/${userId}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ bio: bioDraft })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to update bio');
      setProfile(data);
      setBioDraft(data.bio || '');
      setIsEditingBio(false);
      window.dispatchEvent(new Event('profile-changed'));
    } catch (err) {
      setBioError(err.message);
    } finally {
      setSavingBio(false);
    }
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarError('');
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const response = await fetch(apiUrl(`/profile/${userId}/avatar`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to update avatar');
      setProfile(data);
      const storedUser = JSON.parse(localStorage.getItem('user') || 'null');
      if (storedUser) localStorage.setItem('user', JSON.stringify({ ...storedUser, avatar_path: data.avatar_path }));
      window.dispatchEvent(new Event('profile-changed'));
    } catch (err) {
      setAvatarError(err.message);
    } finally {
      event.target.value = '';
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordMessage('');
    if (passwordDraft.newPassword !== passwordDraft.confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      const response = await fetch(apiUrl('/auth/password'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ currentPassword: passwordDraft.currentPassword, newPassword: passwordDraft.newPassword })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to update password');
      setPasswordDraft({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordMessage(data.message);
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  // 2. Fetch User's Resources (with debounce)
  const fetchResources = useCallback(async () => {
    setLoadingRes(true);
    try {
      const params = new URLSearchParams();
      if (resSearch.trim()) params.append('search', resSearch.trim());
      params.append('sortBy', resSortBy);
      params.append('order', resOrder);

      const response = await fetch(apiUrl(`/profile/${userId}/resources?${params.toString()}`));
      const data = await response.json();
      if (response.ok) setUploads(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load user resources', err);
    } finally {
      setLoadingRes(false);
    }
  }, [userId, resSearch, resSortBy, resOrder]);

  useEffect(() => {
    const timeoutId = setTimeout(() => fetchResources(), 300);
    return () => clearTimeout(timeoutId);
  }, [fetchResources]);

  // 3. Fetch User's Reviews (with debounce)
  const fetchReviews = useCallback(async () => {
    setLoadingRev(true);
    try {
      const params = new URLSearchParams();
      if (revSearch.trim()) params.append('search', revSearch.trim());
      params.append('sortBy', revSortBy);
      params.append('order', revOrder);

      const response = await fetch(apiUrl(`/profile/${userId}/reviews?${params.toString()}`));
      const data = await response.json();
      if (response.ok) setReviews(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load user reviews', err);
    } finally {
      setLoadingRev(false);
    }
  }, [userId, revSearch, revSortBy, revOrder]);

  useEffect(() => {
    const timeoutId = setTimeout(() => fetchReviews(), 300);
    return () => clearTimeout(timeoutId);
  }, [fetchReviews]);

  // Download Handler (Reused from Resources page)
  const handleDownload = async (resId, title) => {
    try {
      const response = await fetch(apiUrl(`/resources/${resId}/download`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = title;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleResourceVote = async (resId, value) => {
    const token = localStorage.getItem('token');
    if (!token) return alert('Please log in to vote.');
    try {
      const response = await fetch(apiUrl(`/resources/${resId}/vote`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Vote failed');
      setUploads((prev) => prev.map((upload) => upload.res_id === resId
        ? { ...upload, vote_tally: data.votes, current_vote: data.currentVote }
        : upload));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReviewVote = async (reviewId, value) => {
    const token = localStorage.getItem('token');
    if (!token) return alert('Please log in to vote.');
    try {
      const response = await fetch(apiUrl(`/course-reviews/reviews/${reviewId}/vote`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Vote failed');
      setReviews((prev) => prev.map((review) => review.review_id === reviewId
        ? { ...review, vote_tally: data.votes, current_vote: data.currentVote }
        : review));
    } catch (err) {
      alert(err.message);
    }
  };

  if (loadingProfile) return <div className="prof-page"><p className="prof-empty-state">Loading profile...</p></div>;
  if (error) return <div className="prof-page"><p className="prof-error">{error}</p></div>;
  if (!profile) return <div className="prof-page"><p className="prof-empty-state">Profile not found.</p></div>;

  const resourceVotes = uploads.reduce((total, upload) => total + Number(upload.vote_tally || 0), 0);
  const reviewVotes = reviews.reduce((total, review) => total + Number(review.vote_tally || 0), 0);

  return (
    <div className="prof-page prof-page-upgraded">
      <header className="prof-page-topline">
        <button className="prof-back-btn" onClick={() => navigate(-1)}>
          ← BACK
        </button>
        <p className="prof-context-label">{isOwnProfile ? 'MY ACADEMIC SPACE' : 'CONTRIBUTOR PROFILE'}</p>
      </header>

      <div className={`prof-layout ${expandedResources || expandedReviews ? 'has-expanded-section' : ''}`}>
        
        {/* LEFT SIDEBAR: Avatar & Identity */}
        <aside className="prof-sidebar">
          <div className="prof-avatar-frame">
            <div className={`prof-avatar ${isOwnProfile ? 'prof-avatar-editable' : ''}`} onClick={() => isOwnProfile && avatarInputRef.current?.click()} role={isOwnProfile ? 'button' : undefined} tabIndex={isOwnProfile ? 0 : undefined} onKeyDown={(event) => { if (isOwnProfile && (event.key === 'Enter' || event.key === ' ')) avatarInputRef.current?.click(); }}>
            {getAvatarUrl(profile.avatar_path) ? (
              <img src={getAvatarUrl(profile.avatar_path)} alt={profile.name} />
            ) : (
              profile.name.charAt(0).toUpperCase()
            )}
            {isOwnProfile && <>
              <span className="prof-avatar-edit-label">Change</span>
              <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleAvatarChange} hidden />
            </>}
            </div>
            {isOwnProfile && <span className="prof-avatar-hint">Click to replace · JPG, PNG, WebP or GIF · max 2 MB</span>}
          </div>
          {avatarError && <p className="prof-inline-error">{avatarError}</p>}
          <div className="prof-identity">
            <p className="prof-eyebrow">{isOwnProfile ? 'YOUR PROFILE' : 'ACADEMICOS MEMBER'}</p>
            <h1 className="prof-name">{profile.name}</h1>
            <p className="prof-meta"><span aria-hidden="true">✉</span> {profile.email || 'Email not public'}</p>
          </div>
          <div className="prof-profile-note">
            <span className="prof-status-dot" aria-hidden="true" />
            <span>{isOwnProfile ? 'Your profile is visible to the AcademicOS community.' : 'Community contributor'}</span>
          </div>
        </aside>

        {/* RIGHT PANEL: Bio & Contributions */}
        <main className="prof-main">
          <section className="prof-hero-copy">
            <p className="prof-eyebrow">{isOwnProfile ? 'PERSONAL DASHBOARD' : 'CONTRIBUTION SNAPSHOT'}</p>
            <h2>{isOwnProfile ? 'Keep your academic identity up to date.' : `${profile.name}'s academic footprint.`}</h2>
            <p>{isOwnProfile ? 'Your uploads and reviews make the library more useful for every batch.' : 'Browse this member’s shared resources and course experience below.'}</p>
          </section>

          <section className="prof-stat-grid" aria-label="Contribution summary">
            <div className="prof-stat-card"><span>Resources</span><strong>{uploads.length}</strong><small>shared materials</small></div>
            <div className="prof-stat-card"><span>Reviews</span><strong>{reviews.length}</strong><small>course insights</small></div>
            <div className="prof-stat-card"><span>Helpful votes</span><strong>{resourceVotes + reviewVotes}</strong><small>across contributions</small></div>
          </section>
          
          <div className="prof-bio-section">
            <div className="prof-section-heading">
              <h3>About</h3>
              {isOwnProfile && !isEditingBio && <button className="prof-edit-btn" onClick={() => setIsEditingBio(true)}>Edit bio</button>}
            </div>
            {isEditingBio ? (
              <form className="prof-bio-form" onSubmit={handleBioSubmit}>
                <textarea value={bioDraft} maxLength={500} onChange={(event) => setBioDraft(event.target.value)} autoFocus />
                <div className="prof-bio-actions">
                  <span>{bioDraft.length}/500</span>
                  <button type="button" className="prof-cancel-btn" onClick={() => { setBioDraft(profile.bio || ''); setIsEditingBio(false); setBioError(''); }}>Cancel</button>
                  <button type="submit" className="prof-save-btn" disabled={savingBio}>{savingBio ? 'Saving...' : 'Save bio'}</button>
                </div>
                {bioError && <p className="prof-inline-error">{bioError}</p>}
              </form>
            ) : (
              <p className={`prof-bio ${!profile.bio ? 'empty' : ''}`}>
                {profile.bio || 'This user has not written a bio yet.'}
              </p>
            )}
          </div>

          {isOwnProfile && (
            <div className="prof-account-section">
              <div className="prof-section-heading">
                <div><p className="prof-eyebrow">ACCOUNT SECURITY</p><h3>Keep your account secure</h3></div>
                <button className="prof-edit-btn" onClick={() => { setShowPasswordForm((open) => !open); setPasswordError(''); setPasswordMessage(''); }}>
                  {showPasswordForm ? 'Close' : 'Change password'}
                </button>
              </div>
              {!showPasswordForm && <p className="prof-security-copy">Use a password only you know. Your current password is required before it can be changed.</p>}
              {showPasswordForm && <form className="prof-password-form" onSubmit={handlePasswordSubmit}>
                <input type="password" placeholder="Current password" value={passwordDraft.currentPassword} onChange={(event) => setPasswordDraft({ ...passwordDraft, currentPassword: event.target.value })} minLength={6} required />
                <input type="password" placeholder="New password" value={passwordDraft.newPassword} onChange={(event) => setPasswordDraft({ ...passwordDraft, newPassword: event.target.value })} minLength={6} required />
                <input type="password" placeholder="Confirm new password" value={passwordDraft.confirmPassword} onChange={(event) => setPasswordDraft({ ...passwordDraft, confirmPassword: event.target.value })} minLength={6} required />
                <button type="submit" className="prof-save-btn" disabled={savingPassword}>{savingPassword ? 'Saving...' : 'Update password'}</button>
                {passwordError && <p className="prof-inline-error">{passwordError}</p>}
                {passwordMessage && <p className="prof-success">{passwordMessage}</p>}
              </form>}
            </div>
          )}

          <div className="prof-contributions-grid">
            
            {/* =========================================
                UPLOADED RESOURCES WITH SEARCH/SORT
                ========================================= */}
            <section className={`prof-section ${expandedResources ? 'is-expanded' : ''}`}>
              <button className="prof-section-toggle" onClick={() => setExpandedResources((expanded) => !expanded)} aria-expanded={expandedResources}>
                <h3>
                  UPLOADS <span className="prof-count-badge">{uploads.length}</span>
                </h3>
                <span className="prof-chevron" aria-hidden="true">{expandedResources ? '−' : '+'}</span>
              </button>

              <div className={`prof-section-content ${expandedResources ? 'is-open' : ''}`}>
                <div className="prof-section-content-inner">
              <div className="prof-filter-row">
                <input 
                  type="text" 
                  placeholder="Search code..." 
                  value={resSearch}
                  onChange={(e) => setResSearch(e.target.value)}
                  className="prof-filter-input"
                />
                <select 
                  value={resSortBy} 
                  onChange={(e) => setResSortBy(e.target.value)}
                  className="prof-filter-select"
                >
                  <option value="default">Newest</option>
                  <option value="votes">Votes</option>
                  <option value="downloads">Downloads</option>
                </select>
                <button 
                  onClick={() => setResOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="prof-order-btn"
                >
                  {resOrder === 'asc' ? '↑' : '↓'}
                </button>
                </div>

              {loadingRes && uploads.length === 0 ? (
                <p className="prof-empty-state">Filtering...</p>
              ) : uploads.length === 0 ? (
                <p className="prof-empty-state">No resources match your search.</p>
              ) : (
                <ul className={`prof-list${loadingRes ? ' prof-list-refreshing' : ''}`} aria-busy={loadingRes}>
                  {uploads.slice(0, 5).map(upload => (
                    <li key={upload.res_id} className="prof-list-item">
                      <div className="prof-list-header">
                        <span className="prof-item-tag">{upload.course_code} • {upload.type}</span>
                        <button 
                          onClick={(event) => { event.stopPropagation(); handleDownload(upload.res_id, upload.title); }}
                          className="prof-download-btn"
                        >
                          ↓ DOWNLOAD
                        </button>
                      </div>
                      <h4 className="prof-list-title">{upload.title}</h4>
                      <div className="prof-item-stats">
                        <span title="Downloads" aria-label={`${upload.download_count || 0} downloads`}>📥 {upload.download_count || 0}</span>
                        <span title="Votes" aria-label={`${upload.vote_tally || 0} votes`}>👍 {upload.vote_tally || 0}</span>
                      </div>
                      <div className="prof-vote-actions" onClick={(event) => event.stopPropagation()}>
                        <button className={upload.current_vote === 1 ? 'is-active' : ''} onClick={() => handleResourceVote(upload.res_id, 1)} aria-label="Upvote resource">▲</button>
                        <button className={upload.current_vote === -1 ? 'is-active is-down' : ''} onClick={() => handleResourceVote(upload.res_id, -1)} aria-label="Downvote resource">▼</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
                </div>
              </div>
            </section>

            {/* =========================================
                COURSE REVIEWS WITH SEARCH/SORT
                ========================================= */}
            <section className={`prof-section ${expandedReviews ? 'is-expanded' : ''}`}>
              <button className="prof-section-toggle" onClick={() => setExpandedReviews((expanded) => !expanded)} aria-expanded={expandedReviews}>
                <h3>
                  REVIEWS <span className="prof-count-badge">{reviews.length}</span>
                </h3>
                <span className="prof-chevron" aria-hidden="true">{expandedReviews ? '−' : '+'}</span>
              </button>

              <div className={`prof-section-content ${expandedReviews ? 'is-open' : ''}`}>
                <div className="prof-section-content-inner">
              <div className="prof-filter-row">
                <input 
                  type="text" 
                  placeholder="Search code..." 
                  value={revSearch}
                  onChange={(e) => setRevSearch(e.target.value)}
                  className="prof-filter-input"
                />
                <select 
                  value={revSortBy} 
                  onChange={(e) => setRevSortBy(e.target.value)}
                  className="prof-filter-select"
                >
                  <option value="date">Newest</option>
                  <option value="votes">Votes</option>
                  <option value="usefulness">Usefulness</option>
                </select>
                <button 
                  onClick={() => setRevOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="prof-order-btn"
                >
                  {revOrder === 'asc' ? '↑' : '↓'}
                </button>
                </div>

              {loadingRev && reviews.length === 0 ? (
                <p className="prof-empty-state">Filtering...</p>
              ) : reviews.length === 0 ? (
                <p className="prof-empty-state">No reviews match your search.</p>
              ) : (
                <ul className={`prof-list${loadingRev ? ' prof-list-refreshing' : ''}`} aria-busy={loadingRev}>
                  {reviews.slice(0, 10).map(review => (
                    <li key={review.review_id} className="prof-list-item prof-review-item" onClick={() => setSelectedReview({ courseCode: review.course_code, reviewId: review.review_id })}>
                      <div className="prof-list-header">
                        <span className="prof-item-tag">{review.course_code}</span>
                        <span className="prof-item-meta">Usefulness: {review.prereq_use}/5</span>
                      </div>
                      <h4 className="prof-list-title">{review.title || 'General Review'}</h4>
                      <div className="prof-item-stats">
                        <span title="Votes" aria-label={`${review.vote_tally || 0} votes`}>👍 {review.vote_tally || 0}</span>
                      </div>
                      <div className="prof-vote-actions" onClick={(event) => event.stopPropagation()}>
                        <button className={review.current_vote === 1 ? 'is-active' : ''} onClick={() => handleReviewVote(review.review_id, 1)} aria-label="Upvote review">▲</button>
                        <button className={review.current_vote === -1 ? 'is-active is-down' : ''} onClick={() => handleReviewVote(review.review_id, -1)} aria-label="Downvote review">▼</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
                </div>
              </div>
            </section>

          </div>
        </main>
      </div>
      {selectedReview && (
        <CourseReviewsModal
          courseCode={selectedReview.courseCode}
          reviewId={selectedReview.reviewId}
          currentUser={currentUserId ? { user_id: currentUserId } : null}
          onClose={() => setSelectedReview(null)}
        />
      )}
    </div>
  );
}
