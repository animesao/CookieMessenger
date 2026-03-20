import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import SetupProfile from './pages/SetupProfile';
import Profile from './pages/Profile';
import { wsConnect, wsDisconnect } from './hooks/useWebSocket';

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  // Connect WS as soon as we have a user/token
  useEffect(() => {
    if (user && localStorage.getItem('token')) {
      wsConnect();
    }
    return () => {};
  }, [user]);

  const handleLogin = (userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    // Connect immediately after login
    setTimeout(wsConnect, 100);
  };

  const handleUpdate = (updatedUser) => {
    localStorage.setItem('user', JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  const handleSetupComplete = (updatedUser) => {
    if (updatedUser) handleUpdate(updatedUser);
  };

  const handleLogout = () => {
    wsDisconnect();
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <Routes>
      <Route path="/login"    element={!user ? <Login onLogin={handleLogin} /> : <Navigate to="/profile" />} />
      <Route path="/register" element={!user ? <Register /> : <Navigate to="/profile" />} />
      <Route
        path="/setup"
        element={user ? <SetupProfile onComplete={handleSetupComplete} /> : <Navigate to="/login" />}
      />
      <Route
        path="/profile"
        element={
          user
            ? <Profile user={user} onUpdate={handleUpdate} onLogout={handleLogout} />
            : <Navigate to="/login" />
        }
      />
      <Route path="*" element={<Navigate to={user ? '/profile' : '/login'} />} />
    </Routes>
  );
}
