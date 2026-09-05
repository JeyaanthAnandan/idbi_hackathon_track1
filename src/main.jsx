import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './web.css';
import { initializeApi } from './engine/api.js';

async function start() {
  await initializeApi();
  const { default: App } = await import('./App.jsx');
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

start();
