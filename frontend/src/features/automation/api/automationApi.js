/**
 * Unified Automation Studio API Client
 * Connects frontend to Template Library, Client Installation Engine,
 * Flow Hub, and Execution History endpoints.
 */

import { fetchWithAuth, getAuthHeaders } from '../../../utils/apiAuth';

export const automationApi = {
  // --- TEMPLATE LIBRARY ---
  async getTemplates(params = {}) {
    const qs = new URLSearchParams();
    if (params.industry && params.industry !== 'ALL') qs.append('industry', params.industry);
    if (params.category && params.category !== 'ALL') qs.append('category', params.category);
    if (params.search) qs.append('search', params.search);
    if (params.limit) qs.append('limit', params.limit);
    const query = qs.toString() ? `?${qs.toString()}` : '';

    const res = await fetchWithAuth(`/api/v1/template-library${query}`);
    return res.json();
  },

  async getTemplateDetails(templateIdOrKey) {
    const res = await fetchWithAuth(`/api/v1/template-library/${templateIdOrKey}`);
    return res.json();
  },

  async getTenantResources() {
    const res = await fetchWithAuth('/api/v1/template-library/resources');
    return res.json();
  },

  async installTemplate(templateIdOrKey, payload) {
    const res = await fetchWithAuth(`/api/v1/template-library/${templateIdOrKey}/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  // --- TENANT INSTALLATIONS ---
  async getInstallations() {
    const res = await fetchWithAuth('/api/v1/template-installations');
    return res.json();
  },

  async getInstallation(id) {
    const res = await fetchWithAuth(`/api/v1/template-installations/${id}`);
    return res.json();
  },

  async updateInstallationConfig(id, payload) {
    const res = await fetchWithAuth(`/api/v1/template-installations/${id}/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async validateInstallation(id) {
    const res = await fetchWithAuth(`/api/v1/template-installations/${id}/validate`, {
      method: 'POST'
    });
    return res.json();
  },

  async activateInstallation(id) {
    const res = await fetchWithAuth(`/api/v1/template-installations/${id}/activate`, {
      method: 'POST'
    });
    return res.json();
  },

  async checkUpgrade(id) {
    const res = await fetchWithAuth(`/api/v1/template-installations/${id}/upgrade`);
    return res.json();
  },

  async applyUpgrade(id, targetVersionNumber) {
    const res = await fetchWithAuth(`/api/v1/template-installations/${id}/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetVersionNumber })
    });
    return res.json();
  },

  // --- FLOW ENGINE OPERATIONS ---
  async getFlows() {
    const res = await fetchWithAuth('/api/flows/conversation-flows');
    return res.json();
  },

  async getFlow(id) {
    const res = await fetchWithAuth(`/api/flows/conversation-flows/${id}`);
    return res.json();
  },

  async saveFlowDraft(id, payload) {
    const res = await fetchWithAuth(`/api/flows/conversation-flows/${id}/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async publishFlow(id) {
    const res = await fetchWithAuth(`/api/flows/conversation-flows/${id}/publish`, {
      method: 'POST'
    });
    return res.json();
  },

  async pauseFlow(id) {
    const res = await fetchWithAuth(`/api/flows/conversation-flows/${id}/pause`, {
      method: 'POST'
    });
    return res.json();
  },

  async deleteFlow(id) {
    const res = await fetchWithAuth(`/api/flows/conversation-flows/${id}`, {
      method: 'DELETE'
    });
    return res.json();
  },

  async duplicateFlow(id) {
    const res = await fetchWithAuth(`/api/flows/conversation-flows/${id}/duplicate`, {
      method: 'POST'
    });
    return res.json();
  },

  async createFlow(payload) {
    const res = await fetchWithAuth('/api/flows/conversation-flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async assignFlowToLine(id, phoneNumberId) {
    const res = await fetchWithAuth(`/api/flows/conversation-flows/${id}/assign-line`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumberId })
    });
    return res.json();
  },

  async setDefaultFlow(id) {
    const res = await fetchWithAuth(`/api/flows/conversation-flows/${id}/set-default`, {
      method: 'POST'
    });
    return res.json();
  },

  async getTriggerConflicts() {
    const res = await fetchWithAuth('/api/flows/conflicts');
    return res.json();
  },

  // --- GLOBAL SETTINGS ---
  async getGlobalSettings(phoneNumberId = null) {
    const query = phoneNumberId ? `?phoneNumberId=${encodeURIComponent(phoneNumberId)}` : '';
    const res = await fetchWithAuth(`/api/flows/global-settings${query}`);
    return res.json();
  },

  async updateGlobalSettings(payload, phoneNumberId = null) {
    const query = phoneNumberId ? `?phoneNumberId=${encodeURIComponent(phoneNumberId)}` : '';
    const res = await fetchWithAuth(`/api/flows/global-settings${query}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  // --- SIMULATION & SANDBOX ---
  async simulateTurn(payload) {
    const res = await fetchWithAuth('/api/flows/conversation-flows/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        isSimulation: true // Permanent safety constraint
      })
    });
    return res.json();
  },

  // --- EXECUTION HISTORY & OBSERVABILITY ---
  async getExecutions(params = {}) {
    const qs = new URLSearchParams();
    if (params.flowId) qs.append('flowId', params.flowId);
    if (params.limit) qs.append('limit', params.limit);
    const query = qs.toString() ? `?${qs.toString()}` : '';

    const res = await fetchWithAuth(`/api/flows/executions${query}`);
    return res.json();
  },

  async getExecutionDetails(sessionId) {
    const res = await fetchWithAuth(`/api/flows/executions/${sessionId}`);
    return res.json();
  },

  async resetSession(sessionId) {
    const res = await fetchWithAuth(`/api/flows/sessions/${sessionId}/reset`, {
      method: 'POST'
    });
    return res.json();
  },

  // --- PLATFORM ADMIN ---
  async getAdminTemplates() {
    const res = await fetchWithAuth('/api/v1/template-library/admin/all');
    return res.json();
  },

  async createMasterTemplate(payload) {
    const res = await fetchWithAuth('/api/v1/template-library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async createVersionRelease(templateId, payload) {
    const res = await fetchWithAuth(`/api/v1/template-library/${templateId}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  }
};

