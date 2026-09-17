import React, { useEffect, useState, useRef } from 'react';
import './Resources.css';

const RESOURCE_TYPES = [
  { type: 'Slides', icon: '📊' },
  { type: 'Previous Year Questions', icon: '📝' },
  { type: 'Notes', icon: '📓' },
  { type: 'Lab reports', icon: '🧪' }
];

const API_BASE = 'http://localhost:5000/api/resources';
const COURSES_API = `${API_BASE}/courses`;
const MY_VERSIONS_API = `${API_BASE}/my-versions`;

export default function Resources() {
  const [activeType, setActiveType] = useState(RESOURCE_TYPES[0].type);
  const [courseSearch, setCourseSearch] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [order, setOrder] = useState('desc');
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [expandedVersionsFor, setExpandedVersionsFor] = useState(null);
  const [versionHistory, setVersionHistory] = useState({});
  const [loadingVersions, setLoadingVersions] = useState(false);

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadData, setUploadData] = useState({
    title: '',
    type: RESOURCE_TYPES[0].type,
    course_code: ''
  });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [reportingId, setReportingId] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportError, setReportError] = useState('');
  const [reportedResources, setReportedResources] = useState(new Set());

  // Course dropdown state & ref (matches CourseReviews.jsx's debounced
  // server-search pattern — courseMatches is populated by a fetch to
  // COURSES_API?search=..., not filtered client-side from a preloaded list)
  const [courseQuery, setCourseQuery] = useState('');
  const [courseMatches, setCourseMatches] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [showCourseSuggestions, setShowCourseSuggestions] = useState(false);
  const courseBoxRef = useRef(null);
  const [searchCourseMatches, setSearchCourseMatches] = useState([]);
  const [showSearchCourseSuggestions, setShowSearchCourseSuggestions] = useState(false);
  const searchCourseBoxRef = useRef(null);

  // Parent resource picker state & ref
  const [parentQuery, setParentQuery] = useState('');
  const [parentResources, setParentResources] = useState([]);
  const [selectedParent, setSelectedParent] = useState(null);
  const [showParentSuggestions, setShowParentSuggestions] = useState(false);
  const parentBoxRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (courseBoxRef.current && !courseBoxRef.current.contains(e.target)) {
        setShowCourseSuggestions(false);
      }
      if (searchCourseBoxRef.current && !searchCourseBoxRef.current.contains(e.target)) {
        setShowSearchCourseSuggestions(false);
      }
      if (parentBoxRef.current && !parentBoxRef.current.contains(e.target)) {
        setShowParentSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchResources();
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [activeType, courseSearch, sortBy, order]);

  // Debounced course search for the upload form's course picker — mirrors
  // WriteReviewForm's course dropdown in CourseReviews.jsx exactly: query
  // the server as the user types instead of filtering a preloaded array.
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

  useEffect(() => {
    if (!selectedCourse) {
      setParentResources([]);
      return;
    }

    const controller = new AbortController();
    fetch(`${MY_VERSIONS_API}?course_code=${encodeURIComponent(selectedCourse.course_code)}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      signal: controller.signal
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setParentResources(data);
        else setParentResources([]);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setParentResources([]);
      });

    return () => controller.abort();
  }, [selectedCourse]);

  useEffect(() => {
    const query = courseSearch.trim();
    if (!query) {
      setSearchCourseMatches([]);
      return;
    }
    const timeoutId = setTimeout(() => {
      fetch(`${COURSES_API}?search=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setSearchCourseMatches(data.slice(0, 8));
        })
        .catch(() => setSearchCourseMatches([]));
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [courseSearch]);

  const fetchResources = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (activeType) params.append('type', activeType);
      if (courseSearch.trim()) params.append('course_code', courseSearch.trim());
      params.append('sortBy', sortBy);
      params.append('order', order);

      const response = await fetch(`${API_BASE}?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to load resources');
      }

      setResources(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTypeClick = (type) => {
    setActiveType((prev) => (prev === type ? null : type));
  };

  const handleUploadChange = (e) => {
    setUploadData({ ...uploadData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const pickCourse = (c) => {
    setSelectedCourse(c);
    setCourseQuery(`${c.course_code} — ${c.title}`);
    setCourseMatches([]);
    setShowCourseSuggestions(false);
    handleClearParent();
    setUploadData((prev) => ({ ...prev, course_code: c.course_code }));
  };

  const clearCourse = () => {
    setSelectedCourse(null);
    setCourseQuery('');
    setCourseMatches([]);
    handleClearParent();
    setUploadData((prev) => ({ ...prev, course_code: '' }));
  };

  const parentSuggestions = selectedCourse
    ? parentResources
        .filter((r) => !parentQuery.trim() || r.title.toLowerCase().includes(parentQuery.toLowerCase()))
        .slice(0, 8)
    : [];

  const handleSelectParent = (resource) => {
    setSelectedParent({ res_id: resource.res_id, title: resource.title });
    setParentQuery(resource.title);
    setShowParentSuggestions(false);
  };

  const handleClearParent = () => {
    setSelectedParent(null);
    setParentQuery('');
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    setUploadError('');

    if (!file) {
      setUploadError('Please select a PDF or ZIP file');
      return;
    }

    if (!uploadData.course_code) {
      setUploadError('Please select a course from the dropdown');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', uploadData.title);
    formData.append('type', uploadData.type);
    formData.append('course_code', uploadData.course_code);
    if (selectedParent) {
      formData.append('parent_res_id', selectedParent.res_id);
    }

    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Upload failed');

      setUploadData({ title: '', type: RESOURCE_TYPES[0].type, course_code: '' });
      setFile(null);
      handleClearParent();
      clearCourse();
      setShowUploadForm(false);
      fetchResources();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleVote = async (resId, value) => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in to vote.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/${resId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ value })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Vote failed');

      setResources((prev) =>
        prev.map((res) =>
          res.res_id === resId
            ? { ...res, vote_tally: data.votes, current_vote: data.currentVote }
            : res
        )
      );
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReportSubmit = async (resId) => {
    if (!reportReason.trim()) {
      setReportError('Please enter a reason for reporting.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ target_type: 'resource', target_id: resId, reason: reportReason })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to report resource');

      setReportedResources((prev) => new Set(prev).add(resId));
      setReportingId(null);
      setReportReason('');
      setReportError('');
    } catch (err) {
      setReportError(err.message);
    }
  };

  const toggleVersions = async (resId) => {
    if (expandedVersionsFor === resId) {
      setExpandedVersionsFor(null);
      return;
    }

    setExpandedVersionsFor(resId);
    if (!versionHistory[resId]) {
      setLoadingVersions(true);
      try {
        const response = await fetch(`${API_BASE}/${resId}/versions`);
        const data = await response.json();
        if (response.ok) {
          setVersionHistory((prev) => ({ ...prev, [resId]: data }));
        }
      } catch (err) {
      } finally {
        setLoadingVersions(false);
      }
    }
  };

  const handleDownload = async (resId, title) => {
    try {
      const response = await fetch(`${API_BASE}/${resId}/download`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Download failed');
      }

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

  const getFileExtension = (filePath) => {
    if (!filePath) return 'FILE';
    const parts = filePath.split('.');
    return parts.length > 1 ? parts.pop().toUpperCase() : 'FILE';
  };

  return (
    <section className="resources-page">
      <header className="res-page-header">
        <div>
          <p className="res-kicker">KNOWLEDGE LIBRARY</p>
          <h2>Resources, made useful.</h2>
          <span>Find curated notes, slides, past questions, and versioned files by course.</span>
        </div>
        <button className="res-action-btn" onClick={() => setShowUploadForm((prev) => !prev)}>
          {showUploadForm ? 'CANCEL' : '+ UPLOAD RESOURCE'}
        </button>
      </header>

      <form
        onSubmit={handleUploadSubmit}
        className={`res-upload-form${showUploadForm ? '' : ' res-form-closed'}`}
      >
        {uploadError && <div className="res-error">{uploadError}</div>}

        <div>
          <label className="res-label">Title</label>
          <input
            type="text"
            name="title"
            required
            value={uploadData.title}
            onChange={handleUploadChange}
            className="res-input"
          />
        </div>

        <div>
          <label className="res-label">Type</label>
          <select
            name="type"
            required
            value={uploadData.type}
            onChange={handleUploadChange}
            className="res-input"
          >
            {RESOURCE_TYPES.map((t) => (
              <option key={t.type} value={t.type}>{t.type}</option>
            ))}
          </select>
        </div>

        <div className="res-parent-search-wrapper" ref={courseBoxRef}>
          <label className="res-label">Select Course Code *</label>
          <div className="res-parent-input-row">
            <input
              type="text"
              className="res-input"
              placeholder="Type a course code or name..."
              value={courseQuery}
              onChange={(e) => {
                setCourseQuery(e.target.value);
                setSelectedCourse(null);
                setShowCourseSuggestions(true);
                setUploadData((prev) => ({ ...prev, course_code: '' }));
              }}
              onFocus={() => setShowCourseSuggestions(true)}
              autoComplete="off"
              required
            />
            {courseQuery && (
              <button
                type="button"
                className="res-parent-clear-btn"
                onClick={clearCourse}
                aria-label="Clear course"
              >
                ✕
              </button>
            )}
          </div>

          {showCourseSuggestions && !selectedCourse && courseMatches.length > 0 && (
            <ul className="res-parent-suggestions">
              {courseMatches.map((c) => (
                <li key={c.course_code}>
                  <button
                    type="button"
                    className="res-parent-suggestion-item"
                    onClick={() => pickCourse(c)}
                  >
                    <span className="res-parent-suggestion-title">{c.title}</span>
                    <span className="res-parent-suggestion-meta">{c.course_code}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selectedCourse && (
            <p className="res-parent-selected-note">
              Selected: {selectedCourse.course_code} — {selectedCourse.title}
            </p>
          )}
        </div>

        <div className="res-parent-search-wrapper" ref={parentBoxRef}>
          <label className="res-label">Previous Version (optional)</label>
          <div className="res-parent-input-row">
            <input
              type="text"
              placeholder={selectedCourse ? 'Select a previous version...' : 'Choose a course first'}
              value={parentQuery}
              onChange={(e) => {
                setParentQuery(e.target.value);
                setSelectedParent(null);
                setShowParentSuggestions(true);
              }}
              onFocus={() => selectedCourse && setShowParentSuggestions(true)}
              disabled={!selectedCourse}
              autoComplete="off"
              className="res-input"
            />
            {selectedParent && (
              <button
                type="button"
                onClick={handleClearParent}
                className="res-parent-clear-btn"
                aria-label="Clear selected parent resource"
              >
                ✕
              </button>
            )}
          </div>

          {showParentSuggestions && parentSuggestions.length > 0 && (
            <ul className="res-parent-suggestions">
              {parentSuggestions.map((r) => (
                <li key={r.res_id}>
                  <button
                    type="button"
                    className="res-parent-suggestion-item"
                    onClick={() => handleSelectParent(r)}
                  >
                    <span className="res-parent-suggestion-title">{r.title}</span>
                    <span className="res-parent-suggestion-meta">VERSION {r.version || 1}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selectedParent && (
            <p className="res-parent-selected-note">
              This upload will be linked as a new version of "{selectedParent.title}".
            </p>
          )}
        </div>

        <div>
          <label className="res-label">File (PDF or ZIP)</label>
          <div className="res-file-input-wrapper">
            <label htmlFor="resource-file" className="res-file-btn">
              Choose File
            </label>
            <span className="res-file-name">
              {file ? file.name : 'No file chosen'}
            </span>
            <input
              id="resource-file"
              type="file"
              accept=".pdf,.zip"
              required
              onChange={handleFileChange}
              className="res-file-input-hidden"
            />
          </div>
        </div>

        <button type="submit" disabled={uploading} className="res-btn">
          {uploading ? 'UPLOADING...' : 'SUBMIT'}
        </button>
      </form>

      <div className="res-toolbar-heading">
        <div>
          <p className="res-kicker">BROWSE THE LIBRARY</p>
          <h3>What are you looking for?</h3>
        </div>
        <span>{activeType ? `${activeType} selected` : 'All resource types'}</span>
      </div>

      <div className="res-type-grid">
        {RESOURCE_TYPES.map((t) => (
          <button
            key={t.type}
            className={`res-type-card${activeType === t.type ? ' res-type-active' : ''}`}
            onClick={() => handleTypeClick(t.type)}
          >
            <span className="res-type-icon">{t.icon}</span>
            <span className="res-type-label">{t.type}</span>
          </button>
        ))}
      </div>

      <div className="res-course-search-wrapper res-parent-search-wrapper" ref={searchCourseBoxRef}>
        <input
          type="text"
          placeholder="🔍 Search by course code (e.g. CSE204)..."
          value={courseSearch}
          onChange={(e) => {
            setCourseSearch(e.target.value);
            setShowSearchCourseSuggestions(true);
          }}
          onFocus={() => setShowSearchCourseSuggestions(true)}
          autoComplete="off"
          className="res-input res-course-search-input"
        />
        {courseSearch && (
          <button
            type="button"
            onClick={() => {
              setCourseSearch('');
              setShowSearchCourseSuggestions(false);
            }}
            className="res-parent-clear-btn"
            aria-label="Clear course search"
          >
            ✕
          </button>
        )}
        {showSearchCourseSuggestions && searchCourseMatches.length > 0 && (
          <ul className="res-parent-suggestions">
            {searchCourseMatches.map((course) => (
              <li key={course.course_code}>
                <button
                  type="button"
                  className="res-parent-suggestion-item"
                  onClick={() => {
                    setCourseSearch(course.course_code);
                    setShowSearchCourseSuggestions(false);
                  }}
                >
                  <span className="res-parent-suggestion-title">{course.title}</span>
                  <span className="res-parent-suggestion-meta">{course.course_code}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="res-sort-bar">
        <span className="res-sort-label">ORDER RESULTS</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="res-input res-sort-select"
        >
          <option value="default">Sort: Newest</option>
          <option value="votes">Sort: Votes</option>
          <option value="downloads">Sort: Downloads</option>
        </select>
        <button
          type="button"
          className="res-order-btn"
          onClick={() => setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
        >
          {order === 'asc' ? '↑ ASCENDING' : '↓ DESCENDING'}
        </button>
      </div>

      {loading && (
        <div className="res-resource-list data-skeleton-resources" aria-label="Loading resources">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="res-resource-card-wrapper" key={index}>
              <div className="res-resource-card data-skeleton-resource">
                <span className="data-skeleton-block badge" />
                <div className="data-skeleton-resource-copy">
                  <span className="data-skeleton-line title" />
                  <span className="data-skeleton-line medium" />
                </div>
                <span className="data-skeleton-line action" />
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="res-error">{error}</p>}

      {!loading && !error && (
        <div className="res-resource-list">
          <div className="res-results-summary">
            <span>{resources.length} {resources.length === 1 ? 'resource' : 'resources'} found</span>
            <span>{courseSearch ? `Matching ${courseSearch}` : 'Across AcademicOS'}</span>
          </div>
          {resources.map((res) => (
            <div key={res.res_id} className="res-resource-card-wrapper">
              <div className="res-resource-card">
                <div className="res-vote-column">
                  <button
                    className={`res-vote-btn${res.current_vote === 1 ? ' res-vote-active-up' : ''}`}
                    onClick={() => handleVote(res.res_id, 1)}
                    aria-label="Upvote"
                  >
                    ▲
                  </button>
                  <span className="res-vote-tally">{res.vote_tally}</span>
                  <button
                    className={`res-vote-btn${res.current_vote === -1 ? ' res-vote-active-down' : ''}`}
                    onClick={() => handleVote(res.res_id, -1)}
                    aria-label="Downvote"
                  >
                    ▼
                  </button>
                </div>

                <div className="res-resource-badge">{getFileExtension(res.file_path)}</div>
                <div className="res-resource-details">
                  <h4>{res.title}</h4>
                  <p>
                    Course: <strong>{res.course_code}</strong>
                    {' | '}Uploaded by: <strong>{res.uploader_name || 'Unknown'}</strong>
                  </p>
                </div>
                <div className="res-resource-meta">
                  <span>📥 {res.download_count}</span>
                  {res.parent_res_id && (
                    <button
                      className="res-versions-btn"
                      onClick={() => toggleVersions(res.res_id)}
                    >
                      🕘 {expandedVersionsFor === res.res_id ? 'HIDE VERSIONS' : 'PREVIOUS VERSIONS'}
                    </button>
                  )}
                  <button className="res-card-btn" onClick={() => handleDownload(res.res_id, res.title)}>
                    DOWNLOAD
                  </button>

                  {/* MODIFIED REPORT BLOCK STARTS HERE */}
                  {reportedResources.has(res.res_id) ? (
                    <span className="cr-report-success">
                      ✅ Report submitted. A moderator will review it.
                    </span>
                  ) : reportingId === res.res_id ? (
                    <div className="res-report-form res-report-form-active">
                      <div className="cr-report-box">
                        <input
                          type="text"
                          className="p5-input"
                          placeholder="Reason for reporting..."
                          value={reportReason}
                          onChange={(e) => {
                            setReportReason(e.target.value);
                            if (reportError) setReportError('');
                          }}
                          autoFocus
                        />
                        <button className="cr-submit-btn" onClick={() => handleReportSubmit(res.res_id)}>SUBMIT</button>
                        <button className="p5-versions-btn" onClick={() => {
                          setReportingId(null);
                          setReportReason('');
                          setReportError('');
                        }}>CANCEL</button>
                      </div>
                      {reportError && (
                        <span style={{ color: '#ff6b6b', fontSize: '0.85rem', fontWeight: 'bold' }}>
                          {reportError}
                        </span>
                      )}
                    </div>
                  ) : (
                    <button className="cr-report-btn" onClick={() => {
                      if (!localStorage.getItem('token')) {
                        alert('Please log in to report a resource.');
                        return;
                      }
                      setReportingId(res.res_id);
                      setReportReason('');
                      setReportError('');
                    }}>
                      ⚑ Report
                    </button>
                  )}
                  {/* MODIFIED REPORT BLOCK ENDS HERE */}
                  
                </div>
              </div>

              <div
                className={`res-version-history${expandedVersionsFor === res.res_id ? ' res-version-history-open' : ''}`}
                aria-hidden={expandedVersionsFor !== res.res_id}
              >
                <div className="res-version-history-inner">
                  {loadingVersions && !versionHistory[res.res_id] && (
                    <p className="res-empty-state">Loading versions...</p>
                  )}
                  {versionHistory[res.res_id] && versionHistory[res.res_id].length === 0 && (
                    <p className="res-empty-state">No previous versions found.</p>
                  )}
                  {versionHistory[res.res_id] &&
                    versionHistory[res.res_id].map((v) => (
                      <div key={v.res_id} className="res-version-item">
                        <span className="res-version-tag">v{v.version}</span>
                        <span className="res-version-title">{v.title}</span>
                        <button
                          className="res-card-btn"
                          onClick={() => handleDownload(v.res_id, v.title)}
                        >
                          DOWNLOAD
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ))}

          {resources.length === 0 && (
            <p className="res-empty-state">
              No resources found{activeType ? ` for "${activeType}"` : ''}
              {courseSearch ? ` matching "${courseSearch}"` : ''}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
