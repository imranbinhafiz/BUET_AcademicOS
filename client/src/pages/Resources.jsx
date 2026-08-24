import React from 'react';
import Sidebar from '../components/sidebar';
import './Resources.css';

export default function Resources() {
  const sampleResources = [
    { id: 1, title: 'CSE 204 Data Structures - Final Sheet', type: 'PDF', course: 'CSE 204', author: 'Tahmid', downloads: 142 },
    { id: 2, title: 'CSE 218 Numerical Methods Notes', type: 'ZIP', course: 'CSE 218', author: 'Abrar', downloads: 98 },
    { id: 3, title: 'EEE 263 Lab Manual & Code Examples', type: 'PDF', course: 'EEE 263', author: 'Nafis', downloads: 210 }
  ];

  return (
    <div className="p5-layout">
      <Sidebar />
      <div className="p5-main-wrapper">
        <header className="p5-topbar">
          <span className="p5-page-indicator">SYSTEM // ACADEMIC_RESOURCES</span>
        </header>

        <main className="p5-content">
          <div className="p5-page-header">
            <h2>RESOURCES ARCHIVE</h2>
            <button className="p5-action-btn">+ UPLOAD RESOURCE</button>
          </div>

          <div className="p5-resource-list">
            {sampleResources.map((res) => (
              <div key={res.id} className="p5-resource-card">
                <div className="p5-resource-badge">{res.type}</div>
                <div className="p5-resource-details">
                  <h4>{res.title}</h4>
                  <p>Course: <strong>{res.course}</strong> | Uploaded by: {res.author}</p>
                </div>
                <div className="p5-resource-meta">
                  <span>📥 {res.downloads}</span>
                  <button className="p5-card-btn">DOWNLOAD</button>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}