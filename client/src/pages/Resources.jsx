import React, { useEffect, useState } from 'react';
import './Resources.css';

// These must match the chk_resource_type CHECK constraint on the
// `resources` table in the database (see schema.sql).
const RESOURCE_TYPES = [
  { type: 'Slides', icon: '📊' },
  { type: 'Previous Year Questions', icon: '📝' },
  { type: 'Notes', icon: '📓' },
  { type: 'Lab reports', icon: '🧪' }
];

const API_BASE = 'http://localhost:5000/api/resources';
const COURSES_API = 'http://localhost:5000/api/courses';

// Reads the logged-in user's ID from what Auth.jsx already saves to
// localStorage at login — used to restrict the parent-version search to
// the current user's own uploads.
function getCurrentUserId() {
  try {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored).user_id : null;
  } catch {
    return null;
  }
}

export default function Resources() {
  const [activeType, setActiveType] = useState(null);
  const [courseSearch, setCourseSearch] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [order, setOrder] = useState('desc');
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Version history (previous versions of a resource, via parent_res_id)
  const [expandedVersionsFor, setExpandedVersionsFor] = useState(null);
  const [versionHistory, setVersionHistory] = useState({}); // { [res_id]: [...] }
  const [loadingVersions, setLoadingVersions] = useState(false);

  // An unfiltered snapshot of all resources, fetched once, used only to
  // populate the parent-resource suggestions below — independent of
  // whatever filters are currently applied to the main list.
  const [allResources, setAllResources] = useState([]);

  // Real course catalog, fetched from the database (not derived from
  // whichever courses happen to already have resources uploaded).
  const [courses, setCourses] = useState([]);

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadData, setUploadData] = useState({
    title: '',
    type: RESOURCE_TYPES[0].type,
    course_code: ''
  });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Parent-resource (previous version) picker state
  const [parentQuery, setParentQuery] = useState('');
  const [selectedParent, setSelectedParent] = useState(null); // { res_id, title } or null
  const [showParentSuggestions, setShowParentSuggestions] = useState(false);

  // Fetch the full unfiltered list once, for the parent-resource search.
  useEffect(() => {
    fetch(API_BASE)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setAllResources(data);
      })
      .catch(() => {
        // Non-critical if this fails — the parent picker just has fewer
        // suggestions; the main list still works.
      });
  }, []);

  // Fetch the real course catalog once, for the course search bar and
  // the upload form's course code field.
  useEffect(() => {
    fetch(COURSES_API)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setCourses(data);
      })
      .catch(() => {
        // Non-critical — inputs fall back to plain free-typed text.
      });
  }, []);

  // Refetch the visible list whenever the type filter or course search
  // changes, debounced so we're not firing a request on every keystroke.
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchResources();
    }, 300);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType, courseSearch, sortBy, order]);

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

  // Unique course codes come from the real course catalog now, not from
  // whichever courses happen to have existing resources.
  const availableCourseCodes = courses.map((c) => c.course_code);

  const handleUploadChange = (e) => {
    setUploadData({ ...uploadData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  // Filter the unfiltered snapshot by title or course code as the user
  // types in the parent-resource search box — restricted to the current
  // user's OWN uploads, since you can only version-link your own work.
  const currentUserId = getCurrentUserId();
  const parentSuggestions = parentQuery.trim()
    ? allResources
        .filter((r) => r.user_id === currentUserId)
        .filter(
          (r) =>
            r.title.toLowerCase().includes(parentQuery.toLowerCase()) ||
            r.course_code.toLowerCase().includes(parentQuery.toLowerCase())
        )
        .slice(0, 6)
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

    setUploading(true);

    // File uploads must use FormData, not JSON.stringify — the browser
    // sets the correct multipart Content-Type header automatically, so
    // don't set Content-Type manually here.
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

      if (!response.ok) {
        throw new Error(data.message || 'Upload failed');
      }

      setUploadData({ title: '', type: RESOURCE_TYPES[0].type, course_code: '' });
      setFile(null);
      handleClearParent();
      setShowUploadForm(false);
      fetchResources(); // refresh the visible list
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

      if (!response.ok) {
        throw new Error(data.message || 'Vote failed');
      }

      // Update just this one card's tally/vote state, instead of
      // refetching the entire list.
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

  const toggleVersions = async (resId) => {
    if (expandedVersionsFor === resId) {
      setExpandedVersionsFor(null);
      return;
    }

    setExpandedVersionsFor(resId);

    // Only fetch once per resource — cache the result.
    if (!versionHistory[resId]) {
      setLoadingVersions(true);
      try {
        const response = await fetch(`${API_BASE}/${resId}/versions`);
        const data = await response.json();
        if (response.ok) {
          setVersionHistory((prev) => ({ ...prev, [resId]: data }));
        }
      } catch (err) {
        // Non-critical — the panel will just show "no versions found"
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

      // The response body IS the file itself — fetch doesn't trigger a
      // browser download automatically, so we convert it to a Blob and
      // simulate a click on a temporary link to save it.
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

  // The DB only stores file_path, not a separate file-type field — derive
  // the badge (PDF/ZIP) from the file's extension instead.
  const getFileExtension = (filePath) => {
    if (!filePath) return 'FILE';
    const parts = filePath.split('.');
    return parts.length > 1 ? parts.pop().toUpperCase() : 'FILE';
  };

  return (
    <>
      <div className="p5-page-header">
        <h2>RESOURCES ARCHIVE</h2>
        <button className="p5-action-btn" onClick={() => setShowUploadForm((prev) => !prev)}>
          {showUploadForm ? 'CANCEL' : '+ UPLOAD RESOURCE'}
        </button>
      </div>

      <form
        onSubmit={handleUploadSubmit}
        className={`p5-upload-form${showUploadForm ? '' : ' p5-form-closed'}`}
      >
        {uploadError && <div className="p5-error">{uploadError}</div>}

        <div>
          <label className="p5-label">Title</label>
          <input
            type="text"
            name="title"
            required
            value={uploadData.title}
            onChange={handleUploadChange}
            className="p5-input"
          />
        </div>

        <div>
          <label className="p5-label">Type</label>
          <select
            name="type"
            required
            value={uploadData.type}
            onChange={handleUploadChange}
            className="p5-input"
          >
            {RESOURCE_TYPES.map((t) => (
              <option key={t.type} value={t.type}>{t.type}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="p5-label">Course Code</label>
          <input
            type="text"
            name="course_code"
            list="upload-course-options"
            required
            placeholder="e.g. CSE204"
            value={uploadData.course_code}
            onChange={handleUploadChange}
            className="p5-input"
          />
          <datalist id="upload-course-options">
            {courses.map((c) => (
              <option key={c.course_code} value={c.course_code}>
                {c.title}
              </option>
            ))}
          </datalist>
        </div>

        <div className="p5-parent-search-wrapper">
          <label className="p5-label">Previous Version (optional)</label>
          <div className="p5-parent-input-row">
            <input
              type="text"
              placeholder="Search by title to link a previous version..."
              value={parentQuery}
              onChange={(e) => {
                setParentQuery(e.target.value);
                setSelectedParent(null); // typing invalidates a prior selection
                setShowParentSuggestions(true);
              }}
              onFocus={() => setShowParentSuggestions(true)}
              className="p5-input"
            />
            {selectedParent && (
              <button
                type="button"
                onClick={handleClearParent}
                className="p5-parent-clear-btn"
                aria-label="Clear selected parent resource"
              >
                ✕
              </button>
            )}
          </div>

          {showParentSuggestions && parentSuggestions.length > 0 && (
            <ul className="p5-parent-suggestions">
              {parentSuggestions.map((r) => (
                <li key={r.res_id}>
                  <button
                    type="button"
                    className="p5-parent-suggestion-item"
                    onClick={() => handleSelectParent(r)}
                  >
                    <span className="p5-parent-suggestion-title">{r.title}</span>
                    <span className="p5-parent-suggestion-meta">{r.course_code}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selectedParent && (
            <p className="p5-parent-selected-note">
              This upload will be linked as a new version of "{selectedParent.title}".
            </p>
          )}
        </div>

        <div>
          <label className="p5-label">File (PDF or ZIP)</label>
          <div className="p5-file-input-wrapper">
            <label htmlFor="resource-file" className="p5-file-btn">
              Choose File
            </label>
            <span className="p5-file-name">
              {file ? file.name : 'No file chosen'}
            </span>
            <input
              id="resource-file"
              type="file"
              accept=".pdf,.zip"
              required
              onChange={handleFileChange}
              className="p5-file-input-hidden"
            />
          </div>
        </div>

        <button type="submit" disabled={uploading} className="p5-btn">
          {uploading ? 'UPLOADING...' : 'SUBMIT'}
        </button>
      </form>

      <div className="p5-type-grid">
        {RESOURCE_TYPES.map((t) => (
          <button
            key={t.type}
            className={`p5-type-card${activeType === t.type ? ' p5-type-active' : ''}`}
            onClick={() => handleTypeClick(t.type)}
          >
            <span className="p5-type-icon">{t.icon}</span>
            <span className="p5-type-label">{t.type}</span>
          </button>
        ))}
      </div>

      <div className="p5-course-search-wrapper">
        <input
          type="text"
          list="course-code-options"
          placeholder="🔍 Search by course code (e.g. CSE204)..."
          value={courseSearch}
          onChange={(e) => setCourseSearch(e.target.value)}
          className="p5-input p5-course-search-input"
        />
        <datalist id="course-code-options">
          {availableCourseCodes.map((code) => (
            <option key={code} value={code} />
          ))}
        </datalist>
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
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="p5-input p5-sort-select"
        >
          <option value="default">Sort: Newest</option>
          <option value="votes">Sort: Votes</option>
          <option value="downloads">Sort: Downloads</option>
        </select>
        <button
          type="button"
          className="p5-order-btn"
          onClick={() => setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
        >
          {order === 'asc' ? '↑ ASCENDING' : '↓ DESCENDING'}
        </button>
      </div>

      {loading && <p className="p5-empty-state">Loading resources...</p>}
      {error && <p className="p5-error">{error}</p>}

      {!loading && !error && (
        <div className="p5-resource-list">
          {resources.map((res) => (
            <div key={res.res_id} className="p5-resource-card-wrapper">
              <div className="p5-resource-card">
                <div className="p5-vote-column">
                  <button
                    className={`p5-vote-btn${res.current_vote === 1 ? ' p5-vote-active-up' : ''}`}
                    onClick={() => handleVote(res.res_id, 1)}
                    aria-label="Upvote"
                  >
                    ▲
                  </button>
                  <span className="p5-vote-tally">{res.vote_tally}</span>
                  <button
                    className={`p5-vote-btn${res.current_vote === -1 ? ' p5-vote-active-down' : ''}`}
                    onClick={() => handleVote(res.res_id, -1)}
                    aria-label="Downvote"
                  >
                    ▼
                  </button>
                </div>

                <div className="p5-resource-badge">{getFileExtension(res.file_path)}</div>
                <div className="p5-resource-details">
                  <h4>{res.title}</h4>
                  <p>
                    Course: <strong>{res.course_code}</strong>
                    {' | '}Uploaded by: <strong>{res.uploader_name || 'Unknown'}</strong>
                  </p>
                </div>
                <div className="p5-resource-meta">
                  <span>📥 {res.download_count}</span>
                  {res.parent_res_id && (
                    <button
                      className="p5-versions-btn"
                      onClick={() => toggleVersions(res.res_id)}
                    >
                      🕘 {expandedVersionsFor === res.res_id ? 'HIDE VERSIONS' : 'PREVIOUS VERSIONS'}
                    </button>
                  )}
                  <button className="p5-card-btn" onClick={() => handleDownload(res.res_id, res.title)}>
                    DOWNLOAD
                  </button>
                </div>
              </div>

              {expandedVersionsFor === res.res_id && (
                <div className="p5-version-history">
                  {loadingVersions && !versionHistory[res.res_id] && (
                    <p className="p5-empty-state">Loading versions...</p>
                  )}
                  {versionHistory[res.res_id] && versionHistory[res.res_id].length === 0 && (
                    <p className="p5-empty-state">No previous versions found.</p>
                  )}
                  {versionHistory[res.res_id] &&
                    versionHistory[res.res_id].map((v) => (
                      <div key={v.res_id} className="p5-version-item">
                        <span className="p5-version-tag">v{v.version}</span>
                        <span className="p5-version-title">{v.title}</span>
                        <button
                          className="p5-card-btn"
                          onClick={() => handleDownload(v.res_id, v.title)}
                        >
                          DOWNLOAD
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}

          {resources.length === 0 && (
            <p className="p5-empty-state">
              No resources found{activeType ? ` for "${activeType}"` : ''}
              {courseSearch ? ` matching "${courseSearch}"` : ''}.
            </p>
          )}
        </div>
      )}
    </>
  );
}