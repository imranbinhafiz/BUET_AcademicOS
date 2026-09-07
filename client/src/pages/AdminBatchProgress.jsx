import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import './AdminBatchProgress.css';

const API_BASE = 'http://localhost:5000/api/admin';
const TERM_SEQUENCE = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];

function getJson(response) {
  return response.json().then((data) => {
    if (!response.ok) throw new Error(data.message || 'The request could not be completed.');
    return data;
  });
}

function batchKey(batch) {
  return `${batch.batch_year}:${batch.dept_code}`;
}

function getNextTerm(currentTermCode) {
  const currentIndex = TERM_SEQUENCE.indexOf(currentTermCode);
  if (currentIndex < 0 || currentIndex === TERM_SEQUENCE.length - 1) return null;
  return TERM_SEQUENCE[currentIndex + 1];
}

function formatDate(value) {
  if (!value) return 'No recorded change yet';
  return new Date(value).toLocaleString();
}

function makeRequestId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  throw new Error('Your browser cannot create a safe request identifier. Please use a modern browser.');
}

export default function AdminBatchProgress() {
  const { user } = useOutletContext();
  const token = localStorage.getItem('token');
  const [batches, setBatches] = useState([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState('');
  const [advancing, setAdvancing] = useState(false);

  const isAdmin = user && user.role && user.role.toLowerCase() === 'admin';
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token]
  );

  const selectedBatch = batches.find((batch) => batchKey(batch) === selectedKey) || null;
  const nextTerm = selectedBatch ? getNextTerm(selectedBatch.current_term_code) : null;

  const loadHistory = useCallback(async (batch) => {
    if (!batch) {
      setHistory([]);
      return;
    }

    setLoadingHistory(true);
    try {
      const response = await fetch(
        `${API_BASE}/batch-progress/${encodeURIComponent(batch.batch_year)}/${encodeURIComponent(batch.dept_code)}/history`,
        { headers }
      );
      const data = await getJson(response);
      setHistory(data.history);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingHistory(false);
    }
  }, [headers]);

  const loadBatches = useCallback(async (preserveSelection = true) => {
    if (!token || !isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/batch-progress?dept_code=5`, { headers });
      const data = await getJson(response);
      setBatches(data.batches);
      setSelectedKey((current) => {
        if (preserveSelection && data.batches.some((batch) => batchKey(batch) === current)) return current;
        return data.batches[0] ? batchKey(data.batches[0]) : '';
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [headers, isAdmin, token]);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return undefined;
    }
    loadBatches(false);
    return undefined;
  }, [isAdmin, loadBatches]);

  useEffect(() => {
    if (selectedBatch) loadHistory(selectedBatch);
  }, [selectedKey]); // selectedKey is the deliberate user selection

  const beginReview = () => {
    setError('');
    setNotice('');
    setReason(`Completed ${selectedBatch.current_term_label || selectedBatch.current_term_code}.`);
    setRequestId(makeRequestId());
    setReviewing(true);
  };

  const cancelReview = () => {
    setReviewing(false);
    setReason('');
    setRequestId('');
  };

  const advanceBatch = async () => {
    if (!selectedBatch || !reason.trim() || !requestId) return;

    setAdvancing(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(
        `${API_BASE}/batch-progress/${encodeURIComponent(selectedBatch.batch_year)}/${encodeURIComponent(selectedBatch.dept_code)}/advance`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            expected_current_term_code: selectedBatch.current_term_code,
            reason: reason.trim(),
            request_id: requestId
          })
        }
      );
      const data = await getJson(response);
      setNotice(
        `Batch ${selectedBatch.batch_year} advanced. ${data.notifications_created} student notification${Number(data.notifications_created) === 1 ? '' : 's'} created.`
      );
      cancelReview();
      await loadBatches(true);
      await loadHistory(selectedBatch);
    } catch (err) {
      setError(err.message);
      if (/changed before your request/i.test(err.message)) {
        await loadBatches(true);
      }
    } finally {
      setAdvancing(false);
    }
  };

  if (!user) {
    return <section className="admin-page"><div className="admin-access-card"><h2>ADMIN CONTROL</h2><p>Log in with an administrator account to manage batch progress.</p></div></section>;
  }

  if (!isAdmin) {
    return <section className="admin-page"><div className="admin-access-card"><p className="admin-kicker">RESTRICTED AREA</p><h2>ADMIN CONTROL</h2><p>Your account is not an active administrator account. Student result data is never shown on this page.</p></div></section>;
  }

  return (
    <section className="admin-page">
      <div className="p5-page-header admin-header">
        <div>
          <p className="admin-kicker">DATABASE-CONTROLLED WORKFLOW</p>
          <h2>BATCH TERM CONTROL</h2>
          <p>Advance one batch by exactly one term. PostgreSQL records the event and notifies active students in the same transaction.</p>
        </div>
      </div>

      {error && <div className="admin-message error">{error}</div>}
      {notice && <div className="admin-message success">{notice}</div>}

      {loading && <p className="admin-loading">Loading configured CSE batches...</p>}

      {!loading && batches.length === 0 && (
        <div className="admin-empty">No CSE batch progress rows have been configured yet.</div>
      )}

      {!loading && selectedBatch && (
        <>
          <label className="admin-batch-picker">
            <span>SELECT BATCH</span>
            <select value={selectedKey} onChange={(event) => { cancelReview(); setSelectedKey(event.target.value); }}>
              {batches.map((batch) => (
                <option key={batchKey(batch)} value={batchKey(batch)}>
                  BATCH {batch.batch_year} · {batch.dept_name}
                </option>
              ))}
            </select>
          </label>

          <div className="admin-summary-grid">
            <article className="admin-summary-card featured">
              <span>CURRENT TERM</span>
              <strong>{selectedBatch.current_term_code || 'GRADUATED'}</strong>
              <small>{selectedBatch.current_term_label || 'No new result-entry term remains'}</small>
            </article>
            <article className="admin-summary-card">
              <span>COMPLETED THROUGH</span>
              <strong>{selectedBatch.latest_completed_term_code || 'NONE'}</strong>
              <small>{selectedBatch.latest_completed_term_label || 'No completed term recorded'}</small>
            </article>
            <article className="admin-summary-card">
              <span>ACTIVE STUDENTS</span>
              <strong>{selectedBatch.active_student_count}</strong>
              <small>Only these active student accounts receive the update</small>
            </article>
          </div>

          <div className="admin-control-card">
            <div>
              <p className="admin-kicker">NEXT LEGAL TRANSITION</p>
              {selectedBatch.current_term_code ? (
                <h3>Complete {selectedBatch.current_term_code} → {nextTerm || 'GRADUATED'}</h3>
              ) : (
                <h3>This batch is already graduated.</h3>
              )}
              <p>The target term is calculated by PostgreSQL. It cannot be typed or skipped in this page.</p>
            </div>
            {selectedBatch.current_term_code && !reviewing && (
              <button type="button" className="admin-primary-button" onClick={beginReview}>REVIEW ADVANCE</button>
            )}
          </div>

          {reviewing && (
            <div className="admin-confirm-card">
              <div>
                <p className="admin-kicker">CONFIRM DATABASE ACTION</p>
                <h3>Complete {selectedBatch.current_term_code} and open {nextTerm || 'the graduated state'}.</h3>
                <p>This creates one audit record and sends an unread notification to {selectedBatch.active_student_count} active student account{Number(selectedBatch.active_student_count) === 1 ? '' : 's'}. It is not automatically reversible.</p>
              </div>
              <label>
                <span>WHY IS THIS TERM COMPLETE?</span>
                <textarea value={reason} maxLength="500" onChange={(event) => setReason(event.target.value)} placeholder="Example: Official Level 2 Term 1 results were published." />
              </label>
              <div className="admin-confirm-actions">
                <button type="button" className="admin-secondary-button" onClick={cancelReview} disabled={advancing}>CANCEL</button>
                <button type="button" className="admin-primary-button" onClick={advanceBatch} disabled={advancing || reason.trim().length < 3}>
                  {advancing ? 'ADVANCING...' : 'CONFIRM ONE-TERM ADVANCE'}
                </button>
              </div>
            </div>
          )}

          <section className="admin-history-card">
            <div className="admin-history-heading">
              <div><p className="admin-kicker">AUDIT HISTORY</p><h3>Recorded batch transitions</h3></div>
              <span>{loadingHistory ? 'Loading...' : `${history.length} record${history.length === 1 ? '' : 's'}`}</span>
            </div>
            {!loadingHistory && history.length === 0 && <p className="admin-history-empty">No advance has been recorded for this batch yet.</p>}
            {history.map((event) => (
              <article className="admin-history-item" key={event.batch_progress_history_id}>
                <div className="admin-history-transition"><strong>{event.previous_current_term_code}</strong><span>COMPLETED →</span><strong>{event.new_current_term_code || 'GRADUATED'}</strong></div>
                <div><span>REASON</span><p>{event.reason}</p></div>
                <div><span>BY</span><p>{event.advanced_by_name}</p></div>
                <div><span>NOTIFIED</span><p>{event.notifications_created} student{Number(event.notifications_created) === 1 ? '' : 's'}</p></div>
                <time>{formatDate(event.advanced_at)}</time>
              </article>
            ))}
          </section>
        </>
      )}
    </section>
  );
}
