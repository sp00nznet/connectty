// Install the FAKE window.connectty before anything imports the app.
import './mock';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../src/renderer/App';
import '../src/renderer/styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  // No StrictMode: it double-invokes effects, which would replay the fake
  // terminal stream twice into the same xterm.
  <App />
);
