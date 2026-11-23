// Backward-compatible module facade. Keep provider and hook in separate
// modules to preserve React Fast Refresh boundaries.
export { AuthProvider } from './AuthProvider';
export { useAuth } from './useAuth';
