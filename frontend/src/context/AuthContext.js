import React, { createContext, useState, useContext, useEffect } from 'react';
import { login as loginAPI } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser && token) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, [token]);

  const login = async (email, password) => {
    const response = await loginAPI({ email, password });
    const { token: newToken, user: userData } = response.data;
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  // Returns true if the logged-in user can access a given permission key
  const hasPermission = (perm) => {
    if (!user) return false;
    if (user.role === 'Administrator') return true;
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    if (perms.includes('Full Access')) return true;
    return perms.includes(perm);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, isAuthenticated: !!token, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export default AuthContext;
