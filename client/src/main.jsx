import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';
// AI project visual layer. Existing page styles remain loaded by each page;
// this theme only adds the compatible redesign on top of them.
import './ai-theme/index.css';
import './ai-theme/Home.css';
import './ai-theme/Resources.css';
import './ai-theme/CourseReviews.css';
import './ai-theme/Performance.css';
import './ai-theme/Notifications.css';
import './ai-theme/Auth.css';
import './ai-theme/TopContributors.css';
import './ai-theme/AdminBatchProgress.css';
import './ai-theme/AdminModeration.css';
import './ai-theme/sidebar.css';
import './ai-theme/topbar.css';
import './ai-theme/UserProfile.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
