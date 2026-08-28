import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRouter from './AppRouter.jsx';
import { initTheme } from './lib/theme.js';

// Set the persisted theme before the first paint so nothing flashes.
initTheme();

// StrictMode double-invokes effects in development, which surfaces missing
// cleanup in socket subscriptions rather than letting listeners pile up.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);
