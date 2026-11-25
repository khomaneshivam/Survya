import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAuthHeaders } from '../utils/apiAuth';
import { PageHeader, Skeleton, Card, CardBody, Button, Badge, Tabs } from '../components/ui';
import ExperiencesListView from '../components/inapp-studio/ExperiencesListView';
import ExperienceDetailEditor from '../components/inapp-studio/ExperienceDetailEditor';
import StarterPackModal from '../components/inapp-studio/StarterPackModal';
import GuidedStudioWizard from '../components/inapp-studio/GuidedStudioWizard';
import IndustryTemplatesTab from '../components/inapp-studio/IndustryTemplatesTab';
import EmailGoalsTab from '../components/inapp-studio/EmailGoalsTab';
import AnalyticsGovernanceTab from '../components/inapp-studio/AnalyticsGovernanceTab';
import QrCodeModal from '../components/inapp-studio/QrCodeModal';
import NegotiationsAndCallsModal from '../components/inapp-studio/NegotiationsAndCallsModal';
import PublicExperiencePage from './PublicExperiencePage';
import {
  LayoutDashboard,
  Layers,
  Sparkles,
  Link2,
  Activity,
  Smartphone,
  Plus,
  Copy,
  ExternalLink,
  MessageCircle,
  Mail,
  BarChart3
} from 'lucide-react';

const STUDIO_TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'templates', label: 'Industry Templates', icon: Sparkles },
  { id: 'experiences', label: 'Experiences', icon: Layers },
  { id: 'simulator', label: 'Chat Simulator', icon: Smartphone },
  { id: 'share_links', label: 'Share Links', icon: Link2 },
  { id: 'email_goals', label: 'Email & Goals', icon: Mail },
  { id: 'analytics', label: 'Analytics & Governance', icon: BarChart3 },
  { id: 'history', label: 'Execution History', icon: Activity }
];

