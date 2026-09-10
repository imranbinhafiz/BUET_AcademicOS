import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import './CourseReviews.css';

const API_BASE = 'http://localhost:5000/api/course-reviews';
const COURSES_API = `${API_BASE}/courses`;
const REVIEWS_API = `${API_BASE}/reviews`;
const DEPARTMENTS_API = `${API_BASE}/departments`;
const REPORTS_API = `${API_BASE}/reports`;
const SERVER_ORIGIN = API_BASE.replace('/api/course-reviews', '');

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
          <option value="difficulty">Sort: Difficulty</option>
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

      {loading && (
        <div className="cr-courses-grid data-skeleton-grid" aria-label="Loading courses">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="cr-course-card data-skeleton-card" key={index}>
              <span className="data-skeleton-line short" />
              <span className="data-skeleton-line title" />
              <span className="data-skeleton-line medium" />
              <span className="data-skeleton-line footer" />
            </div>
          ))}
        </div>
      )}
      {error && <p className="p5-error">{error}</p>}

      {!loading && !error && (
        <div className="cr-courses-grid">
          {courses.map((c) => (
            <div key={c.course_code} className="cr-course-card">
              {/* UPDATED: Added numerical difficulty score next to the text tag */}
              <span className={`cr-diff-tag cr-diff-${difficultyTag(c.avg_difficulty).toLowerCase()}`}>
                {difficultyTag(c.avg_difficulty)} {c.avg_difficulty ? `- ${Number(c.avg_difficulty).toFixed(1)}/5.0` : ''}
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

function WriteReviewForm({ isOpen, onSubmitted, onCancel }) {
  const [courseQuery, setCourseQuery] = useState('');
  const [courseMatches, setCourseMatches] = useState([]);
  const [showCourseSuggestions, setShowCourseSuggestions] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);

  const [teacherQuery, setTeacherQuery] = useState('');
  const [offerings, setOfferings] = useState([]);
  const [showTeacherSuggestions, setShowTeacherSuggestions] = useState(false);
  const [selectedOffering, setSelectedOffering] = useState(null);

  const [difficulty, setDifficulty] = useState(3);
  const [prereqUse, setPrereqUse] = useState(3);
  const [comment, setComment] = useState('');
  const [file, setFile] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const textareaRef = useRef(null);
  const courseBoxRef = useRef(null);
  const teacherBoxRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [comment]);

  useEffect(() => {
    if (selectedCourse) return;
    const q = courseQuery.trim();
    if (!q) {
      setCourseMatches([]);
      return;
    }
    const timeoutId = setTimeout(() => {
      fetch(`${COURSES_API}?search=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setCourseMatches(data.slice(0, 8));
        })
        .catch(() => setCourseMatches([]));
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [courseQuery, selectedCourse]);

  const pickCourse = (c) => {
    setSelectedCourse(c);
    setCourseQuery(`${c.course_code} — ${c.title}`);
    setCourseMatches([]);
    setShowCourseSuggestions(false);
    setSelectedOffering(null);
    setTeacherQuery('');
    setOfferings([]);
  };

  const clearCourse = () => {
    setSelectedCourse(null);
    setCourseQuery('');
    setCourseMatches([]);
    setSelectedOffering(null);
    setTeacherQuery('');
    setOfferings([]);
  };

  useEffect(() => {
    if (!selectedCourse) {
      setOfferings([]);
      return;
    }
    fetch(`${COURSES_API}/${selectedCourse.course_code}/offerings`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setOfferings(data);
        } else {
          console.error("Expected an array of teachers, but got:", data);
        }
      })
      .catch((err) => console.error("Teacher fetch failed:", err));
    }, [selectedCourse]);

  const teacherMatches = teacherQuery.trim()
    ? offerings.filter((o) =>
        o.teacher_name.toLowerCase().includes(teacherQuery.trim().toLowerCase())
      )
    : offerings;

  const pickTeacher = (o) => {
    setSelectedOffering(o);
    setTeacherQuery(`${o.teacher_name} (${o.semester})`);
    setShowTeacherSuggestions(false);
  };

  const clearTeacher = () => {
    setSelectedOffering(null);
    setTeacherQuery('');
  };

  useEffect(() => {
    const handler = (e) => {
      if (courseBoxRef.current && !courseBoxRef.current.contains(e.target)) {
        setShowCourseSuggestions(false);
      }
      if (teacherBoxRef.current && !teacherBoxRef.current.contains(e.target)) {
        setShowTeacherSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const token = localStorage.getItem('token');
    if (!token) {
      setFormError('Please log in to submit a review.');
      return;
    }

    if (!selectedCourse) {
      setFormError('Please select a course from the list.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('course_code', selectedCourse.course_code);
      if (selectedOffering) formData.append('offering_id', selectedOffering.offering_id);
      formData.append('difficulty', difficulty);
      formData.append('prereq_use', prereqUse);
      formData.append('comment', comment);
      if (file) formData.append('attachment', file);

      const response = await fetch(REVIEWS_API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to submit review');

      clearCourse();
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

      <div className="p5-parent-search-wrapper" ref={courseBoxRef}>
        <label className="p5-label">Select Course Code *</label>
        <div className="p5-parent-input-row">
          <input
            type="text"
            className="p5-input"
            placeholder="Type a course code or name..."
            value={courseQuery}
            onChange={(e) => {
              setCourseQuery(e.target.value);
              setSelectedCourse(null);
              setShowCourseSuggestions(true);
            }}
            onFocus={() => setShowCourseSuggestions(true)}
            autoComplete="off"
            required
          />
          {courseQuery && (
            <button
              type="button"
              className="p5-parent-clear-btn"
              onClick={clearCourse}
              aria-label="Clear course"
            >
              ✕
            </button>
          )}
            {showCourseSuggestions && !selectedCourse && courseMatches.length > 0 && (
              <ul className="p5-parent-suggestions">
                {courseMatches.map((c) => (
                  <li key={c.course_code}>
                    <button
                      type="button"
                      className="p5-parent-suggestion-item"
                      onClick={() => pickCourse(c)}
                    >
                      <span className="p5-parent-suggestion-title">{c.title}</span>
                      <span className="p5-parent-suggestion-meta">{c.course_code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        {selectedCourse && (
          <p className="p5-parent-selected-note">
            Selected: {selectedCourse.course_code} — {selectedCourse.title}
          </p>
        )}
      </div>

      <div className="p5-parent-search-wrapper" ref={teacherBoxRef}>
        <label className="p5-label">Select Teacher (Optional)</label>
        <div className="p5-parent-input-row">
          <input
            type="text"
            className="p5-input"
            placeholder={selectedCourse ? 'Type a teacher name...' : 'Choose a course first'}
            value={teacherQuery}
            onChange={(e) => {
              setTeacherQuery(e.target.value);
              setSelectedOffering(null);
              setShowTeacherSuggestions(true);
            }}
            onFocus={() => selectedCourse && setShowTeacherSuggestions(true)}
            disabled={!selectedCourse}
            autoComplete="off"
          />
          {teacherQuery && (
            <button
              type="button"
              className="p5-parent-clear-btn"
              onClick={clearTeacher}
              aria-label="Clear teacher"
            >
              ✕
            </button>
          )}
        </div>
        {showTeacherSuggestions && !selectedOffering && teacherMatches.length > 0 && (
          <ul className="p5-parent-suggestions">
            {teacherMatches.map((o) => (
              <li key={o.offering_id}>
                <button
                  type="button"
                  className="p5-parent-suggestion-item"
                  onClick={() => pickTeacher(o)}
                >
                  <span className="p5-parent-suggestion-title">{o.teacher_name}</span>
                  <span className="p5-parent-suggestion-meta">{o.semester}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label className="p5-label">Difficulty Level (1 = Easy, 5 = Hard)</label>
          <input
            type="number"
            min="1"
            max="5"
            step="0.1" /* <--- ADD THIS */
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
            step="0.1" /* <--- ADD THIS */
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
          <span className="p5-file-name">{file ? file.name : 'No file chosen'}</span>
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
        <button type="submit" disabled={submitting} className="p5-btn">
          {submitting ? 'SUBMITTING...' : 'POST REVIEW'}
        </button>
        <button type="button" onClick={onCancel} className="p5-versions-btn">
          CANCEL
        </button>
      </div>
    </form>
  );
}

export function CourseReviewsModal({ courseCode, reviewId, currentUser, onClose }) {
  const [downloadingId, setDownloadingId] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [reportingId, setReportingId] = useState(null);
  const [reportReason, setReportReason] = useState('');
  // NEW: State to hold the validation error message
  const [reportError, setReportError] = useState(''); 

  const [reportedReviews, setReportedReviews] = useState(new Set());
  const [expandedReviews, setExpandedReviews] = useState(new Set());
  const MAX_REVIEW_LENGTH = 250;

  const [sortBy, setSortBy] = useState('date');
  const [order, setOrder] = useState('desc');

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const fetchReviews = async () => {
      setLoading(true);
      try {
        const headers = {};
        const token = localStorage.getItem('token');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${COURSES_API}/${courseCode}/reviews`, {
          headers
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to load reviews');
        }

        setReviews(reviewId ? data.filter((review) => String(review.review_id) === String(reviewId)) : data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();
  }, [courseCode]);

  const handleVote = async (reviewId, value) => {
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

  const handleDownloadAttachment = async (reviewId) => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in to download this attachment.');
      return;
    }

    setDownloadingId(reviewId);
    try {
      const response = await fetch(`${REVIEWS_API}/${reviewId}/download`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        let message = 'Failed to download attachment';
        try {
          const data = await response.json();
          message = data.message || message;
        } catch { }
        throw new Error(message);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `review-${reviewId}-attachment`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleReportSubmit = async (reviewId) => {
    if (!reportReason.trim()) {
      setReportError('Please enter a reason for reporting.');
      return;
    }

    setReportError(''); // Clear any previous errors

    const token = localStorage.getItem('token');
    try {
      const response = await fetch(REPORTS_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          target_type: 'coursereview',
          target_id: reviewId,
          reason: reportReason
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to report');
      }

      setReportedReviews((prev) => new Set(prev).add(reviewId));
      setReportingId(null);
      setReportReason('');
      setReportError('');
    } catch (err) {
      // UPDATED: Catch the error and set it to state instead of alerting
      setReportError(err.message);
    }
  };

  const toggleExpand = (reviewId) => {
    setExpandedReviews((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(reviewId)) {
        newSet.delete(reviewId);
      } else {
        newSet.add(reviewId);
      }
      return newSet;
    });
  };

  const sortedReviews = [...reviews].sort((a, b) => {
    let diff = 0;
    if (sortBy === 'date') {
      diff = new Date(b.created_at) - new Date(a.created_at);
    } else if (sortBy === 'votes') {
      diff = (b.vote_tally || 0) - (a.vote_tally || 0);
    } else if (sortBy === 'usefulness') {
      diff = Number(b.prereq_use || 0) - Number(a.prereq_use || 0);
    } else if (sortBy === 'difficulty') {
      diff = Number(b.difficulty || 0) - Number(a.difficulty || 0);
    }
    return order === 'asc' ? -diff : diff;
  });

  return createPortal(
    (
    <div className="cr-anilist-overlay" onClick={onClose}>
      <div className="cr-anilist-container" onClick={(e) => e.stopPropagation()}>
        <button className="cr-anilist-close-btn" onClick={onClose}>
          ✕
        </button>

        <div className="cr-anilist-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <span className="cr-anilist-tag">COURSE REVIEWS</span>
            <h2>{courseCode}</h2>
          </div>

          {!loading && !error && reviews.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                className="p5-input"
                style={{ width: 'auto', minWidth: '150px', padding: '0.4rem 0.75rem' }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="date">Sort: Newest</option>
                <option value="votes">Sort: Votes</option>
                <option value="usefulness">Sort: Usefulness</option>
                <option value="difficulty">Sort: Difficulty</option>
              </select>

              <button
                type="button"
                className="p5-order-btn"
                style={{ padding: '0.4rem 0.85rem' }}
                onClick={() => setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              >
                {order === 'asc' ? '↑ ASC' : '↓ DESC'}
              </button>
            </div>
          )}
        </div>

        <div className="cr-anilist-reviews-list">
          {loading && (
            <div className="data-skeleton-review-list" aria-label="Loading reviews">
              {Array.from({ length: 3 }, (_, index) => (
                <div className="cr-anilist-card data-skeleton-review" key={index}>
                  <span className="data-skeleton-line medium" />
                  <span className="data-skeleton-line paragraph" />
                  <span className="data-skeleton-line paragraph short" />
                </div>
              ))}
            </div>
          )}
          {error && <p className="p5-error">{error}</p>}

          {!loading && !error && reviews.length === 0 && (
            <p className="p5-empty-state">No reviews yet for this course. Be the first!</p>
          )}

          {!loading &&
            !error &&
            sortedReviews.map((review) => {
              const isExpanded = expandedReviews.has(review.review_id);
              const lines = review.comment.split('\n');
              const isLong = review.comment.length > MAX_REVIEW_LENGTH || lines.length > 4;

              let displayText = review.comment;
              if (!isExpanded && isLong) {
                if (lines.length > 4) {
                  displayText = lines.slice(0, 4).join('\n') + '...';
                }
                if (displayText.length > MAX_REVIEW_LENGTH) {
                  displayText = displayText.substring(0, MAX_REVIEW_LENGTH) + '...';
                }
              }

              return (
                <div key={review.review_id} className="cr-anilist-card">
                  <div className="cr-anilist-user-bar">
                    <div className="cr-anilist-author">
                      <div className="cr-anilist-avatar">
                        {review.reviewer_avatar_path ? (
                          <img src={`${SERVER_ORIGIN}${review.reviewer_avatar_path}`} alt={review.reviewer_name || 'Reviewer'} />
                        ) : (
                          review.reviewer_name ? review.reviewer_name.charAt(0).toUpperCase() : 'A'
                        )}
                      </div>
                      <div className="cr-anilist-user-info">
                        <span className="cr-author-name">{review.reviewer_name || 'Anonymous'}</span>
                        <span className="cr-author-meta">
                          {review.teacher_name ? `Taken with ${review.teacher_name}` : 'General Review'}
                          {' • '}
                          {new Date(review.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="p5-vote-column">
                      <button
                        className={`p5-vote-btn ${review.current_vote === 1 ? 'p5-vote-active-up' : ''}`}
                        onClick={() => handleVote(review.review_id, 1)}
                      >
                        ▲
                      </button>
                      <span className="p5-vote-tally">{review.vote_tally}</span>
                      <button
                        className={`p5-vote-btn ${review.current_vote === -1 ? 'p5-vote-active-down' : ''}`}
                        onClick={() => handleVote(review.review_id, -1)}
                      >
                        ▼
                      </button>
                    </div>
                  </div>

                  <div className="cr-anilist-body">
                    <p className="cr-anilist-text">
                      {displayText}
                    </p>

                    {isLong && (
                      <button
                        onClick={() => toggleExpand(review.review_id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--cr-red)',
                          cursor: 'pointer',
                          padding: 0,
                          fontFamily: 'var(--font-cr)',
                          fontWeight: 'bold',
                          fontSize: '0.85rem'
                        }}
                      >
                        {isExpanded ? 'SHOW LESS' : 'READ MORE'}
                      </button>
                    )}

                    {review.file_path && (
                      <div className="cr-attachment-link">
                        <button
                          type="button"
                          onClick={() => handleDownloadAttachment(review.review_id)}
                          disabled={downloadingId === review.review_id}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--cr-red)',
                            cursor: downloadingId === review.review_id ? 'default' : 'pointer',
                            padding: 0,
                            fontFamily: 'var(--font-cr)',
                            fontWeight: 'bold',
                            fontSize: '0.85rem',
                            textDecoration: 'underline'
                          }}
                        >
                          📎 {downloadingId === review.review_id ? 'Downloading...' : 'Download attached notes'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="cr-anilist-bottom-rating">
                    <div className="cr-rating-metrics">
                      <div className="cr-metric">
                        <span className="cr-metric-label">DIFFICULTY</span>
                        <span className="cr-metric-val">{review.difficulty} / 5</span>
                      </div>
                      <div className="cr-metric">
                        <span className="cr-metric-label">USEFULNESS</span>
                        <span className="cr-metric-val">{review.prereq_use} / 5</span>
                      </div>
                    </div>
                  </div>

                  <div className="cr-anilist-actions">
                    {reportedReviews.has(review.review_id) ? (
                      <span className="cr-report-success">
                        ✅ Report submitted. A moderator will review it.
                      </span>
                    ) : currentUser && reportingId === review.review_id ? (
                      
                      /* UPDATED: Wrapped the report box in a column to display the error text below it */
                      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '0.4rem' }}>
                        <div className="cr-report-box">
                          <input
                            type="text"
                            className="p5-input"
                            placeholder="Reason for reporting..."
                            value={reportReason}
                            onChange={(e) => {
                              setReportReason(e.target.value);
                              if (reportError) setReportError(''); // Clear error when they start typing
                            }}
                            autoFocus
                          />
                          <button className="cr-submit-btn" onClick={() => handleReportSubmit(review.review_id)}>SUBMIT</button>
                          <button className="p5-versions-btn" onClick={() => {
                            setReportingId(null);
                            setReportError(''); // Clear error on cancel
                          }}>CANCEL</button>
                        </div>
                        
                        {/* Display the validation error if it exists */}
                        {reportError && (
                          <span style={{ color: '#ff6b6b', fontSize: '0.85rem', fontWeight: 'bold' }}>
                            {reportError}
                          </span>
                        )}
                      </div>

                    ) : (
                      currentUser && (
                        <button className="cr-report-btn" onClick={() => {
                          setReportingId(review.review_id);
                          setReportReason('');
                          setReportError(''); // Clear previous states when opening
                        }}>
                          ⚑ Report
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
    ),
    document.body
  );
}