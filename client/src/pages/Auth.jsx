import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Auth.css';

const DEPARTMENTS = [
  { code: '5', name: 'Computer Science & Engineering' },
  { code: '6', name: 'Electrical & Electronic Engineering' },
  { code: '4', name: 'Mechanical Engineering' },
  { code: '2', name: 'Civil Engineering' },
  { code: '3', name: 'Industrial & Production Engineering' }
];

export default function Auth({ isSignup, onSuccess }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    batch: '',
    dept_code: DEPARTMENTS[0].code,
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isSignup 
      ? 'http://localhost:5000/api/auth/register' 
      : 'http://localhost:5000/api/auth/login';

    const payload = isSignup 
      ? { ...formData } 
      : { email: formData.email, password: formData.password };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Authentication failed');
      }

      if (onSuccess) onSuccess(data);

      if (!isSignup) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        navigate('/'); // Redirect to Home after Login
      } else {
        navigate('/login'); // Redirect to Login after Signup
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p5-wrapper">
      <div className="p5-card">
        <span className="p5-card-tag">BUET ACADEMICOS</span>
        
        <h2 className="p5-title">
          {isSignup ? 'CREATE ACCOUNT' : 'USER LOGIN'}
        </h2>

        {error && <div className="p5-error">{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isSignup && (
            <>
              <div>
                <label className="p5-label">Full Name</label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="p5-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', alignItems: 'start' }}>
                <div>
                  <label className="p5-label">Batch</label>
                  <input
                    type="text"
                    name="batch"
                    required
                    value={formData.batch}
                    onChange={handleChange}
                    className="p5-input"
                  />
                </div>
                <div>
                  <label className="p5-label">Department</label>
                  <select
                    name="dept_code"
                    required
                    value={formData.dept_code}
                    onChange={handleChange}
                    className="p5-input"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept.code} value={dept.code}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="p5-label">Email Address</label>
            <input
              type="email"
              name="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="p5-input"
            />
          </div>

          <div>
            <label className="p5-label">Password</label>
            <input
              type="password"
              name="password"
              required
              value={formData.password}
              onChange={handleChange}
              className="p5-input"
            />
          </div>

          <button type="submit" disabled={loading} className="p5-btn">
            {loading ? 'PROCESSING...' : isSignup ? 'SIGN UP' : 'LOG IN'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <Link to={isSignup ? '/login' : '/register'} className="p5-link">
            {isSignup ? 'ALREADY HAVE AN ACCOUNT? LOG IN' : "DON'T HAVE AN ACCOUNT? SIGN UP"}
          </Link>
        </div>
      </div>
    </div>
  );
}