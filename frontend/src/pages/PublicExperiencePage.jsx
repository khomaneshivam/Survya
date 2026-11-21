import React, { useState, useEffect, useCallback } from 'react';
import ExperienceShell from '../components/inapp-runtime/ExperienceShell';
import HeroWelcomeScreen from '../components/inapp-runtime/HeroWelcomeScreen';
import CatalogExplorerScreen from '../components/inapp-runtime/CatalogExplorerScreen';
import ItemDetailScreen from '../components/inapp-runtime/ItemDetailScreen';
import DynamicFormScreen from '../components/inapp-runtime/DynamicFormScreen';
import ConfirmationScreen from '../components/inapp-runtime/ConfirmationScreen';
import { AlertCircle, Clock, RotateCcw } from 'lucide-react';

export default function PublicExperiencePage({
  slug,
  isPreview = false,
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

  // Session State
  const [sessionToken, setSessionToken] = useState(null);
  const [currentScreenKey, setCurrentScreenKey] = useState(null);
  const [navigationStack, setNavigationStack] = useState([]);
  const [stateData, setStateData] = useState({});

  // Dynamic Item Detail View Override (when user taps an item in catalog)
  const [viewingItem, setViewingItem] = useState(null);

  // Form Submitting & Field Errors
  const [submittingForm, setSubmittingForm] = useState(false);
  const [serverFieldErrors, setServerFieldErrors] = useState({});

  // SEO: Ensure search engines do not index customer runtime links
  useEffect(() => {
    if (typeof document !== 'undefined') {
      let meta = document.querySelector('meta[name="robots"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'robots';
        document.head.appendChild(meta);
      }
      meta.content = 'noindex, nofollow';
    }
  }, []);

  // 1. Fetch Experience Definition & Catalog
  const loadExperienceData = useCallback(async () => {
    if (previewExperience && previewScreens) {
      setExperience(previewExperience);
      setScreens(previewScreens);
      setFormFieldsByScreen(previewFields || {});
      const entryKey = previewExperience.entryScreenKey || previewScreens[0]?.screenKey || 'welcome';
      setCurrentScreenKey(entryKey);
      setNavigationStack([entryKey]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setErrorCode(null);

      // GET Experience & Screens
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

      // GET Catalog Items
      try {
        const catRes = await fetch(`/api/v1/public/x/${slug}/catalog`);
        const catData = await catRes.json();
        if (catData.success) {
          setCatalogItems(catData.items || []);
        }
      } catch (catErr) {
        console.warn('[PublicExperiencePage] Catalog load warning:', catErr.message);
      }

      // Initialize or Resume Session
      let existingToken = null;
      try {
        existingToken = sessionStorage.getItem(`sarvya_inapp_session_${slug}`);
      } catch (_) {}

      const sessRes = await fetch(`/api/v1/public/x/${slug}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken: existingToken })
      });
      const sessData = await sessRes.json();

      if (sessData.success && sessData.data) {
        const { sessionToken: token, currentScreenKey: scrKey, navigationStack: stack, stateData: sData } = sessData.data;
        setSessionToken(token);
        setCurrentScreenKey(scrKey);
        setNavigationStack(stack || [scrKey]);
        setStateData(sData || {});
        try {
          sessionStorage.setItem(`sarvya_inapp_session_${slug}`, token);
        } catch (_) {}
      }
    } catch (err) {
      console.error('[PublicExperiencePage] Load error:', err);
      setError(err.message || 'Network error loading experience');
    } finally {
      setLoading(false);
    }
  }, [slug, previewExperience, previewScreens, previewFields]);

  useEffect(() => {
    loadExperienceData();
  }, [loadExperienceData]);

  // 2. Navigation Action Handler (NEXT, BACK, JUMP)
  const handleAction = async (action, payload = {}) => {
    // If user is currently looking at item detail overlay and clicks Back
    if (viewingItem && action === 'BACK') {
      setViewingItem(null);
      return;
    }

    if (action === 'BACK' && navigationStack.length <= 1) {
      return;
    }

    // Client-side preview mode handling
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

      const targetKey = payload.targetScreenKey || null;
      let nextKey = targetKey;
      if (!nextKey) {
        const curIdx = screens.findIndex(s => s.screenKey === currentScreenKey);
        if (curIdx >= 0 && curIdx < screens.length - 1) {
          nextKey = screens[curIdx + 1].screenKey;
        } else {
          nextKey = currentScreenKey;
        }
      }

      if (payload.formValues) {
        setStateData(prev => ({ ...prev, ...payload.formValues }));
      }
      if (payload.selectedItemId) {
        const item = catalogItems.find(i => String(i.id) === String(payload.selectedItemId));
        setStateData(prev => ({ ...prev, selectedItemId: payload.selectedItemId, selectedItem: item }));
      }

      setNavigationStack(prev => [...prev, nextKey]);
      setCurrentScreenKey(nextKey);
      return;
    }

    // Live Server Navigation
    try {
      if (payload.formValues) setSubmittingForm(true);
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
          selectedItemId: payload.selectedItemId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 422 && data.fieldErrors) {
          setServerFieldErrors(data.fieldErrors);
          return;
        }
        if (res.status === 401) {
          // Session expired: restart
          sessionStorage.removeItem(`sarvya_inapp_session_${slug}`);
          await loadExperienceData();
          return;
        }
        alert(data.message || 'Navigation error');
        return;
      }

      if (data.success && data.data) {
        setCurrentScreenKey(data.data.currentScreenKey);
        setNavigationStack(data.data.navigationStack || []);
        setStateData(data.data.stateData || {});
        setViewingItem(null);
      }
    } catch (err) {
      console.error('[PublicExperiencePage] Navigation error:', err);
      alert(err.message || 'Network error navigating');
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleSelectItem = (item) => {
    // Check if an ITEM_DETAIL screen exists in the flow
    const detailScreen = screens.find(s => s.screenType === 'ITEM_DETAIL');
    if (detailScreen) {
      handleAction('JUMP', {
        targetScreenKey: detailScreen.screenKey,
        selectedItemId: item.id
      });
    } else {
      // Use built-in item detail modal/overlay
      setViewingItem(item);
    }
  };

  const handleResetSession = () => {
    try {
      sessionStorage.removeItem(`sarvya_inapp_session_${slug}`);
    } catch (_) {}
    loadExperienceData();
  };

  // 3. Loading State
  if (loading) {
    return (
      <div
        style={{
          minHeight: isPreview ? '100%' : '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          backgroundColor: '#f8fafc',
          color: '#64748b'
        }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            border: '3px solid #e2e8f0',
            borderTopColor: '#2F5219',
            animation: 'spin 0.8s linear infinite'
          }}
        />
        <span style={{ fontSize: '13px', fontWeight: 600 }}>Loading Experience...</span>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // 4. Error / Paused State
  if (error || !experience) {
    return (
      <div
        style={{
          minHeight: isPreview ? '100%' : '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          backgroundColor: '#f8fafc',
          color: '#334155',
          textAlign: 'center'
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: errorCode === 410 ? '#fef3c7' : '#fee2e2',
            color: errorCode === 410 ? '#d97706' : '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px'
          }}
        >
          {errorCode === 410 ? <Clock size={28} /> : <AlertCircle size={28} />}
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px 0', color: '#0f172a' }}>
          {errorCode === 410 ? 'Experience Currently Unavailable' : 'Experience Not Found'}
        </h2>
        <p style={{ fontSize: '13.5px', color: '#64748b', maxWidth: '380px', margin: '0 0 20px 0', lineHeight: 1.5 }}>
          {error || 'The requested interactive experience could not be loaded.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: '8px 18px',
            borderRadius: '10px',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            border: 'none',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <RotateCcw size={14} />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  // 5. Render Active Screen
  const activeScreen = screens.find(s => s.screenKey === currentScreenKey) || screens[0] || {};
  const currentStepIndex = screens.findIndex(s => s.screenKey === currentScreenKey);
  const totalSteps = screens.length;

  return (
    <ExperienceShell
      theme={experience.theme || {}}
      title={experience.name}
      navigationStack={viewingItem ? [...navigationStack, 'item_detail'] : navigationStack}
      currentStepIndex={currentStepIndex >= 0 ? currentStepIndex : 0}
      totalSteps={totalSteps}
      onNavigateBack={() => handleAction('BACK')}
      isPreview={isPreview}
    >
      {/* If an item detail overlay is active */}
      {viewingItem ? (
        <ItemDetailScreen
          item={viewingItem}
          experience={experience}
          onAction={(act, payload) => {
            if (act === 'NEXT') {
              // Proceed from item detail into next screen
              setViewingItem(null);
              handleAction('NEXT', { selectedItemId: viewingItem.id, ...payload });
            } else {
              handleAction(act, payload);
            }
          }}
        />
      ) : activeScreen.screenType === 'HERO_WELCOME' ? (
        <HeroWelcomeScreen
          screen={activeScreen}
          experience={experience}
          onAction={handleAction}
        />
      ) : activeScreen.screenType === 'CATALOG_EXPLORER' ? (
        <CatalogExplorerScreen
          screen={activeScreen}
          experience={experience}
          catalogItems={catalogItems}
          catalogMeta={catalogMeta}
          onSelectItem={handleSelectItem}
          onAction={handleAction}
        />
      ) : activeScreen.screenType === 'ITEM_DETAIL' ? (
        <ItemDetailScreen
          item={stateData.selectedItem || catalogItems[0] || {}}
          experience={experience}
          onAction={handleAction}
        />
      ) : activeScreen.screenType === 'DYNAMIC_FORM' ? (
        <DynamicFormScreen
          screen={activeScreen}
          fields={formFieldsByScreen[activeScreen.id] || []}
          initialValues={stateData}
          serverFieldErrors={serverFieldErrors}
          experience={experience}
          submitting={submittingForm}
          onSubmit={(formValues) => handleAction('NEXT', { formValues })}
        />
      ) : activeScreen.screenType === 'CONFIRMATION' ? (
        <ConfirmationScreen
          screen={activeScreen}
          stateData={stateData}
          experience={experience}
          onReset={handleResetSession}
        />
      ) : (
        /* Fallback renderer for other screen types */
        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700 }}>{activeScreen.title || 'Screen'}</h2>
          <p style={{ color: '#64748b', fontSize: '13.5px' }}>{activeScreen.subtitle || ''}</p>
          <button
            type="button"
            onClick={() => handleAction('NEXT')}
            style={{
              marginTop: '16px',
              padding: '10px 24px',
              borderRadius: '10px',
              backgroundColor: experience.theme?.primaryColor || '#2F5219',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Continue
          </button>
        </div>
      )}
    </ExperienceShell>
  );
}
