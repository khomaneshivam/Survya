import { useState, useEffect, useCallback, useMemo } from 'react';
import { automationApi } from '../api/automationApi';

export function useAutomations() {
  const [flows, setFlows] = useState([]);
  const [installations, setInstallations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState(null);

  const fetchAutomations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [flowsRes, instRes] = await Promise.all([
        automationApi.getFlows().catch(() => ({ success: false, flows: [] })),
        automationApi.getInstallations().catch(() => ({ success: false, installations: [] }))
      ]);

      const loadedFlows = (flowsRes?.flows || flowsRes?.data || []);
      const loadedInst = (instRes?.installations || instRes?.data || []);

      setFlows(Array.isArray(loadedFlows) ? loadedFlows : []);
      setInstallations(Array.isArray(loadedInst) ? loadedInst : []);
    } catch (err) {
      setError(err.message || 'Failed to load automations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]);

  // Merge flows with their installation metadata
  const automations = useMemo(() => {
    const instMap = new Map();
    installations.forEach(inst => {
      const flowKey = inst.flow_id || inst.installed_flow_id;
      if (flowKey) {
        instMap.set(flowKey, inst);
      }
    });

    return flows.map(flow => {
      const inst = instMap.get(flow.id) || null;
      return {
        ...flow,
        installation: inst,
        isTemplateBased: Boolean(flow.installed_from_template_id || inst),
        templateKey: inst?.template_key || null,
        installedVersion: inst?.installed_version_number || null,
        hasUpgrade: Boolean(inst?.upgrade_available || (inst?.latest_version && inst?.installed_version_number && inst.latest_version !== inst.installed_version_number))
      };
    });
  }, [flows, installations]);

  // Operational high-density metrics
  const metrics = useMemo(() => {
    const total = automations.length;
    let active = 0;
    let drafts = 0;
    let paused = 0;
    let needsAttention = 0;

    automations.forEach(item => {
      const status = (item.status || 'DRAFT').toUpperCase();
      if (status === 'ACTIVE' || status === 'PUBLISHED') {
        active++;
      } else if (status === 'PAUSED') {
        paused++;
      } else if (status === 'DRAFT') {
        drafts++;
      }

      if (item.error_rate > 0.05 || item.last_error || (item.installation && item.installation.status === 'ERROR')) {
        needsAttention++;
      }
    });

    return { total, active, drafts, paused, needsAttention };
  }, [automations]);

  const toggleStatus = async (flowId, currentStatus) => {
    setActionLoading(flowId);
    try {
      const isCurrentlyActive = (currentStatus || '').toUpperCase() === 'ACTIVE' || (currentStatus || '').toUpperCase() === 'PUBLISHED';
      if (isCurrentlyActive) {
        await automationApi.pauseFlow(flowId);
      } else {
        await automationApi.publishFlow(flowId);
      }
      await fetchAutomations();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setActionLoading(null);
    }
  };

  const deleteAutomation = async (flowId) => {
    setActionLoading(flowId);
    try {
      const res = await automationApi.deleteFlow(flowId);
      if (res && res.success !== false) {
        setFlows(prev => prev.filter(f => f.id !== flowId));
        return { success: true };
      }
      return { success: false, error: res?.error || 'Failed to delete automation' };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setActionLoading(null);
    }
  };

  const duplicateAutomation = async (flowId) => {
    setActionLoading(flowId);
    try {
      const res = await automationApi.duplicateFlow(flowId);
      if (res && res.success !== false) {
        await fetchAutomations();
        return { success: true, newFlow: res.flow };
      }
      return { success: false, error: res?.error || 'Failed to duplicate' };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setActionLoading(null);
    }
  };

  return {
    automations,
    metrics,
    loading,
    actionLoading,
    error,
    refresh: fetchAutomations,
    toggleStatus,
    deleteAutomation,
    duplicateAutomation
  };
}

