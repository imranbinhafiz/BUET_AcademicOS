import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './Performance.css';

const API_BASE = 'http://localhost:5000/api/performance';

const GRADE_OPTIONS = [
  { value: '', label: 'Select grade point' },
  { value: '4', label: '4.00  A+' },
  { value: '3.75', label: '3.75  A' },
  { value: '3.5', label: '3.50  A-' },
  { value: '3.25', label: '3.25  B+' },
  { value: '3', label: '3.00  B' },
  { value: '2.75', label: '2.75  B-' },
  { value: '2.5', label: '2.50  C+' },
  { value: '2.25', label: '2.25  C' },
  { value: '2', label: '2.00  D' },
  { value: '0', label: '0.00  F' }
];

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

function formatGpa(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '—';
}

export default function Performance() {
  const token = localStorage.getItem('token');
  const user = getStoredUser();
  const [terms, setTerms] = useState([]);
  const [selectedTerm, setSelectedTerm] = useState('');
  const [activeView, setActiveView] = useState('mine');
  const [myPerformance, setMyPerformance] = useState(null);
  const [batchStats, setBatchStats] = useState(null);
  const [gradeDrafts, setGradeDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingCourse, setSavingCourse] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    async function loadTerms() {
      try {
        const response = await fetch(`${API_BASE}/terms`, { headers });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not load terms');

        setTerms(data.terms);
        setSelectedTerm((current) => current || data.terms[0] || '');
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }

    loadTerms();
    // The token determines authentication for this first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || !selectedTerm) return;

    async function loadPerformance() {
      setLoading(true);
      setError('');

      try {
        const termQuery = `level_term=${encodeURIComponent(selectedTerm)}`;
        const [myResponse, batchResponse] = await Promise.all([
          fetch(`${API_BASE}/me?${termQuery}`, { headers }),
          fetch(`${API_BASE}/batch-stats?${termQuery}`, { headers })
        ]);
        const [myData, batchData] = await Promise.all([
          myResponse.json(),
          batchResponse.json()
        ]);

        if (!myResponse.ok) throw new Error(myData.message || 'Could not load your results');
        if (!batchResponse.ok) throw new Error(batchData.message || 'Could not load batch statistics');

        setMyPerformance(myData);
        setBatchStats(batchData);
        setGradeDrafts(
          Object.fromEntries(
            myData.courses.map((course) => [
              course.course_code,
              course.grade_point == null ? '' : String(course.grade_point)
            ])
          )
        );
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadPerformance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTerm, token]);

  async function refreshSelectedTerm() {
    const termQuery = `level_term=${encodeURIComponent(selectedTerm)}`;
    const [myResponse, batchResponse] = await Promise.all([
      fetch(`${API_BASE}/me?${termQuery}`, { headers }),
      fetch(`${API_BASE}/batch-stats?${termQuery}`, { headers })
    ]);
    const [myData, batchData] = await Promise.all([myResponse.json(), batchResponse.json()]);

    if (!myResponse.ok) throw new Error(myData.message || 'Could not refresh your results');
    if (!batchResponse.ok) throw new Error(batchData.message || 'Could not refresh batch statistics');

    setMyPerformance(myData);
    setBatchStats(batchData);
    setGradeDrafts(
      Object.fromEntries(
        myData.courses.map((course) => [
          course.course_code,
          course.grade_point == null ? '' : String(course.grade_point)
        ])
      )
    );
  }

  async function saveGrade(courseCode) {
    const gradePoint = gradeDrafts[courseCode];
    if (gradePoint === '' || gradePoint === undefined) {
      setError('Choose a grade point before saving.');
      return;
    }

    setSavingCourse(courseCode);
    setError('');
    setNotice('');

    try {
      const response = await fetch(`${API_BASE}/me/${encodeURIComponent(courseCode)}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade_point: Number(gradePoint),
          level_term: selectedTerm
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not save grade point');

      await refreshSelectedTerm();
      setNotice(`${courseCode} saved.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCourse(null);
    }
  }

  async function deleteGrade(courseCode) {
    if (!window.confirm(`Remove the saved result for ${courseCode}?`)) return;

    setSavingCourse(courseCode);
    setError('');
    setNotice('');

    try {
      const response = await fetch(`${API_BASE}/me/${encodeURIComponent(courseCode)}`, {
        method: 'DELETE',
        headers
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not remove grade point');

      await refreshSelectedTerm();
      setNotice(`${courseCode} removed.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCourse(null);
    }
  }

  if (!token || !user) {
    return (
      <section className="performance-page">
        <div className="p5-page-header">
          <h2>TERM PERFORMANCE</h2>
        </div>
        <div className="performance-login-card">
          <h3>LOG IN TO TRACK RESULTS</h3>
          <p>Save your course grade points, calculate your term GPA, and view anonymous batch statistics.</p>
          <Link to="/login" className="performance-primary-button">LOG IN</Link>
        </div>
      </section>
    );
  }

  const summary = myPerformance?.summary;
  const batchSummary = batchStats?.summary;

  return (
    <section className="performance-page">
      <div className="p5-page-header performance-header">
        <div>
          <p className="performance-kicker">ACADEMIC RECORD</p>
          <h2>TERM PERFORMANCE</h2>
        </div>
        <label className="performance-term-picker">
          <span>SELECT TERM</span>
          <select value={selectedTerm} onChange={(event) => setSelectedTerm(event.target.value)}>
            {terms.map((term) => <option key={term} value={term}>LEVEL {term}</option>)}
          </select>
        </label>
      </div>

      <div className="performance-tabs" role="tablist" aria-label="Performance views">
        <button
          type="button"
          className={activeView === 'mine' ? 'performance-tab active' : 'performance-tab'}
          onClick={() => setActiveView('mine')}
        >
          MY RESULT
        </button>
        <button
          type="button"
          className={activeView === 'batch' ? 'performance-tab active' : 'performance-tab'}
          onClick={() => setActiveView('batch')}
        >
          BATCH {user.batch || ''} STATISTICS
        </button>
      </div>

      {error && <div className="performance-message error">{error}</div>}
      {notice && <div className="performance-message success">{notice}</div>}
      {loading && <p className="performance-loading">Loading performance data...</p>}

      {!loading && activeView === 'mine' && myPerformance && (
        <>
          <div className="performance-summary-grid">
            <article className="performance-summary-card featured">
              <span>TERM GPA</span>
              <strong>{formatGpa(summary.term_gpa)}</strong>
              <small>Credit-weighted calculation</small>
            </article>
            <article className="performance-summary-card">
              <span>COURSES RECORDED</span>
              <strong>{summary.recorded_courses}</strong>
              <small>out of {myPerformance.courses.length} courses shown</small>
            </article>
            <article className="performance-summary-card">
              <span>CREDITS RECORDED</span>
              <strong>{formatGpa(summary.recorded_credits)}</strong>
              <small>Only saved results contribute to GPA</small>
            </article>
          </div>

          <div className="performance-note">
            Enter one official BUET grade point for every completed course. Your term GPA is calculated as
            <strong> Σ(grade point × credit) / Σ(credit)</strong>. Batch statistics count only complete term submissions.
          </div>

          <div className="performance-table-card">
            <div className="performance-table-heading">
              <div>
                <h3>LEVEL {selectedTerm} COURSES</h3>
                <p>Save or update each course result whenever you receive it.</p>
              </div>
            </div>

            <div className="performance-course-table" role="table">
              <div className="performance-course-row table-head" role="row">
                <span>COURSE</span><span>CREDITS</span><span>GRADE POINT</span><span>ACTION</span>
              </div>
              {myPerformance.courses.map((course) => {
                const hasSavedGrade = course.grade_point !== null && course.grade_point !== undefined;
                const isSaving = savingCourse === course.course_code;
                return (
                  <div className="performance-course-row" role="row" key={course.course_code}>
                    <div className="performance-course-name">
                      <strong>{course.course_code}</strong>
                      <span>{course.title}</span>
                    </div>
                    <span>{formatGpa(course.credits)}</span>
                    <select
                      aria-label={`Grade point for ${course.course_code}`}
                      value={gradeDrafts[course.course_code] ?? ''}
                      onChange={(event) => setGradeDrafts((current) => ({
                        ...current,
                        [course.course_code]: event.target.value
                      }))}
                    >
                      {GRADE_OPTIONS.map((option) => (
                        <option key={option.value || 'none'} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <div className="performance-actions">
                      <button
                        type="button"
                        className="performance-primary-button compact"
                        disabled={isSaving}
                        onClick={() => saveGrade(course.course_code)}
                      >
                        {isSaving ? 'SAVING...' : hasSavedGrade ? 'UPDATE' : 'SAVE'}
                      </button>
                      {hasSavedGrade && (
                        <button
                          type="button"
                          className="performance-remove-button"
                          disabled={isSaving}
                          onClick={() => deleteGrade(course.course_code)}
                        >
                          REMOVE
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {myPerformance.courses.length === 0 && (
                <p className="performance-empty">No courses are currently assigned to Level {selectedTerm}.</p>
              )}
            </div>
          </div>
        </>
      )}

      {!loading && activeView === 'batch' && batchStats && (
        <>
          <div className="performance-batch-intro">
            <p className="performance-kicker">ANONYMOUS AGGREGATE</p>
            <h3>BATCH {batchStats.batch} · LEVEL {selectedTerm}</h3>
            <p>Statistics include students who have submitted at least one course result for this term. Individual results are never shown.</p>
          </div>

          <div className="performance-summary-grid">
            <article className="performance-summary-card featured">
              <span>BATCH AVERAGE GPA</span>
              <strong>{formatGpa(batchSummary.batch_average_gpa)}</strong>
              <small>Average of submitted student term GPAs</small>
            </article>
            <article className="performance-summary-card">
              <span>COMPLETE RESULTS</span>
              <strong>{batchSummary.completed_students}</strong>
              <small>{batchSummary.students_with_any_data} started · {batchSummary.total_students} registered</small>
            </article>
            <article className="performance-summary-card">
              <span>HIGHEST / LOWEST</span>
              <strong>{formatGpa(batchSummary.highest_gpa)} / {formatGpa(batchSummary.lowest_gpa)}</strong>
              <small>Submitted term GPAs only</small>
            </article>
          </div>

          <div className="performance-table-card">
            <div className="performance-table-heading">
              <div>
                <h3>COURSE-WISE BATCH SNAPSHOT</h3>
                <p>Use this to spot difficult courses and compare aggregate outcomes.</p>
              </div>
            </div>
            <div className="performance-course-table batch" role="table">
              {!batchStats.privacy_threshold_met && (
                <p className="performance-privacy-note">
                  Aggregate GPA is hidden until at least {batchStats.minimum_anonymous_cohort} students submit all
                  {` ${batchSummary.expected_courses}`} courses for this term. This keeps individual results private.
                </p>
              )}
              <div className="performance-course-row batch-head table-head" role="row">
                <span>COURSE</span><span>SUBMISSIONS</span><span>AVERAGE GP</span><span>HIGH / LOW</span>
              </div>
              {batchStats.courses.map((course) => (
                <div className="performance-course-row batch-row" role="row" key={course.course_code}>
                  <div className="performance-course-name">
                    <strong>{course.course_code}</strong>
                    <span>{course.title}</span>
                  </div>
                  <span>{course.submitted_students}</span>
                  <strong>{formatGpa(course.average_grade_point)}</strong>
                  <span>{formatGpa(course.highest_grade_point)} / {formatGpa(course.lowest_grade_point)}</span>
                </div>
              ))}
              {batchStats.courses.length === 0 && (
                <p className="performance-empty">No courses are currently assigned to Level {selectedTerm}.</p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
