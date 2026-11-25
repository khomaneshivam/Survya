import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardBody, Button, Badge, Modal, SearchInput } from '../ui';
import { useAuth } from '../../context/AuthContext';
import { getAuthHeaders } from '../../utils/apiAuth';
import ConversationalRenderer from '../studio-chat/ConversationalRenderer';
import { Play, CopyPlus, Sparkles } from 'lucide-react';

const STUDIO_INDUSTRY_TO_DOMAINS = {
  HOSPITALITY: ['HOSPITALITY'],
  RETAIL: ['RETAIL_ECOM', 'RESTAURANT_FOOD'],
  HEALTHCARE: ['CLINIC_HEALTH'],
  SERVICES: ['CLINIC_HEALTH', 'SALON_WELLNESS'],
  REAL_ESTATE: ['REAL_ESTATE'],
  B2B_SALES: ['B2B_WHOLESALE'],
  EDUCATION: ['EDUCATION_COACHING']
};

export default function IndustryTemplatesTab({ token, onInstalled, toast }) {
  const { isPlatformAdmin, allowedDomains = [] } = useAuth();
  const [blueprints, setBlueprints] = useState([]);
  const [search, setSearch] = useState('');
  const [industryFilter, setIndustryFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [installingKey, setInstallingKey] = useState(null);

  // Interactive Try Demo state
  const [demoState, setDemoState] = useState(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoErrors, setDemoErrors] = useState({});
  const [demoSubmitting, setDemoSubmitting] = useState(false);

  const loadBlueprints = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/studio/blueprints', { headers: getAuthHeaders(token) });
      const data = await res.json();
      if (data.success) setBlueprints(data.data || []);
    } catch (_) {} finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadBlueprints();
  }, [loadBlueprints]);

  const handleTryDemo = async (key) => {
    try {
      setDemoErrors({});
      const res = await fetch(`/api/v1/studio/blueprints/${key}/demo/start`, {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success && data.data) {
        setDemoState(data.data);
        setDemoOpen(true);
      } else {
        alert(data.message || 'Unable to start demo');
      }
    } catch (err) {
      alert(err.message || 'Demo startup error');
    }
  };

  const handleDemoAction = async (action, payload = {}) => {
    if (!demoState?.demoToken) return;
    setDemoSubmitting(true);
    setDemoErrors({});
    try {
      const res = await fetch(`/api/v1/studio/blueprints/${demoState.blueprintKey}/demo/navigate`, {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          demoToken: demoState.demoToken,
          fromScreenKey: demoState.currentScreenKey,
          action,
          targetScreenKey: payload.targetScreenKey,
          formValues: payload.formValues,
          selectedItemId: payload.selectedItemId
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (res.status === 422 && data.fieldErrors) {
          setDemoErrors(data.fieldErrors);
          return;
        }
        alert(data.message || 'Demo step failed');
        return;
      }
      setDemoState(data.data);
    } catch (err) {
      alert(err.message || 'Network error in demo');
    } finally {
      setDemoSubmitting(false);
    }
  };

  const handleInstall = async (bp) => {
    setInstallingKey(bp.key);
    try {
      const res = await fetch(`/api/v1/studio/blueprints/${bp.key}/install`, {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: bp.title })
      });
      const data = await res.json();
      if (data.success) {
        if (toast) toast(`Installed "${bp.title}" into your Experiences!`);
        if (onInstalled) onInstalled(data.data);
      } else {
        alert(data.message || 'Install failed');
      }
    } catch (err) {
      alert(err.message || 'Error installing template');
    } finally {
      setInstallingKey(null);
    }
  };

  const isIndustryAllowed = (ind) => {
    if (isPlatformAdmin || !Array.isArray(allowedDomains) || allowedDomains.length === 0) return true;
    const mapped = STUDIO_INDUSTRY_TO_DOMAINS[String(ind || '').toUpperCase()] || [String(ind || '').toUpperCase()];
    return mapped.some((d) => allowedDomains.includes(d));
  };

  const allowedIndustryFilters = ['ALL', 'HOSPITALITY', 'RETAIL', 'HEALTHCARE', 'SERVICES', 'REAL_ESTATE', 'B2B_SALES', 'EDUCATION']
    .filter((ind) => ind === 'ALL' || isIndustryAllowed(ind));

  const filtered = blueprints.filter((bp) => {
    if (!isIndustryAllowed(bp.industry)) return false;
    if (industryFilter !== 'ALL' && bp.industry !== industryFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return bp.title.toLowerCase().includes(q)
        || bp.description.toLowerCase().includes(q)
        || bp.goalLabel.toLowerCase().includes(q);
    }
    return true;
  });

  const activeScreen = demoState?.screens?.find((s) => s.screenKey === demoState.currentScreenKey) || demoState?.screens?.[0] || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: '260px', flex: 1, maxWidth: '420px' }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search industry experiences..." />
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {allowedIndustryFilters.map((ind) => (
            <button
              key={ind}
              type="button"
              onClick={() => setIndustryFilter(ind)}
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                border: industryFilter === ind ? '1px solid #2F5219' : '1px solid #CBD5E1',
                backgroundColor: industryFilter === ind ? '#2F5219' : '#FFFFFF',
                color: industryFilter === ind ? '#FFFFFF' : '#334155',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {ind.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '24px', color: '#64748B' }}>Loading industry library...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '16px' }}>
          {filtered.map((bp) => (
            <Card key={bp.key}>
              <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <Badge variant="info">{bp.badge}</Badge>
                    <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>{bp.stepsCount} steps</span>
                  </div>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '15.5px', fontWeight: 700, color: '#0F172A' }}>{bp.title}</h3>
                  <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>{bp.description}</p>
                  <div style={{ fontSize: '11.5px', color: '#15803D', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Sparkles size={13} /> Goal: {bp.goalLabel}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', paddingTop: '10px', borderTop: '1px solid #F1F5F9' }}>
                  <Button variant="secondary" onClick={() => handleTryDemo(bp.key)} style={{ flex: 1 }}>
                    <Play size={13} /> Try Demo
                  </Button>
                  <Button variant="primary" disabled={installingKey === bp.key} onClick={() => handleInstall(bp)} style={{ flex: 1 }}>
                    <CopyPlus size={13} /> {installingKey === bp.key ? 'Cloning...' : 'Use Template'}
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={demoOpen}
        onClose={() => {
          setDemoOpen(false);
          setDemoState(null);
        }}
        title={demoState ? `Interactive Try Demo — ${demoState.experience?.name}` : 'Try Demo'}
      >
        <div style={{ height: '600px', borderRadius: '14px', overflow: 'hidden', border: '1px solid #CBD5E1' }}>
          {demoState && activeScreen && (
            <ConversationalRenderer
              experience={demoState.experience}
              screens={demoState.screens}
              catalogItems={demoState.catalogItems}
              activeScreen={activeScreen}
              navigationStack={demoState.navigationStack}
              stateData={demoState.stateData}
              transcript={demoState.transcript}
              demoMode
              isPreview
              submitting={demoSubmitting}
              serverFieldErrors={demoErrors}
              onSelectItem={(item) => handleDemoAction('NEXT', { selectedItemId: item.id })}
              onAction={handleDemoAction}
              onReset={() => handleTryDemo(demoState.blueprintKey)}
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
