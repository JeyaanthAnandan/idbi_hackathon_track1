import React, { useState } from 'react';
import TalkingHeadAvatar from './TalkingHeadAvatar.jsx';
import { signUp, logIn } from '../engine/auth.js';
import { customer } from '../data/customer.js';

// Entry gate before onboarding — logs the customer into their IDBI account
// (or creates one) so MITRA has an identity to attach the risk quiz to.
export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (m) => {
    setMode(m);
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    if (mode === 'signup') {
      if (!name.trim()) { setSubmitting(false); return setError('Enter your full name.'); }
      if (!email.trim()) { setSubmitting(false); return setError('Enter your email.'); }
      if (password.length < 8) { setSubmitting(false); return setError('Password must be at least 8 characters.'); }
      const res = await signUp({ name, email, password });
      setSubmitting(false);
      if (!res.ok) return setError(res.error);
      onAuthed(res.session);
    } else {
      if (!email.trim() || !password) { setSubmitting(false); return setError('Enter your email and password.'); }
      const res = await logIn({ email, password });
      setSubmitting(false);
      if (!res.ok) return setError(res.error);
      onAuthed(res.session);
    }
  };

  return (
    <div className="onboard auth-screen">
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="avatar-svg-wrap" style={{ width: 96, height: 96 }}>
          <TalkingHeadAvatar size={96} mood="happy" />
        </div>
      </div>

      <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
      <p className="ob-sub">
        {mode === 'login'
          ? 'Log in to your MITRA prototype account to continue.'
          : "A few details and MITRA will get to know you next."}
      </p>

      <div className="auth-tabs">
        <button
          type="button"
          className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
          onClick={() => switchMode('login')}
        >
          Log in
        </button>
        <button
          type="button"
          className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
          onClick={() => switchMode('signup')}
        >
          Sign up
        </button>
      </div>

      <form className="auth-form" onSubmit={submit}>
        {mode === 'signup' && (
          <div className="settings-row">
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>
        )}
        <div className="settings-row">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div className="settings-row">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </div>

        {error && <div className="auth-error">{error}</div>}

        <button className="primary-btn" type="submit" style={{ marginTop: 18 }} disabled={submitting}>
          {submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>

      <button
        className="ghost-btn"
        type="button"
        style={{ marginTop: 16, alignSelf: 'center' }}
        onClick={() => { window.location.search = '?demo=1'; }}
      >
        Skip · try the demo as {customer.name.split(' ')[0]}
      </button>

      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--ink-soft)', textAlign: 'center', lineHeight: 1.6 }}>
        Prototype account — password hashes and sessions are stored by the local MITRA API.
      </div>
    </div>
  );
}
