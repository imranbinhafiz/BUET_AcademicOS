import React from 'react';
import Sidebar from '../components/sidebar';
import './TeacherReviews.css';

export default function TeacherReviews() {
  const teachers = [
    { name: 'Dr. Md. Mostofa Akbar', dept: 'CSE', score: '4.9', feedback: 'Clear concepts and rigorous algorithmic explanations.' },
    { name: 'Dr. Sadia Sharmin', dept: 'CSE', score: '4.8', feedback: 'Extremely helpful during office hours and interactive lectures.' }
  ];

  return (
    <div className="p5-layout">
      <Sidebar />
      <div className="p5-main-wrapper">
        <header className="p5-topbar">
          <span className="p5-page-indicator">SYSTEM // FACULTY_DIRECTORY</span>
        </header>

        <main className="p5-content">
          <div className="p5-page-header">
            <h2>INSTRUCTOR FEEDBACK</h2>
          </div>

          <div className="p5-teachers-list">
            {teachers.map((t) => (
              <div key={t.name} className="p5-teacher-card">
                <div className="p5-teacher-score">{t.score}</div>
                <div className="p5-teacher-info">
                  <h3>{t.name}</h3>
                  <span className="p5-teacher-dept">DEPARTMENT OF {t.dept}</span>
                  <p>"{t.feedback}"</p>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}