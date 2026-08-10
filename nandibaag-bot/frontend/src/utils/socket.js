import { io } from 'socket.io-client';
import { getToken } from './api';
import { getSessionId } from './sessionManager';

let socket = null;

const getSocketUrl = () => {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin;
  }
  return 'http://localhost:7002';
};

export function connectSocket(token) {
  if (socket?.connected) {
    return socket;
  }

  const socketUrl = getSocketUrl();
  const sessionId = getSessionId();

  socket = io(socketUrl, {
    auth: {
      token: token || getToken()
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected to server, registering session:', sessionId);
    socket.emit('register_session', sessionId);
  });

  // Listen for real-time room booking/reservation events
  socket.on('booking_created', (data) => {
    console.log('[Socket] booking_created received:', data);
    window.dispatchEvent(new CustomEvent('refresh_availability', { detail: data }));
  });

  socket.on('availability_updated', (data) => {
    console.log('[Socket] availability_updated received:', data);
    window.dispatchEvent(new CustomEvent('refresh_availability', { detail: data }));
  });

  socket.on('reservation_updated', (data) => {
    console.log('[Socket] reservation_updated received:', data);
    window.dispatchEvent(new CustomEvent('refresh_availability', { detail: data }));
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error.message);
  });

  return socket;
}

export function getSocket() {
  if (!socket) {
    return connectSocket();
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export default { connectSocket, getSocket, disconnectSocket };
