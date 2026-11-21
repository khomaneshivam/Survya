import React from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export default function ExperienceShell({
  theme = {},
  title = '',
  navigationStack = [],
  currentStepIndex = 0,
  totalSteps = 1,
  onNavigateBack,
  isPreview = false,
  children
}) {
  const primaryColor = theme.primaryColor || '#2F5219';
  const bgColor = theme.backgroundColor || '#F8FAFC';
  const surfaceColor = theme.surfaceColor || '#FFFFFF';
  const textColor = theme.textColor || '#0F172A';

  const canGoBack = navigationStack && navigationStack.length > 1;
  const progressPercent = totalSteps > 0 ? Math.min(100, Math.round(((currentStepIndex + 1) / totalSteps) * 100)) : 100;

  return (
    <div
      className="inapp-experience-shell-wrapper"
      style={{
        minHeight: isPreview ? '100%' : '100dvh',
        height: isPreview ? '100%' : 'auto',
        backgroundColor: isPreview ? 'transparent' : bgColor,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: isPreview ? '0' : '0'
      }}
    >
      <div
        className="inapp-experience-container"
        style={{
          width: '100%',
          maxWidth: isPreview ? '100%' : '480px',
          minHeight: isPreview ? '100%' : '100dvh',
          backgroundColor: surfaceColor,
          color: textColor,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: isPreview ? 'none' : '0 10px 30px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
          position: 'relative'
        }}
      >
        {/* Branded Top Bar */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 40,
            backgroundColor: surfaceColor,
            borderBottom: '1px solid rgba(0,0,0,0.07)',
            backdropFilter: 'blur(8px)'
          }}
        >
          <div
            style={{
              height: '56px',
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              {canGoBack && (
                <button
                  type="button"
                  onClick={onNavigateBack}
                  aria-label="Go back"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: textColor
                  }}
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <span
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: textColor,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {title}
              </span>
            </div>

            {totalSteps > 1 && (
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: primaryColor,
                  backgroundColor: `${primaryColor}14`,
                  padding: '3px 8px',
                  borderRadius: '12px',
                  flexShrink: 0
                }}
              >
                Step {currentStepIndex + 1}/{totalSteps}
              </span>
            )}
          </div>

          {/* Progress Bar Line */}
          {totalSteps > 1 && (
            <div
              style={{
                height: '3px',
                width: '100%',
                backgroundColor: 'rgba(0,0,0,0.05)',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  backgroundColor: primaryColor,
                  transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              />
            </div>
          )}
        </header>

        {/* Content Body */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '20px 16px'
          }}
        >
          {children}
        </main>

        {/* Trust & Verification Footer */}
        <footer
          style={{
            padding: '14px 16px 20px 16px',
            textAlign: 'center',
            fontSize: '11px',
            color: '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            borderTop: '1px solid rgba(0,0,0,0.04)',
            marginTop: 'auto'
          }}
        >
          <ShieldCheck size={14} color={primaryColor} />
          <span>Verified Secure Experience by SARVYA</span>
        </footer>
      </div>
    </div>
  );
}

