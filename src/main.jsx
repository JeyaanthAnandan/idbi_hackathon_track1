import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './web.css';
import { initializeApi } from './engine/api.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';

async function start() {
  await initializeApi();
  const { default: App } = await import('./App.jsx');
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary><App /></ErrorBoundary>
    </React.StrictMode>
  );
}

start();
