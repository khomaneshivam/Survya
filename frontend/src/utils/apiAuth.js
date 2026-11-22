/**
 * Shared API Authentication Helper
 * Ensures the JWT Bearer token is automatically attached to API requests
 * from localStorage or the active auth session.
 */

export function getAuthToken(overrideToken) {
  if (overrideToken && typeof overrideToken === 'string' && overrideToken.trim()) {
    return overrideToken.trim();
  }
  try {
    const saved = localStorage.getItem('token');
    if (saved && typeof saved === 'string') {
      return saved.trim();
    }
  } catch (e) {}
  return null;
}

export function getAuthHeaders(overrideToken, extraHeaders = {}) {
  const token = getAuthToken(overrideToken);
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders
  };
}

export async function fetchWithAuth(url, options = {}, overrideToken) {
  const token = getAuthToken(overrideToken);
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };
  return fetch(url, {
    credentials: 'include',
    ...options,
    headers
  });
}

