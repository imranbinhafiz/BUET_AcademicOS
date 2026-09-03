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

function formatGpa(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '—';
}

async function getJson(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'The request could not be completed.');
  return data;
}

export default function Performance() {
  const token = localStorage.getItem('token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const [activeView, setActiveView] = useState('mine');
  const [myPerformance, setMyPerformance] = useState(null);
  const [selectedTerm, setSelectedTerm] = useState('');
  const [gradeDrafts, setGradeDrafts] = useState({});
  const [savingCourse, setSavingCourse] = useState(null);

  const [analysisDept, setAnalysisDept] = useState('');
  const [batches, setBatches] = useState([]);
  const [analysisBatch, setAnalysisBatch] = useState('');
  const [analysisTerms, setAnalysisTerms] = useState([]);
  const [analysisTerm, setAnalysisTerm] = useState('');
  const [batchStats, setBatchStats] = useState(null);

  const [loadingMine, setLoadingMine] = useState(Boolean(token));
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function loadDrafts(courses) {
    setGradeDrafts(Object.fromEntries(courses.map((course) => [
      course.curriculum_course_id,
      course.grade_point == null ? '' : String(course.grade_point)
    ])));
  }

  async function loadMyPerformance(termCode) {
    if (!token) return;
    setLoadingMine(true);
    setError('');
    try {
      const query = termCode ? `?term_code=${encodeURIComponent(termCode)}` : '';
      const data = await getJson(await fetch(`${API_BASE}/me${query}`, { headers }));
      setMyPerformance(data);
      setSelectedTerm(data.selected_term);
      loadDrafts(data.courses);
      setAnalysisDept((current) => current || data.progress.dept_code);
      setAnalysisBatch((current) => current || data.progress.batch_year);
    } catch (err) {
      setError(err.message);
      setMyPerformance(null);
    } finally {
      setLoadingMine(false);
    }
  }

  useEffect(() => {
    if (!token) {
      setLoadingMine(false);
      return;
    }
    loadMyPerformance();
    // Token is the authentication boundary for initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || !analysisDept) return;

    async function loadBatches() {
      try {
        const data = await getJson(await fetch(
          `${API_BASE}/batches?dept_code=${encodeURIComponent(analysisDept)}`,
          { headers }
        ));
        setBatches(data.batches);
        setAnalysisBatch((current) => (
          data.batches.some((batch) => batch.batch_year === current)
            ? current
            : (data.batches[0]?.batch_year || '')
        ));
      } catch (err) {
        setError(err.message);
      }
    }

    loadBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, analysisDept]);

  useEffect(() => {
    if (!token || !analysisDept || !analysisBatch) return;

    async function loadAnalysisTerms() {
      setLoadingBatch(true);
      try {
        const data = await getJson(await fetch(
          `${API_BASE}/batch-terms?batch_year=${encodeURIComponent(analysisBatch)}&dept_code=${encodeURIComponent(analysisDept)}`,
          { headers }
        ));
        setAnalysisTerms(data.terms);
        setAnalysisTerm((current) => (
          data.terms.some((term) => term.term_code === current)
            ? current
            : (data.terms[data.terms.length - 1]?.term_code || '')
        ));
      } catch (err) {
        setError(err.message);
        setAnalysisTerms([]);
        setAnalysisTerm('');
      } finally {
        setLoadingBatch(false);
      }
    }

    loadAnalysisTerms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, analysisDept, analysisBatch]);

  useEffect(() => {
    if (!token || !analysisDept || !analysisBatch || !analysisTerm) return;

    async function loadBatchStats() {
      setLoadingBatch(true);
      try {
        const data = await getJson(await fetch(
          `${API_BASE}/batch-stats?batch_year=${encodeURIComponent(analysisBatch)}&dept_code=${encodeURIComponent(analysisDept)}&term_code=${encodeURIComponent(analysisTerm)}`,
          { headers }
        ));
        setBatchStats(data);
      } catch (err) {
        setError(err.message);
        setBatchStats(null);
      } finally {
        setLoadingBatch(false);
      }
    }

    loadBatchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, analysisDept, analysisBatch, analysisTerm]);

  async function saveGrade(course) {
    const gradePoint = gradeDrafts[course.curriculum_course_id];
    if (gradePoint === '' || gradePoint === undefined) {
      setError('Choose a grade point before saving.');
      return;
    }

    setSavingCourse(course.curriculum_course_id);
    setError('');
    setNotice('');
    try {
      await getJson(await fetch(
        `${API_BASE}/me/courses/${course.curriculum_course_id}`,
        {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ grade_point: Number(gradePoint) })
        }
      ));
      await loadMyPerformance(selectedTerm);
      setNotice(`${course.course_code} saved.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCourse(null);
    }
  }

  async function deleteGrade(course) {
    if (!window.confirm(`Remove the saved result for ${course.course_code}?`)) return;

    setSavingCourse(course.curriculum_course_id);
    setError('');
    setNotice('');
    try {
      await getJson(await fetch(
        `${API_BASE}/me/courses/${course.curriculum_course_id}`,
        { method: 'DELETE', headers }
      ));
      await loadMyPerformance(selectedTerm);
      setNotice(`${course.course_code} removed.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCourse(null);
    }
  }

  if (!token) {
    return (
      <section className="performance-page">
        <div className="p5-page-header"><h2>TERM PERFORMANCE</h2></div>
        <div className="performance-login-card">
          <h3>LOG IN TO TRACK RESULTS</h3>
          <p>Record official grade points for completed terms and explore anonymous batch analysis.</p>
          <Link to="/login" className="performance-primary-button">LOG IN</Link>
        </div>
      </section>
    );
  }

  const personalSummary = myPerformance?.summary;
  const batchSummary = batchStats?.summary;
  const coverage = batchStats?.coverage;
  const analyticsVisible = batchStats?.availability.analytics_visible;

  return (
    <section className="performance-page">
      <div className="p5-page-header performance-header">
        <div>
          <p className="performance-kicker">ACADEMIC RECORD</p>
          <h2>TERM PERFORMANCE</h2>
        </div>
        {myPerformance && (
          <div className="performance-progress-chip">
            <span>BATCH {myPerformance.progress.batch_year}</span>
            <strong>COMPLETED THROUGH {myPerformance.progress.latest_completed_term_code}</strong>
          </div>
        )}
      </div>

      <div className="performance-tabs" role="tablist" aria-label="Performance views">
        <button type="button" className={activeView === 'mine' ? 'performance-tab active' : 'performance-tab'} onClick={() => setActiveView('mine')}>
          MY RESULTS
        </button>
        <button type="button" className={activeView === 'batch' ? 'performance-tab active' : 'performance-tab'} onClick={() => setActiveView('batch')}>
          BATCH ANALYSIS
        </button>
      </div>

      {error && <div className="performance-message error">{error}</div>}
      {notice && <div className="performance-message success">{notice}</div>}

      {activeView === 'mine' && (
        <>
          {loadingMine && <p className="performance-loading">Loading your curriculum and results...</p>}
          {!loadingMine && myPerformance && (
            <>
              <div className="performance-control-row">
                <label className="performance-term-picker">
                  <span>COMPLETED TERM</span>
                  <select value={selectedTerm} onChange={(event) => loadMyPerformance(event.target.value)}>
                    {myPerformance.available_terms.map((term) => (
                      <option key={term.term_code} value={term.term_code}>{term.display_name}</option>
                    ))}
                  </select>
                </label>
                <p>Only terms through <strong>{myPerformance.progress.latest_completed_term_code}</strong> can be edited. This rule is enforced by PostgreSQL too.</p>
              </div>

              <div className="performance-summary-grid">
                <article className="performance-summary-card featured">
                  <span>TERM GPA</span><strong>{formatGpa(personalSummary.term_gpa)}</strong><small>Credit-weighted from saved results</small>
                </article>
                <article className="performance-summary-card">
                  <span>COURSES RECORDED</span><strong>{personalSummary.recorded_courses} / {personalSummary.expected_courses}</strong><small>{personalSummary.is_complete ? 'Complete submission' : 'Still in progress'}</small>
                </article>
                <article className="performance-summary-card">
                  <span>CREDITS RECORDED</span><strong>{formatGpa(personalSummary.recorded_credits)} / {formatGpa(personalSummary.expected_credits)}</strong><small>Each term uses its curriculum credit snapshot</small>
                </article>
              </div>

              <div className="performance-note">
                Your GPA is <strong>Σ(grade point × credit) / Σ(credit)</strong>. Batch GPA includes only students who saved every required course for that term.
              </div>

              <div className="performance-table-card">
                <div className="performance-table-heading"><div><h3>{myPerformance.selected_term} COURSES</h3><p>These are your own batch curriculum placements, not a global course list.</p></div></div>
                <div className="performance-course-table" role="table">
                  <div className="performance-course-row table-head" role="row"><span>COURSE</span><span>CREDITS</span><span>GRADE POINT</span><span>ACTION</span></div>
                  {myPerformance.courses.map((course) => {
                    const saved = course.grade_point !== null && course.grade_point !== undefined;
                    const saving = savingCourse === course.curriculum_course_id;
                    return (
                      <div className="performance-course-row" role="row" key={course.curriculum_course_id}>
                        <div className="performance-course-name"><strong>{course.course_code}</strong><span>{course.title}</span></div>
                        <span>{formatGpa(course.credits)}</span>
                        <select aria-label={`Grade point for ${course.course_code}`} value={gradeDrafts[course.curriculum_course_id] ?? ''} onChange={(event) => setGradeDrafts((current) => ({ ...current, [course.curriculum_course_id]: event.target.value }))}>
                          {GRADE_OPTIONS.map((option) => <option key={option.value || 'none'} value={option.value}>{option.label}</option>)}
                        </select>
                        <div className="performance-actions">
                          <button type="button" className="performance-primary-button compact" disabled={saving} onClick={() => saveGrade(course)}>{saving ? 'SAVING...' : saved ? 'UPDATE' : 'SAVE'}</button>
                          {saved && <button type="button" className="performance-remove-button" disabled={saving} onClick={() => deleteGrade(course)}>REMOVE</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {activeView === 'batch' && (
        <>
          <div className="performance-analysis-controls">
            <label className="performance-term-picker"><span>BATCH</span><select value={analysisBatch} onChange={(event) => setAnalysisBatch(event.target.value)}>{batches.map((batch) => <option key={batch.batch_year} value={batch.batch_year}>BATCH {batch.batch_year}</option>)}</select></label>
            <label className="performance-term-picker"><span>COMPLETED TERM</span><select value={analysisTerm} onChange={(event) => setAnalysisTerm(event.target.value)}>{analysisTerms.map((term) => <option key={term.term_code} value={term.term_code}>{term.display_name}</option>)}</select></label>
          </div>

          {loadingBatch && <p className="performance-loading">Loading anonymous batch analysis...</p>}
          {!loadingBatch && batchStats && (
            <>
              <div className="performance-batch-intro">
                <p className="performance-kicker">ANONYMOUS AGGREGATE</p>
                <h3>BATCH {batchStats.selection.batch_year} · TERM {batchStats.selection.term_code}</h3>
                <p>There are no names, IDs, or individual grades here. Every figure uses the same complete-term cohort.</p>
              </div>

              {!analyticsVisible && (
                <div className="performance-privacy-note">
                  Analysis unlocks after at least {batchStats.availability.minimum_anonymous_cohort} students complete all {coverage.expected_courses} courses. Right now, {coverage.completed_students} complete submissions are available.
                </div>
              )}

              <div className="performance-summary-grid">
                <article className="performance-summary-card featured"><span>BATCH AVERAGE GPA</span><strong>{analyticsVisible ? formatGpa(batchSummary.average_gpa) : 'LOCKED'}</strong><small>{analyticsVisible ? 'Complete submissions only' : 'Privacy threshold not reached'}</small></article>
                <article className="performance-summary-card"><span>SUBMISSION COVERAGE</span><strong>{coverage.completed_students} / {coverage.registered_students}</strong><small>{coverage.students_with_any_data} started · {coverage.expected_courses} courses required</small></article>
                <article className="performance-summary-card"><span>MEDIAN · SPREAD</span><strong>{analyticsVisible ? `${formatGpa(batchSummary.median_gpa)} · ${formatGpa(batchSummary.standard_deviation_gpa)}` : 'LOCKED'}</strong><small>Median GPA · standard deviation</small></article>
              </div>

              {analyticsVisible && (
                <>
                  <div className="performance-distribution-card">
                    <div><p className="performance-kicker">GPA DISTRIBUTION</p><h3>Middle 50% of the complete cohort</h3></div>
                    <div className="performance-range-scale" aria-label="Batch GPA quartile range">
                      <span className="range-fill" style={{ left: `${(Number(batchSummary.first_quartile_gpa) / 4) * 100}%`, width: `${((Number(batchSummary.third_quartile_gpa) - Number(batchSummary.first_quartile_gpa)) / 4) * 100}%` }} />
                      <i style={{ left: `${(Number(batchSummary.median_gpa) / 4) * 100}%` }} title={`Median ${formatGpa(batchSummary.median_gpa)}`} />
                    </div>
                    <div className="performance-range-labels"><span>Q1 {formatGpa(batchSummary.first_quartile_gpa)}</span><span>Median {formatGpa(batchSummary.median_gpa)}</span><span>Q3 {formatGpa(batchSummary.third_quartile_gpa)}</span></div>
                  </div>

                  <div className="performance-chart-card">
                    <div className="performance-table-heading"><div><h3>COURSE AVERAGES</h3><p>Lower average means lower aggregate performance in this completed cohort; it is not a judgement about course difficulty.</p></div></div>
                    <div className="performance-bar-list">
                      {[...batchStats.courses].sort((a, b) => Number(a.average_grade_point) - Number(b.average_grade_point)).map((course) => (
                        <div className="performance-bar-row" key={course.curriculum_course_id}>
                          <div><strong>{course.course_code}</strong><span>{course.title}</span></div>
                          <div className="performance-bar-track"><span style={{ width: `${(Number(course.average_grade_point) / 4) * 100}%` }} /></div>
                          <strong>{formatGpa(course.average_grade_point)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="performance-table-card">
                <div className="performance-table-heading"><div><h3>COURSE-WISE BATCH STATS</h3><p>Pass rate, median, and grade counts are hidden together until the privacy threshold is met.</p></div></div>
                <div className="performance-course-table batch" role="table">
                  <div className="performance-course-row batch-head table-head" role="row"><span>COURSE</span><span>AVERAGE GP</span><span>MEDIAN / PASS RATE</span><span>F / A+ COUNT</span></div>
                  {batchStats.courses.map((course) => (
                    <div className="performance-course-row batch-row" role="row" key={course.curriculum_course_id}>
                      <div className="performance-course-name"><strong>{course.course_code}</strong><span>{course.title}</span></div>
                      <strong>{formatGpa(course.average_grade_point)}</strong>
                      <span>{formatGpa(course.median_grade_point)} / {course.pass_rate_percent == null ? '—' : `${formatGpa(course.pass_rate_percent)}%`}</span>
                      <span>{course.fail_count ?? '—'} / {course.a_plus_count ?? '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
