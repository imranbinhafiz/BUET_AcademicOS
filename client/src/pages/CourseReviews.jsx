import React, { useEffect, useState, useCallback, useRef } from 'react';
import './CourseReviews.css';

const API_BASE = 'http://localhost:5000/api';
const COURSES_API = `${API_BASE}/courses`;
const REVIEWS_API = `${API_BASE}/reviews`;
const DEPARTMENTS_API = `${API_BASE}/departments`;
const REPORTS_API = `${API_BASE}/reports`;

function getCurrentUser() {
  try {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function difficultyTag(avgDifficulty) {
  if (avgDifficulty == null) return 'N/A';
  if (avgDifficulty <= 2) return 'EASY';
  if (avgDifficulty <= 3.5) return 'MEDIUM';
  return 'HARD';
}

export default function CourseReviews() {
  const [courseSearch, setCourseSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sortBy, setSortBy] = useState('rating');
  const [order, setOrder] = useState('desc');

  const [courses, setCourses] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeCourse, setActiveCourse] = useState(null);
  const [showWriteReview, setShowWriteReview] = useState(false);

  const currentUser = getCurrentUser();

  useEffect(() => {
    fetch(DEPARTMENTS_API)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setDepartments(data);
      })
      .catch(() => {});
  }, []);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (courseSearch.trim()) params.append('search', courseSearch.trim());
      if (deptFilter) params.append('dept_code', deptFilter);
      params.append('sortBy', sortBy);
      params.append('order', order);

      const response = await fetch(`${COURSES_API}?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to load courses');
      }

      setCourses(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [courseSearch, deptFilter, sortBy, order]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchCourses();
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [fetchCourses]);

  const clearFilters = () => {
    setCourseSearch('');
    setDeptFilter('');
  };

  const hasActiveFilters = courseSearch || deptFilter;

  return (
    <div className="cr-reviews-page">
      <div className="p5-page-header">
        <h2>COURSE SURVIVAL & REVIEWS</h2>
        {currentUser && (
          <button
            className="p5-action-btn"
            onClick={() => setShowWriteReview((prev) => !prev)}
          >
            {showWriteReview ? '✕ CLOSE FORM' : '+ WRITE REVIEW'}
          </button>
        )}
      </div>

      <WriteReviewForm
        courses={courses}
        isOpen={showWriteReview}
        onSubmitted={() => {
          setShowWriteReview(false);
          fetchCourses();
        }}
        onCancel={() => setShowWriteReview(false)}
      />

      <div className="p5-course-search-wrapper">
        <input
          type="text"
          placeholder="🔍 Search by course code, name, or teacher..."
          value={courseSearch}
          onChange={(e) => setCourseSearch(e.target.value)}
          className="p5-input p5-course-search-input"
        />
        {courseSearch && (
          <button
            type="button"
            onClick={() => setCourseSearch('')}
            className="p5-parent-clear-btn"
            aria-label="Clear course search"
          >
            ✕
          </button>
        )}
      </div>

      <div className="p5-sort-bar">
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="p5-input p5-sort-select"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d.dept_code} value={d.dept_code}>
              {d.dept_name}
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="p5-input p5-sort-select"
        >
          <option value="name">Sort: Default</option>
          <option value="rating">Sort: Usefulness</option>
        </select>

        <button
          type="button"
          className="p5-order-btn"
          onClick={() => setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
        >
          {order === 'asc' ? '↑ ASCENDING' : '↓ DESCENDING'}
        </button>

        {hasActiveFilters && (
          <button type="button" className="p5-order-btn" onClick={clearFilters}>
            CLEAR FILTERS
          </button>
        )}
      </div>

      {loading && <p className="p5-empty-state">Loading courses...</p>}
      {error && <p className="p5-error">{error}</p>}

      {!loading && !error && (
        <div className="cr-courses-grid">
          {courses.map((c) => (
            <div key={c.course_code} className="cr-course-card">
              <span className={`cr-diff-tag cr-diff-${difficultyTag(c.avg_difficulty).toLowerCase()}`}>
                {difficultyTag(c.avg_difficulty)}
              </span>
              <h3>{c.course_code}</h3>
              <p className="cr-course-name">{c.title}</p>
              <div className="cr-course-footer">
                <span>
                  USEFULNESS: <strong>{c.avg_prereq_use ? `${Number(c.avg_prereq_use).toFixed(1)} / 5.0` : 'N/A'}</strong>
                </span>
                <button className="p5-card-btn" onClick={() => setActiveCourse(c.course_code)}>
                  READ REVIEWS
                </button>
              </div>
            </div>
          ))}

          {courses.length === 0 && (
            <p className="p5-empty-state">
              No courses found{hasActiveFilters ? ' matching your filters' : ''}.
            </p>
          )}
        </div>
      )}

      {activeCourse && (
        <CourseReviewsModal
          courseCode={activeCourse}
          currentUser={currentUser}
          onClose={() => setActiveCourse(null)}
        />
      )}
    </div>
  );
}

function WriteReviewForm({ courses = [], isOpen, onSubmitted, onCancel }) {
  const [selectedCourse, setSelectedCourse] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [offerings, setOfferings] = useState([]);
  const [difficulty, setDifficulty] = useState(3);
  const [prereqUse, setPrereqUse] = useState(3);
  const [comment, setComment] = useState('');
  const [file, setFile] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [comment]);

  useEffect(() => {
    setTeacherId('');
    if (!selectedCourse) {
      setOfferings([]);
      return;
    }
    fetch(`${COURSES_API}/${selectedCourse}/offerings`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setOfferings(data);
      })
      .catch(() => setOfferings([]));
  }, [selectedCourse]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const token = localStorage.getItem('token');
    if (!token) {
      setFormError('Please log in to submit a review.');
      return;
    }

    if (!selectedCourse) {
      setFormError('Please select a course code.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('course_code', selectedCourse);
      if (teacherId) formData.append('offering_id', teacherId);
      formData.append('difficulty', difficulty);
      formData.append('prereq_use', prereqUse);
      formData.append('comment', comment);
      if (file) formData.append('attachment', file);

      const response = await fetch(REVIEWS_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to submit review');

      setSelectedCourse('');
      setTeacherId('');
      setDifficulty(3);
      setPrereqUse(3);
      setComment('');
      setFile(null);

      onSubmitted();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={`p5-upload-form ${!isOpen ? 'p5-form-closed' : ''}`} onSubmit={handleSubmit}>
      {formError && <div className="p5-error">{formError}</div>}

      <div>
        <label className="p5-label">Select Course Code *</label>
        <select
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
          className="p5-input"
          required
        >
          <option value="">-- Choose Course --</option>
          {courses.map((c) => (
            <option key={c.course_code} value={c.course_code}>
              {c.course_code} — {c.title}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="p5-label">Select Teacher (Optional)</label>
        <select
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          className="p5-input"
          disabled={!selectedCourse}
        >
          <option value="">General / Unspecified Teacher</option>
          {offerings.map((o) => (
            <option key={o.offering_id} value={o.offering_id}>
              {o.teacher_name} ({o.semester})
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label className="p5-label">Difficulty Level (1 = Easy, 5 = Hard)</label>
          <input
            type="number"
            min="1"
            max="5"
            required
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            className="p5-input"
          />
        </div>

        <div>
          <label className="p5-label">Usefulness Score (1 = Low, 5 = High)</label>
          <input
            type="number"
            min="1"
            max="5"
            required
            value={prereqUse}
            onChange={(e) => setPrereqUse(Number(e.target.value))}
            className="p5-input"
          />
        </div>
      </div>

      <div>
        <label className="p5-label">Attach File / Notes (Optional)</label>
        <div className="p5-file-input-wrapper">
          <label htmlFor="course-review-file" className="p5-file-btn">
            Choose File
          </label>
          <input
            id="course-review-file"
            type="file"
            onChange={(e) => setFile(e.target.files[0] || null)}
            className="p5-file-input-hidden"
          />
          <span className="p5-file-name">
            {file ? file.name : 'No file chosen'}
          </span>
        </div>
      </div>

      <div>
        <label className="p5-label">Detailed Review & Advice *</label>
        <textarea
          ref={textareaRef}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={6}
          placeholder="Write your detailed review, exam prep tips, grading policies..."
          className="p5-input"
          style={{ minHeight: '130px', overflow: 'hidden', resize: 'none' }}
          required
        />
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem' }}>
        <button
          type="submit"
          disabled={submitting}
          className="p5-btn"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {submitting ? 'SUBMITTING...' : 'POST REVIEW'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="p5-versions-btn"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          CANCEL
        </button>
      </div>
    </form>
  );
}

function CourseReviewsModal({ courseCode, currentUser, onClose }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${COURSES_API}/${courseCode}/reviews`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to load reviews');
      setReviews(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [courseCode]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleReviewVote = async (reviewId, value) => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in to vote.');
      return;
    }

    try {
      const response = await fetch(`${REVIEWS_API}/${reviewId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ value })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Vote failed');

      setReviews((prev) =>
        prev.map((r) =>
          r.review_id === reviewId
            ? { ...r, vote_tally: data.votes, current_vote: data.currentVote }
            : r
        )
      );
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="cr-anilist-overlay" onClick={onClose}>
      <div className="cr-anilist-container" onClick={(e) => e.stopPropagation()}>
        <button className="cr-anilist-close-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <header className="cr-anilist-header">
          <span className="cr-anilist-tag">REVIEWS // DATABASE</span>
          <h2>{courseCode}</h2>
        </header>

        {loading && <p className="p5-empty-state">Loading reviews...</p>}
        {error && <p className="p5-error">{error}</p>}

        <div className="cr-anilist-reviews-list">
          {!loading && reviews.length === 0 && (
            <p className="p5-empty-state">No reviews recorded for this course yet.</p>
          )}

          {reviews.map((r) => (
            <AniListReviewCard
              key={r.review_id}
              review={r}
              isOwnReview={currentUser && r.user_id === currentUser.user_id}
              onVote={handleReviewVote}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AniListReviewCard({ review: r, isOwnReview, onVote }) {
  const [showReportBox, setShowReportBox] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reported, setReported] = useState(false);

  const handleReportSubmit = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in to report a review.');
      return;
    }
    if (!reportReason.trim()) return;

    setReportSubmitting(true);
    try {
      const response = await fetch(REPORTS_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          target_type: 'coursereview',
          target_id: r.review_id,
          reason: reportReason.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Report failed');

      setReported(true);
      setShowReportBox(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setReportSubmitting(false);
    }
  };

  const calculatedScore = (((6 - r.difficulty) + r.prereq_use) / 2).toFixed(1);

  return (
    <article className="cr-anilist-card">
      <div className="cr-anilist-user-bar">
        <div className="cr-anilist-author">
          <div className="cr-anilist-avatar">
            {r.user_name ? r.user_name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="cr-anilist-user-info">
            <span className="cr-author-name">{r.user_name || 'Anonymous Student'}</span>
            <span className="cr-author-meta">
              {r.teacher_name ? `Instructor: ${r.teacher_name}` : 'General Instructor'}
              {r.semester ? ` • ${r.semester}` : ''}
            </span>
          </div>
        </div>

        <div className="p5-vote-column">
          <button
            className={`p5-vote-btn ${r.current_vote === 1 ? 'p5-vote-active-up' : ''}`}
            onClick={() => onVote(r.review_id, 1)}
          >
            ▲
          </button>
          <span className="p5-vote-tally">{r.vote_tally ?? 0}</span>
          <button
            className={`p5-vote-btn ${r.current_vote === -1 ? 'p5-vote-active-down' : ''}`}
            onClick={() => onVote(r.review_id, -1)}
          >
            ▼
          </button>
        </div>
      </div>

      <div className="cr-anilist-body">
        <p className="cr-anilist-text">{r.comment}</p>

        {r.file_path && (
          <div className="cr-attachment-link">
            📁{' '}
            <a href={`http://localhost:5000/${r.file_path}`} target="_blank" rel="noreferrer">
              Download Review Attachment
            </a>
          </div>
        )}
      </div>

      <div className="cr-anilist-bottom-rating">
        <div className="cr-rating-metrics">
          <div className="cr-metric">
            <span className="cr-metric-label">DIFFICULTY</span>
            <span className="cr-metric-val">{r.difficulty} / 5</span>
          </div>
          <div className="cr-metric">
            <span className="cr-metric-label">USEFULNESS</span>
            <span className="cr-metric-val">{r.prereq_use} / 5</span>
          </div>
        </div>

        <div className="cr-anilist-final-score">
          <span className="cr-score-label">OVERALL RATING</span>
          <span className="cr-score-number">
            {calculatedScore} <span>/ 5.0</span>
          </span>
        </div>
      </div>

      {!isOwnReview && (
        <div className="cr-anilist-actions">
          {reported ? (
            <span className="cr-reported-note">🚩 Reported to Moderation</span>
          ) : showReportBox ? (
            <div className="cr-report-box">
              <input
                type="text"
                placeholder="Reason for reporting..."
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="p5-input"
              />
              <button
                type="button"
                className="p5-card-btn"
                disabled={reportSubmitting || !reportReason.trim()}
                onClick={handleReportSubmit}
              >
                {reportSubmitting ? 'SENDING...' : 'CONFIRM'}
              </button>
              <button type="button" className="p5-versions-btn" onClick={() => setShowReportBox(false)}>
                CANCEL
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="cr-report-btn"
              onClick={() => setShowReportBox(true)}
            >
              🚩 REPORT
            </button>
          )}
        </div>
      )}
    </article>
  );
}