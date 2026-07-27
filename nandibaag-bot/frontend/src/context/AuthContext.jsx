import React, { createContext, useContext, useState, useEffect } from 'react';
import api, { setToken, getToken, clearToken } from '../utils/api';
import { connectSocket, disconnectSocket } from '../utils/socket';

const AuthContext = createContext(null);

/**
 * Auth Context Provider
 * 
 * Provides authentication state and methods:
 * - user: Current user object
 * - token: JWT token
 * - login: Login function
 * - logout: Logout function
 * - loading: Loading state
 * 
 * Token storage pattern:
 * - If rememberMe is true: localStorage (persists across sessions)
 * - If rememberMe is false: sessionStorage (clears on tab close)
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing token on mount
  useEffect(() => {
    const existingToken = getToken();
    if (existingToken) {
      setTokenState(existingToken);
      connectSocket(existingToken);
      fetchCurrentUser();
    } else {
      setLoading(false);
    }
  }, []);

  // Fetch current user
  const fetchCurrentUser = async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data.user);
    } catch (error) {
      console.error('Failed to fetch current user:', error);
      clearToken();
      setTokenState(null);
    } finally {
      setLoading(false);
    }
  };

  // Login function
  const login = async (email, password, rememberMe = false) => {
    try {
      console.log('[Auth] Attempting login to:', api.defaults.baseURL + '/auth/login');
      const response = await api.post('/auth/login', { email, password, rememberMe });
      console.log('[Auth] Login response:', response.status, response.data?.success);
      const { token: newToken, user: newUser, expiresIn } = response.data;
      
      setToken(newToken, rememberMe);
      setTokenState(newToken);
      setUser(newUser);
      
      // Connect socket
      connectSocket(newToken);
      
      return { success: true, expiresIn };
    } catch (error) {
      console.error('[Auth] Login failed:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data,
        url: error.config?.url,
        baseURL: error.config?.baseURL
      });
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Login failed',
        status: error.response?.status
      };
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearToken();
      setTokenState(null);
      setUser(null);
      disconnectSocket();
    }
  };

  const value = {
    user,
    token,
    login,
    logout,
    loading,
    isAuthenticated: !!token
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Custom hook to use auth context
 * 
 * @returns {object} Auth context value
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
