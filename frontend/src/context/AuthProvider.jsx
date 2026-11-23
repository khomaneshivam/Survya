import React, { useState, useEffect, useEffectEvent } from 'react';
import AuthContext from './AuthStore';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('token')));
  const [originalAdminToken, setOriginalAdminToken] = useState(() => localStorage.getItem('orig_admin_token') || null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => localStorage.getItem('workspace_id') || null);

  const isImpersonating = Boolean(originalAdminToken);

  // This Effect Event can access the latest auth state without retriggering
  // initial session validation whenever the user object changes.
  const verifyOnMount = useEffectEvent((savedToken) => {
    void verifyAndFetchUser(savedToken);
  });

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (savedToken) verifyOnMount(savedToken);
  }, []);

  // Dynamic White-Label Branding injection
  useEffect(() => {
    const branding = user?.tenant?.branding_json;
    if (branding && typeof branding === 'object') {
      if (branding.primaryColor) {
        document.documentElement.style.setProperty('--sarvya-blue', branding.primaryColor);
        document.documentElement.style.setProperty('--brand-primary', branding.primaryColor);
      }
      if (branding.appName) {
        document.title = `${branding.appName} — WhatsApp Automation`;
      }
    } else {
      document.documentElement.style.removeProperty('--sarvya-blue');
      document.documentElement.style.removeProperty('--brand-primary');
      document.title = 'SARVYA — WhatsApp Automation Platform';
    }
  }, [user]);

  async function verifyAndFetchUser(tok = token) {
    if (!tok) {
      setLoading(false);
      return;
    }
    try {
      const headers = {
        'Authorization': `Bearer ${tok}`
      };
      const wsId = localStorage.getItem('workspace_id');
      if (wsId) {
        headers['x-workspace-id'] = wsId;
      }
      const res = await fetch('/api/auth/me', { headers });
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
        if (data.user.tenant_id) {
          setActiveWorkspaceId(String(data.user.tenant_id));
        }
      } else {
        logout();
      }
    } catch {
      if (!user) logout();
    } finally {
      setLoading(false);
    }
  }

  async function login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Login failed');
    }
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  }

  async function register(name, email, phone, password) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, password })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Registration failed');
    }
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  }

  function logout() {
    setToken(null);
    setUser(null);
    setOriginalAdminToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('orig_admin_token');
  }

  // Admin account inspection / impersonation
  async function impersonateUser(targetUserId) {
    if (!user || user.role !== 'ADMIN') {
      throw new Error('Only Master Admins can inspect accounts.');
    }
    const currentAdminToken = token;
    const res = await fetch(`/api/admin/impersonate/${targetUserId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${currentAdminToken}` }
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to switch into target user account');
    }

    // Save admin token for reversion
    localStorage.setItem('orig_admin_token', currentAdminToken);
    setOriginalAdminToken(currentAdminToken);

    // Set impersonated user token
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    return data.user;
  }

  // Revert back to Master Admin account
  async function revertImpersonation() {
    if (!originalAdminToken) return;
    const adminTok = originalAdminToken;
    localStorage.removeItem('orig_admin_token');
    setOriginalAdminToken(null);

    setToken(adminTok);
    localStorage.setItem('token', adminTok);
    await verifyAndFetchUser(adminTok);
  }

  // Switch active workspace in multi-tenant & agency white-label mode
  async function switchWorkspace(workspaceId) {
    if (!workspaceId) {
      localStorage.removeItem('workspace_id');
      setActiveWorkspaceId(null);
    } else {
      localStorage.setItem('workspace_id', String(workspaceId));
      setActiveWorkspaceId(String(workspaceId));
    }
    await verifyAndFetchUser(token);
  }

  const value = {
    user,
    token,
    loading,
    isAuthenticated: Boolean(token && user),
    isAdmin: user?.role === 'ADMIN',
    isImpersonating,
    activeWorkspaceId,
    switchWorkspace,
    login,
    register,
    logout,
    impersonateUser,
    revertImpersonation,
    refreshUser: () => verifyAndFetchUser(token)
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

