import React from 'react';
import { X, Smartphone, RefreshCw, ExternalLink } from 'lucide-react';
import PublicExperiencePage from '../../pages/PublicExperiencePage';

export default function LiveMobilePreviewModal({
  isOpen,
  onClose,
  experience
}) {
  const [reloadKey, setReloadKey] = React.useState(1);

  if (!isOpen || !experience) return null;

  const publicUrl = `/x/${experience.slug}`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px',
          maxHeight: '94vh'
        }}
      >
        {/* Top Floating Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            backgroundColor: '#1e293b',
            color: '#ffffff',
            padding: '8px 18px',
            borderRadius: '24px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            fontSize: '13px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Smartphone size={16} color="#38bdf8" />
            <span style={{ fontWeight: 600 }}>Live Mobile Preview: {experience.name}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setReloadKey(k => k + 1)}
              title="Reset Preview"
              style={{
                border: 'none',
                background: 'rgba(255,255,255,0.12)',
                color: '#ffffff',
                padding: '6px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px'
              }}
            >
              <RefreshCw size={13} />
              <span>Reset</span>
            </button>

            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: 'rgba(255,255,255,0.12)',
                color: '#ffffff',
                padding: '6px 10px',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px'
              }}
            >
              <ExternalLink size={13} />
              <span>Open Tab</span>
            </a>

            <button
              type="button"
              onClick={onClose}
              style={{
                border: 'none',
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#f87171',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Realistic Mobile Device Frame */}
        <div
          style={{
            width: '380px',
            height: '740px',
            maxHeight: 'calc(94vh - 70px)',
            backgroundColor: '#090d16',
            borderRadius: '44px',
            padding: '12px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5), inset 0 0 2px 2px rgba(255,255,255,0.15)',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box'
          }}
        >
          {/* Top Speaker / Dynamic Island Notch */}
          <div
            style={{
              position: 'absolute',
              top: '18px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '100px',
              height: '18px',
              backgroundColor: '#000000',
              borderRadius: '12px',
              zIndex: 99,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <div style={{ width: '40px', height: '4px', backgroundColor: '#1e293b', borderRadius: '2px' }} />
          </div>

          {/* Device Screen Content Area */}
          <div
            style={{
              flex: 1,
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: '34px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative'
            }}
          >
            <div style={{ height: '24px', backgroundColor: '#ffffff', flexShrink: 0 }} />
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <PublicExperiencePage
                key={reloadKey}
                slug={experience.slug}
                isPreview={true}
              />
            </div>
            {/* Bottom Home Indicator Bar */}
            <div
              style={{
                height: '18px',
                backgroundColor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <div style={{ width: '110px', height: '4px', backgroundColor: '#cbd5e1', borderRadius: '2px' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

