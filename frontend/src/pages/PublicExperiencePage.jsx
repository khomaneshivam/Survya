import React, { useState, useEffect, useCallback } from 'react';
import usePageMeta from '../utils/usePageMeta';
import ConversationalRenderer from '../components/studio-chat/ConversationalRenderer';
import { AlertCircle, Clock, MessageCircle, RotateCcw } from 'lucide-react';

export default function PublicExperiencePage({
  slug,
  isPreview = false,
  demoMode = false,
  previewExperience = null,
  previewScreens = null,
  previewFields = null
}) {
  const [loading, setLoading] = useState(!previewExperience);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);

  // Runtime Experience State
  const [experience, setExperience] = useState(previewExperience);
  const [screens, setScreens] = useState(previewScreens || []);
  const [formFieldsByScreen, setFormFieldsByScreen] = useState(previewFields || {});
  const [catalogMeta, setCatalogMeta] = useState({});
  const [catalogItems, setCatalogItems] = useState([]);

  // Session & Conversational Transcript State
  const [sessionToken, setSessionToken] = useState(null);
  const [currentScreenKey, setCurrentScreenKey] = useState(null);
  const [navigationStack, setNavigationStack] = useState([]);
  const [stateData, setStateData] = useState({});
  const [transcript, setTranscript] = useState([]);
  const [channelOwner, setChannelOwner] = useState('SURVYA');
  const [optimisticLockVersion, setOptimisticLockVersion] = useState(1);

  // Form Submitting & Field Errors
  const [submittingForm, setSubmittingForm] = useState(false);
  const [serverFieldErrors, setServerFieldErrors] = useState({});

  usePageMeta({
    title: experience?.name || experience?.title || 'Survya Chat Experience',
    description: experience?.description || 'Interactive Conversational Experience',
    noindex: true
  });

  const loadExperienceData = useCallback(async () => {
    if (previewExperience && previewScreens) {
      setExperience(previewExperience);
      setScreens(previewScreens);
      setFormFieldsByScreen(previewFields || {});
      const entryKey = previewExperience.entryScreenKey || previewScreens[0]?.screenKey || 'welcome';
      setCurrentScreenKey(entryKey);
      setNavigationStack([entryKey]);
      const entryScr = previewScreens.find((s) => s.screenKey === entryKey) || previewScreens[0];
      if (entryScr) {
        setTranscript([{
          id: 'preview_init',
          role: 'assistant',
          screenKey: entryScr.screenKey,
          title: entryScr.title,
          message: entryScr.subtitle || entryScr.title
        }]);
      }
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setErrorCode(null);

      // 1. Load published Experience Definition
      const res = await fetch(`/api/v1/public/x/${slug}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorCode(res.status);
        setError(data.message || 'Unable to load experience');
        return;
      }

      const expData = data.data;
      setExperience(expData.experience);
      setScreens(expData.screens || []);
      setFormFieldsByScreen(expData.formFieldsByScreen || {});
      setCatalogMeta(expData.catalogMeta || {});

      // 2. Load Catalog Items if applicable
      try {
        const catRes = await fetch(`/api/v1/public/x/${slug}/catalog`);
        const catData = await catRes.json();
        if (catData.success) {
          setCatalogItems(catData.items || []);
        }
      } catch (_) {}

      // 3. Redeem opaque ?ct= continuation token if present in URL, then strip query param from URL
      const urlParams = new URLSearchParams(window.location.search || '');
      const continuationToken = urlParams.get('ct');

      if (continuationToken) {
        try {
          window.history.replaceState({}, '', window.location.pathname);
        } catch (_) {}

        const redeemRes = await fetch(`/api/v1/public/x/${slug}/continuation/redeem`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ct: continuationToken })
        });
        const redeemData = await redeemRes.json();

        if (!redeemRes.ok || !redeemData.success) {
          setErrorCode(redeemRes.status);
          setError(redeemData.message || 'This WhatsApp continuation link is invalid or has expired.');
          return;
        }

        const rData = redeemData.data;
        setSessionToken(rData.sessionToken);
        setCurrentScreenKey(rData.currentScreenKey);
        setNavigationStack(rData.navigationStack || [rData.currentScreenKey]);
        setStateData(rData.stateData || {});
        setTranscript(rData.transcript || []);
        setChannelOwner(rData.channelOwner || 'SURVYA');
        setOptimisticLockVersion(rData.optimisticLockVersion || 1);
        try {
          sessionStorage.setItem(`sarvya_inapp_session_${slug}`, rData.sessionToken);
        } catch (_) {}
        return;
      }

      // 4. Otherwise start or resume standard customer session
      let existingToken = null;
      try {
        existingToken = sessionStorage.getItem(`sarvya_inapp_session_${slug}`);
      } catch (_) {}

      const sessRes = await fetch(`/api/v1/public/x/${slug}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken: existingToken, demoMode })
      });
      const sessData = await sessRes.json();

      if (sessData.success && sessData.data) {
        const s = sessData.data;
        setSessionToken(s.sessionToken);
        setCurrentScreenKey(s.currentScreenKey);
        setNavigationStack(s.navigationStack || [s.currentScreenKey]);
        setStateData(s.stateData || {});
        setTranscript(s.transcript || []);
        setChannelOwner(s.channelOwner || 'SURVYA');
        setOptimisticLockVersion(s.optimisticLockVersion || 1);
        try {
          sessionStorage.setItem(`sarvya_inapp_session_${slug}`, s.sessionToken);
        } catch (_) {}
      }
    } catch (err) {
      setError(err.message || 'Network error loading conversational experience');
    } finally {
      setLoading(false);
    }
  }, [slug, demoMode, previewExperience, previewScreens, previewFields]);

  useEffect(() => {
    loadExperienceData();
  }, [loadExperienceData]);

  const handleAction = async (action, payload = {}) => {
    if (action === 'BACK' && navigationStack.length <= 1) return;

    if (isPreview && !sessionToken) {
      if (action === 'BACK') {
        const newStack = [...navigationStack];
        if (newStack.length > 1) {
          newStack.pop();
          const nextKey = newStack[newStack.length - 1];
          setNavigationStack(newStack);
          setCurrentScreenKey(nextKey);
        }
        return;
      }
      const curIdx = screens.findIndex((s) => s.screenKey === currentScreenKey);
      const nextKey = payload.targetScreenKey || screens[Math.min(curIdx + 1, screens.length - 1)]?.screenKey || currentScreenKey;
      const nextScr = screens.find((s) => s.screenKey === nextKey);

      if (payload.formValues) setStateData((prev) => ({ ...prev, ...payload.formValues }));
      if (payload.selectedItemId) {
        const item = catalogItems.find((i) => String(i.id) === String(payload.selectedItemId));
        setStateData((prev) => ({ ...prev, selectedItemId: payload.selectedItemId, selectedItem: item, selectedItemTitle: item?.title }));
      }
      setTranscript((prev) => [
        ...prev,
        { id: `p_u_${Date.now()}`, role: 'customer', summary: payload.selectedItemId ? 'Selected item' : 'Submitted step' },
        ...(nextScr && nextScr.screenKey !== currentScreenKey ? [{ id: `p_a_${Date.now()}`, role: 'assistant', screenKey: nextScr.screenKey, title: nextScr.title, message: nextScr.subtitle || nextScr.title }] : [])
      ]);
      setNavigationStack((prev) => [...prev, nextKey]);
      setCurrentScreenKey(nextKey);
      return;
    }

    try {
      setSubmittingForm(true);
      setServerFieldErrors({});

      const res = await fetch(`/api/v1/public/x/${slug}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken,
          fromScreenKey: currentScreenKey,
          action,
          targetScreenKey: payload.targetScreenKey,
          formValues: payload.formValues,
          selectedItemId: payload.selectedItemId,
          expectedLockVersion: optimisticLockVersion
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 422 && data.fieldErrors) {
          setServerFieldErrors(data.fieldErrors);
          return;
        }
        if (res.status === 409) {
          await loadExperienceData();
          return;
        }
        alert(data.message || 'Unable to process step');
        return;
      }

      const d = data.data;
      setCurrentScreenKey(d.currentScreenKey);
      setNavigationStack(d.navigationStack || []);
      setStateData(d.stateData || {});
      if (Array.isArray(d.transcript)) setTranscript(d.transcript);
      if (d.channelOwner) setChannelOwner(d.channelOwner);
      if (d.optimisticLockVersion) setOptimisticLockVersion(d.optimisticLockVersion);
    } catch (err) {
      alert(err.message || 'Network error');
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleSelectItem = (item, targetScreen = null) => {
    const detailScreen = screens.find((s) => s.screenType === 'ITEM_DETAIL');
    const target = targetScreen || (detailScreen ? detailScreen.screenKey : null);
    setStateData((prev) => ({
      ...prev,
      selectedItemId: item.id,
      selectedItem: item,
      selectedItemTitle: item.title,
      selectedItemPrice: item.price
    }));
    handleAction(target ? 'JUMP' : 'NEXT', {
      targetScreenKey: target,
      selectedItemId: item.id
    });
  };

  const handleSwitchChannel = async (targetChannel) => {
    if (isPreview || !sessionToken) return;
    try {
      const res = await fetch(`/api/v1/public/x/${slug}/channel-switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken, targetChannel })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setChannelOwner(data.data.channelOwner);
        if (data.data.optimisticLockVersion) setOptimisticLockVersion(data.data.optimisticLockVersion);
        if (targetChannel === 'HUMAN') {
          const supportScreen = screens.find((s) => s.screenType === 'LIVE_CHAT' || s.screenType === 'CALL_CONNECT');
          if (supportScreen) {
            await handleAction('JUMP', { targetScreenKey: supportScreen.screenKey });
          }
        }
      }
    } catch (_) {}
  };

  const handleResetSession = () => {
    try {
      sessionStorage.removeItem(`sarvya_inapp_session_${slug}`);
    } catch (_) {}
    loadExperienceData();
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F8F7' }}>
        <div style={{ textAlign: 'center', color: '#475569', fontSize: '14px', fontWeight: 600 }}>
          Opening conversation...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F8F7', padding: '20px' }}>
        <div style={{ maxWidth: '400px', width: '100%', background: '#FFFFFF', borderRadius: '16px', padding: '28px 22px', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: errorCode === 410 ? '#FEF3C7' : '#FEE2E2', color: errorCode === 410 ? '#D97706' : '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px auto' }}>
            {errorCode === 410 ? <Clock size={22} /> : <AlertCircle size={22} />}
          </div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '17px', fontWeight: 700, color: '#0F172A' }}>
            {errorCode === 401 ? 'Continuation Link Expired' : errorCode === 410 ? 'Experience Paused' : 'Experience Unavailable'}
          </h2>
          <p style={{ margin: '0 0 18px 0', fontSize: '13.5px', color: '#475569', lineHeight: 1.5 }}>{error}</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleResetSession}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
            >
              <RotateCcw size={14} /> Start Fresh
            </button>
            <a
              href="https://wa.me/"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '10px', background: '#25D366', color: '#FFFFFF', textDecoration: 'none', fontWeight: 700, fontSize: '13px' }}
            >
              <MessageCircle size={14} /> Back to WhatsApp
            </a>
          </div>
        </div>
      </div>
    );
  }

  const activeScreen = screens.find((s) => s.screenKey === currentScreenKey) || screens[0] || null;

  return (
    <ConversationalRenderer
      experience={experience}
      screens={screens}
      formFieldsByScreen={formFieldsByScreen}
      catalogItems={catalogItems}
      catalogMeta={catalogMeta}
      activeScreen={activeScreen}
      navigationStack={navigationStack}
      stateData={stateData}
      transcript={transcript}
      channelOwner={channelOwner}
      demoMode={demoMode}
      isPreview={isPreview}
      sessionToken={sessionToken}
      slug={slug}
      submitting={submittingForm}
      serverFieldErrors={serverFieldErrors}
      onSelectItem={handleSelectItem}
      onAction={handleAction}
      onSwitchChannel={handleSwitchChannel}
      onReset={handleResetSession}
    />
  );
}
