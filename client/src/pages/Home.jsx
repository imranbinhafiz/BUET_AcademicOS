import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';

export default function Home() {
  const { user } = useOutletContext();

  return (
    <>
      <div className="p5-welcome-card">
        <div className="p5-welcome-banner">
          <h2>WELCOME {user ? `BACK, ${user.name.toUpperCase()}` : 'TO BUET ACADEMICOS'}</h2>
          <p>SYSTEM STATUS: READY // SELECT A MODULE FROM THE NAVIGATION</p>
        </div>
      </div>

      <div className="p5-grid">
        <div className="p5-grid-card">
          <h3>RECENT RESOURCES</h3>
          <p>Access notes, past papers, and version-controlled course materials.</p>
          <Link to="/resources" className="p5-card-btn">EXPLORE →</Link>
        </div>

        <div className="p5-grid-card">
          <h3>COURSE SURVIVAL</h3>
          <p>Check difficulty metrics and prerequisite advice before registering.</p>
          <Link to="/course-reviews" className="p5-card-btn">REVIEWS →</Link>
        </div>

        <div className="p5-grid-card">
          <h3>LEADERBOARD</h3>
          <p>Top contributors providing high-value academic resources this semester.</p>
          <Link to="/top-contributors" className="p5-card-btn">VIEW →</Link>
        </div>
      </div>
    </>
  );
}