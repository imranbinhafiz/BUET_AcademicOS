import React from 'react';
import './CourseReviews.css';

export default function CourseReviews() {
  const courses = [
    { code: 'CSE 204', name: 'Data Structures & Algorithms I', rating: '4.8 / 5.0', difficulty: 'HARD' },
    { code: 'CSE 218', name: 'Numerical Methods', rating: '4.2 / 5.0', difficulty: 'MEDIUM' },
    { code: 'MATH 247', name: 'Linear Algebra & Matrices', rating: '4.5 / 5.0', difficulty: 'HARD' }
  ];

  return (
    <>
      <div className="p5-page-header">
        <h2>COURSE SURVIVAL & REVIEWS</h2>
      </div>

      <div className="p5-courses-grid">
        {courses.map((c) => (
          <div key={c.code} className="p5-course-card">
            <span className="p5-diff-tag">{c.difficulty}</span>
            <h3>{c.code}</h3>
            <p className="p5-course-name">{c.name}</p>
            <div className="p5-course-footer">
              <span>RATING: <strong>{c.rating}</strong></span>
              <button className="p5-card-btn">READ REVIEWS</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}