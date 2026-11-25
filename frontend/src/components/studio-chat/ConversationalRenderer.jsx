import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Headphones,
  MessageCircle,
  WifiOff,
  ShieldCheck,
  Sparkles,
  RotateCcw
} from 'lucide-react';
import { renderConversationalStep } from './componentRegistry';

export default function ConversationalRenderer({
  experience = {},
  screens = [],
  formFieldsByScreen = {},
  catalogItems = [],
  catalogMeta = {},
  activeScreen = null,
  navigationStack = [],
  stateData = {},
  transcript = [],
  channelOwner = 'SURVYA',
  demoMode = false,
  isPreview = false,
  sessionToken = null,
  slug = '',
  submitting = false,
  serverFieldErrors = {},
  onSelectItem,
  onAction,
  onSwitchChannel,
  onReset
}) {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const threadEndRef = useRef(null);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [transcript.length, activeScreen?.screenKey]);

  const primaryColor = experience.theme?.primaryColor || '#2F5219';
  const businessName = experience.name || experience.title || 'Survya Assistant';
  const initialLetter = businessName.trim().charAt(0).toUpperCase() || 'S';
  const canGoBack = navigationStack && navigationStack.length > 1;
  const activeFields = activeScreen ? (formFieldsByScreen[activeScreen.id] || []) : [];

  // Exclude trailing assistant turn when we already render the live interactive step below
  const pastTurns = transcript.filter((turn, idx) => {
    if (idx === transcript.length - 1 && turn.role === 'assistant' && turn.screenKey === activeScreen?.screenKey) {
      return false;
    }
    return true;
  });

  return (
    <div
      className="survya-chat-shell"
      style={{
        minHeight: isPreview ? '100%' : '100dvh',
        height: isPreview ? '100%' : '100dvh',
        width: '100%',
        backgroundColor: isPreview ? '#F1F5F9' : '#E9EEF2',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'stretch',
        overflow: 'hidden'
      }}
    >
      <div
        className="survya-chat-viewport"
        style={{
          width: '100%',
          maxWidth: isPreview ? '100%' : '520px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#F6F8F7',
          boxShadow: isPreview ? 'none' : '0 12px 36px rgba(15, 23, 42, 0.12)',
          position: 'relative'
        }}
      >
        {/* Minimal Conversational Header — Zero Website Nav Chrome */}
        <header
          style={{
            flexShrink: 0,
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            zIndex: 20
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            {canGoBack && (
              <button
                type="button"
                onClick={() => onAction('BACK')}
                aria-label="Previous step"
                style={{
                  border: 'none',
                  background: '#F1F5F9',
                  color: '#0F172A',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: primaryColor,
                color: '#FFFFFF',
                fontWeight: 800,
                fontSize: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              {initialLetter}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {businessName}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#475569' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: channelOwner === 'HUMAN' ? '#D97706' : '#16A34A' }} />
                <span>
                  {demoMode ? 'Interactive Demo Mode' : channelOwner === 'HUMAN' ? 'Connected with Specialist' : 'Instant Assistant'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {!demoMode && onSwitchChannel && (
              <>
                <button
                  type="button"
                  title="Human Assistance"
                  onClick={() => onSwitchChannel('HUMAN')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 9px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#FFFFFF',
                    color: '#334155',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Headphones size={13} />
                  <span>Support</span>
                </button>
                <button
                  type="button"
                  title="Continue on WhatsApp"
                  onClick={() => onSwitchChannel('WHATSAPP')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 9px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#DCFCE7',
                    color: '#166534',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <MessageCircle size={13} />
                  <span>WhatsApp</span>
                </button>
              </>
            )}
            {onReset && (
              <button
                type="button"
                title="Restart chat"
                onClick={onReset}
                style={{
                  border: 'none',
                  background: '#F1F5F9',
                  color: '#475569',
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <RotateCcw size={13} />
              </button>
            )}
          </div>
        </header>

        {/* Demo / Offline Status Banners */}
        {demoMode && (
          <div style={{ background: '#FEF3C7', color: '#92400E', padding: '6px 14px', fontSize: '11.5px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderBottom: '1px solid #FDE68A' }}>
            <Sparkles size={13} />
            <span>Isolated Try Demo — Zero live WhatsApp, email, or payment side effects</span>
          </div>
        )}
        {isOffline && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '8px 14px', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <WifiOff size={14} />
            <span>Connection offline. Your progress is preserved until you reconnect.</span>
          </div>
        )}

        {/* Scrollable Conversational Message Stream */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 14px 24px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          {/* Past Conversational Turns */}
          {pastTurns.map((turn) => {
            const isUser = turn.role === 'customer';
            return (
              <div
                key={turn.id}
                style={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start'
                }}
              >
                <div
                  style={{
                    maxWidth: '84%',
                    padding: '10px 13px',
                    borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                    backgroundColor: isUser ? primaryColor : '#FFFFFF',
                    color: isUser ? '#FFFFFF' : '#0F172A',
                    fontSize: '13.5px',
                    lineHeight: 1.45,
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
                    border: isUser ? 'none' : '1px solid rgba(15, 23, 42, 0.06)'
                  }}
                >
                  {isUser ? (turn.summary || 'Submitted') : (turn.message || turn.title)}
                </div>
              </div>
            );
          })}

          {/* Active Interactive Conversational Step Card */}
          {activeScreen ? (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div
                style={{
                  width: '100%',
                  maxWidth: '94%',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '16px 16px 16px 4px',
                  padding: '14px',
                  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)',
                  border: '1px solid rgba(15, 23, 42, 0.08)'
                }}
              >
                {renderConversationalStep({
                  screen: activeScreen,
                  fields: activeFields,
                  experience,
                  stateData,
                  catalogItems,
                  catalogMeta,
                  sessionToken,
                  slug,
                  submitting,
                  serverFieldErrors,
                  onSelectItem,
                  onAction,
                  onSwitchChannel,
                  onReset
                })}
              </div>
            </div>
          ) : (
            <div style={{ padding: '16px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
              No active step configured for this experience yet.
            </div>
          )}

          <div ref={threadEndRef} />
        </div>

        {/* Minimal Trust Footer */}
        <footer
          style={{
            flexShrink: 0,
            padding: '8px 14px',
            backgroundColor: '#FFFFFF',
            borderTop: '1px solid rgba(15, 23, 42, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#64748B'
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <ShieldCheck size={12} color="#16A34A" />
            Verified Conversational Experience
          </span>
          <span>
            Step {Math.max(1, (screens.findIndex((s) => s.screenKey === activeScreen?.screenKey) + 1) || 1)} of {Math.max(1, screens.length)}
          </span>
        </footer>
      </div>
    </div>
  );
}
