import React, { useState } from 'react';
import { logOut } from '../engine/auth.js';
import Icon from './Icons.jsx';

export default function LogoutButton({ className = 'ghost-btn', compact = false }) {
  const [submitting, setSubmitting] = useState(false);

  const handleLogout = async () => {
    if (!window.confirm('Log out of MITRA and return to account login?')) return;

    setSubmitting(true);
    try {
      await logOut();
      // Clear deep links such as ?connect=1 so the next sandbox customer
      // always starts from the account login screen.
      window.location.assign(window.location.pathname);
    } catch {
      setSubmitting(false);
      window.alert('Could not log out because the API is unavailable. Please retry.');
    }
  };

  return (
    <button
      type="button"
      className={className}
      onClick={handleLogout}
      disabled={submitting}
      aria-label={submitting ? 'Logging out' : 'Log out and switch account'}
      title="Log out and switch sandbox account"
    >
      {compact ? <Icon name="logout" size={18} /> : null}
      <span>{submitting ? 'Logging out…' : 'Log out'}</span>
    </button>
  );
}
