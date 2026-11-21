import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader, Skeleton } from '../components/ui';
import ExperiencesListView from '../components/inapp-studio/ExperiencesListView';
import ExperienceDetailEditor from '../components/inapp-studio/ExperienceDetailEditor';
import StarterPackModal from '../components/inapp-studio/StarterPackModal';
import QrCodeModal from '../components/inapp-studio/QrCodeModal';
import NegotiationsAndCallsModal from '../components/inapp-studio/NegotiationsAndCallsModal';

export default function InAppStudioPage() {
  const [experiences, setExperiences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedExperience, setSelectedExperience] = useState(null);

  // Modals
  const [starterModalOpen, setStarterModalOpen] = useState(false);
  const [starterLoading, setStarterLoading] = useState(false);

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrData, setQrData] = useState(null);

  const [negModalOpen, setNegModalOpen] = useState(false);

  // Studio Toast notification
  const [toastMsg, setToastMsg] = useState(null);
  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  }, []);

  const loadExperiences = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/inapp/experiences', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setExperiences(data.data || []);
      }
    } catch (err) {
      console.error('[InAppStudioPage] Error loading experiences:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExperiences();
  }, [loadExperiences]);

  // Load detailed experience when selected
  const handleSelectExperience = async (exp) => {
    try {
      const res = await fetch(`/api/v1/inapp/experiences/${exp.id}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setSelectedExperience(data.data);
      } else {
        setSelectedExperience(exp);
      }
    } catch (err) {
      setSelectedExperience(exp);
    }
  };

  const handleRefreshSelected = async () => {
    if (!selectedExperience) return;
    try {
      const res = await fetch(`/api/v1/inapp/experiences/${selectedExperience.id}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setSelectedExperience(data.data);
      }
      loadExperiences();
    } catch (err) {
      console.error('[InAppStudioPage] Error refreshing experience:', err);
    }
  };

  const handleSelectStarter = async (domainType) => {
    try {
      setStarterLoading(true);
      const res = await fetch('/api/v1/inapp/experiences/from-starter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ domainType })
      });
      const data = await res.json();
      if (data.success) {
        setStarterModalOpen(false);
        showToast(`Created ${domainType} starter experience!`);
        await loadExperiences();
        if (data.data) {
          setSelectedExperience(data.data);
        }
      } else {
        alert(data.message || 'Failed to instantiate starter pack');
      }
    } catch (err) {
      alert(err.message || 'Error creating starter experience');
    } finally {
      setStarterLoading(false);
    }
  };

  const handleOpenQr = async (exp) => {
    try {
      const res = await fetch(`/api/v1/inapp/experiences/${exp.id}/qr`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setQrData(data.data);
        setQrModalOpen(true);
      }
    } catch (err) {
      alert('Unable to generate QR Code');
    }
  };

  return (
    <div className="inapp-studio-page" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Toast Alert */}
      {toastMsg && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: '#171719',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          zIndex: 9999,
          fontSize: '14px',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {toastMsg}
        </div>
      )}

      {selectedExperience ? (
        <ExperienceDetailEditor
          experience={selectedExperience}
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
          <PageHeader
            title="In-App Experience Studio"
            subtitle="Design WhatsApp-Flows-style multi-screen web experiences with validated forms, catalog exploration, rate discussions, and calls."
          />

          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px', marginTop: '20px' }}>
              <Skeleton style={{ height: '200px', borderRadius: '12px' }} />
              <Skeleton style={{ height: '200px', borderRadius: '12px' }} />
              <Skeleton style={{ height: '200px', borderRadius: '12px' }} />
            </div>
          ) : (
            <ExperiencesListView
              experiences={experiences}
              loading={loading}
              onSelectExperience={handleSelectExperience}
              onOpenStarterModal={() => setStarterModalOpen(true)}
              onOpenNegotiationsModal={() => setNegModalOpen(true)}
              onOpenQr={handleOpenQr}
              onRefresh={loadExperiences}
              toast={showToast}
            />
          )}
        </>
      )}

      {/* Negotiations & Calls Management Modal */}
      <NegotiationsAndCallsModal
        isOpen={negModalOpen}
        onClose={() => setNegModalOpen(false)}
        toast={showToast}
      />

      {/* Starter Pack Modal */}
      <StarterPackModal
        isOpen={starterModalOpen}
        onClose={() => setStarterModalOpen(false)}
        onSelectStarter={handleSelectStarter}
        loading={starterLoading}
      />

      {/* QR Code Modal */}
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

