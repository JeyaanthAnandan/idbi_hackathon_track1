import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './web.css';
import './phone.css';
import { initializeApi, loadAiStatus } from './engine/api.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// ?rm=1 opens the banker side: the Relationship Manager console. It shares
// the build, brand tokens and RM desk queue with the customer app.
const RM_VIEW = new URLSearchParams(window.location.search).get('rm') === '1';

async function start() {
  if (RM_VIEW) {
    document.body.classList.add('rm-mode');
    try {
      const theme = localStorage.getItem('mitra_theme');
      if (theme && theme !== 'system') document.documentElement.setAttribute('data-theme', theme);
    } catch { /* storage unavailable */ }
    // The copilot uses the same server-side DeepSeek and Sarvam as the customer app.
    await loadAiStatus();
    const { default: RmConsole } = await import('./components/rm/RmConsole.jsx');
    createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <ErrorBoundary><RmConsole /></ErrorBoundary>
      </React.StrictMode>
    );
    return;
  }
  await initializeApi();
  const { default: App } = await import('./App.jsx');
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary><App /></ErrorBoundary>
    </React.StrictMode>
  );
}

start();
