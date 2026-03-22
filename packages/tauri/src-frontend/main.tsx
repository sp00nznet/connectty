// Load the Tauri adapter BEFORE anything else
// This sets window.connectty to route through Tauri invoke/listen
import './connectty-api';

// Now load the app normally
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../../desktop/src/renderer/App';
import '../../desktop/src/renderer/styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