export default function InAppStudioPage() {
  const { token } = useAuth();
  const [studioTab, setStudioTab] = useState('experiences');
  const [overview, setOverview] = useState(null);
  const [experiences, setExperiences] = useState([]);
  const [shareLinks, setShareLinks] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedExperience, setSelectedExperience] = useState(null);
  const [simulatorExp, setSimulatorExp] = useState(null);

  // Share link form
  const [shareForm, setShareForm] = useState({
    experienceId: '',
    phoneNumber: '',
    prefilledMessage: '',
    initialReplyText: ''
  });
  const [generatingLink, setGeneratingLink] = useState(false);

  // Modals
  const [starterModalOpen, setStarterModalOpen] = useState(false);
  const [starterLoading, setStarterLoading] = useState(false);
  const [guidedWizardOpen, setGuidedWizardOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [negModalOpen, setNegModalOpen] = useState(false);

  const [toastMsg, setToastMsg] = useState(null);
  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  }, []);

  const loadExperiences = useCallback(async () => {
    try {
      setLoading(true);
      const [expRes, ovRes, linkRes, histRes] = await Promise.all([
        fetch('/api/v1/inapp/experiences', { headers: getAuthHeaders(token) }),
        fetch('/api/v1/studio/overview', { headers: getAuthHeaders(token) }),
        fetch('/api/v1/studio/share-links', { headers: getAuthHeaders(token) }),
        fetch('/api/v1/studio/execution-history?limit=40', { headers: getAuthHeaders(token) })
      ]);
      const expData = await expRes.json();
      if (expData.success) {
        const list = expData.data || [];
        setExperiences(list);
        if (!simulatorExp && list.length > 0) {
          setSimulatorExp(list[0]);
        }
        if (!shareForm.experienceId && list.length > 0) {
          setShareForm((f) => ({ ...f, experienceId: String(list[0].id) }));
        }
      }
      const ovData = await ovRes.json();
      if (ovData.success) setOverview(ovData.data);
      const lkData = await linkRes.json();
      if (lkData.success) setShareLinks(lkData.data || []);
      const hiData = await histRes.json();
      if (hiData.success) setHistoryRows(hiData.data || []);
    } catch (err) {
      console.error('[SurvyaStudio] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [token, simulatorExp, shareForm.experienceId]);

  useEffect(() => {
    loadExperiences();
  }, [loadExperiences]);

  const handleSelectExperience = async (exp) => {
    try {
      const res = await fetch(`/api/v1/inapp/experiences/${exp.id}`, {
        headers: getAuthHeaders(token)
      });
      const data = await res.json();
      setSelectedExperience(data.success ? data.data : exp);
    } catch (_) {
      setSelectedExperience(exp);
    }
  };

  const handleRefreshSelected = async () => {
    if (!selectedExperience) return;
    try {
      const res = await fetch(`/api/v1/inapp/experiences/${selectedExperience.id}`, {
        headers: getAuthHeaders(token)
      });
      const data = await res.json();
      if (data.success) setSelectedExperience(data.data);
      loadExperiences();
    } catch (_) {}
  };

  const handleSelectStarter = async (domainType) => {
    try {
      setStarterLoading(true);
      const res = await fetch('/api/v1/inapp/experiences/from-starter', {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ domainType })
      });
      const data = await res.json();
      if (data.success) {
        setStarterModalOpen(false);
        showToast(`Created ${domainType} starter experience!`);
        await loadExperiences();
        if (data.data) setSelectedExperience(data.data);
      } else {
        alert(data.message || 'Failed to instantiate starter pack');
      }
    } catch (err) {
      alert(err.message || 'Error creating starter experience');
    } finally {
      setStarterLoading(false);
    }
  };

  const handleGenerateShareLink = async (e) => {
    e.preventDefault();
    if (!shareForm.experienceId) return;
    setGeneratingLink(true);
    try {
      const res = await fetch(`/api/v1/studio/experiences/${shareForm.experienceId}/share-link`, {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          phoneNumber: shareForm.phoneNumber,
          prefilledMessage: shareForm.prefilledMessage,
          initialReplyText: shareForm.initialReplyText
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('WhatsApp Share Link & first reply generated!');
        await loadExperiences();
      } else {
        alert(data.message || 'Failed to generate share link');
      }
    } catch (err) {
      alert(err.message || 'Error creating link');
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleOpenQr = async (exp) => {
    try {
      const res = await fetch(`/api/v1/inapp/experiences/${exp.id}/qr`, {
        headers: getAuthHeaders(token)
      });
      const data = await res.json();
      if (data.success) {
        setQrData(data.data);
        setQrModalOpen(true);
      }
    } catch (_) {
      alert('Unable to generate QR Code');
    }
  };

  return (
    <div className="inapp-studio-page" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', backgroundColor: '#171719', color: '#ffffff',
          padding: '12px 20px', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          zIndex: 9999, fontSize: '14px', fontWeight: 500
        }}>
          {toastMsg}
        </div>
      )}

      {selectedExperience ? (
        <ExperienceDetailEditor
          experience={selectedExperience}
          token={token}
          onBack={() => {
            setSelectedExperience(null);
            loadExperiences();
          }}
          onRefresh={handleRefreshSelected}
          onOpenQr={handleOpenQr}
          toast={showToast}
        />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <PageHeader
              title="Survya Conversational Business Studio"
              subtitle="Build guided WhatsApp-to-Chat customer journeys, configure automated replies, share entry links, and track business goals."
            />
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button variant="secondary" onClick={() => setStarterModalOpen(true)}>
                <Layers size={15} /> Starter Templates
              </Button>
              <Button variant="primary" onClick={() => setGuidedWizardOpen(true)}>
                <Sparkles size={15} /> Mode A: Guided Setup
              </Button>
            </div>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <Tabs tabs={STUDIO_TABS} activeTab={studioTab} onChange={setStudioTab} />
          </div>

          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              <Skeleton style={{ height: '160px', borderRadius: '12px' }} />
              <Skeleton style={{ height: '160px', borderRadius: '12px' }} />
              <Skeleton style={{ height: '160px', borderRadius: '12px' }} />
            </div>
          ) : studioTab === 'overview' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
                <MetricTile label="Total Experiences" value={overview?.totalExperiences ?? experiences.length} />
                <MetricTile label="Published Live" value={overview?.publishedExperiences ?? 0} />
                <MetricTile label="WhatsApp Share Links" value={overview?.shareLinksCount ?? shareLinks.length} />
                <MetricTile label="Link Clicks" value={overview?.totalLinkClicks ?? 0} />
                <MetricTile label="Customer Sessions" value={overview?.totalSessions ?? 0} />
                <MetricTile label="Registry Widgets" value={overview?.registeredComponentsCount ?? 29} />
              </div>

              <Card>
                <CardBody style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 700 }}>Start a New Conversational Business Flow</h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
                      Use Mode A (Guided Setup) for plain-language setup or Mode B (Experience Builder) for custom multi-step conversational flows.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="secondary" onClick={() => setStudioTab('templates')}>
                      <Sparkles size={14} /> Explore Industry Library
                    </Button>
                    <Button variant="secondary" onClick={() => setStudioTab('share_links')}>
                      <Link2 size={14} /> Manage Share Links
                    </Button>
                    <Button variant="primary" onClick={() => setGuidedWizardOpen(true)}>
                      <Plus size={14} /> Launch Mode A Wizard
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </div>
          ) : studioTab === 'templates' ? (
            <IndustryTemplatesTab
              token={token}
              onInstalled={(exp) => {
                loadExperiences();
                if (exp) setSelectedExperience(exp);
              }}
              toast={showToast}
            />
          ) : studioTab === 'experiences' ? (
            <ExperiencesListView
              experiences={experiences}
              token={token}
              loading={loading}
              onSelectExperience={handleSelectExperience}
              onOpenStarterModal={() => setStarterModalOpen(true)}
              onOpenNegotiationsModal={() => setNegModalOpen(true)}
              onOpenQr={handleOpenQr}
              onRefresh={loadExperiences}
              toast={showToast}
            />
          ) : studioTab === 'simulator' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px', alignItems: 'start' }}>
              <Card>
                <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>Select Experience to Test</div>
                  {experiences.map((exp) => (
                    <button
                      key={exp.id}
                      type="button"
                      onClick={() => handleSelectExperience(exp).then(() => setSimulatorExp(exp)) || setSimulatorExp(exp)}
                      style={{
                        textAlign: 'left',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: simulatorExp?.id === exp.id ? '2px solid #2F5219' : '1px solid #E2E8F0',
                        background: simulatorExp?.id === exp.id ? '#F0FDF4' : '#FFFFFF',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#0F172A' }}>{exp.name}</div>
                      <div style={{ fontSize: '11.5px', color: '#64748B' }}>/{exp.slug} · {exp.status}</div>
                    </button>
                  ))}
                </CardBody>
              </Card>
              <div style={{ height: '640px', borderRadius: '20px', overflow: 'hidden', border: '1px solid #CBD5E1' }}>
                {simulatorExp ? (
                  <PublicExperiencePage key={simulatorExp.slug} slug={simulatorExp.slug} demoMode />
                ) : (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>Create or select an experience to simulate.</div>
                )}
              </div>
            </div>
          ) : studioTab === 'share_links' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <Card>
                <CardBody>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 700 }}>
                    Generate WhatsApp Entry Link & Automated First Reply
                  </h3>
                  <form onSubmit={handleGenerateShareLink} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', alignItems: 'end' }}>
                    <div>
                      <label style={labelCss}>Target Experience</label>
                      <select
                        value={shareForm.experienceId}
                        onChange={(e) => setShareForm({ ...shareForm, experienceId: e.target.value })}
                        style={inputCss}
                      >
                        {experiences.map((exp) => (
                          <option key={exp.id} value={exp.id}>{exp.name} ({exp.status})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelCss}>WhatsApp Number (optional if WABA verified)</label>
                      <input
                        type="text"
                        placeholder="919820012345"
                        value={shareForm.phoneNumber}
                        onChange={(e) => setShareForm({ ...shareForm, phoneNumber: e.target.value })}
                        style={inputCss}
                      />
                    </div>
                    <div>
                      <label style={labelCss}>Pre-filled WhatsApp Message</label>
                      <input
                        type="text"
                        placeholder="Hi, I want to book / enquire"
                        value={shareForm.prefilledMessage}
                        onChange={(e) => setShareForm({ ...shareForm, prefilledMessage: e.target.value })}
                        style={inputCss}
                      />
                    </div>
                    <div>
                      <label style={labelCss}>First Automated Reply Copy</label>
                      <input
                        type="text"
                        placeholder="Tap below to open our interactive chat:"
                        value={shareForm.initialReplyText}
                        onChange={(e) => setShareForm({ ...shareForm, initialReplyText: e.target.value })}
                        style={inputCss}
                      />
                    </div>
                    <Button type="submit" variant="primary" disabled={generatingLink}>
                      <MessageCircle size={14} />
                      {generatingLink ? 'Saving...' : 'Generate WA Link'}
                    </Button>
                  </form>
                </CardBody>
              </Card>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '14px' }}>
                {shareLinks.map((lnk) => (
                  <Card key={lnk.id}>
                    <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '14px' }}>{lnk.title}</strong>
                        <Badge variant="success">{lnk.clicks_count || 0} clicks</Badge>
                      </div>
                      <div style={{ fontSize: '12px', color: '#475569' }}>
                        WA Number: <code>{lnk.phone_number}</code> · Slug: <code>/c/{lnk.slug}</code>
                      </div>
                      <div style={{ fontSize: '12px', background: '#F8FAFC', padding: '8px', borderRadius: '8px', wordBreak: 'break-all' }}>
                        {lnk.waMeUrl}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            navigator.clipboard.writeText(lnk.waMeUrl);
                            showToast('wa.me link copied');
                          }}
                        >
                          <Copy size={13} /> Copy wa.me
                        </Button>
                        {lnk.directChatUrl && (
                          <Button variant="secondary" onClick={() => window.open(lnk.directChatUrl, '_blank', 'noopener,noreferrer')}>
                            <ExternalLink size={13} /> Open Chat
                          </Button>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          ) : studioTab === 'email_goals' ? (
            <EmailGoalsTab token={token} toast={showToast} />
          ) : studioTab === 'analytics' ? (
            <AnalyticsGovernanceTab
              token={token}
              experiences={experiences}
              onRefreshExperiences={loadExperiences}
              toast={showToast}
            />
          ) : (
            <Card>
              <CardBody>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 700 }}>Recent Customer Executions</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>
                        <th style={{ padding: '8px' }}>Experience</th>
                        <th style={{ padding: '8px' }}>Customer</th>
                        <th style={{ padding: '8px' }}>Current Step</th>
                        <th style={{ padding: '8px' }}>Channel Owner</th>
                        <th style={{ padding: '8px' }}>Goal Status</th>
                        <th style={{ padding: '8px' }}>Mode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.length === 0 ? (
                        <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#64748B' }}>No sessions recorded yet.</td></tr>
                      ) : historyRows.map((row) => (
                        <tr key={row.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '8px', fontWeight: 600 }}>{row.experience_name}</td>
                          <td style={{ padding: '8px' }}>{row.visitor_name || row.visitor_phone || 'Anonymous'}</td>
                          <td style={{ padding: '8px' }}><code>{row.current_screen_key}</code></td>
                          <td style={{ padding: '8px' }}><Badge variant="info">{row.channel_owner}</Badge></td>
                          <td style={{ padding: '8px' }}><Badge variant={row.goal_status === 'COMPLETED' ? 'success' : 'warning'}>{row.goal_status}</Badge></td>
                          <td style={{ padding: '8px' }}>{row.demo_mode ? 'Demo' : 'Live'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          )}
        </>
      )}

      <GuidedStudioWizard
        isOpen={guidedWizardOpen}
        onClose={() => setGuidedWizardOpen(false)}
        token={token}
        onCreated={(resData) => {
          loadExperiences();
          if (resData?.experience) setSelectedExperience(resData.experience);
        }}
        toast={showToast}
      />

      <NegotiationsAndCallsModal
        isOpen={negModalOpen}
        token={token}
        onClose={() => setNegModalOpen(false)}
        toast={showToast}
      />

      <StarterPackModal
        isOpen={starterModalOpen}
        onClose={() => setStarterModalOpen(false)}
        onSelectStarter={handleSelectStarter}
        loading={starterLoading}
      />

      <QrCodeModal
        isOpen={qrModalOpen}
        onClose={() => {
          setQrModalOpen(false);
          setQrData(null);
        }}
        qrData={qrData}
      />
    </div>
  );
}

function MetricTile({ label, value }) {
  return (
    <Card>
      <CardBody style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>{value}</div>
      </CardBody>
    </Card>
  );
}

const labelCss = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' };
const inputCss = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' };
