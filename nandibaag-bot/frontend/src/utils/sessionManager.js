/**
 * Session Manager for Frontend
 * Generates and persists a unique session ID in sessionStorage
 * so temporary room reservations are associated with the user's browser tab.
 */

export const getSessionId = () => {
  let sessionId = sessionStorage.getItem('bookingSessionId');
  if (!sessionId) {
    sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    sessionStorage.setItem('bookingSessionId', sessionId);
  }
  return sessionId;
};
