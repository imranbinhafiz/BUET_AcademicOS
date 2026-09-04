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
      setNotice(`Report ${status}. The content owner was notified.`);
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
      {!loading && <section className="moderation-section"><div className="moderation-section-head"><p>REPORTS</p><h3>Content reports</h3></div>{queue.reports.length === 0 ? <div className="moderation-empty">No reports are waiting for review.</div> : queue.reports.map((report) => <article className="moderation-item" key={report.report_id}><div><span className="moderation-type">{report.target_type} · {report.course_code || 'unknown course'}</span><h4>“{report.target_preview}”</h4><p>Reason: {report.reason}</p></div><div className="moderation-actions"><button disabled={workingKey === `report-${report.report_id}`} onClick={() => resolveReport(report.report_id, 'dismissed')}>DISMISS</button><button className="primary" disabled={workingKey === `report-${report.report_id}`} onClick={() => resolveReport(report.report_id, 'reviewed')}>{workingKey === `report-${report.report_id}` ? 'SAVING...' : 'MARK REVIEWED'}</button></div></article>)}</section>}
      {!loading && <section className="moderation-section"><div className="moderation-section-head"><p>RESOURCE APPROVAL</p><h3>New uploads</h3></div>{queue.resources.length === 0 ? <div className="moderation-empty">No resources are waiting for approval.</div> : queue.resources.map((resource) => <article className="moderation-item" key={resource.res_id}><div><span className="moderation-type">{resource.course_code} · {resource.type}</span><h4>{resource.title}</h4><p>Uploaded by {resource.uploader_name}</p></div><div className="moderation-actions"><button disabled={workingKey === `resource-${resource.res_id}`} onClick={() => moderateResource(resource.res_id, 'rejected')}>REJECT</button><button className="primary" disabled={workingKey === `resource-${resource.res_id}`} onClick={() => moderateResource(resource.res_id, 'approved')}>{workingKey === `resource-${resource.res_id}` ? 'SAVING...' : 'APPROVE'}</button></div></article>)}</section>}
    </section>
  );
}
