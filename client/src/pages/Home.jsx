import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';

export default function Home() {
  const { user } = useOutletContext();
  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <div className="home-dashboard">
      <section className="home-hero">
        <div className="home-hero-copy">
          <span className="home-eyebrow"><i /> YOUR ACADEMIC COMMAND CENTRE</span>
          <h1>{firstName ? <>Welcome back,<br /><em>{firstName}.</em></> : <>Built for better<br /><em>academic decisions.</em></>}</h1>
          <p>Discover trusted resources, learn from real course experiences, and turn your performance data into a clearer path forward.</p>
          <div className="home-actions">
            <Link to="/resources" className="home-primary-action">Explore resources <span>↗</span></Link>
            <Link to="/performance" className="home-secondary-action">View performance</Link>
          </div>
        </div>
        <div className="home-signal-card" aria-label="AcademicOS system overview">
          <div className="home-signal-top"><span>ACADEMICOS</span><b>LIVE</b></div>
          <div className="home-orbit"><div className="home-orbit-core">A<span>OS</span></div></div>
          <div className="home-signal-meta"><span>KNOWLEDGE NETWORK</span><strong>CONNECTED</strong></div>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-heading">
          <div><span>01 / WORKSPACE</span><h2>Everything you need to move forward</h2></div>
          <p>One focused space for the decisions that shape your term.</p>
        </div>
        <div className="home-module-grid">
          <Link to="/resources" className="home-module-card featured">
            <div className="home-module-icon">↧</div><span className="home-card-index">01</span>
            <div><small>RESOURCE LIBRARY</small><h3>Find what seniors wish they had.</h3><p>Notes, questions, slides, and lab materials—moderated and organized by course.</p></div>
            <b>Browse library <span>→</span></b>
          </Link>
          <Link to="/course-reviews" className="home-module-card">
            <div className="home-module-icon">◇</div><span className="home-card-index">02</span>
            <div><small>COURSE INTELLIGENCE</small><h3>Know the course before it tests you.</h3><p>Real difficulty, workload, prerequisite, and preparation advice from students.</p></div>
            <b>Read reviews <span>→</span></b>
          </Link>
          <Link to="/performance" className="home-module-card">
            <div className="home-module-icon">⌁</div><span className="home-card-index">03</span>
            <div><small>PRIVATE ANALYTICS</small><h3>Turn marks into useful signals.</h3><p>Track results privately and recognize performance patterns across your term.</p></div>
            <b>Open analytics <span>→</span></b>
          </Link>
        </div>
      </section>

      <section className="home-principle">
        <span className="home-principle-mark">“</span>
        <div><small>BUILT AROUND ONE PRINCIPLE</small><h2>The database does the thinking.<br />You make the decision.</h2></div>
        <Link to="/top-contributors">Meet the community <span>→</span></Link>
      </section>
    </div>
  );
}
