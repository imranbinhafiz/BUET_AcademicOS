import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import './AdminModeration.css';

const API_BASE = 'http://localhost:5000/api/admin';

function getJson(response) {
  return response.json().then((data) => {
    if (!response.ok) throw new Error(data.message || 'The request could not be completed.');
    return data;
  });
}

export default function AdminModeration() {
  const { user } = useOutletContext();
  const token = localStorage.getItem('token');
  const [queue, setQueue] = useState({ reports: [], resources: [] });
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [activeReportId, setActiveReportId] = useState(null);
  const [adminMessage, setAdminMessage] = useState('');

  const loadQueue = useCallback(async () => {
    if (!token || user?.role?.toLowerCase() !== 'admin') {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getJson(await fetch(`${API_BASE}/moderation/queue`, { headers: { Authorization: `Bearer ${token}` } }));
      setQueue(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, user?.role]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  async function resolveReport(reportId, status) {
    const key = `report-${reportId}`;
    setWorkingKey(key); setError(''); setNotice('');
    try {
      await getJson(await fetch(`${API_BASE}/reports/${reportId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      }));
      setNotice(`Report ${status}.`);
      setActiveReportId(null); 
      await loadQueue();
    } catch (err) { setError(err.message); } finally { setWorkingKey(''); }
  }

  async function deleteReportedContent(reportId) {
    if (!adminMessage.trim()) {
      setError('Please provide a message for the user explaining why their content was deleted.');
      return;
    }

    const key = `report-delete-${reportId}`;
    setWorkingKey(key); setError(''); setNotice('');
    try {
      await getJson(await fetch(`${API_BASE}/reports/${reportId}/content`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: adminMessage })
      }));
      setNotice('Content permanently deleted. Owner and all reporters notified.');
      setAdminMessage('');
      setActiveReportId(null);
      await loadQueue();
    } catch (err) { setError(err.message); } finally { setWorkingKey(''); }
  }

  async function moderateResource(resourceId, approvalStatus) {
    const key = `resource-${resourceId}`;
    setWorkingKey(key); setError(''); setNotice('');
    try {
      await getJson(await fetch(`${API_BASE}/resources/${resourceId}/moderation`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_status: approvalStatus })
      }));
      setNotice(`Resource ${approvalStatus}. The uploader was notified.`);
      await loadQueue();
    } catch (err) { setError(err.message); } finally { setWorkingKey(''); }
  }

  if (!user || user.role?.toLowerCase() !== 'admin') {
    return <section className="moderation-page"><div className="moderation-access-card"><p>RESTRICTED AREA</p><h2>MODERATION QUEUE</h2><span>Only active administrators can review reports and uploaded resources.</span></div></section>;
  }

  return (
    <section className="moderation-page">
      <div className="p5-page-header moderation-header"><div><p>CONTENT SAFETY WORKFLOW</p><h2>MODERATION QUEUE</h2><span>Resolve reports and approve resources. PostgreSQL sends the resulting personal notification.</span></div></div>
      
      {error && <div className="moderation-message error">{error}</div>}
      {notice && <div className="moderation-message success">{notice}</div>}
      {loading && <p className="moderation-loading">Loading pending moderation work...</p>}
      
      {!loading && <div className="moderation-summary"><span><b>{queue.reports.length}</b> pending reports</span><span><b>{queue.resources.length}</b> resources waiting</span></div>}
      
      {!loading && (
        <section className="moderation-section">
          <div className="moderation-section-head"><p>REPORTS</p><h3>Content reports</h3></div>
          {queue.reports.length === 0 ? <div className="moderation-empty">No reports are waiting for review.</div> : queue.reports.map((report) => {
            
            const isExpanded = activeReportId === report.report_id;

            return (
              <article 
                className={`moderation-item ${isExpanded ? 'expanded' : ''}`} 
                key={report.report_id}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                  <div>
                    <span className="moderation-type">{report.target_type} · {report.course_code || 'unknown course'}</span>
                    <h4>{isExpanded ? 'Full Reported Content:' : `“${report.target_preview.substring(0, 80)}...”`}</h4>
                  </div>
                  
                  {!isExpanded && (
                    <div className="moderation-actions">
                      <button disabled={workingKey === `report-${report.report_id}`} onClick={() => resolveReport(report.report_id, 'dismissed')}>DISMISS</button>
                      <button className="primary" onClick={() => { setActiveReportId(report.report_id); setAdminMessage(''); }}>TAKE ACTION</button>
                    </div>
                  )}
                </div>

                {/* Expanded Full Content Preview */}
                {isExpanded && (
                  <div className="moderation-full-content" style={{ marginTop: '0.75rem', padding: '1rem', background: '#111', borderRadius: '4px', border: '1px solid var(--cr-card-border)' }}>
                    <p style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--cr-text-light)' }}>{report.target_preview}</p>
                  </div>
                )}

                {/* Reason Box (Always Visible) */}
                <div style={{ background: '#1a1a1a', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--cr-card-border)', marginTop: '0.75rem' }}>
                  <strong style={{ color: 'var(--cr-red)', display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', textTransform: 'uppercase' }}>Report Reason:</strong>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--cr-text-light)' }}>{report.reason}</p>
                </div>

                {/* Expanded Admin Actions Box */}
                {isExpanded && (
                  <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '0.4rem', color: 'var(--cr-text-muted)' }}>Message to Owner (Required for deletion):</label>
                      <textarea 
                        className="p5-input"
                        rows="3"
                        value={adminMessage}
                        onChange={(e) => setAdminMessage(e.target.value)}
                        placeholder="Explain which community guideline was violated..."
                        style={{ width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                    
                    <div className="moderation-actions" style={{ justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                      <button onClick={() => { setActiveReportId(null); setAdminMessage(''); }}>CANCEL</button>
                      <button disabled={workingKey === `report-${report.report_id}`} onClick={() => resolveReport(report.report_id, 'dismissed')}>DISMISS REPORT</button>
                      <button 
                        style={{ backgroundColor: 'var(--cr-red)', color: '#fff', borderColor: 'var(--cr-red)' }}
                        disabled={workingKey === `report-delete-${report.report_id}`} 
                        onClick={() => deleteReportedContent(report.report_id)}
                      >
                        {workingKey === `report-delete-${report.report_id}` ? 'DELETING...' : 'DELETE CONTENT & NOTIFY'}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {!loading && (
        <section className="moderation-section">
          <div className="moderation-section-head"><p>RESOURCE APPROVAL</p><h3>New uploads</h3></div>
          {queue.resources.length === 0 ? <div className="moderation-empty">No resources are waiting for approval.</div> : queue.resources.map((resource) => (
            <article className="moderation-item" key={resource.res_id}>
              <div>
                <span className="moderation-type">{resource.course_code} · {resource.type}</span>
                <h4>{resource.title}</h4>
                <p>Uploaded by {resource.uploader_name}</p>
              </div>
              <div className="moderation-actions">
                <button disabled={workingKey === `resource-${resource.res_id}`} onClick={() => moderateResource(resource.res_id, 'rejected')}>REJECT</button>
                <button className="primary" disabled={workingKey === `resource-${resource.res_id}`} onClick={() => moderateResource(resource.res_id, 'approved')}>{workingKey === `resource-${resource.res_id}` ? 'SAVING...' : 'APPROVE'}</button>
              </div>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}