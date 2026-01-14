import React, { useState, useEffect } from 'react';
import type { User } from '@connectty/shared';
import { api } from './services/api';
import { wsService } from './services/websocket';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const token = api.getToken();
    if (token) {
      api.verifyToken()
        .then((user) => {
          if (user) {
            setUser(user);
            // Connect WebSocket
            wsService.connect(token).catch(console.error);
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = async (user: User) => {
    setUser(user);
    const token = api.getToken();
    if (token) {
      await wsService.connect(token);
    }
  };

  const handleLogout = () => {
    api.logout();
    wsService.disconnect();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="loading" style={{ height: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
}
