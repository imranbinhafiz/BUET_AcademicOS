import React from 'react';
import Sidebar from '../components/sidebar';
import './TopContributors.css';

export default function TopContributors() {
  const leaders = [
    { rank: '#01', name: 'Tahmid', points: '1,420 PTS', uploads: 34 },
    { rank: '#02', name: 'Abrar', points: '1,180 PTS', uploads: 26 },
    { rank: '#03', name: 'Nafis', points: '950 PTS', uploads: 19 }
  ];

  return (
    <div className="p5-layout">
      <Sidebar />
      <div className="p5-main-wrapper">
        <header className="p5-topbar">
          <span className="p5-page-indicator">SYSTEM // HALL_OF_FAME</span>
        </header>

        <main className="p5-content">
          <div className="p5-page-header">
            <h2>TOP ACADEMIC CONTRIBUTORS</h2>
          </div>

          <div className="p5-leaderboard-table">
            {leaders.map((item) => (
              <div key={item.rank} className="p5-leader-row">
                <span className="p5-rank">{item.rank}</span>
                <span className="p5-leader-name">{item.name}</span>
                <span className="p5-leader-uploads">{item.uploads} UPLOADS</span>
                <span className="p5-leader-points">{item.points}</span>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}