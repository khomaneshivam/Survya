import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  MessageSquare, 
  Send, 
  RefreshCw, 
  CheckCheck, 
  Search, 
  ShieldCheck, 
  Sparkles,
  ArrowLeft,
  X,
  Paperclip,
  Image as ImageIcon,
  FileVideo,
  Play,
  Trash2,
  Download,
  ExternalLink,
  Maximize2,
  ImageOff,
  ZoomIn,
  ZoomOut,
  CheckCircle2,
  Layers,
  Link2,
  Smartphone,
  Globe,
  MessageCircle,
  Bot,
  Sliders,
  Phone,
  RotateCcw,
  FileText,
  PlusCircle,
  Check,
  Edit3,
  Code,
  History,
  Mic,
  Languages,
  Bell,
  BellRing,
  Receipt
} from 'lucide-react';
import { formatIndianTime } from '../utils/indianTime';
import InboxCommerceDrawer from '../components/inbox/InboxCommerceDrawer';

/**
 * Parses key-value responses from WhatsApp Flows or Booking Enquiries into structured fields
 */
function parseFlowContent(raw) {
  if (!raw) return [];
  const parts = String(raw).split(/,\s*(?=[a-zA-Z0-9_-]+:)/);
  const items = [];
  for (const part of parts) {
    const colonIdx = part.indexOf(':');
    if (colonIdx !== -1) {
      const k = part.substring(0, colonIdx).trim();
      const v = part.substring(colonIdx + 1).trim();
      let label = k;
      if (k === 'in' || k === 'check_in') label = 'Check-in';
      else if (k === 'out' || k === 'check_out') label = 'Check-out';
      else if (k === 'name') label = 'Guest Name';
      else if (k === 'adults') label = 'Adults';
      else if (k === 'children' || k === 'kids') label = 'Children';
      else if (k === 'room' || k === 'villa') label = 'Room / Villa';
      else if (k === 'price') label = 'Total Price';
      items.push({ label, value: v });
    }
  }
  return items;
}

/**
 * WhatsApp-style image card with loading shimmer, automatic fallback to proxy,
 * broken state retry, and click-to-lightbox.
 */
function ChatImageBubble({
  src,
  alt = "WhatsApp Photo",
  caption,
  time,
  isOutbound,
  onOpenLightbox,
  mediaId,
  senderName
}) {
  const [loadStatus, setLoadStatus] = useState('loading'); // 'loading' | 'loaded' | 'error'
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [imageSrc, setImageSrc] = useState(src);
  const [prevSrc, setPrevSrc] = useState(src);

  if (src !== prevSrc) {
    setPrevSrc(src);
    setImageSrc(src);
    setLoadStatus('loading');
    setRetryAttempt(0);
  }

  function handleImageError() {
    // If loading from /uploads/inbound/ failed, auto-fallback to /api/media/inbound/
    if (retryAttempt === 0) {
      setRetryAttempt(1);
      if (imageSrc && imageSrc.includes('/uploads/inbound/')) {
        const parts = imageSrc.split('/uploads/inbound/')[1];
        const extractedId = parts ? parts.split('?')[0].split('.')[0] : null;
        if (extractedId) {
          setImageSrc(`/api/media/inbound/${extractedId}?retry=1`);
          return;
        }
      } else if (mediaId) {
        setImageSrc(`/api/media/inbound/${mediaId}?retry=1`);
        return;
      }
    }
    setLoadStatus('error');
  }

  function handleManualRetry(e) {
    if (e) e.stopPropagation();
    setLoadStatus('loading');
    setRetryAttempt(prev => prev + 1);
    const separator = imageSrc.includes('?') ? '&' : '?';
    setImageSrc(`${imageSrc.split('?')[0]}${separator}t=${Date.now()}`);
  }

  return (
    <div style={{
      width: '100%',
      minWidth: '220px',
      maxWidth: '320px',
      marginBottom: caption ? '6px' : '2px'
    }}>
      {/* 1. Loading Shimmer Skeleton */}
      {loadStatus === 'loading' && (
        <div style={{
          width: '100%',
          height: '210px',
          background: 'linear-gradient(110deg, #EEEEF0 25%, #E5E5E8 50%, #EEEEF0 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s infinite linear',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          color: '#67676B',
          borderRadius: '8px',
          border: '1px solid #E5E5E8'
        }}>
          <ImageIcon size={28} color="#96969C" className="pulse-glow" />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#67676B' }}>
            Loading WhatsApp Photo...
          </span>
        </div>
      )}

      {/* 2. Error Fallback Card */}
      {loadStatus === 'error' && (
        <div style={{
          padding: '16px 12px',
          background: '#FDF0F0',
          border: '1px solid #FDB1AF',
          borderRadius: '8px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px'
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: '#FDF0F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9B2C2C'
          }}>
            <ImageOff size={18} />
          </div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#9B2C2C' }}>
            Photo Unavailable
          </div>
          <div style={{ fontSize: '0.7rem', color: '#9B2C2C', lineHeight: 1.35, maxWidth: '240px' }}>
            Image could not be loaded or is downloading from Meta WhatsApp servers.
          </div>
          <button
            type="button"
            onClick={handleManualRetry}
            style={{
              marginTop: '4px',
              background: '#FFFFFF',
              border: '1px solid #9B2C2C',
              color: '#9B2C2C',
              borderRadius: '6px',
              padding: '5px 12px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.15s ease'
            }}
          >
            <RefreshCw size={12} />
            <span>Retry Download</span>
          </button>
        </div>
      )}

      {/* 3. Loaded Image Card */}
      <div
        className="chat-image-container"
        onClick={() => {
          if (loadStatus === 'loaded') {
            onOpenLightbox({
              url: imageSrc,
              caption,
              time,
              sender: isOutbound ? 'You' : senderName,
              isOutbound
            });
          }
        }}
        style={{
          display: loadStatus === 'loaded' ? 'block' : 'none'
        }}
        title="Click to view full photo"
      >
        <img
          src={imageSrc}
          alt={caption || alt}
          onLoad={() => setLoadStatus('loaded')}
          onError={handleImageError}
          style={{
            width: '100%',
            maxHeight: '340px',
            objectFit: 'contain',
            display: 'block',
            margin: '0 auto',
            borderRadius: '8px'
          }}
          loading="eager"
        />

        {/* Hover Expand Overlay */}
        <div className="chat-image-overlay">
          <div style={{
            background: 'rgba(15, 23, 42, 0.75)',
            color: '#FFFFFF',
            padding: '5px 12px',
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backdropFilter: 'blur(4px)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
          }}>
            <Maximize2 size={13} />
            <span>Click to Expand</span>
          </div>
        </div>

        {/* If NO caption: Floating timestamp pill inside the photo */}
        {!caption && (
          <div style={{
            position: 'absolute',
            bottom: '6px',
            right: '6px',
            background: 'rgba(15, 23, 42, 0.72)',
            color: '#FFFFFF',
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '0.675rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            backdropFilter: 'blur(4px)',
            pointerEvents: 'none'
          }}>
            <span>{time}</span>
            {isOutbound && <CheckCheck size={12} color="#60A5FA" />}
          </div>
        )}
      </div>

      {/* Clean Caption beneath the photo */}
      {caption && (
        <div style={{
          padding: '6px 4px 2px 4px',
          fontSize: '0.85rem',
          lineHeight: 1.45,
          color: '#171719',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}>
          {caption}
        </div>
      )}
    </div>
  );
}

/**
 * Classifies a conversation into one of the 3 channels:
 * 'whatsapp' | 'in_app' | 'website'
 */
function getConversationChannelType(convo) {
  if (!convo) return 'whatsapp';
  const phone = String(convo.phone || '');
  const source = String(convo.source || '').toUpperCase();
  const linkSlug = String(convo.linkSlug || '').toLowerCase();
  const linkTitle = String(convo.linkTitle || '').toLowerCase();

  // In-App Chat: Virtual visitors starting with 919000 or explicit IN_APP source or slug/title with app/mobile
  if (
    source === 'IN_APP' || 
    convo.channel === 'IN_APP' ||
    phone.startsWith('919000') || 
    linkSlug.includes('inapp') || 
    linkSlug.includes('in-app') || 
    linkTitle.includes('in-app') ||
    linkTitle.includes('in app')
  ) {
    return 'in_app';
  }

  // Website Chat: Direct website concierge live widget
  if (
    source === 'WEBSITE' || 
    source === 'WEB' || 
    convo.channel === 'WEBSITE' || 
    convo.channel === 'WEB'
  ) {
    return 'website';
  }

  // Default: WhatsApp Cloud API & Click-to-Chat WhatsApp links
  return 'whatsapp';
}

function getChannelMeta(channelType, convo) {
  switch (channelType) {
    case 'in_app':
      return {
        key: 'in_app',
        label: 'In-App Chat',
        shortLabel: 'In-App',
        badgeColor: '#2876B8',
        badgeBg: '#EFF6FF',
        badgeBorder: '#BFDBFE',
        icon: Smartphone,
        description: 'In-App Mobile / Webview Guest Session',
        origin: convo?.linkTitle ? `App: ${convo.linkTitle}` : 'Mobile App Session'
      };
    case 'website':
      return {
        key: 'website',
        label: 'Website Chat',
        shortLabel: 'Website',
        badgeColor: '#7C3AED',
        badgeBg: '#F5F3FF',
        badgeBorder: '#DDD6FE',
        icon: Globe,
        description: 'Website Concierge / Direct Chat Link',
        origin: convo?.linkTitle ? `Page: ${convo.linkTitle}` : (convo?.linkSlug ? `/c/${convo.linkSlug}` : 'Website Chat Link')
      };
    case 'whatsapp':
    default:
      return {
        key: 'whatsapp',
        label: 'WhatsApp Chats',
        shortLabel: 'WhatsApp',
        badgeColor: '#2F5219',
        badgeBg: '#EDF4E6',
        badgeBorder: '#C3D1AC',
        icon: MessageCircle,
        description: 'Direct Meta WhatsApp Cloud API',
        origin: 'Direct WhatsApp Cloud API'
      };
  }
}

/**
 * Formats a raw database message row from customer_replies or campaign_recipients into chat bubble objects
 */
function formatInboxMessage(r, allRecords = []) {
  const isOutbound = r.message_type === 'outbound';
  const incomingText = r.message_body || r.message_text || '';
  const isAutoOutbound = Boolean(
    r.user_id === 'bot' ||
    r.source === 'CONVERSATION_FLOW' ||
    r.source === 'WHATSAPP_FLOW' ||
    r.reply_status === 'AUTO_REPLIED' ||
    Boolean(r.reply_sent_at)
  );

  let resolvedMediaUrl = r.media_url || null;
  let resolvedMediaType = r.media_type || null;
  let resolvedCaption = r.media_caption || null;
  let rawMediaId = null;

  if (!resolvedMediaUrl && r.raw_payload) {
    try {
      const raw = typeof r.raw_payload === 'string' ? JSON.parse(r.raw_payload) : r.raw_payload;
      const mediaObj = raw.image || raw.video || raw.document || raw.audio || raw.sticker;
      if (mediaObj?.id) {
        rawMediaId = mediaObj.id;
        resolvedMediaUrl = `/api/media/inbound/${mediaObj.id}`;
        resolvedMediaType = r.message_type || (raw.image ? 'image' : (raw.video ? 'video' : (raw.audio ? 'audio' : 'image')));
        resolvedCaption = resolvedCaption || mediaObj.caption || mediaObj.filename || null;
      }
    } catch (e) {}
  }

  const msgs = [];
  if (isOutbound) {
    msgs.push({
      id: r.id || `out_${Math.random()}`,
      from_phone: isAutoOutbound ? 'Auto-Reply Bot' : 'Agent',
      text: incomingText || r.reply_text || '',
      media_url: resolvedMediaUrl,
      media_type: resolvedMediaType,
      media_caption: resolvedCaption,
      time: r.received_at,
      is_outbound: true,
      status: r.reply_status || 'SENT',
      is_auto: isAutoOutbound,
      campaign_name: r.campaign_name || null
    });
  } else {
    const isMediaMsg = Boolean(resolvedMediaUrl || rawMediaId || r.message_type === 'image' || r.message_type === 'video' || r.message_type === 'audio');
    if (incomingText || isMediaMsg) {
      msgs.push({
        id: r.id,
        from_phone: r.from_phone,
        text: incomingText,
        media_url: resolvedMediaUrl,
        media_type: resolvedMediaType || (r.message_type === 'image' ? 'image' : (r.message_type === 'audio' ? 'audio' : null)),
        media_caption: resolvedCaption,
        media_id: rawMediaId,
        voice_transcript: r.voice_transcript || null,
        detected_language: r.detected_language || null,
        time: r.received_at,
        is_outbound: false,
        is_read: r.is_read
      });
    }

    if (r.reply_text && r.reply_text.trim()) {
      const trimmedReply = r.reply_text.trim();
      const phoneDigits = String(r.from_phone || '').replace(/\D/g, '');
      const hasMatchingOutbound = (allRecords || []).some(other =>
        String(other.from_phone || other.clean_phone || '').replace(/\D/g, '') === phoneDigits &&
        other.message_type === 'outbound' &&
        ((other.message_body && other.message_body.trim() === trimmedReply) ||
         (other.reply_text && other.reply_text.trim() === trimmedReply) ||
         (Math.abs(new Date(other.received_at || other.time || 0).getTime() - new Date(r.reply_sent_at || r.received_at || 0).getTime()) < 15000))
      );

      if (!hasMatchingOutbound) {
        msgs.push({
          id: `${r.id}_reply`,
          from_phone: 'Auto-Reply Bot',
          text: r.reply_text,
          media_url: null,
          media_type: null,
          media_caption: null,
          time: r.reply_sent_at || r.received_at,
          is_outbound: true,
          status: r.reply_status || 'SENT',
          is_auto: true
        });
      }
    }
  }

  return msgs;
}

export default function InboxPage({ onNavigate }) {
  const { token } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedConvo, setSelectedConvo] = useState(null);
  const [isCommerceDrawerOpen, setIsCommerceDrawerOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [search, setSearch] = useState('');
  const [convoFilter, setConvoFilter] = useState('replies'); // 'replies' | 'all' | 'unread'
  const [channelFilter, setChannelFilter] = useState('all'); // 'all' | 'whatsapp' | 'in_app' | 'website'
  const [loading, setLoading] = useState(true);

  // Media attachment states (Images & Videos)
  const [selectedMediaFile, setSelectedMediaFile] = useState(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState(null);
  const [mediaType, setMediaType] = useState(null); // 'image' | 'video'

  // Lightbox modal state for full-screen image preview
  const [lightboxMedia, setLightboxMedia] = useState(null);
  const [lightboxZoomed, setLightboxZoomed] = useState(false);
  const [downloadingMedia, setDownloadingMedia] = useState(false);

  // WhatsApp Flows sending modal state
  const [showFlowModal, setShowFlowModal] = useState(false);
  const [availableFlows, setAvailableFlows] = useState([]);
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [flowBodyText, setFlowBodyText] = useState('');
  const [flowCtaText, setFlowCtaText] = useState('Open Form');
  const [sendingFlow, setSendingFlow] = useState(false);

  // Conversation pagination & history loading state
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [hasMorePrevious, setHasMorePrevious] = useState(false);
  const [totalConversationMessages, setTotalConversationMessages] = useState(0);

  // Real-time Bot Pause / Takeover status for active contact
  const [selectedBotStatus, setSelectedBotStatus] = useState({ isPaused: false, remainingMinutes: 0 });
  const [togglingBot, setTogglingBot] = useState(false);

  // Browser Notification API for backgrounded inbound messages
  const [notificationPerm, setNotificationPerm] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const handleRequestNotificationPerm = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const res = await Notification.requestPermission();
        setNotificationPerm(res);
      } catch (_) {}
    }
  };

  // In-App Experience Rate Negotiation & Callback Action States
  const [inappActiveNegotiation, setInappActiveNegotiation] = useState(null);
  const [inappActiveCall, setInappActiveCall] = useState(null);
  const [inappActionLoading, setInappActionLoading] = useState(false);
  const [inappCounterFormOpen, setInappCounterFormOpen] = useState(false);
  const [inappCounterPrice, setInappCounterPrice] = useState('');
  const [inappCounterNote, setInappCounterNote] = useState('');

  // AI Copilot States
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotDrafts, setCopilotDrafts] = useState(null);
  const [copilotSummary, setCopilotSummary] = useState(null);
  const [copilotNotice, setCopilotNotice] = useState(null);

  const handleCopilotDraft = async () => {
    if (!selectedConvo || !selectedConvo.messages) return;
    setCopilotLoading(true);
    setCopilotNotice(null);
    try {
      const res = await fetch('/api/v1/ai/copilot/draft-reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          phone: selectedConvo.phone,
          customerName: selectedConvo.name,
          messages: selectedConvo.messages
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to draft AI reply');
      setCopilotDrafts(data.suggestions || []);
    } catch (err) {
      setCopilotNotice(err.message);
    } finally {
      setCopilotLoading(false);
    }
  };

  const handleCopilotTranslate = async (targetLang = 'en') => {
    if (!selectedConvo || !selectedConvo.messages) return;
    setCopilotLoading(true);
    setCopilotNotice(null);
    try {
      const textToTranslate = replyText.trim() || 
        ([...selectedConvo.messages].reverse().find(m => !m.is_outbound)?.text || '');
      if (!textToTranslate) throw new Error('No text found to translate.');

      const res = await fetch('/api/v1/ai/copilot/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          text: textToTranslate,
          targetLanguage: targetLang
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Translation failed');
      if (replyText.trim()) {
        setReplyText(data.translatedText);
      } else {
        setCopilotNotice(`Translated (${data.targetLanguage}): "${data.translatedText}"`);
      }
    } catch (err) {
      setCopilotNotice(err.message);
    } finally {
      setCopilotLoading(false);
    }
  };

  const handleCopilotSummarize = async () => {
    if (!selectedConvo || !selectedConvo.messages) return;
    setCopilotLoading(true);
    setCopilotNotice(null);
    try {
      const res = await fetch('/api/v1/ai/copilot/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          phone: selectedConvo.phone,
          customerName: selectedConvo.name,
          messages: selectedConvo.messages
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to summarize thread');
      setCopilotSummary(data);
    } catch (err) {
      setCopilotNotice(err.message);
    } finally {
      setCopilotLoading(false);
    }
  };

  const fetchInappCommerceStatus = useCallback(async (phone) => {
    if (!phone) {
      setInappActiveNegotiation(null);
      setInappActiveCall(null);
      return;
    }
    try {
      const cleanPhone = String(phone).replace(/\D/g, '');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
      const [negRes, callRes] = await Promise.all([
        fetch(`/api/v1/inapp/negotiations?phone=${encodeURIComponent(cleanPhone)}&limit=5`, { headers: authHeader, credentials: 'include' }),
        fetch(`/api/v1/inapp/calls?phone=${encodeURIComponent(cleanPhone)}&limit=5`, { headers: authHeader, credentials: 'include' })
      ]);
      const negData = await negRes.json();
      const callData = await callRes.json();

      if (negData.success && Array.isArray(negData.data)) {
        const active = negData.data.find(n => n.status === 'PENDING_AGENT' || n.status === 'AGENT_COUNTERED') || null;
        setInappActiveNegotiation(active);
        if (active) {
          setInappCounterPrice(String(active.agent_counter_price || active.customer_offer_price || ''));
        }
      } else {
        setInappActiveNegotiation(null);
      }

      if (callData.success && Array.isArray(callData.data)) {
        const activeCall = callData.data.find(c => c.status === 'QUEUED' || c.status === 'ASSIGNED') || null;
        setInappActiveCall(activeCall);
      } else {
        setInappActiveCall(null);
      }
    } catch (_) {}
  }, []);

  const handleInappNegotiationAction = async (action, counterPrice, agentNote) => {
    if (!inappActiveNegotiation) return;
    try {
      setInappActionLoading(true);
      const res = await fetch(`/api/v1/inapp/negotiations/${inappActiveNegotiation.id}/agent-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({ action, counterPrice, agentNote })
      });
      const data = await res.json();
      if (data.success) {
        setInappCounterFormOpen(false);
        if (selectedConvo?.phone) {
          fetchInappCommerceStatus(selectedConvo.phone);
        }
      } else {
        alert(data.message || 'Action failed');
      }
    } catch (e) {
      alert(e.message || 'Action error');
    } finally {
      setInappActionLoading(false);
    }
  };

  const handleInappCallStatus = async (status, callNotes) => {
    if (!inappActiveCall) return;
    try {
      setInappActionLoading(true);
      const res = await fetch(`/api/v1/inapp/calls/${inappActiveCall.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({ status, callNotes })
      });
      const data = await res.json();
      if (data.success) {
        if (selectedConvo?.phone) {
          fetchInappCommerceStatus(selectedConvo.phone);
        }
      } else {
        alert(data.message || 'Status update failed');
      }
    } catch (e) {
      alert(e.message || 'Call status error');
    } finally {
      setInappActionLoading(false);
    }
  };

  async function handleOpenFlowModal() {
    try {
      const res = await fetch('/api/flows', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) {
        const eligible = (data.data || []).filter(f => f.meta_flow_id);
        setAvailableFlows(eligible);
        if (eligible.length > 0) {
          setSelectedFlowId(eligible[0].id);
          setFlowBodyText(`Hi ${selectedConvo?.name || 'there'}! Please take a moment to complete our ${eligible[0].name} form:`);
        }
      }
    } catch (e) {}
    setShowFlowModal(true);
  }

  async function handleSendFlowMessage() {
    if (!selectedFlowId || !selectedConvo?.phone) return;
    setSendingFlow(true);
    try {
      const targetFlow = availableFlows.find(f => f.id === selectedFlowId);
      const res = await fetch(`/api/flows/${selectedFlowId}/send-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          to: selectedConvo.phone,
          bodyText: flowBodyText || `Please complete the form:`,
          ctaText: flowCtaText || 'Open Form',
          headerText: targetFlow?.name || 'Interactive Form'
        })
      });
      const data = await res.json();
      if (data.success) {
        const newMsg = {
          id: data.messageId || `flw_${Date.now()}`,
          from_phone: 'Agent',
          text: `[Sent WhatsApp Flow: ${targetFlow?.name || 'Interactive Form'}]`,
          time: new Date().toISOString(),
          is_outbound: true,
          status: 'SENT'
        };
        const updatedMessages = [...selectedConvo.messages, newMsg];
        const updatedConvo = {
          ...selectedConvo,
          messages: updatedMessages,
          lastMessage: `You: [WhatsApp Flow: ${targetFlow?.name}]`,
          lastTime: newMsg.time
        };
        setSelectedConvo(updatedConvo);
        setConversations(prev => prev.map(c => (c.phone === selectedConvo.phone ? updatedConvo : c)));
        setShowFlowModal(false);
      } else {
        alert(data.message || 'Failed to send Flow message.');
      }
    } catch (err) {
      alert(err.message || 'Error sending Flow message.');
    } finally {
      setSendingFlow(false);
    }
  }

  // DOM element and workflow references
  const messagesEndRef = useRef(null);
  const chatCanvasRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const initialSelectionDone = useRef(false);
  const previousPhoneRef = useRef(null);

  /**
   * Fetches the complete message history for the selected conversation from the server
   */
  async function fetchFullConversation(phone, silent = false) {
    if (!phone) return;
    if (!silent) setLoadingHistory(true);
    try {
      const cleanPhone = String(phone).replace(/\D/g, '');
      const res = await fetch(`/api/inbox/conversation/${encodeURIComponent(cleanPhone || phone)}?limit=100`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.messages)) {
        const rawRows = data.messages;
        const formattedMsgs = [];
        rawRows.forEach(row => {
          const formatted = formatInboxMessage(row, rawRows);
          formattedMsgs.push(...formatted);
        });

        // Chronological sort & deduplicate consecutive identical outbound
        formattedMsgs.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        const deduped = formattedMsgs.filter((m, idx, arr) => {
          if (idx === 0) return true;
          const prev = arr[idx - 1];
          if (m.is_outbound && prev.is_outbound) {
            const mText = (m.text || '').trim();
            const prevText = (prev.text || '').trim();
            const textMatches = mText === prevText || (mText.length > 5 && (mText.includes(prevText) || prevText.includes(mText)));
            if (textMatches) {
              const diffMs = Math.abs(new Date(m.time).getTime() - new Date(prev.time).getTime());
              if (isNaN(diffMs) || diffMs < 30000) return false;
            }
          }
          return true;
        });

        setHasMorePrevious(Boolean(data.hasMore));
        setTotalConversationMessages(data.total || deduped.length);

        setSelectedConvo(prev => {
          if (!prev) return prev;
          const prevDigits = String(prev.phone || '').replace(/\D/g, '');
          const targetDigits = String(phone || '').replace(/\D/g, '');
          if (prevDigits !== targetDigits && prev.phone !== phone) return prev;
          return {
            ...prev,
            messages: deduped
          };
        });
      }
    } catch (e) {
      console.warn('Failed to fetch full conversation history:', e);
    } finally {
      if (!silent) setLoadingHistory(false);
    }
  }

  /**
   * Loads older message history (prepending before the oldest visible message)
   */
  async function handleLoadPreviousMessages() {
    if (!selectedConvo?.phone || loadingPrevious || !hasMorePrevious) return;
    const canvas = chatCanvasRef.current;
    const prevScrollHeight = canvas ? canvas.scrollHeight : 0;
    const prevScrollTop = canvas ? canvas.scrollTop : 0;

    const currentMsgs = selectedConvo.messages || [];
    const oldestMsg = currentMsgs.length > 0 ? currentMsgs[0] : null;
    const beforeTime = oldestMsg?.time;

    setLoadingPrevious(true);
    try {
      const cleanPhone = String(selectedConvo.phone).replace(/\D/g, '');
      let url = `/api/inbox/conversation/${encodeURIComponent(cleanPhone || selectedConvo.phone)}?limit=100`;
      if (beforeTime) {
        url += `&before=${encodeURIComponent(beforeTime)}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.messages) && data.messages.length > 0) {
        const rawRows = data.messages;
        const formattedOlder = [];
        rawRows.forEach(row => {
          const formatted = formatInboxMessage(row, rawRows);
          formattedOlder.push(...formatted);
        });

        formattedOlder.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

        // Deduplicate against already loaded messages
        const existingIds = new Set(currentMsgs.map(m => String(m.id)));
        const newUniqueOlder = formattedOlder.filter(m => !existingIds.has(String(m.id)));

        if (newUniqueOlder.length > 0) {
          const combined = [...newUniqueOlder, ...currentMsgs];
          combined.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

          const deduped = combined.filter((m, idx, arr) => {
            if (idx === 0) return true;
            const prev = arr[idx - 1];
            if (m.is_outbound && prev.is_outbound) {
              const mText = (m.text || '').trim();
              const prevText = (prev.text || '').trim();
              const textMatches = mText === prevText || (mText.length > 5 && (mText.includes(prevText) || prevText.includes(mText)));
              if (textMatches) {
                const diffMs = Math.abs(new Date(m.time).getTime() - new Date(prev.time).getTime());
                if (isNaN(diffMs) || diffMs < 30000) return false;
              }
            }
            return true;
          });

          setSelectedConvo(prev => prev ? { ...prev, messages: deduped } : prev);
        }

        setHasMorePrevious(Boolean(data.hasMore));
        if (data.total) setTotalConversationMessages(data.total);

        // Preserve scroll position so view doesn't jump
        requestAnimationFrame(() => {
          if (canvas) {
            const newScrollHeight = canvas.scrollHeight;
            canvas.scrollTop = (newScrollHeight - prevScrollHeight) + prevScrollTop;
          }
        });
      } else {
        setHasMorePrevious(false);
      }
    } catch (err) {
      console.error('Failed to load previous messages:', err);
    } finally {
      setLoadingPrevious(false);
    }
  }

  // Close lightbox on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && lightboxMedia) {
        setLightboxMedia(null);
        setLightboxZoomed(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxMedia]);

  async function handleDownloadMedia(url, caption) {
    if (!url) return;
    try {
      setDownloadingMedia(true);
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const cleanName = (caption || 'whatsapp_photo').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 25);
      a.download = `${cleanName || 'whatsapp_photo'}_${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
      window.open(url, '_blank');
    } finally {
      setDownloadingMedia(false);
    }
  }

  // Auto-Reply Bot & Conversational Concierge configuration modal state
  const [showAutoReplyModal, setShowAutoReplyModal] = useState(false);
  const [autoReplySettings, setAutoReplySettings] = useState({
    enabled: true,
    mode: 'ONCE_PER_CONTACT',
    engineMode: 'HOSPITALITY_FLOW',
    businessName: 'Your Business',
    welcomeMessage: '👋 Hello {{name}}! Welcome to *{{business_name}}*.\n\nHow can we help you today? Select an option below or reply with your travel dates to check real-time availability and live rates! 👇',
    fallbackMessage: 'Hi {{name}}, thank you for reaching out to {{business_name}}! We have received your message and our team will get back to you shortly.',
    button1: 'This Weekend',
    button2: 'Tomorrow (2 N)',
    button3: 'Talk to Staff',
    quoteConfirm: 'Confirm Booking',
    quoteModify: 'Change Dates',
    quoteRooms: 'Other Rooms',
    confirmedButton1: 'Facilities',
    confirmedButton2: 'Dining Menu',
    confirmedButton3: 'Location / Map',
    handoffPhone: '+91 87665 90634',
    handoffMessage: '🤝 *Connecting You with Our Front Desk*\n\nOur reservations staff has been alerted and will message you directly on this chat shortly.\n\n📞 For urgent queries, call us directly at {{phone}}.',
    selectedFlowId: 'flow_hospitality_booking',
    takeoverPauseMinutes: 60,
    dynamicOptions: []
  });
  const [publishedFlows, setPublishedFlows] = useState([]);
  const [autoReplyActiveTab, setAutoReplyActiveTab] = useState('mode'); // 'mode' | 'welcome' | 'flow' | 'quote' | 'handoff' | 'dynamic'
  const [previewStage, setPreviewStage] = useState('welcome'); // 'welcome' | 'flow' | 'quote' | 'confirmed' | 'handoff' | 'dynamic'
  const [loadingAutoReply, setLoadingAutoReply] = useState(false);
  const [savingAutoReply, setSavingAutoReply] = useState(false);
  const [autoReplySaveSuccess, setAutoReplySaveSuccess] = useState(false);

  // Dynamic Bot Options & Programmable Rules (Admin)
  const [editingDynOption, setEditingDynOption] = useState(null);
  const [isDynOptionModalOpen, setIsDynOptionModalOpen] = useState(false);
  const [dynPreviewOptionId, setDynPreviewOptionId] = useState('');

  // Interactive WhatsApp Flow Simulator & Intake Values
  const [simulatorValues, setSimulatorValues] = useState({
    guest_name: 'Shivam',
    check_in: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    check_out: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
    room_preference: 'Deluxe Sea View Room',
    adults: '2',
    children: '0',
    special_requests: 'Beach-facing room with extra pillows please.'
  });
  const [simulatorQuote, setSimulatorQuote] = useState(null);
  const [simulatorValidationError, setSimulatorValidationError] = useState('');
  const [isCreateFlowModalOpen, setIsCreateFlowModalOpen] = useState(false);
  const [creatingFlow, setCreatingFlow] = useState(false);
  const [newFlowForm, setNewFlowForm] = useState({
    name: 'Beach Villa Stay & Dates Intake',
    category: 'LEAD_GENERATION',
    ctaText: 'Select Dates & Room',
    description: 'Natively collect travel dates, guest count, and room preference on WhatsApp.',
    collectName: true,
    collectCheckin: true,
    collectCheckout: true,
    collectRoom: true,
    collectGuests: true,
    collectNotes: true,
    roomOptions: 'Deluxe Sea View Room, Luxury Coconut Cottage, Family Ocean Suite'
  });

  const DYNAMIC_STARTER_TEMPLATES = [
    {
      title: "Spa & Massage",
      buttonLabel: "Spa & Wellness",
      triggers: "spa, massage, wellness, ayurveda, steam, relaxation, facial",
      matchType: "CONTAINS",
      stage: "ANY",
      actionType: "REPLY_TEXT",
      responseText: "🌿 *Ayurvedic Beachside Spa & Wellness*\n\nIndulge in our rejuvenating therapies:\n• *Abhyanga Full Body Massage*: ₹2,400 (60 mins)\n• *Aromatherapy Deep Tissue*: ₹2,800 (60 mins)\n• *Herbal Steam & Shirodhara*: ₹1,800 (45 mins)\n\n🕒 Open daily 08:00 AM – 08:00 PM.",
      followUpButtons: [
        { id: "btn_staff", title: "Book Spa Slot" },
        { id: "btn_check_avail", title: "View Rooms" }
      ],
      active: true,
      showInGreeting: false
    },
    {
      title: "Local Sightseeing",
      buttonLabel: "Sightseeing",
      triggers: "tour, sightseeing, beach, scuba, watersports, fort, travel, attractions",
      matchType: "CONTAINS",
      stage: "ANY",
      actionType: "REPLY_TEXT",
      responseText: "⛵ *Must-Visit Attractions Around KonkanTrip*\n\n1. *Sindhudurg Sea Fort* - 15 mins by ferry\n2. *Tsunami Island Watersports* - Parasailing & Jet Ski\n3. *Scuba Diving at Tarkali* - Clear coral reefs\n4. *Devbagh Sangam Beach* - River meets the sea\n\nOur travel desk can arrange cabs and boat tickets!",
      followUpButtons: [
        { id: "btn_check_avail", title: "Plan Stay" },
        { id: "btn_staff", title: "Book Cab / Tour" }
      ],
      active: true,
      showInGreeting: false
    },
    {
      title: "Ferry & Travel Route",
      buttonLabel: "Ferry & Route",
      triggers: "ferry, ro-ro, boat, jetty, reaching, route, distance, map, directions",
      matchType: "CONTAINS",
      stage: "ANY",
      actionType: "REPLY_TEXT",
      responseText: "🚗 *How to Reach Us & Ferry Schedules*\n\n• *From Mumbai / Pune*: Take NH 66 or M2M Ferries Ro-Pax to Mandwa.\n• *Ferry Schedule*: Runs hourly 06:30 AM – 07:30 PM daily.\n• *Nearest Airport*: Chipi Airport (35 mins) or Mopa Airport (90 mins).\n\n📍 Google Maps: https://maps.google.com/?q=KonkanTrip+Beach+Resort",
      followUpButtons: [
        { id: "btn_check_avail", title: "Check Rates" },
        { id: "btn_staff", title: "Need Pickup" }
      ],
      active: true,
      showInGreeting: false
    },
    {
      title: "Guest WiFi & Timings",
      buttonLabel: "WiFi & Timings",
      triggers: "wifi, password, internet, pool, swimming pool, breakfast, dinner, timings",
      matchType: "CONTAINS",
      stage: "ANY",
      actionType: "REPLY_TEXT",
      responseText: "📶 *Resort Guest Essentials*\n\n• *Wi-Fi Network*: `KonkanTrip_Guest` (Password: `BeachVibes2026`)\n• *Infinity Pool*: 07:00 AM – 08:00 PM\n• *Breakfast Buffet*: 07:30 AM – 10:30 AM\n• *Dinner Buffet*: 07:30 PM – 10:30 PM\n• *Room Service*: Dial `9` from room phone anytime!",
      followUpButtons: [
        { id: "btn_menu", title: "Dining Menu" },
        { id: "btn_staff", title: "Front Desk" }
      ],
      active: true,
      showInGreeting: false
    },
    {
      title: "Secret Discount Voucher",
      buttonLabel: "Special Discount",
      triggers: "discount, coupon, promo, offer, deal, voucher, cheap, reduce",
      matchType: "CONTAINS",
      stage: "ANY",
      actionType: "REPLY_TEXT",
      responseText: "🎉 *Special Direct Booking Benefit!*\n\nUse promo code *PARADISE10* to get *10% Flat Discount* + *Complimentary High Tea* on direct WhatsApp bookings for 2+ nights!\n\n👇 Check live dates to apply this offer:",
      followUpButtons: [
        { id: "btn_dates_weekend", title: "This Weekend" },
        { id: "btn_check_avail", title: "Check Rates" }
      ],
      active: true,
      showInGreeting: true
    }
  ];

  const handleOpenDynOptionModal = (option = null) => {
    if (option) {
      setEditingDynOption({
        ...option,
        followUpButtons: option.followUpButtons && option.followUpButtons.length > 0 
          ? [...option.followUpButtons] 
          : [{ id: 'btn_staff', title: 'Talk to Staff' }]
      });
    } else {
      setEditingDynOption({
        id: `opt_${Date.now().toString(36)}`,
        title: '',
        buttonLabel: '',
        triggers: '',
        matchType: 'CONTAINS',
        stage: 'ANY',
        actionType: 'REPLY_TEXT',
        responseText: '',
        flowId: '',
        url: '',
        followUpButtons: [
          { id: 'btn_check_avail', title: 'Check Rates' },
          { id: 'btn_staff', title: 'Talk to Staff' }
        ],
        active: true,
        showInGreeting: false
      });
    }
    setIsDynOptionModalOpen(true);
  };

  const handleSaveDynamicOption = (e) => {
    if (e) e.preventDefault();
    if (!editingDynOption?.title?.trim()) {
      alert('Please enter an Option Title.');
      return;
    }
    const currentList = Array.isArray(autoReplySettings.dynamicOptions) ? [...autoReplySettings.dynamicOptions] : [];
    const existingIdx = currentList.findIndex(o => o.id === editingDynOption.id);
    const sanitizedOption = {
      ...editingDynOption,
      title: editingDynOption.title.trim(),
      buttonLabel: (editingDynOption.buttonLabel || editingDynOption.title).trim().substring(0, 20),
      triggers: editingDynOption.triggers ? editingDynOption.triggers.trim() : '',
      matchType: editingDynOption.matchType || 'CONTAINS',
      actionType: editingDynOption.actionType || 'REPLY_TEXT',
      active: editingDynOption.active !== false
    };

    if (existingIdx !== -1) {
      currentList[existingIdx] = sanitizedOption;
    } else {
      currentList.push(sanitizedOption);
    }
    setAutoReplySettings({ ...autoReplySettings, dynamicOptions: currentList });
    setIsDynOptionModalOpen(false);
    setEditingDynOption(null);
  };

  const handleDeleteDynamicOption = (optId) => {
    if (!window.confirm('Are you sure you want to delete this dynamic bot rule?')) return;
    const currentList = (autoReplySettings.dynamicOptions || []).filter(o => o.id !== optId);
    setAutoReplySettings({ ...autoReplySettings, dynamicOptions: currentList });
  };

  const handleToggleDynamicOption = (optId) => {
    const currentList = (autoReplySettings.dynamicOptions || []).map(o => {
      if (o.id === optId) {
        return { ...o, active: !o.active };
      }
      return o;
    });
    setAutoReplySettings({ ...autoReplySettings, dynamicOptions: currentList });
  };

  const handleApplyStarterTemplate = (tpl) => {
    const currentList = Array.isArray(autoReplySettings.dynamicOptions) ? [...autoReplySettings.dynamicOptions] : [];
    const newId = `opt_${Date.now().toString(36)}`;
    currentList.push({
      ...tpl,
      id: newId
    });
    setAutoReplySettings({ ...autoReplySettings, dynamicOptions: currentList });
  };

  function handleSimulatorSubmit(e) {
    if (e) e.preventDefault();
    setSimulatorValidationError('');
    
    const cin = new Date(simulatorValues.check_in);
    const cout = new Date(simulatorValues.check_out);
    if (isNaN(cin.getTime()) || isNaN(cout.getTime())) {
      setSimulatorValidationError('Please select valid check-in and check-out dates.');
      return;
    }
    if (cout <= cin) {
      setSimulatorValidationError('Check-out date must be strictly after check-in date.');
      return;
    }
    const diffTime = Math.abs(cout - cin);
    const nights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    
    let rate = 4500;
    if (simulatorValues.room_preference.includes('Cottage')) rate = 6500;
    else if (simulatorValues.room_preference.includes('Suite')) rate = 8500;
    
    const total = rate * nights;
    const computed = {
      guest_name: simulatorValues.guest_name || 'Guest',
      check_in: simulatorValues.check_in,
      check_out: simulatorValues.check_out,
      room: simulatorValues.room_preference,
      nights,
      adults: simulatorValues.adults || '2',
      children: simulatorValues.children || '0',
      rate,
      total
    };
    setSimulatorQuote(computed);
    setPreviewStage('quote');
  }

  async function handleCreateNewFlow(e) {
    if (e) e.preventDefault();
    if (!newFlowForm.name.trim()) {
      alert('Please enter a Flow name.');
      return;
    }
    setCreatingFlow(true);
    try {
      const roomArray = newFlowForm.roomOptions
        .split(',')
        .map(r => r.trim())
        .filter(Boolean)
        .map((r, i) => ({ id: `room_${i + 1}`, title: r.substring(0, 30) }));

      const formChildren = [
        { type: "TextHeading", text: newFlowForm.name.substring(0, 40) },
        { type: "TextSubheading", text: (newFlowForm.description || "Share your dates and preferences. Our concierge will send you an official quote.").substring(0, 100) }
      ];

      if (newFlowForm.collectName) {
        formChildren.push({ type: "TextInput", name: "guest_name", label: "Guest Full Name", required: true });
      }
      if (newFlowForm.collectCheckin) {
        formChildren.push({ type: "TextInput", name: "check_in", label: "Check-in Date (YYYY-MM-DD)", required: true });
      }
      if (newFlowForm.collectCheckout) {
        formChildren.push({ type: "TextInput", name: "check_out", label: "Check-out Date (YYYY-MM-DD)", required: true });
      }
      if (newFlowForm.collectRoom && roomArray.length > 0) {
        formChildren.push({ type: "Dropdown", name: "room_preference", label: "Room / Package Category", required: true, "data-source": roomArray });
      }
      if (newFlowForm.collectGuests) {
        formChildren.push({
          type: "Dropdown",
          name: "adults",
          label: "Adult Guests",
          required: true,
          "data-source": [
            { id: "1", title: "1 Adult" },
            { id: "2", title: "2 Adults" },
            { id: "3", title: "3 Adults" },
            { id: "4", title: "4+ Adults" }
          ]
        });
        formChildren.push({
          type: "Dropdown",
          name: "children",
          label: "Children",
          required: false,
          "data-source": [
            { id: "0", title: "None" },
            { id: "1", title: "1 Child" },
            { id: "2", title: "2 Children" },
            { id: "3", title: "3+ Children" }
          ]
        });
      }
      if (newFlowForm.collectNotes) {
        formChildren.push({ type: "TextInput", name: "special_requests", label: "Special Requests (Optional)", required: false });
      }

      const payloadObj = {};
      if (newFlowForm.collectName) payloadObj.guest_name = "${form.guest_name}";
      if (newFlowForm.collectCheckin) payloadObj.check_in = "${form.check_in}";
      if (newFlowForm.collectCheckout) payloadObj.check_out = "${form.check_out}";
      if (newFlowForm.collectRoom) payloadObj.room_preference = "${form.room_preference}";
      if (newFlowForm.collectGuests) {
        payloadObj.adults = "${form.adults}";
        payloadObj.children = "${form.children}";
      }
      if (newFlowForm.collectNotes) payloadObj.special_requests = "${form.special_requests}";

      formChildren.push({
        type: "Footer",
        label: (newFlowForm.ctaText || "Submit Inquiry").substring(0, 30),
        "on-click-action": {
          name: "complete",
          payload: payloadObj
        }
      });

      const flowJsonObj = {
        version: "3.1",
        data_api_version: "3.0",
        routing_model: {
          MAIN_INTAKE_SCREEN: []
        },
        screens: [
          {
            id: "MAIN_INTAKE_SCREEN",
            title: newFlowForm.name.substring(0, 20),
            terminal: true,
            data: {},
            layout: {
              type: "SingleColumnLayout",
              children: [
                {
                  type: "Form",
                  name: "intake_form",
                  children: formChildren
                }
              ]
            }
          }
        ]
      };

      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newFlowForm.name,
          description: newFlowForm.description,
          categories: [newFlowForm.category || 'LEAD_GENERATION'],
          status: 'PUBLISHED',
          publishImmediately: true,
          flow_json: JSON.stringify(flowJsonObj)
        })
      });

      const data = await res.json();
      if (res.ok && data.success && data.data) {
        const created = data.data;
        setPublishedFlows(prev => [created, ...prev]);
        setAutoReplySettings(prev => ({
          ...prev,
          selectedFlowId: created.id,
          flowCta: newFlowForm.ctaText
        }));
        setIsCreateFlowModalOpen(false);
        setPreviewStage('flow');
        alert(`✓ Flow "${newFlowForm.name}" created and linked to your concierge bot!`);
      } else {
        alert(data.message || 'Failed to create flow.');
      }
    } catch (err) {
      alert(err.message || 'Error creating flow.');
    } finally {
      setCreatingFlow(false);
    }
  }

  function handleResetAutoReplyDefaults() {
    if (!window.confirm("Reset all bot messages and button labels to recommended hospitality defaults?")) return;
    setAutoReplySettings(prev => ({
      ...prev,
      enabled: true,
      mode: 'ONCE_PER_CONTACT',
      engineMode: 'HOSPITALITY_FLOW',
      businessName: 'Your Business',
      welcomeMessage: '👋 Hello {{name}}! Welcome to *{{business_name}}*.\n\nHow can we help you today? Select an option below or reply with your travel dates to check real-time availability and live rates! 👇',
      fallbackMessage: 'Hi {{name}}, thank you for reaching out to {{business_name}}! We have received your message and our team will get back to you shortly.',
      button1: 'This Weekend',
      button2: 'Tomorrow (2 N)',
      button3: 'Talk to Staff',
      quoteConfirm: 'Confirm Booking',
      quoteModify: 'Change Dates',
      quoteRooms: 'Other Rooms',
      confirmedButton1: 'Facilities',
      confirmedButton2: 'Dining Menu',
      confirmedButton3: 'Location / Map',
      handoffPhone: '+91 87665 90634',
      handoffMessage: '🤝 *Connecting You with Our Front Desk*\n\nOur reservations staff has been alerted and will message you directly on this chat shortly.\n\n📞 For urgent queries, call us directly at {{phone}}.',
      selectedFlowId: 'flow_hospitality_booking',
      takeoverPauseMinutes: 60
    }));
  }

  useEffect(() => {
    loadInbox(false, convoFilter);
    loadAutoReplySettings();
    // Background auto-refresh polling every 8 seconds
    const interval = setInterval(() => {
      loadInbox(true, convoFilter);
    }, 8000);
    return () => clearInterval(interval);
  }, [token, convoFilter]);

  // Real-time instant SSE stream: instant arrival of incoming messages and bot status updates
  useEffect(() => {
    if (!token) return;
    let sse = null;
    try {
      sse = new EventSource(`/api/broadcast/stream?streamToken=${encodeURIComponent(token)}`);
      sse.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const type = (payload.type || '').toUpperCase();
          if (type === 'REPLY' || type === 'REPLY_UPDATED' || type === 'STATUS') {
            loadInbox(true, convoFilter);
            if (selectedConvo?.phone) {
              fetchBotStatus(selectedConvo.phone);
              fetchInappCommerceStatus(selectedConvo.phone);
            }
            // Trigger browser desktop/mobile push notification if tab is backgrounded
            if (type === 'REPLY' && typeof window !== 'undefined' && 'Notification' in window) {
              if (Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
                try {
                  const sender = payload.sender_name || payload.from_phone || 'WhatsApp Guest';
                  const snippet = payload.text || 'Sent a new WhatsApp message';
                  new Notification(`New WhatsApp Message from ${sender}`, {
                    body: snippet.substring(0, 120),
                    icon: '/favicon.svg',
                    badge: '/favicon.svg',
                    tag: `sarvya-reply-${payload.from_phone || Date.now()}`
                  });
                } catch (_) {}
              }
            }
          }
        } catch (e) {}
      };
      sse.onerror = () => {
        // SSE error, 8-sec interval polling acts as fallback
      };
    } catch (err) {}

    return () => {
      if (sse) {
        try { sse.close(); } catch (e) {}
      }
    };
  }, [token, convoFilter, selectedConvo?.phone]);

  async function fetchBotStatus(phone) {
    if (!phone || !token) return;
    try {
      const res = await fetch(`/api/inbox/bot-status/${encodeURIComponent(phone)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        setSelectedBotStatus(data.data);
      }
    } catch (e) {}
  }

  async function handleToggleBotStatus(phone, pause) {
    if (!phone || !token || togglingBot) return;
    try {
      setTogglingBot(true);
      const res = await fetch(`/api/inbox/bot-status/${encodeURIComponent(phone)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ paused: pause, durationMinutes: 60 })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setSelectedBotStatus(data.data);
      }
    } catch (e) {
      console.error('Failed to toggle bot status:', e);
    } finally {
      setTogglingBot(false);
    }
  }

  useEffect(() => {
    if (selectedConvo?.phone) {
      fetchBotStatus(selectedConvo.phone);
      fetchInappCommerceStatus(selectedConvo.phone);
    }
  }, [selectedConvo?.phone, token, fetchInappCommerceStatus]);

  async function loadAutoReplySettings() {
    try {
      setLoadingAutoReply(true);
      const res = await fetch('/api/replies/auto-reply-settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        setAutoReplySettings(data.data);
      }
      try {
        const flowsRes = await fetch('/api/flows?status=PUBLISHED', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const flowsData = await flowsRes.json();
        if (flowsData.success && Array.isArray(flowsData.data)) {
          setPublishedFlows(flowsData.data);
        }
      } catch (fErr) {}
    } catch (err) {
      console.error('Failed to load auto-reply settings:', err);
    } finally {
      setLoadingAutoReply(false);
    }
  }

  async function handleSaveAutoReplySettings(e) {
    if (e) e.preventDefault();
    try {
      setSavingAutoReply(true);
      setAutoReplySaveSuccess(false);
      const res = await fetch('/api/replies/auto-reply-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(autoReplySettings)
      });
      const data = await res.json();
      if (data.success) {
        setAutoReplySettings(data.data);
        setAutoReplySaveSuccess(true);
        setTimeout(() => setAutoReplySaveSuccess(false), 2500);
      } else {
        alert(data.message || 'Failed to save auto-reply settings');
      }
    } catch (err) {
      alert(err.message || 'Error saving auto-reply settings');
    } finally {
      setSavingAutoReply(false);
    }
  }

  // Auto-scroll to bottom of chat canvas when active conversation changes or new messages arrive
  useEffect(() => {
    if (selectedConvo?.messages?.length) {
      const isNewConversation = previousPhoneRef.current !== selectedConvo.phone;
      previousPhoneRef.current = selectedConvo.phone;

      const timer = setTimeout(() => {
        if (chatCanvasRef.current) {
          const container = chatCanvasRef.current;
          const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 140;
          if (isNearBottom || isNewConversation) {
            container.scrollTop = container.scrollHeight;
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [selectedConvo?.phone, selectedConvo?.messages?.length]);

  // Focus message input when switching conversations on desktop
  useEffect(() => {
    if (selectedConvo && typeof window !== 'undefined' && window.innerWidth >= 860) {
      textareaRef.current?.focus();
    }
  }, [selectedConvo?.phone]);

  async function loadInbox(silent = false, filterMode = convoFilter) {
    if (!silent) setLoading(true);
    try {
      const repliesOnlyParam = filterMode === 'all' ? 'false' : 'true';
      const res = await fetch(`/api/inbox/replies?limit=1000&repliesOnly=${repliesOnlyParam}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const rawList = data.replies || data.data || [];

      if (data.success && Array.isArray(rawList)) {
        // Group by phone number
        const convos = {};

        rawList.forEach(r => {
          const phoneKey = r.from_phone;
          if (!phoneKey) return;

          const rawName = r.customer_name || r.contact_name;
          const guestName = (rawName && rawName !== 'Customer' && rawName !== 'Demo Customer') ? rawName : null;

          if (!convos[phoneKey]) {
            convos[phoneKey] = {
              phone: phoneKey,
              name: guestName || 'Guest',
              lastMessage: '',
              lastTime: r.received_at,
              unreadCount: 0,
              messages: [],
              linkId: r.link_id || null,
              linkTitle: r.link_title || null,
              linkSlug: r.link_slug || null,
              source: r.source || null
            };
          } else {
            if (guestName && convos[phoneKey].name === 'Guest') {
              convos[phoneKey].name = guestName;
            }
            if (r.link_id && !convos[phoneKey].linkId) {
              convos[phoneKey].linkId = r.link_id;
              convos[phoneKey].linkTitle = r.link_title;
              convos[phoneKey].linkSlug = r.link_slug;
              convos[phoneKey].source = r.source;
            }
          }

          const isCurrentlyActive = Boolean(
            selectedConvo?.phone &&
            (selectedConvo.phone === phoneKey || String(selectedConvo.phone).replace(/\D/g, '') === String(phoneKey).replace(/\D/g, ''))
          );

          if (r.is_read === 0 && !isCurrentlyActive) {
            convos[phoneKey].unreadCount += 1;
          } else if (r.is_read === 0 && isCurrentlyActive) {
            // Auto mark-as-read since active conversation is open
            fetch(`/api/inbox/conversation/${encodeURIComponent(phoneKey)}/mark-read`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` }
            }).catch(() => {});
          }

          const formatted = formatInboxMessage(r, rawList);
          formatted.forEach(m => convos[phoneKey].messages.push(m));
        });

        // Sort messages chronologically (oldest at top, newest at bottom) and deduplicate consecutive identical outbound replies
        Object.values(convos).forEach(c => {
          c.messages.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
          c.messages = c.messages.filter((m, idx, arr) => {
            if (idx === 0) return true;
            const prev = arr[idx - 1];
            if (m.is_outbound && prev.is_outbound) {
              const mText = (m.text || '').trim();
              const prevText = (prev.text || '').trim();
              const textMatches = mText === prevText || (mText.length > 5 && (mText.includes(prevText) || prevText.includes(mText)));
              if (textMatches) {
                const diffMs = Math.abs(new Date(m.time).getTime() - new Date(prev.time).getTime());
                if (isNaN(diffMs) || diffMs < 30000) {
                  return false;
                }
              }
            }
            return true;
          });
          if (c.messages.length > 0) {
            const last = c.messages[c.messages.length - 1];
            const isLastVideo = last.media_type === 'video' || (last.media_url && /\.(mp4|3gp|mov|webm)(\?.*)?$/i.test(last.media_url));
            const isLastImage = last.media_type === 'image' || (last.media_url && !isLastVideo) || Boolean(last.media_id);
            const mediaTag = isLastVideo ? '🎬 Video' : (isLastImage ? '📷 Photo' : '');

            let previewText = last.text ? last.text.replace(/^\[(image|photo)\]\s*/i, '').trim() : '';
            if (/^\[(image|photo|image received|video|video received)\]$/i.test(previewText.trim())) {
              previewText = '';
            }
            if (!previewText && last.media_caption) {
              previewText = last.media_caption.trim();
            }
            const snippet = previewText ? (mediaTag ? `${mediaTag}: ${previewText}` : previewText) : (mediaTag || 'Message');

            c.lastMessage = last.is_outbound ? `You: ${snippet}` : snippet;
            c.lastTime = last.time;
          }
        });

        // Sort conversations by newest activity first
        const sortedConvos = Object.values(convos).sort(
          (a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime()
        );

        setConversations(sortedConvos);

        // Keep current selection updated with new messages, or restore from sessionStorage, or auto-select on desktop
        setSelectedConvo(prev => {
          let targetPhone = prev?.phone;
          if (!targetPhone && typeof window !== 'undefined') {
            try {
              targetPhone = sessionStorage.getItem('inbox_selected_phone');
            } catch (e) {}
          }

          if (targetPhone) {
            const targetDigits = String(targetPhone).replace(/\D/g, '');
            const updated = sortedConvos.find(c => c.phone === targetPhone || String(c.phone).replace(/\D/g, '') === targetDigits);
            if (updated) {
              if (prev && (prev.phone === targetPhone || String(prev.phone).replace(/\D/g, '') === targetDigits) && prev.messages && prev.messages.length > 0) {
                const existingIds = new Set(prev.messages.map(m => String(m.id)));
                const incomingNew = updated.messages.filter(m => !existingIds.has(String(m.id)));
                if (incomingNew.length > 0) {
                  const merged = [...prev.messages, ...incomingNew];
                  merged.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
                  return {
                    ...updated,
                    messages: merged,
                    unreadCount: 0
                  };
                }
                return {
                  ...updated,
                  messages: prev.messages,
                  unreadCount: 0
                };
              }
              return { ...updated, unreadCount: 0 };
            }
          }

          // Initial load auto-select ONLY on wider desktop screens (window width >= 1024px)
          if (!initialSelectionDone.current && typeof window !== 'undefined' && window.innerWidth >= 1024 && sortedConvos.length > 0) {
            initialSelectionDone.current = true;
            const topConvo = sortedConvos[0];
            try {
              sessionStorage.setItem('inbox_selected_phone', topConvo.phone);
            } catch (e) {}
            // Mark as read and fetch full history for initial selection
            fetch(`/api/inbox/conversation/${encodeURIComponent(topConvo.phone)}/mark-read`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` }
            }).catch(() => {});
            fetchFullConversation(topConvo.phone, true);
            return { ...topConvo, unreadCount: 0 };
          }

          return prev || null;
        });
      }
    } catch (err) {
      console.error('Failed to load inbox:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  function handleSelectConversation(convo) {
    if (!convo) return;
    const cleanPhone = String(convo.phone).replace(/\D/g, '');
    setSelectedConvo({ ...convo, unreadCount: 0 });
    initialSelectionDone.current = true;
    try {
      sessionStorage.setItem('inbox_selected_phone', convo.phone);
    } catch (e) {}

    // Clear unread badge locally
    setConversations(prev => 
      prev.map(c => (c.phone === convo.phone || (cleanPhone && String(c.phone).replace(/\D/g, '') === cleanPhone)) ? { ...c, unreadCount: 0 } : c)
    );

    // Mark as read in backend atomically for this phone
    fetch(`/api/inbox/conversation/${encodeURIComponent(cleanPhone || convo.phone)}/mark-read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    }).catch(() => {});

    // Also mark individual unread message IDs as secondary fallback
    const unreadIds = (convo.messages || [])
      .filter(m => !m.is_outbound && m.is_read === 0 && m.id && typeof m.id === 'number')
      .map(m => m.id);
    unreadIds.forEach(id => {
      fetch(`/api/replies/${id}/mark-read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {});
    });

    // Fetch full conversation history from server
    fetchFullConversation(convo.phone);
  }

  function handleBackToList() {
    setSelectedConvo(null);
    initialSelectionDone.current = true; // prevents background polling from forcing chat re-open
    try {
      sessionStorage.removeItem('inbox_selected_phone');
    } catch (e) {}
  }

  async function handleDeleteConversation(convo) {
    if (!convo || !convo.phone) return;
    const displayName = convo.name || `+${convo.phone}`;
    const count = convo.messages?.length || 0;
    const confirmed = window.confirm(
      `Are you sure you want to delete the chat with ${displayName}?\n\nThis will permanently delete all ${count} message${count === 1 ? '' : 's'} in this conversation.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/inbox/conversation/${encodeURIComponent(convo.phone)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setConversations(prev => prev.filter(c => c.phone !== convo.phone));
        setSelectedConvo(prev => (prev?.phone === convo.phone ? null : prev));
        try {
          if (sessionStorage.getItem('inbox_selected_phone') === convo.phone) {
            sessionStorage.removeItem('inbox_selected_phone');
          }
        } catch (e) {}
      } else {
        alert(data.message || 'Failed to delete chat.');
      }
    } catch (err) {
      alert(err.message || 'Error deleting chat.');
    }
  }

  async function handleDeleteMessage(msgId) {
    if (!msgId || typeof msgId !== 'number') return;
    const confirmed = window.confirm('Delete this message from chat history?');
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/replies/${msgId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSelectedConvo(prev => {
          if (!prev) return null;
          const updatedMessages = prev.messages.filter(m => m.id !== msgId);
          return {
            ...prev,
            messages: updatedMessages,
            lastMessage: updatedMessages.length > 0 ? (updatedMessages[updatedMessages.length - 1].text || '[Media]') : 'No messages'
          };
        });
        setConversations(prev =>
          prev.map(c => {
            if (c.phone === selectedConvo?.phone) {
              const updatedMessages = c.messages.filter(m => m.id !== msgId);
              return {
                ...c,
                messages: updatedMessages,
                lastMessage: updatedMessages.length > 0 ? (updatedMessages[updatedMessages.length - 1].text || '[Media]') : 'No messages'
              };
            }
            return c;
          })
        );
      } else {
        alert(data.message || 'Failed to delete message.');
      }
    } catch (err) {
      alert(err.message || 'Error deleting message.');
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/') || /\.(mp4|3gp|mov|webm)$/i.test(file.name);
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name);

    if (!isImage && !isVideo) {
      alert('Please select a valid image (JPG, PNG, WEBP) or video (MP4, 3GP, MOV).');
      return;
    }

    if (file.size > 28 * 1024 * 1024) {
      alert('Selected file is larger than 28MB. Please select a smaller media file.');
      return;
    }

    setSelectedMediaFile(file);
    setMediaType(isVideo ? 'video' : 'image');
    setMediaPreviewUrl(URL.createObjectURL(file));

    // Focus textarea so the user can immediately add a caption
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  }

  function handleClearMedia() {
    if (mediaPreviewUrl && mediaPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(mediaPreviewUrl);
    }
    setSelectedMediaFile(null);
    setMediaPreviewUrl(null);
    setMediaType(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSendReply(e) {
    if (e && e.preventDefault) e.preventDefault();
    const hasText = Boolean(replyText && replyText.trim());
    if (!hasText && !selectedMediaFile) return;
    if (!selectedConvo || sendingReply) return;

    const textToSend = replyText;
    const mediaFile = selectedMediaFile;
    const currentMediaType = mediaType;
    const currentPreviewUrl = mediaPreviewUrl;

    setSendingReply(true);

    try {
      let res;
      if (mediaFile) {
        const formData = new FormData();
        formData.append('to', selectedConvo.phone);
        formData.append('message', textToSend);
        formData.append('file', mediaFile);

        res = await fetch('/api/inbox/reply', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
      } else {
        res = await fetch('/api/inbox/reply', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            to: selectedConvo.phone,
            message: textToSend
          })
        });
      }

      const data = await res.json();
      if (data.success) {
        const newMsg = {
          id: data.messageId || `out_${Date.now()}`,
          from_phone: 'Agent',
          text: textToSend,
          media_url: data.mediaUrl || currentPreviewUrl,
          media_type: data.mediaType || currentMediaType,
          time: new Date().toISOString(),
          is_outbound: true,
          status: 'SENT'
        };

        const updatedMessages = [...selectedConvo.messages, newMsg];
        const mediaTag = newMsg.media_type ? (newMsg.media_type === 'video' ? '🎬 Video' : '📷 Image') : '';
        const updatedConvo = {
          ...selectedConvo,
          messages: updatedMessages,
          lastMessage: `You: ${textToSend ? textToSend : `[${mediaTag || 'Media'}]`}`,
          lastTime: newMsg.time
        };

        setSelectedConvo(updatedConvo);
        setConversations(prev =>
          prev.map(c => (c.phone === selectedConvo.phone ? updatedConvo : c))
        );
        setReplyText('');
        handleClearMedia();

        if (textareaRef.current) {
          textareaRef.current.style.height = '42px';
        }
      } else {
        alert(data.message || 'Failed to send reply');
      }
    } catch (err) {
      alert(err.message || 'Failed to dispatch reply');
    } finally {
      setSendingReply(false);
    }
  }

  function handleChannelChange(newChannel) {
    setChannelFilter(newChannel);
    if (newChannel !== 'all') {
      const available = conversations.filter(c => getConversationChannelType(c) === newChannel);
      if (available.length > 0 && selectedConvo && getConversationChannelType(selectedConvo) !== newChannel) {
        if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
          setSelectedConvo(available[0]);
          try { sessionStorage.setItem('inbox_selected_phone', available[0].phone); } catch (e) {}
        }
      }
    }
  }

  // Channel breakdown counts (across all conversations)
  const channelCounts = {
    all: conversations.length,
    whatsapp: conversations.filter(c => getConversationChannelType(c) === 'whatsapp').length,
    in_app: conversations.filter(c => getConversationChannelType(c) === 'in_app').length,
    website: conversations.filter(c => getConversationChannelType(c) === 'website').length
  };

  // Filter conversations by active channel
  const convosInActiveChannel = conversations.filter(c => {
    if (channelFilter === 'all') return true;
    return getConversationChannelType(c) === channelFilter;
  });

  // Secondary counts (Replies, Unread, All) scoped to the active channel
  const repliesCount = convosInActiveChannel.filter(c => c.messages.some(m => !m.is_outbound)).length;
  const unreadCount = convosInActiveChannel.filter(c => c.unreadCount > 0).length;
  const allCount = convosInActiveChannel.length;

  const filteredConvos = convosInActiveChannel.filter(c => {
    const matchesSearch = 
      (c.name || '').toLowerCase().includes(search.toLowerCase()) || 
      (c.phone || '').includes(search) ||
      (c.lastMessage || '').toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    if (convoFilter === 'replies') {
      return c.messages.some(m => !m.is_outbound);
    }
    if (convoFilter === 'unread') {
      return c.unreadCount > 0;
    }
    return true; // 'all'
  });

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#171719', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>2-Way Customer Inbox</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, background: '#EDF4E6', color: '#2F5219', padding: '3px 10px', borderRadius: '12px', border: '1px solid #C3D1AC' }}>
              Live Sync
            </span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '3px' }}>
            Live WhatsApp customer conversations captured via Meta webhook. Read incoming guest messages and reply instantly.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Auto-Reply Bot Settings Trigger Button */}
          <button
            type="button"
            onClick={() => {
              if (onNavigate) {
                onNavigate('autoreply');
              } else {
                loadAutoReplySettings();
                setShowAutoReplyModal(true);
              }
            }}
            className="btn btn-secondary"
            style={{
              gap: '8px',
              fontSize: '0.825rem',
              border: autoReplySettings.enabled ? '1px solid #C3D1AC' : '1px solid #D4D4D9',
              background: autoReplySettings.enabled ? '#F3F6EE' : '#FFFFFF',
              color: autoReplySettings.enabled ? '#2F5219' : '#67676B',
              fontWeight: 600,
              boxShadow: 'var(--shadow-xs)'
            }}
            title="Configure Automated Message Settings"
          >
            <Bot size={15} color={autoReplySettings.enabled ? '#2F5219' : '#96969C'} />
            <span>{autoReplySettings.engineMode === 'HOSPITALITY_FLOW' ? 'Concierge Bot' : 'Auto-Reply Bot'}</span>
            {autoReplySettings.enabled ? (
              <span style={{
                fontSize: '0.68rem',
                background: '#EDF4E6',
                color: '#2F5219',
                padding: '1px 7px',
                borderRadius: '10px',
                border: '1px solid #C3D1AC',
                fontWeight: 700
              }}>
                {autoReplySettings.engineMode === 'HOSPITALITY_FLOW' ? 'Concierge Active' : (autoReplySettings.mode === 'ONCE_PER_24_HOURS' ? '24h Window' : 'Once Only')}
              </span>
            ) : (
              <span style={{
                fontSize: '0.68rem',
                background: '#EEEEF0',
                color: '#67676B',
                padding: '1px 7px',
                borderRadius: '10px',
                fontWeight: 600
              }}>
                Off
              </span>
            )}
          </button>

          {/* Browser Desktop/Mobile Push Notification Toggle */}
          {typeof window !== 'undefined' && 'Notification' in window && (
            <button
              type="button"
              onClick={handleRequestNotificationPerm}
              className="btn btn-secondary"
              style={{
                gap: '6px',
                fontSize: '0.825rem',
                border: notificationPerm === 'granted' ? '1px solid #C3D1AC' : '1px solid #D4D4D9',
                background: notificationPerm === 'granted' ? '#F3F6EE' : '#FFFFFF',
                color: notificationPerm === 'granted' ? '#2F5219' : '#67676B'
              }}
              title={notificationPerm === 'granted' ? 'Push Notifications Active for Inbound Messages' : 'Enable Desktop/Mobile Push Notifications'}
            >
              {notificationPerm === 'granted' ? <BellRing size={14} color="#2F5219" /> : <Bell size={14} />}
              <span>{notificationPerm === 'granted' ? 'Alerts On' : 'Enable Alerts'}</span>
            </button>
          )}

          <button 
            type="button"
            onClick={() => loadInbox(false)} 
            className="btn btn-secondary" 
            style={{ gap: '6px', fontSize: '0.825rem' }} 
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'pulse-glow' : ''} />
            <span>{loading ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Main Inbox Two-Pane Container */}
      <div className={`inbox-layout-container ${selectedConvo ? 'has-convo-selected' : ''}`}>
        
        {/* Left Pane: Conversation List */}
        <div className="inbox-list-pane">
          {/* Search Bar & Conversation Filters */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)', background: '#FFFFFF' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#171719' }}>
                Conversations ({filteredConvos.length})
              </span>
              <span style={{ fontSize: '0.72rem', color: '#67676B' }}>
                Live 2-Way Sync
              </span>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search guest name, phone, message..."
                className="saas-input"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: '34px', paddingRight: search ? '30px' : '14px', fontSize: '0.825rem' }}
              />
              <Search size={15} color="#96969C" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }} />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#96969C',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex'
                  }}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* 3 Channels Sub-Header Tabs */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '4px',
              background: '#F5F5F6',
              padding: '3px',
              borderRadius: '8px',
              marginTop: '10px',
              border: '1px solid #E5E5E8'
            }}>
              {[
                { id: 'all', label: 'All', icon: Layers, count: channelCounts.all },
                { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, count: channelCounts.whatsapp },
                { id: 'in_app', label: 'In-App', icon: Smartphone, count: channelCounts.in_app },
                { id: 'website', label: 'Website', icon: Globe, count: channelCounts.website }
              ].map(tab => {
                const isActive = channelFilter === tab.id;
                const TabIcon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleChannelChange(tab.id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '6px 2px',
                      borderRadius: '6px',
                      border: isActive ? '1px solid #C3D1AC' : '1px solid transparent',
                      background: isActive ? '#FFFFFF' : 'transparent',
                      color: isActive ? '#2F5219' : '#67676B',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                      gap: '2px'
                    }}
                    title={`${tab.label} Chats (${tab.count})`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <TabIcon size={12} color={isActive ? '#2F5219' : '#96969C'} />
                      <span style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{tab.label}</span>
                    </div>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      padding: '0px 5px',
                      borderRadius: '8px',
                      background: isActive ? '#EDF4E6' : '#E5E5E8',
                      color: isActive ? '#2F5219' : '#67676B'
                    }}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Conversation Mode Filter Pills */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setConvoFilter('replies')}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: '0.75rem',
                  fontWeight: convoFilter === 'replies' ? 700 : 500,
                  borderRadius: '6px',
                  border: convoFilter === 'replies' ? '1px solid #C3D1AC' : '1px solid #E5E5E8',
                  background: convoFilter === 'replies' ? '#EDF4E6' : '#F5F5F6',
                  color: convoFilter === 'replies' ? '#2F5219' : '#67676B',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>Replies</span>
                {repliesCount > 0 && (
                  <span style={{
                    fontSize: '0.675rem',
                    background: convoFilter === 'replies' ? '#2F5219' : '#96969C',
                    color: '#FFFFFF',
                    padding: '1px 5px',
                    borderRadius: '10px',
                    fontWeight: 700
                  }}>
                    {repliesCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setConvoFilter('all')}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: '0.75rem',
                  fontWeight: convoFilter === 'all' ? 700 : 500,
                  borderRadius: '6px',
                  border: convoFilter === 'all' ? '1px solid #C3D1AC' : '1px solid #E5E5E8',
                  background: convoFilter === 'all' ? '#EDF4E6' : '#F5F5F6',
                  color: convoFilter === 'all' ? '#2F5219' : '#67676B',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>All Chats</span>
                {allCount > 0 && (
                  <span style={{
                    fontSize: '0.675rem',
                    background: convoFilter === 'all' ? '#2F5219' : '#96969C',
                    color: '#FFFFFF',
                    padding: '1px 5px',
                    borderRadius: '10px',
                    fontWeight: 700
                  }}>
                    {allCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setConvoFilter('unread')}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: '0.75rem',
                  fontWeight: convoFilter === 'unread' ? 700 : 500,
                  borderRadius: '6px',
                  border: convoFilter === 'unread' ? '1px solid #FDB1AF' : '1px solid #E5E5E8',
                  background: convoFilter === 'unread' ? '#FDF0F0' : '#F5F5F6',
                  color: convoFilter === 'unread' ? '#9B2C2C' : '#67676B',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>Unread</span>
                {unreadCount > 0 && (
                  <span style={{
                    fontSize: '0.675rem',
                    background: '#9B2C2C',
                    color: '#FFFFFF',
                    padding: '1px 5px',
                    borderRadius: '10px',
                    fontWeight: 700
                  }}>
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* List items */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredConvos.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#96969C', fontSize: '0.85rem' }}>
                <MessageSquare size={36} color="#D4D4D9" style={{ margin: '0 auto 12px auto' }} />
                <div style={{ fontWeight: 600, color: '#67676B' }}>
                  {loading ? 'Loading conversations...' : (
                    channelFilter === 'whatsapp' ? 'No WhatsApp conversations found' :
                    channelFilter === 'in_app' ? 'No In-App chat sessions found' :
                    channelFilter === 'website' ? 'No Website chat conversations found' :
                    'No conversations found'
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '4px', lineHeight: 1.4 }}>
                  {loading 
                    ? 'Syncing customer messages...' 
                    : (
                      channelFilter === 'whatsapp' 
                        ? 'Incoming direct WhatsApp messages via Meta Cloud API will appear here.' :
                      channelFilter === 'in_app'
                        ? 'In-app guest sessions from mobile webviews will appear here.' :
                      channelFilter === 'website'
                        ? 'Conversations started via website concierge chat links will appear here.' :
                        'When guests message your WhatsApp WABA number, mobile in-app link, or website chat, they appear here automatically.'
                    )}
                </div>
              </div>
            ) : (
              filteredConvos.map(c => {
                const isSelected = selectedConvo?.phone === c.phone;
                const initials = (c.name || c.phone || 'G').substring(0, 2).toUpperCase();

                return (
                  <div
                    key={c.phone}
                    onClick={() => handleSelectConversation(c)}
                    style={{
                      padding: '13px 16px',
                      borderBottom: '1px solid #E5E5E8',
                      background: isSelected ? '#FFFFFF' : 'transparent',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      borderLeft: isSelected ? '4px solid var(--brand-wa)' : '4px solid transparent',
                      boxShadow: isSelected ? 'var(--shadow-xs)' : 'none',
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'center'
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: isSelected ? '#EDF4E6' : '#EEEEF0',
                      border: `1px solid ${isSelected ? '#C3D1AC' : '#E5E5E8'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isSelected ? '#2F5219' : '#67676B',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      flexShrink: 0
                    }}>
                      {initials}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                        <span style={{ fontWeight: 700, color: isSelected ? '#171719' : '#3A3A3E', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#96969C', flexShrink: 0, marginLeft: '6px' }}>
                          {c.lastTime ? formatIndianTime(c.lastTime) : ''}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.74rem', fontFamily: 'var(--font-mono)', color: '#67676B' }}>
                          +{c.phone}
                        </span>
                        {/* Channel Badge Pill */}
                        {(() => {
                          const cType = getConversationChannelType(c);
                          const meta = getChannelMeta(cType, c);
                          const ChannelIcon = meta.icon;
                          return (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '0.64rem',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: meta.badgeBg,
                              color: meta.badgeColor,
                              border: `1px solid ${meta.badgeBorder}`
                            }}>
                              <ChannelIcon size={10} />
                              <span>{meta.shortLabel}</span>
                            </span>
                          );
                        })()}
                        {(c.linkTitle || c.source === 'CHAT_LINK') && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: '#EDF4E6',
                            color: '#2F5219',
                            border: '1px solid #C3D1AC'
                          }}>
                            <Link2 size={9} /> {c.linkTitle ? `via ${c.linkTitle}` : 'via Chat Link'}
                          </span>
                        )}
                      </div>

                      <div style={{
                        fontSize: '0.78rem',
                        color: isSelected ? '#3A3A3E' : '#67676B',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {c.lastMessage || 'No messages'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', flexShrink: 0, gap: '6px' }}>
                      {c.unreadCount > 0 ? (
                        <span style={{
                          background: 'var(--brand-wa)',
                          color: '#FFFFFF',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '10px'
                        }}>
                          {c.unreadCount}
                        </span>
                      ) : <span />}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConversation(c);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#96969C',
                          padding: '3px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.color = '#9B2C2C';
                          e.currentTarget.style.background = '#FDF0F0';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.color = '#96969C';
                          e.currentTarget.style.background = 'transparent';
                        }}
                        title={`Delete chat with ${c.name || c.phone}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Active Chat Conversation */}
        <div className="inbox-chat-pane">
          {selectedConvo ? (
            <>
              {/* Header with Back Button */}
              <div style={{
                padding: '12px 18px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#FFFFFF',
                gap: '12px',
                flexShrink: 0,
                position: 'sticky',
                top: 0,
                zIndex: 5
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  {/* Dedicated Back Button */}
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="inbox-back-btn"
                    title="Back to conversation list"
                  >
                    <ArrowLeft size={16} />
                    <span>Back</span>
                  </button>

                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: '#EDF4E6',
                    border: '1px solid #C3D1AC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2F5219',
                    fontWeight: 800,
                    fontSize: '0.875rem',
                    flexShrink: 0
                  }}>
                    {(selectedConvo.name || selectedConvo.phone || 'G').substring(0, 2).toUpperCase()}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#171719', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {selectedConvo.name}
                    </h3>
                    <div style={{ fontSize: '0.74rem', color: '#67676B', fontFamily: 'var(--font-mono)' }}>
                      +{selectedConvo.phone}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {(selectedConvo.linkTitle || selectedConvo.source === 'CHAT_LINK') && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: '#EDF4E6',
                      color: '#2F5219',
                      border: '1px solid #C3D1AC'
                    }}>
                      <Link2 size={11} /> {selectedConvo.linkTitle ? `Link: ${selectedConvo.linkTitle}` : 'via Chat Link'}
                    </span>
                  )}
                  {(() => {
                    const cType = getConversationChannelType(selectedConvo);
                    if (cType === 'in_app') {
                      return (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: '#EFF6FF',
                          color: '#2876B8',
                          border: '1px solid #BFDBFE'
                        }}>
                          <Smartphone size={12} /> In-App Session
                        </span>
                      );
                    }
                    if (cType === 'website') {
                      return (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: '#F5F3FF',
                          color: '#7C3AED',
                          border: '1px solid #DDD6FE'
                        }}>
                          <Globe size={12} /> Website Concierge
                        </span>
                      );
                    }
                    return (
                      <span className="badge badge-success" style={{ fontSize: '0.7rem', gap: '4px' }}>
                        <ShieldCheck size={12} /> WhatsApp Verified
                      </span>
                    );
                  })()}

                  {/* Real-time Bot Pause / Takeover Status */}
                  {selectedBotStatus?.isPaused ? (
                    <button
                      type="button"
                      onClick={() => handleToggleBotStatus(selectedConvo.phone, false)}
                      disabled={togglingBot}
                      title="Automated bot replies are currently paused for this guest. Click to resume automated replies immediately."
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: '#FEF3C7',
                        color: '#92400E',
                        border: '1px solid #FCD34D',
                        cursor: togglingBot ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#D97706' }} />
                      <span>Staff Takeover ({selectedBotStatus.remainingMinutes || 0}m left)</span>
                      <span style={{ textDecoration: 'underline', marginLeft: '2px' }}>Resume Bot</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleBotStatus(selectedConvo.phone, true)}
                      disabled={togglingBot}
                      title="Automated bot replies are active. Click to pause bot and take over conversation manually for 60 minutes."
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: '#F0FDF4',
                        color: '#166534',
                        border: '1px solid #BBF7D0',
                        cursor: togglingBot ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#22C55E' }} />
                      <span>🤖 Bot Active</span>
                      <span style={{ fontSize: '0.68rem', color: '#15803D', textDecoration: 'underline' }}>Take Over</span>
                    </button>
                  )}
                  {/* Commerce & Payment Drawer Toggle */}
                  <button
                    type="button"
                    onClick={() => setIsCommerceDrawerOpen(prev => !prev)}
                    className="btn btn-secondary"
                    style={{
                      padding: '5px 10px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: isCommerceDrawerOpen ? '#EDF4E6' : '#FFFFFF',
                      color: isCommerceDrawerOpen ? '#2F5219' : '#3A3A3E',
                      border: `1px solid ${isCommerceDrawerOpen ? '#C3D1AC' : '#D4D4D9'}`
                    }}
                    title="Toggle Commerce & Payment Drawer"
                  >
                    <Receipt size={13} />
                    <span>Commerce</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteConversation(selectedConvo)}
                    style={{
                      background: '#FDF0F0',
                      border: '1px solid #FDB1AF',
                      color: '#9B2C2C',
                      cursor: 'pointer',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#FDF0F0';
                      e.currentTarget.style.borderColor = '#F87171';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = '#FDF0F0';
                      e.currentTarget.style.borderColor = '#FDB1AF';
                    }}
                    title="Delete entire chat conversation"
                  >
                    <Trash2 size={13} />
                    <span>Delete Chat</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleBackToList}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#96969C',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title="Close conversation"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Active Conversation Channel Sub-Header Strip */}
              {(() => {
                const activeChannelType = getConversationChannelType(selectedConvo);
                const activeMeta = getChannelMeta(activeChannelType, selectedConvo);
                const ActiveChannelIcon = activeMeta.icon;

                return (
                  <div style={{
                    padding: '8px 18px',
                    background: '#FAFAFA',
                    borderBottom: '1px solid #E5E5E8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '0.725rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: activeMeta.badgeBg,
                        color: activeMeta.badgeColor,
                        border: `1px solid ${activeMeta.badgeBorder}`,
                        flexShrink: 0
                      }}>
                        <ActiveChannelIcon size={12} />
                        <span>{activeMeta.label}</span>
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#67676B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {activeMeta.description}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.74rem', color: '#67676B', flexShrink: 0 }}>
                      <span>Source: <strong style={{ color: '#171719' }}>{activeMeta.origin}</strong></span>
                      <span style={{ color: '#D4D4D9' }}>|</span>
                      <span>Total: <strong style={{ color: '#171719' }}>{totalConversationMessages > selectedConvo.messages.length ? `${selectedConvo.messages.length} of ${totalConversationMessages} msgs` : `${selectedConvo.messages.length} msgs`}</strong></span>
                    </div>
                  </div>
                );
              })()}

              {/* In-App Experience Rate Negotiation Action Card */}
              {inappActiveNegotiation && (
                <div style={{
                  background: '#FFFBEB',
                  borderBottom: '1px solid #FDE68A',
                  padding: '10px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        background: '#FEF3C7',
                        color: '#92400E',
                        fontWeight: 800,
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <Sparkles size={12} /> Rate Offer Pending
                      </span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#171719' }}>
                        Customer offered ₹{Number(inappActiveNegotiation.customer_offer_price).toLocaleString('en-IN')}
                        <span style={{ fontWeight: 400, color: '#67676B' }}> for {inappActiveNegotiation.item_title} (Qty: {inappActiveNegotiation.quantity || 1})</span>
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#78716C', textDecoration: 'line-through' }}>
                        Base: ₹{Number(inappActiveNegotiation.base_unit_price).toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {inappActiveNegotiation.status === 'PENDING_AGENT' && (
                        <>
                          <button
                            type="button"
                            disabled={inappActionLoading}
                            onClick={() => handleInappNegotiationAction('APPROVE')}
                            style={{
                              background: '#15803D',
                              color: '#FFFFFF',
                              border: 'none',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: inappActionLoading ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Check size={12} /> Approve Offer
                          </button>
                          <button
                            type="button"
                            disabled={inappActionLoading}
                            onClick={() => setInappCounterFormOpen(prev => !prev)}
                            style={{
                              background: '#2563EB',
                              color: '#FFFFFF',
                              border: 'none',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: inappActionLoading ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {inappCounterFormOpen ? 'Cancel' : 'Counter Offer'}
                          </button>
                          <button
                            type="button"
                            disabled={inappActionLoading}
                            onClick={() => handleInappNegotiationAction('REJECT')}
                            style={{
                              background: '#FEE2E2',
                              color: '#DC2626',
                              border: '1px solid #FCA5A5',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: inappActionLoading ? 'not-allowed' : 'pointer'
                            }}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {inappActiveNegotiation.status === 'AGENT_COUNTERED' && (
                        <span style={{ fontSize: '0.75rem', color: '#2563EB', fontWeight: 600 }}>
                          Countered at ₹{Number(inappActiveNegotiation.agent_counter_price).toLocaleString('en-IN')} (Awaiting customer response)
                        </span>
                      )}
                    </div>
                  </div>

                  {inappActiveNegotiation.notes && (
                    <div style={{ fontSize: '0.74rem', color: '#78716C', fontStyle: 'italic', paddingLeft: '4px' }}>
                      "{inappActiveNegotiation.notes}"
                    </div>
                  )}

                  {inappCounterFormOpen && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px', borderTop: '1px dashed #FDE68A' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#44403C' }}>Your Counter Price:</span>
                      <input
                        type="number"
                        placeholder="e.g. 4200"
                        value={inappCounterPrice}
                        onChange={e => setInappCounterPrice(e.target.value)}
                        style={{ width: '110px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #D6D3D1', fontSize: '0.8rem' }}
                      />
                      <input
                        type="text"
                        placeholder="Optional note to customer"
                        value={inappCounterNote}
                        onChange={e => setInappCounterNote(e.target.value)}
                        style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid #D6D3D1', fontSize: '0.8rem' }}
                      />
                      <button
                        type="button"
                        disabled={inappActionLoading || !inappCounterPrice}
                        onClick={() => handleInappNegotiationAction('COUNTER', inappCounterPrice, inappCounterNote)}
                        style={{
                          background: '#1D4ED8',
                          color: '#FFFFFF',
                          border: 'none',
                          padding: '4px 12px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Send Counter
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* In-App Experience Callback SLA Action Card */}
              {inappActiveCall && (
                <div style={{
                  background: '#EFF6FF',
                  borderBottom: '1px solid #BFDBFE',
                  padding: '10px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      background: '#DBEAFE',
                      color: '#1D4ED8',
                      fontWeight: 800,
                      fontSize: '0.72rem',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <Phone size={12} /> {inappActiveCall.call_type === 'INSTANT_CALLBACK' ? 'Instant Callback' : 'Scheduled Call'}
                    </span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#171719' }}>
                      Topic: {inappActiveCall.topic || 'General Inquiry'}
                    </span>
                    {inappActiveCall.call_type === 'INSTANT_CALLBACK' && (
                      <span style={{ fontSize: '0.72rem', background: '#DC2626', color: '#FFFFFF', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                        ⚡ 5-min SLA
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <a
                      href={`tel:${inappActiveCall.visitor_phone}`}
                      style={{
                        background: '#2563EB',
                        color: '#FFFFFF',
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Phone size={12} /> Call {inappActiveCall.visitor_phone}
                    </a>
                    <button
                      type="button"
                      disabled={inappActionLoading}
                      onClick={() => handleInappCallStatus('CALLED')}
                      style={{
                        background: '#059669',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: inappActionLoading ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Check size={12} /> Mark Called
                    </button>
                    <button
                      type="button"
                      disabled={inappActionLoading}
                      onClick={() => handleInappCallStatus('CANCELLED')}
                      style={{
                        background: '#F1F5F9',
                        color: '#64748B',
                        border: '1px solid #CBD5E1',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: inappActionLoading ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* Chat Messages Canvas */}
              <div 
                ref={chatCanvasRef}
                style={{
                  flex: 1,
                  minHeight: 0,
                  overscrollBehaviorY: 'contain',
                  scrollBehavior: 'smooth',
                  padding: '20px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  background: '#F5F5F6'
                }}
              >
                {/* Load Previous Messages Button */}
                {hasMorePrevious && (
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 10px 0' }}>
                    <button
                      type="button"
                      onClick={handleLoadPreviousMessages}
                      disabled={loadingPrevious}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#2F5219',
                        background: '#EDF4E6',
                        border: '1px solid #C3D1AC',
                        borderRadius: '20px',
                        cursor: loadingPrevious ? 'not-allowed' : 'pointer',
                        boxShadow: 'var(--shadow-xs)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {loadingPrevious ? (
                        <>
                          <RefreshCw size={13} className="spin-animation" />
                          <span>Loading earlier messages...</span>
                        </>
                      ) : (
                        <>
                          <History size={13} />
                          <span>Load earlier messages</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {loadingHistory && (
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 8px 0' }}>
                    <span style={{ fontSize: '0.75rem', color: '#67676B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <RefreshCw size={11} className="spin-animation" /> Loading chat history...
                    </span>
                  </div>
                )}

                {selectedConvo.messages.map((m, idx) => {
                  const isOutbound = m.is_outbound;
                  const displayTime = m.time ? formatIndianTime(m.time) : '';
                  const isVideo = m.media_type === 'video' || (m.media_url && /\.(mp4|3gp|mov|webm)(\?.*)?$/i.test(m.media_url));
                  const isAudio = m.media_type === 'audio' || (m.media_url && /\.(ogg|mp3|wav|m4a|aac|opus)(\?.*)?$/i.test(m.media_url)) || Boolean(m.voice_transcript);
                  const isImage = !isAudio && (m.media_type === 'image' || (m.media_url && !isVideo) || Boolean(m.media_id));
                  let msgText = m.text || m.message_body || m.message_text || '';
                  if (msgText && typeof msgText === 'string' && msgText.startsWith('📢 Broadcast:')) {
                    msgText = msgText.replace(/^📢 Broadcast:\s*/i, '');
                  }

                  // Extract clean caption: strip generic placeholders
                  let cleanCaption = m.media_caption || '';
                  if (!cleanCaption && msgText) {
                    if (!/^\[(image|photo|image received|video|video received|voice note|audio received)\]$/i.test(msgText.trim())) {
                      cleanCaption = msgText.replace(/^\[(image|photo)\]\s*/i, '').trim();
                    }
                  }

                  const imageSrcToUse = m.media_url || (m.media_id ? `/api/media/inbound/${m.media_id}` : null);
                  const shouldShowTextBlock = !isImage && !isVideo && !isAudio && Boolean(msgText);
                  const hasCaption = Boolean(cleanCaption);

                  return (
                    <div
                      key={m.id || idx}
                      style={{
                        maxWidth: isImage ? '340px' : '80%',
                        alignSelf: isOutbound ? 'flex-end' : 'flex-start',
                        background: isOutbound ? '#EDF4E6' : '#FFFFFF',
                        color: '#171719',
                        border: `1px solid ${isOutbound ? '#C3D1AC' : '#E5E5E8'}`,
                        borderRadius: isOutbound ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                        padding: isImage ? '6px 6px 6px 6px' : '10px 14px',
                        boxShadow: 'var(--shadow-xs)',
                        wordWrap: 'break-word',
                        wordBreak: 'break-word'
                      }}
                    >
                      {m.is_auto && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', fontWeight: 700, color: '#2876B8', marginBottom: '6px', padding: isImage ? '4px 6px 0 6px' : '0' }}>
                          <Sparkles size={11} /> Auto-Reply Bot
                        </div>
                      )}

                      {m.campaign_name && isOutbound && !m.is_auto && (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          color: '#047857',
                          background: '#EEF5FB',
                          border: '1px solid #B0DBF6',
                          padding: '2px 7px',
                          borderRadius: '6px',
                          marginBottom: '6px'
                        }}>
                          <span>📢 Campaign: {m.campaign_name}</span>
                        </div>
                      )}

                      {/* Attached Media Display: Video */}
                      {isVideo && m.media_url && (
                        <div style={{ marginBottom: cleanCaption ? '8px' : '4px', borderRadius: '8px', overflow: 'hidden', background: '#000000' }}>
                          <video
                            controls
                            playsInline
                            preload="metadata"
                            src={m.media_url}
                            style={{
                              maxWidth: '100%',
                              maxHeight: '320px',
                              display: 'block',
                              borderRadius: '8px'
                            }}
                          />
                          {cleanCaption && (
                            <div style={{ padding: '6px 8px', color: '#FFFFFF', fontSize: '0.85rem' }}>
                              {cleanCaption}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Attached Media Display: Image */}
                      {isImage && (imageSrcToUse || m.media_id) && (
                        <ChatImageBubble
                          src={imageSrcToUse}
                          alt={cleanCaption || "WhatsApp Photo"}
                          caption={cleanCaption}
                          time={displayTime}
                          isOutbound={isOutbound}
                          mediaId={m.media_id}
                          senderName={selectedConvo.name || selectedConvo.phone}
                          onOpenLightbox={setLightboxMedia}
                        />
                      )}

                      {/* Attached Media Display: Audio / Voice Note */}
                      {isAudio && (
                        <div style={{ marginBottom: '8px', minWidth: '220px', maxWidth: '320px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <Mic size={14} color="#7C3AED" />
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7C3AED' }}>
                              Voice Note
                            </span>
                            {m.detected_language && (
                              <span style={{
                                fontSize: '0.65rem',
                                padding: '1px 5px',
                                background: '#EDE9FE',
                                color: '#6D28D9',
                                borderRadius: '4px',
                                fontWeight: 600,
                                textTransform: 'uppercase'
                              }}>
                                {m.detected_language}
                              </span>
                            )}
                          </div>
                          {m.media_url && (
                            <audio
                              controls
                              src={m.media_url}
                              style={{ width: '100%', height: '36px', outline: 'none' }}
                            />
                          )}
                          {m.voice_transcript && (
                            <div style={{
                              marginTop: '6px',
                              padding: '8px 10px',
                              background: '#F5F3FF',
                              border: '1px solid #DDD6FE',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              color: '#4C1D95',
                              lineHeight: 1.45
                            }}>
                              <span style={{ fontWeight: 600 }}>🎙️ Transcript:</span> {m.voice_transcript}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Preserved Formatted Text with Linebreaks and Spaces */}
                      {shouldShowTextBlock && (
                        msgText?.startsWith('[Flow') ? (() => {
                          const title = msgText.split(']')[0].replace('[', '').trim();
                          const body = msgText.includes(']') ? msgText.split(']').slice(1).join(']').trim() : '';
                          const parsed = parseFlowContent(body);

                          return (
                            <div style={{
                              background: '#FFFFFF',
                              border: '1px solid #C3D1AC',
                              borderRadius: '10px',
                              overflow: 'hidden',
                              minWidth: '240px',
                              maxWidth: '360px',
                              boxShadow: 'var(--shadow-xs)',
                              margin: '2px 0'
                            }}>
                              <div style={{
                                background: '#EDF4E6',
                                padding: '8px 12px',
                                borderBottom: '1px solid #C3D1AC',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: '#2F5219'
                              }}>
                                <Layers size={14} color="#2F5219" />
                                <span>{title}</span>
                              </div>
                              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {parsed.length > 0 ? (
                                  parsed.map((row, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', gap: '8px' }}>
                                      <span style={{ color: '#67676B', fontWeight: 500 }}>{row.label}</span>
                                      <span style={{ color: '#171719', fontWeight: 700, textAlign: 'right' }}>{row.value}</span>
                                    </div>
                                  ))
                                ) : (
                                  <div style={{ fontSize: '0.8rem', color: '#171719', lineHeight: 1.45 }}>{body}</div>
                                )}
                              </div>
                            </div>
                          );
                        })() : (
                          <div style={{ 
                            fontSize: '0.875rem', 
                            lineHeight: 1.5, 
                            whiteSpace: 'pre-wrap', 
                            wordBreak: 'break-word' 
                          }}>
                            {msgText}
                          </div>
                        )
                      )}

                      {/* Timestamp & Status: show if text message, or video, or image with caption */}
                      {(!isImage || hasCaption || isVideo) && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '6px',
                          fontSize: '0.675rem',
                          color: '#67676B',
                          marginTop: isImage ? '2px' : '4px',
                          padding: isImage ? '0 4px 2px 0' : '0'
                        }}>
                          <span>{displayTime}</span>
                          {isOutbound && <CheckCheck size={13} color="#2563EB" />}
                          {typeof m.id === 'number' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(m.id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#96969C',
                                cursor: 'pointer',
                                padding: '2px',
                                borderRadius: '3px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                marginLeft: '2px',
                                transition: 'color 0.15s ease'
                              }}
                              onMouseEnter={e => e.currentTarget.style.color = '#9B2C2C'}
                              onMouseLeave={e => e.currentTarget.style.color = '#96969C'}
                              title="Delete this message"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Media Attachment Preview Bar */}
              {selectedMediaFile && (
                <div style={{
                  padding: '10px 16px',
                  background: '#EEEEF0',
                  borderTop: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    {mediaType === 'video' ? (
                      <div style={{
                        position: 'relative',
                        width: '52px',
                        height: '52px',
                        borderRadius: '8px',
                        background: '#171719',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        flexShrink: 0
                      }}>
                        {mediaPreviewUrl ? (
                          <video src={mediaPreviewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <FileVideo size={24} color="#96969C" />
                        )}
                        <div style={{
                          position: 'absolute',
                          background: 'rgba(0,0,0,0.6)',
                          borderRadius: '50%',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Play size={12} color="#FFFFFF" fill="#FFFFFF" />
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '8px',
                        border: '1px solid #D4D4D9',
                        overflow: 'hidden',
                        background: '#FFFFFF',
                        flexShrink: 0
                      }}>
                        <img
                          src={mediaPreviewUrl}
                          alt="Preview"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    )}

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="badge" style={{
                          fontSize: '0.68rem',
                          padding: '2px 6px',
                          background: mediaType === 'video' ? '#EFF6FF' : '#F3F6EE',
                          color: mediaType === 'video' ? '#1D4ED8' : '#2F5219',
                          border: `1px solid ${mediaType === 'video' ? '#BFDBFE' : '#C3D1AC'}`
                        }}>
                          {mediaType === 'video' ? 'Video Ready' : 'Image Ready'}
                        </span>
                        <span style={{ fontSize: '0.725rem', color: '#67676B' }}>
                          {(selectedMediaFile.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>
                      <div style={{
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#3A3A3E',
                        marginTop: '2px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {selectedMediaFile.name}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleClearMedia}
                    style={{
                      background: '#E5E5E8',
                      border: 'none',
                      borderRadius: '50%',
                      width: '26px',
                      height: '26px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: '#67676B',
                      flexShrink: 0
                    }}
                    title="Remove attachment"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}

              {/* AI Copilot Action Toolbar & Banners */}
              <div style={{
                padding: '6px 16px',
                background: '#F8FAFC',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleCopilotDraft}
                    disabled={copilotLoading}
                    style={{
                      background: '#EDE9FE',
                      border: '1px solid #DDD6FE',
                      color: '#6D28D9',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.725rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Draft 2 grounded reply options grounded in room tariffs and catalog"
                  >
                    <Sparkles size={12} />
                    {copilotLoading ? 'Thinking...' : 'Draft Reply (AI)'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopilotTranslate('en')}
                    disabled={copilotLoading}
                    style={{
                      background: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      color: '#1D4ED8',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.725rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Translate text to English"
                  >
                    <Languages size={12} />
                    EN
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopilotTranslate('hi')}
                    disabled={copilotLoading}
                    style={{
                      background: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      color: '#1D4ED8',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.725rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Translate text to Hindi"
                  >
                    <Languages size={12} />
                    HI (हिन्दी)
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopilotTranslate('mr')}
                    disabled={copilotLoading}
                    style={{
                      background: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      color: '#1D4ED8',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.725rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Translate text to Marathi"
                  >
                    <Languages size={12} />
                    MR (मराठी)
                  </button>

                  <button
                    type="button"
                    onClick={handleCopilotSummarize}
                    disabled={copilotLoading}
                    style={{
                      background: '#F1F5F9',
                      border: '1px solid #CBD5E1',
                      color: '#334155',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.725rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Summarize key points and sentiment of this customer thread"
                  >
                    <FileText size={12} />
                    Summarize Thread
                  </button>
                </div>

                {copilotNotice && (
                  <div style={{
                    fontSize: '0.725rem',
                    color: '#6D28D9',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <span>{copilotNotice}</span>
                    <button
                      type="button"
                      onClick={() => setCopilotNotice(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6D28D9' }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                )}
              </div>

              {/* AI Draft Suggestions Popover */}
              {copilotDrafts && copilotDrafts.length > 0 && (
                <div style={{
                  padding: '10px 16px',
                  background: '#F5F3FF',
                  borderTop: '1px solid #DDD6FE',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6D28D9', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Sparkles size={12} /> Click to Insert AI Draft:
                    </span>
                    <button
                      type="button"
                      onClick={() => setCopilotDrafts(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6D28D9' }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '8px' }}>
                    {copilotDrafts.map((d) => (
                      <div
                        key={d.id}
                        onClick={() => {
                          setReplyText(d.text);
                          setCopilotDrafts(null);
                          if (textareaRef.current) textareaRef.current.focus();
                        }}
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #DDD6FE',
                          borderRadius: '6px',
                          padding: '8px 10px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        className="hover-card"
                      >
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#7C3AED', marginBottom: '2px' }}>
                          {d.label}
                        </div>
                        <div style={{ fontSize: '0.775rem', color: '#171719', lineHeight: 1.35 }}>
                          {d.text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Thread Summary Card */}
              {copilotSummary && (
                <div style={{
                  padding: '10px 16px',
                  background: '#F8FAFC',
                  borderTop: '1px solid #E2E8F0',
                  fontSize: '0.8rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={13} /> Thread Executive Summary
                      <span style={{
                        fontSize: '0.65rem',
                        padding: '1px 6px',
                        background: copilotSummary.urgency === 'HIGH' ? '#FEE2E2' : '#F1F5F9',
                        color: copilotSummary.urgency === 'HIGH' ? '#DC2626' : '#475569',
                        borderRadius: '4px',
                        fontWeight: 700
                      }}>
                        {copilotSummary.urgency} URGENCY
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setCopilotSummary(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <ul style={{ margin: '0 0 6px 16px', padding: 0, color: '#334155', lineHeight: 1.4 }}>
                    {copilotSummary.bullets?.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                  {copilotSummary.nextAction && (
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#2563EB' }}>
                      👉 Recommended Action: {copilotSummary.nextAction}
                    </div>
                  )}
                </div>
              )}

              {/* Reply Input Form */}
              <form 
                onSubmit={handleSendReply}
                style={{
                  padding: '12px 16px',
                  borderTop: '1px solid var(--border-color)',
                  display: 'flex',
                  gap: '10px',
                  background: '#FFFFFF',
                  alignItems: 'flex-end',
                  position: 'sticky',
                  bottom: 0,
                  zIndex: 10
                }}
              >
                {/* Hidden File Picker */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/mp4,video/3gpp,video/quicktime,video/webm"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />

                {/* Attach File Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    background: selectedMediaFile ? '#EDF4E6' : '#EEEEF0',
                    border: `1px solid ${selectedMediaFile ? '#C3D1AC' : '#D4D4D9'}`,
                    color: selectedMediaFile ? '#2F5219' : '#67676B',
                    borderRadius: '8px',
                    width: '42px',
                    height: '42px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'all 0.15s ease'
                  }}
                  title="Attach Image or Video (JPG, PNG, MP4, 3GP, MOV)"
                >
                  <Paperclip size={18} />
                </button>

                {/* Multi-line Auto-Expanding Textarea with Shift+Enter Support */}
                <div style={{ flex: 1, position: 'relative' }}>
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    placeholder={
                      selectedMediaFile 
                        ? `Add caption for this ${mediaType}... (Enter to send, Shift+Enter for newline)`
                        : `Type a reply to ${selectedConvo.name}... (Enter to send, Shift+Enter for newline)`
                    }
                    className="saas-input"
                    value={replyText}
                    onChange={e => {
                      setReplyText(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(Math.max(e.target.scrollHeight, 42), 140)}px`;
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply(e);
                      }
                    }}
                    style={{
                      width: '100%',
                      minHeight: '42px',
                      maxHeight: '140px',
                      resize: 'none',
                      fontSize: '0.875rem',
                      lineHeight: '1.45',
                      padding: '10px 12px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      display: 'block',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={sendingReply || (!replyText.trim() && !selectedMediaFile)}
                  className="btn btn-action-green"
                  style={{
                    gap: '6px',
                    padding: '10px 18px',
                    height: '42px',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Send size={15} />
                  <span>{sendingReply ? 'Sending...' : 'Send'}</span>
                </button>
              </form>
            </>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#96969C',
              padding: '30px'
            }}>
              <MessageSquare size={44} color="#D4D4D9" style={{ marginBottom: '14px' }} />
              <div style={{ fontWeight: 700, color: '#3A3A3E', fontSize: '1rem' }}>Select a customer conversation</div>
              <div style={{ fontSize: '0.825rem', marginTop: '6px', maxWidth: '340px', textAlign: 'center', color: '#67676B', lineHeight: 1.5 }}>
                Choose a guest from the left panel to review message history and dispatch instant WhatsApp replies.
              </div>
            </div>
          )}
        </div>

        {/* Commerce Side-Drawer */}
        <InboxCommerceDrawer
          customerPhone={selectedConvo?.phone}
          customerName={selectedConvo?.name}
          isOpen={isCommerceDrawerOpen && !!selectedConvo}
          onClose={() => setIsCommerceDrawerOpen(false)}
          onInsertMessage={(msg) => setReplyText(prev => prev ? `${prev}\n\n${msg}` : msg)}
          onOpenFlowModal={handleOpenFlowModal}
          token={token}
        />
      </div>

      {/* Full-Screen Image Lightbox Modal */}
      {lightboxMedia && (
        <div 
          className="lightbox-backdrop"
          onClick={() => {
            setLightboxMedia(null);
            setLightboxZoomed(false);
          }}
          style={{ padding: '16px' }}
        >
          {/* Lightbox Header Bar */}
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: '#FFFFFF',
              marginBottom: '10px',
              padding: '6px 14px',
              background: 'rgba(0, 0, 0, 0.4)',
              borderRadius: '8px',
              backdropFilter: 'blur(6px)'
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ImageIcon size={16} color="var(--brand-wa-light)" />
                <span>{lightboxMedia.sender}</span>
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.75, marginTop: '2px' }}>
                {lightboxMedia.time ? formatIndianTime(lightboxMedia.time) : ''}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Zoom In / Out Toggle */}
              <button
                type="button"
                onClick={() => setLightboxZoomed(prev => !prev)}
                className="btn"
                style={{
                  background: lightboxZoomed ? 'rgba(34, 197, 94, 0.35)' : 'rgba(255, 255, 255, 0.15)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  padding: '7px 12px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease'
                }}
                title={lightboxZoomed ? "Zoom out to fit" : "Zoom in 100%"}
              >
                {lightboxZoomed ? <ZoomOut size={14} /> : <ZoomIn size={14} />}
                <span>{lightboxZoomed ? "Fit" : "100%"}</span>
              </button>

              {/* Direct Blob Download */}
              <button
                type="button"
                onClick={() => handleDownloadMedia(lightboxMedia.url, lightboxMedia.caption)}
                disabled={downloadingMedia}
                className="btn"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  padding: '7px 12px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease'
                }}
                title="Download high-resolution image to device"
              >
                <Download size={14} />
                <span>{downloadingMedia ? 'Downloading...' : 'Download'}</span>
              </button>

              {/* Full Size in New Tab */}
              <a
                href={lightboxMedia.url}
                target="_blank"
                rel="noreferrer"
                className="btn"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  padding: '7px 12px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  textDecoration: 'none',
                  borderRadius: '6px',
                  transition: 'background 0.15s ease'
                }}
                title="Open raw image in new tab"
              >
                <ExternalLink size={14} />
                <span>Full Size</span>
              </a>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  setLightboxMedia(null);
                  setLightboxZoomed(false);
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s ease'
                }}
                title="Close (Esc)"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Lightbox Center Image Canvas */}
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: lightboxZoomed ? 'auto' : 'hidden',
              padding: '10px'
            }}
          >
            <img
              src={lightboxMedia.url}
              alt={lightboxMedia.caption || "WhatsApp Photo"}
              onClick={() => setLightboxZoomed(prev => !prev)}
              style={{
                maxWidth: lightboxZoomed ? 'none' : '92vw',
                maxHeight: lightboxZoomed ? 'none' : '76vh',
                objectFit: 'contain',
                borderRadius: '8px',
                cursor: lightboxZoomed ? 'zoom-out' : 'zoom-in',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)',
                transition: 'transform 0.15s ease'
              }}
              title="Click photo to toggle 100% zoom"
            />

            {lightboxMedia.caption && (
              <div style={{
                marginTop: '14px',
                color: '#FFFFFF',
                background: 'rgba(0, 0, 0, 0.65)',
                padding: '8px 18px',
                borderRadius: '8px',
                maxWidth: '750px',
                textAlign: 'center',
                fontSize: '0.9rem',
                lineHeight: 1.45,
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255, 255, 255, 0.15)'
              }}>
                {lightboxMedia.caption}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Auto-Reply Bot Configuration Modal */}
      {showAutoReplyModal && (
        <div 
          onClick={() => setShowAutoReplyModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050,
            padding: '20px'
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '840px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #E5E5E8',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #E5E5E8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#F8FAF5',
              borderTopLeftRadius: '16px',
              borderTopRightRadius: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#EDF4E6',
                  color: '#2F5219',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #C3D1AC'
                }}>
                  <Bot size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#171719', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>Conversational Concierge & Auto-Reply Bot</span>
                    {autoReplySettings.enabled && (
                      <span style={{ fontSize: '0.7rem', color: '#2F5219', background: '#EDF4E6', padding: '1px 8px', borderRadius: '10px', fontWeight: 700, border: '1px solid #C3D1AC' }}>
                        Active
                      </span>
                    )}
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: '#67676B', margin: '2px 0 0 0' }}>
                    Customize interactive buttons, stay intake prompts, welcome greetings, and staff handoff for your property
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAutoReplyModal(false);
                      onNavigate('autoreply');
                    }}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '5px 10px', gap: '5px' }}
                    title="Open dedicated full-screen page"
                  >
                    <span>Full Screen Manager</span>
                    <ExternalLink size={13} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAutoReplyModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#96969C',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '6px'
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Navigation Tabs Bar */}
            <div style={{
              display: 'flex',
              borderBottom: '1px solid #E5E5E8',
              background: '#FAFAFA',
              padding: '4px 16px 0 16px',
              gap: '6px',
              overflowX: 'auto'
            }}>
              {[
                { id: 'mode', label: 'Engine & Mode', icon: Sliders },
                { id: 'welcome', label: 'Greeting & Quick Buttons', icon: Sparkles },
                { id: 'flow', label: 'Meta Flow & Intake', icon: FileText },
                { id: 'quote', label: 'Quote & Actions', icon: Layers },
                { id: 'handoff', label: 'Front Desk & Handoff', icon: Phone },
                { id: 'dynamic', label: '⚡ Dynamic Rules (Admin)', icon: Bot, adminOnly: true }
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = autoReplyActiveTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setAutoReplyActiveTab(tab.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '10px 14px',
                      fontSize: '0.825rem',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#2F5219' : '#67676B',
                      borderBottom: isActive ? '2px solid #2F5219' : '2px solid transparent',
                      background: 'none',
                      borderTop: 'none',
                      borderLeft: 'none',
                      borderRight: 'none',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Icon size={14} color={isActive ? '#2F5219' : '#96969C'} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Modal Body / Form */}
            {loadingAutoReply ? (
              <div style={{ padding: '50px 24px', textAlign: 'center', color: '#67676B' }}>
                <RefreshCw size={26} className="pulse-glow" style={{ margin: '0 auto 12px auto', color: '#2F5219' }} />
                <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>Loading bot configuration...</div>
              </div>
            ) : (
              <form onSubmit={handleSaveAutoReplySettings} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* TAB 1: Engine & Mode */}
                {autoReplyActiveTab === 'mode' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* Master Switch */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      background: autoReplySettings.enabled ? '#F3F6EE' : '#F5F5F6',
                      border: `1.5px solid ${autoReplySettings.enabled ? '#C3D1AC' : '#E5E5E8'}`
                    }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#171719', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>Enable Automated Concierge / Auto-Reply</span>
                          {autoReplySettings.enabled && (
                            <span style={{ fontSize: '0.7rem', color: '#2F5219', background: '#EDF4E6', padding: '1px 8px', borderRadius: '10px', fontWeight: 700 }}>
                              Active
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#67676B', marginTop: '2px' }}>
                          Automatically reply to incoming customer messages via WhatsApp Cloud API & In-App Web Chat
                        </div>
                      </div>

                      <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={autoReplySettings.enabled}
                          onChange={e => setAutoReplySettings({ ...autoReplySettings, enabled: e.target.checked })}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                          position: 'absolute',
                          cursor: 'pointer',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: autoReplySettings.enabled ? '#2F5219' : '#D4D4D9',
                          transition: '0.2s',
                          borderRadius: '24px'
                        }}>
                          <span style={{
                            position: 'absolute',
                            height: '18px',
                            width: '18px',
                            left: autoReplySettings.enabled ? '23px' : '3px',
                            bottom: '3px',
                            backgroundColor: 'white',
                            transition: '0.2s',
                            borderRadius: '50%',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                          }} />
                        </span>
                      </label>
                    </div>

                    {/* Bot Engine Mode Selector */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '8px' }}>
                        Bot Intelligence Engine Mode
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {/* Option 1: Hospitality Flow */}
                        <div
                          onClick={() => setAutoReplySettings({ ...autoReplySettings, engineMode: 'HOSPITALITY_FLOW' })}
                          style={{
                            border: autoReplySettings.engineMode === 'HOSPITALITY_FLOW' ? '2px solid #2F5219' : '1px solid #E5E5E8',
                            background: autoReplySettings.engineMode === 'HOSPITALITY_FLOW' ? '#F8FAF5' : '#FFFFFF',
                            borderRadius: '12px',
                            padding: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                  type="radio"
                                  name="botEngineMode"
                                  checked={autoReplySettings.engineMode === 'HOSPITALITY_FLOW'}
                                  onChange={() => setAutoReplySettings({ ...autoReplySettings, engineMode: 'HOSPITALITY_FLOW' })}
                                  style={{ accentColor: '#2F5219' }}
                                />
                                <span style={{ fontWeight: 800, fontSize: '0.875rem', color: '#171719' }}>
                                  🌟 Hospitality Concierge (Interactive Flow)
                                </span>
                              </div>
                            </div>
                            <p style={{ fontSize: '0.78rem', color: '#67676B', margin: '4px 0 0 24px', lineHeight: 1.45 }}>
                              Full conversational flow: checks real-time room availability, presents live quotes, interactive buttons, dining menu, location map, and automatically creates CRM bookings.
                            </p>
                          </div>
                          <div style={{ marginTop: '10px', marginLeft: '24px' }}>
                            <span style={{ fontSize: '0.675rem', fontWeight: 700, background: '#EDF4E6', color: '#2F5219', padding: '2px 8px', borderRadius: '6px', border: '1px solid #C3D1AC' }}>
                              RECOMMENDED FOR RESORTS & HOTELS
                            </span>
                          </div>
                        </div>

                        {/* Option 2: Simple Greeting */}
                        <div
                          onClick={() => setAutoReplySettings({ ...autoReplySettings, engineMode: 'SIMPLE_GREETING' })}
                          style={{
                            border: autoReplySettings.engineMode === 'SIMPLE_GREETING' ? '2px solid #2F5219' : '1px solid #E5E5E8',
                            background: autoReplySettings.engineMode === 'SIMPLE_GREETING' ? '#F8FAF5' : '#FFFFFF',
                            borderRadius: '12px',
                            padding: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                              <input
                                type="radio"
                                name="botEngineMode"
                                checked={autoReplySettings.engineMode === 'SIMPLE_GREETING'}
                                onChange={() => setAutoReplySettings({ ...autoReplySettings, engineMode: 'SIMPLE_GREETING' })}
                                style={{ accentColor: '#2F5219' }}
                              />
                              <span style={{ fontWeight: 800, fontSize: '0.875rem', color: '#171719' }}>
                                💬 Simple Auto-Reply Greeting
                              </span>
                            </div>
                            <p style={{ fontSize: '0.78rem', color: '#67676B', margin: '4px 0 0 24px', lineHeight: 1.45 }}>
                              Standard away/welcome message sent to customers without running booking engine calculations or sending interactive stay options.
                            </p>
                          </div>
                          <div style={{ marginTop: '10px', marginLeft: '24px' }}>
                            <span style={{ fontSize: '0.675rem', fontWeight: 600, background: '#F1F5F9', color: '#64748B', padding: '2px 8px', borderRadius: '6px' }}>
                              BASIC AUTO-REPLY
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* WhatsApp Flow Selection for Value Collection */}
                    {autoReplySettings.engineMode === 'HOSPITALITY_FLOW' && (
                      <div style={{ background: '#FFFFFF', border: '1px solid #E5E5E8', borderRadius: '12px', padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#171719', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>📱 WhatsApp Flow Screen for Customer Intake</span>
                            <span style={{ fontSize: '0.675rem', fontWeight: 700, background: '#EDF4E6', color: '#2F5219', padding: '2px 8px', borderRadius: '6px', border: '1px solid #C3D1AC' }}>
                              In-App Form
                            </span>
                          </label>
                          <a href="/flows" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: '#2F5219', textDecoration: 'none', fontWeight: 600 }}>
                            Manage Flows ↗
                          </a>
                        </div>
                        <p style={{ fontSize: '0.78rem', color: '#67676B', margin: '0 0 10px 0', lineHeight: 1.45 }}>
                          When a customer inquires about availability, dates, or booking, the concierge bot dispatches this published WhatsApp Flow screen to collect stay dates, guest counts, and room choices natively in WhatsApp.
                        </p>
                        <select
                          value={autoReplySettings.selectedFlowId || ''}
                          onChange={e => setAutoReplySettings({ ...autoReplySettings, selectedFlowId: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            border: '1.5px solid #D4D4D9',
                            fontSize: '0.85rem',
                            color: '#171719',
                            background: '#FFFFFF',
                            outline: 'none',
                            fontWeight: 500
                          }}
                        >
                          <option value="">✨ Auto-Detect (Default Stay & Booking Flow)</option>
                          {publishedFlows.map(f => (
                            <option key={f.id} value={f.id}>
                              {f.name} {f.meta_flow_id ? `(Meta ID: ${f.meta_flow_id})` : ''} - {f.status}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Frequency (Deduplication) */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '8px' }}>
                        Automated Reply Frequency (Deduplication)
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div
                          onClick={() => setAutoReplySettings({ ...autoReplySettings, mode: 'ONCE_PER_CONTACT' })}
                          style={{
                            border: autoReplySettings.mode === 'ONCE_PER_CONTACT' ? '2px solid #2F5219' : '1px solid #E5E5E8',
                            background: autoReplySettings.mode === 'ONCE_PER_CONTACT' ? '#F8FAF5' : '#FFFFFF',
                            borderRadius: '10px',
                            padding: '12px 14px',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                            <input
                              type="radio"
                              name="autoReplyFreq"
                              checked={autoReplySettings.mode === 'ONCE_PER_CONTACT'}
                              onChange={() => setAutoReplySettings({ ...autoReplySettings, mode: 'ONCE_PER_CONTACT' })}
                              style={{ accentColor: '#2F5219' }}
                            />
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#171719' }}>
                              Once Ever per Contact
                            </span>
                          </div>
                          <p style={{ fontSize: '0.75rem', color: '#67676B', margin: '0 0 0 22px' }}>
                            Sends strictly once when a new contact reaches out for the first time.
                          </p>
                        </div>

                        <div
                          onClick={() => setAutoReplySettings({ ...autoReplySettings, mode: 'ONCE_PER_24_HOURS' })}
                          style={{
                            border: autoReplySettings.mode === 'ONCE_PER_24_HOURS' ? '2px solid #2F5219' : '1px solid #E5E5E8',
                            background: autoReplySettings.mode === 'ONCE_PER_24_HOURS' ? '#F8FAF5' : '#FFFFFF',
                            borderRadius: '10px',
                            padding: '12px 14px',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                            <input
                              type="radio"
                              name="autoReplyFreq"
                              checked={autoReplySettings.mode === 'ONCE_PER_24_HOURS'}
                              onChange={() => setAutoReplySettings({ ...autoReplySettings, mode: 'ONCE_PER_24_HOURS' })}
                              style={{ accentColor: '#2F5219' }}
                            />
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#171719' }}>
                              At Most Once per 24 Hours
                            </span>
                          </div>
                          <p style={{ fontSize: '0.75rem', color: '#67676B', margin: '0 0 0 22px' }}>
                            Resends greeting if customer messages on another day after 24h.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: Welcome Greeting & Quick Buttons */}
                {autoReplyActiveTab === 'welcome' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* Business Name */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '6px' }}>
                        Business / Property Display Name
                      </label>
                      <input
                        type="text"
                        className="saas-input"
                        value={autoReplySettings.businessName || ''}
                        onChange={e => setAutoReplySettings({ ...autoReplySettings, businessName: e.target.value })}
                        placeholder="Your Business / Property Name"
                        style={{ width: '100%', fontSize: '0.85rem', padding: '9px 12px' }}
                      />
                      <span style={{ fontSize: '0.72rem', color: '#96969C', marginTop: '4px', display: 'block' }}>
                        Inserted into customer messages via <code>{`{{business_name}}`}</code>.
                      </span>
                    </div>

                    {/* Welcome Greeting Template */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                        <label style={{ fontSize: '0.825rem', fontWeight: 700, color: '#3A3A3E' }}>
                          Welcome Greeting Message
                        </label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              const cur = autoReplySettings.welcomeMessage || '';
                              setAutoReplySettings({ ...autoReplySettings, welcomeMessage: cur + ' {{name}} ' });
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '2px 8px', fontSize: '0.72rem', fontWeight: 600 }}
                          >
                            + <code>{`{{name}}`}</code>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const cur = autoReplySettings.welcomeMessage || '';
                              setAutoReplySettings({ ...autoReplySettings, welcomeMessage: cur + ' *{{business_name}}* ' });
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '2px 8px', fontSize: '0.72rem', fontWeight: 600 }}
                          >
                            + <code>{`{{business_name}}`}</code>
                          </button>
                        </div>
                      </div>

                      <textarea
                        rows={3}
                        className="saas-input"
                        value={autoReplySettings.welcomeMessage || ''}
                        onChange={e => setAutoReplySettings({ ...autoReplySettings, welcomeMessage: e.target.value })}
                        placeholder="👋 Hello {{name}}! Welcome to *{{business_name}}*.\n\nHow can we help you today? Select an option below or reply with your travel dates to check real-time availability and live rates! 👇"
                        style={{ width: '100%', resize: 'vertical', fontSize: '0.85rem', lineHeight: 1.45, padding: '10px 12px' }}
                      />
                      <span style={{ fontSize: '0.72rem', color: '#96969C', marginTop: '4px', display: 'block' }}>
                        Dispatched when a guest says &ldquo;Hi&rdquo;, clicks a Click-to-Chat link, or visits the booking concierge.
                      </span>
                    </div>

                    {/* The 3 Welcome Interactive Quick Buttons */}
                    <div style={{
                      background: '#F8FAF5',
                      border: '1px solid #C3D1AC',
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.875rem', color: '#2F5219' }}>
                            WhatsApp Interactive Quick Buttons (Max 3 Buttons, 20 Chars Limit)
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#67676B', marginTop: '2px' }}>
                            Shown immediately below the welcome greeting on WhatsApp for instant one-tap responses
                          </div>
                        </div>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, background: '#EDF4E6', color: '#2F5219', padding: '2px 8px', borderRadius: '6px' }}>
                          META COMPLIANT
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                        {/* Button 1 */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3A3A3E' }}>Button 1 (Weekend)</label>
                            <span style={{
                              fontSize: '0.675rem',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: '6px',
                              background: String(autoReplySettings.button1 || '').length > 20 ? '#FEE2E2' : '#F1F5F9',
                              color: String(autoReplySettings.button1 || '').length > 20 ? '#B91C1C' : '#64748B'
                            }}>
                              {String(autoReplySettings.button1 || '').length}/20 chars
                            </span>
                          </div>
                          <input
                            type="text"
                            maxLength={20}
                            className="saas-input"
                            value={autoReplySettings.button1 || ''}
                            onChange={e => setAutoReplySettings({ ...autoReplySettings, button1: e.target.value })}
                            placeholder="This Weekend"
                            style={{ width: '100%', fontSize: '0.825rem', padding: '8px 10px' }}
                          />
                          <span style={{ fontSize: '0.7rem', color: '#96969C', marginTop: '3px', display: 'block' }}>
                            Triggers weekend stay rates
                          </span>
                        </div>

                        {/* Button 2 */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3A3A3E' }}>Button 2 (Tomorrow)</label>
                            <span style={{
                              fontSize: '0.675rem',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: '6px',
                              background: String(autoReplySettings.button2 || '').length > 20 ? '#FEE2E2' : '#F1F5F9',
                              color: String(autoReplySettings.button2 || '').length > 20 ? '#B91C1C' : '#64748B'
                            }}>
                              {String(autoReplySettings.button2 || '').length}/20 chars
                            </span>
                          </div>
                          <input
                            type="text"
                            maxLength={20}
                            className="saas-input"
                            value={autoReplySettings.button2 || ''}
                            onChange={e => setAutoReplySettings({ ...autoReplySettings, button2: e.target.value })}
                            placeholder="Tomorrow (2 N)"
                            style={{ width: '100%', fontSize: '0.825rem', padding: '8px 10px' }}
                          />
                          <span style={{ fontSize: '0.7rem', color: '#96969C', marginTop: '3px', display: 'block' }}>
                            Triggers 2-night stay rates
                          </span>
                        </div>

                        {/* Button 3 */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3A3A3E' }}>Button 3 (Handoff)</label>
                            <span style={{
                              fontSize: '0.675rem',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: '6px',
                              background: String(autoReplySettings.button3 || '').length > 20 ? '#FEE2E2' : '#F1F5F9',
                              color: String(autoReplySettings.button3 || '').length > 20 ? '#B91C1C' : '#64748B'
                            }}>
                              {String(autoReplySettings.button3 || '').length}/20 chars
                            </span>
                          </div>
                          <input
                            type="text"
                            maxLength={20}
                            className="saas-input"
                            value={autoReplySettings.button3 || ''}
                            onChange={e => setAutoReplySettings({ ...autoReplySettings, button3: e.target.value })}
                            placeholder="Talk to Staff"
                            style={{ width: '100%', fontSize: '0.825rem', padding: '8px 10px' }}
                          />
                          <span style={{ fontSize: '0.7rem', color: '#96969C', marginTop: '3px', display: 'block' }}>
                            Triggers staff takeover
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB: Meta Flow & Intake Screen */}
                {autoReplyActiveTab === 'flow' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* Active Flow Header Card */}
                    <div style={{
                      background: '#F8FAF5',
                      border: '1px solid #C3D1AC',
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '10px',
                          background: '#EDF4E6',
                          color: '#2F5219',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <FileText size={20} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.925rem', color: '#171719' }}>
                              WhatsApp Native Flow & Data Intake
                            </span>
                            <span style={{ fontSize: '0.675rem', fontWeight: 700, background: '#EDF4E6', color: '#2F5219', padding: '2px 8px', borderRadius: '6px', border: '1px solid #C3D1AC' }}>
                              META NATIVE
                            </span>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#67676B', marginTop: '2px' }}>
                            Collect dates, room choices, guest counts, and customer requests natively inside WhatsApp
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsCreateFlowModalOpen(true)}
                        className="btn btn-primary"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 14px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          borderRadius: '8px'
                        }}
                      >
                        <PlusCircle size={15} />
                        <span>⚡ Create Flow from Here</span>
                      </button>
                    </div>

                    {/* Active Flow Selector */}
                    <div style={{
                      background: '#FFFFFF',
                      border: '1px solid #E5E5E8',
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px'
                    }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '6px' }}>
                          Select Active Flow for Concierge Bot
                        </label>
                        <select
                          className="saas-input"
                          value={autoReplySettings.selectedFlowId || 'flow_hospitality_booking'}
                          onChange={e => setAutoReplySettings({ ...autoReplySettings, selectedFlowId: e.target.value })}
                          style={{ width: '100%', fontSize: '0.85rem', padding: '9px 12px' }}
                        >
                          {publishedFlows.map(f => (
                            <option key={f.id} value={f.id}>
                              {f.name} {f.meta_flow_id ? `(ID: ${f.meta_flow_id})` : ''} - [{f.status}]
                            </option>
                          ))}
                          <option value="flow_hospitality_booking">Booking & Enquiry Flow (Default)</option>
                        </select>
                        <span style={{ fontSize: '0.72rem', color: '#96969C', marginTop: '4px', display: 'block' }}>
                          When a customer asks for dates or rooms, the concierge bot automatically triggers this Flow screen.
                        </span>
                      </div>

                      {/* Call-to-Action Button Label */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <label style={{ fontSize: '0.825rem', fontWeight: 700, color: '#3A3A3E' }}>
                            WhatsApp Flow CTA Button Text (Max 20 chars)
                          </label>
                          <span style={{
                            fontSize: '0.675rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '6px',
                            background: String(autoReplySettings.flowCta || 'Select Dates & Room').length > 20 ? '#FEE2E2' : '#F1F5F9',
                            color: String(autoReplySettings.flowCta || 'Select Dates & Room').length > 20 ? '#B91C1C' : '#64748B'
                          }}>
                            {String(autoReplySettings.flowCta || 'Select Dates & Room').length}/20 chars
                          </span>
                        </div>
                        <input
                          type="text"
                          maxLength={20}
                          className="saas-input"
                          value={autoReplySettings.flowCta || 'Select Dates & Room'}
                          onChange={e => setAutoReplySettings({ ...autoReplySettings, flowCta: e.target.value })}
                          placeholder="Select Dates & Room"
                          style={{ width: '100%', fontSize: '0.85rem', padding: '9px 12px' }}
                        />
                        <span style={{ fontSize: '0.72rem', color: '#96969C', marginTop: '4px', display: 'block' }}>
                          The action button attached to the WhatsApp invitation message that opens the interactive Flow screen.
                        </span>
                      </div>

                      {/* Info on Collected Intake Values */}
                      <div style={{
                        background: '#F8FAF5',
                        border: '1px dashed #C3D1AC',
                        borderRadius: '10px',
                        padding: '12px 14px'
                      }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#2F5219', marginBottom: '4px' }}>
                          ✓ Automatic Intake Data Processing & Validation:
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#4A5568', lineHeight: 1.5 }}>
                          • <strong>Check-in & Check-out:</strong> Validates date sequence, calculates nights duration, and checks live villa inventory.<br />
                          • <strong>Room Category:</strong> Matches guest preference against pricing tiers and generates instant quotes.<br />
                          • <strong>CRM Integration:</strong> Automatically captures guest name, creates booking enquiries (#ENQ-...), and logs opt-in consent.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: Quote & Booking Actions */}
                {autoReplyActiveTab === 'quote' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* Section 1: Itemized Quote Buttons */}
                    <div style={{
                      background: '#FFFFFF',
                      border: '1px solid #E5E5E8',
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.875rem', color: '#171719' }}>
                          Quote Presentation Stage Buttons
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#67676B', marginTop: '2px' }}>
                          Buttons attached when the bot calculates and presents estimated stay rates (max 20 chars per Meta API)
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3A3A3E' }}>Confirm Button</label>
                            <span style={{ fontSize: '0.675rem', fontWeight: 700, color: '#64748B' }}>
                              {String(autoReplySettings.quoteConfirm || '').length}/20
                            </span>
                          </div>
                          <input
                            type="text"
                            maxLength={20}
                            className="saas-input"
                            value={autoReplySettings.quoteConfirm || ''}
                            onChange={e => setAutoReplySettings({ ...autoReplySettings, quoteConfirm: e.target.value })}
                            placeholder="Confirm Booking"
                            style={{ width: '100%', fontSize: '0.825rem', padding: '8px 10px' }}
                          />
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3A3A3E' }}>Change Dates Button</label>
                            <span style={{ fontSize: '0.675rem', fontWeight: 700, color: '#64748B' }}>
                              {String(autoReplySettings.quoteModify || '').length}/20
                            </span>
                          </div>
                          <input
                            type="text"
                            maxLength={20}
                            className="saas-input"
                            value={autoReplySettings.quoteModify || ''}
                            onChange={e => setAutoReplySettings({ ...autoReplySettings, quoteModify: e.target.value })}
                            placeholder="Change Dates"
                            style={{ width: '100%', fontSize: '0.825rem', padding: '8px 10px' }}
                          />
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3A3A3E' }}>Other Rooms Button</label>
                            <span style={{ fontSize: '0.675rem', fontWeight: 700, color: '#64748B' }}>
                              {String(autoReplySettings.quoteRooms || '').length}/20
                            </span>
                          </div>
                          <input
                            type="text"
                            maxLength={20}
                            className="saas-input"
                            value={autoReplySettings.quoteRooms || ''}
                            onChange={e => setAutoReplySettings({ ...autoReplySettings, quoteRooms: e.target.value })}
                            placeholder="Other Rooms"
                            style={{ width: '100%', fontSize: '0.825rem', padding: '8px 10px' }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Post-Confirmation Follow-Up Buttons */}
                    <div style={{
                      background: '#F8FAF5',
                      border: '1px solid #C3D1AC',
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.875rem', color: '#2F5219' }}>
                          Post-Confirmation Exploration Buttons
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#67676B', marginTop: '2px' }}>
                          Buttons shown right after booking enquiry is created so guests can explore resort amenities, food menu, and directions
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3A3A3E' }}>Follow-up 1 (Amenities)</label>
                            <span style={{ fontSize: '0.675rem', fontWeight: 700, color: '#64748B' }}>
                              {String(autoReplySettings.confirmedButton1 || '').length}/20
                            </span>
                          </div>
                          <input
                            type="text"
                            maxLength={20}
                            className="saas-input"
                            value={autoReplySettings.confirmedButton1 || ''}
                            onChange={e => setAutoReplySettings({ ...autoReplySettings, confirmedButton1: e.target.value })}
                            placeholder="Facilities"
                            style={{ width: '100%', fontSize: '0.825rem', padding: '8px 10px' }}
                          />
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3A3A3E' }}>Follow-up 2 (Dining)</label>
                            <span style={{ fontSize: '0.675rem', fontWeight: 700, color: '#64748B' }}>
                              {String(autoReplySettings.confirmedButton2 || '').length}/20
                            </span>
                          </div>
                          <input
                            type="text"
                            maxLength={20}
                            className="saas-input"
                            value={autoReplySettings.confirmedButton2 || ''}
                            onChange={e => setAutoReplySettings({ ...autoReplySettings, confirmedButton2: e.target.value })}
                            placeholder="Dining Menu"
                            style={{ width: '100%', fontSize: '0.825rem', padding: '8px 10px' }}
                          />
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3A3A3E' }}>Follow-up 3 (Directions)</label>
                            <span style={{ fontSize: '0.675rem', fontWeight: 700, color: '#64748B' }}>
                              {String(autoReplySettings.confirmedButton3 || '').length}/20
                            </span>
                          </div>
                          <input
                            type="text"
                            maxLength={20}
                            className="saas-input"
                            value={autoReplySettings.confirmedButton3 || ''}
                            onChange={e => setAutoReplySettings({ ...autoReplySettings, confirmedButton3: e.target.value })}
                            placeholder="Location / Map"
                            style={{ width: '100%', fontSize: '0.825rem', padding: '8px 10px' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: Front Desk & Staff Handoff */}
                {autoReplyActiveTab === 'handoff' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* Front Desk Phone */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '6px' }}>
                        Front Desk Reception Phone Number
                      </label>
                      <input
                        type="text"
                        className="saas-input"
                        value={autoReplySettings.handoffPhone || ''}
                        onChange={e => setAutoReplySettings({ ...autoReplySettings, handoffPhone: e.target.value })}
                        placeholder="+91 87665 90634"
                        style={{ width: '100%', fontSize: '0.85rem', padding: '9px 12px' }}
                      />
                      <span style={{ fontSize: '0.72rem', color: '#96969C', marginTop: '4px', display: 'block' }}>
                        Customer can tap to dial directly when requesting human concierge or urgent assistance.
                      </span>
                    </div>

                    {/* Staff Handoff Message Template */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                        <label style={{ fontSize: '0.825rem', fontWeight: 700, color: '#3A3A3E' }}>
                          Staff Handoff Message
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const cur = autoReplySettings.handoffMessage || '';
                            setAutoReplySettings({ ...autoReplySettings, handoffMessage: cur + ' {{phone}} ' });
                          }}
                          className="btn btn-secondary"
                          style={{ padding: '2px 8px', fontSize: '0.72rem', fontWeight: 600 }}
                        >
                          + <code>{`{{phone}}`}</code>
                        </button>
                      </div>

                      <textarea
                        rows={3}
                        className="saas-input"
                        value={autoReplySettings.handoffMessage || ''}
                        onChange={e => setAutoReplySettings({ ...autoReplySettings, handoffMessage: e.target.value })}
                        placeholder="🤝 *Connecting You with Our Front Desk*\n\nOur reservations staff has been alerted and will message you directly on this chat shortly.\n\n📞 For urgent queries, call us directly at {{phone}}."
                        style={{ width: '100%', resize: 'vertical', fontSize: '0.85rem', lineHeight: 1.45, padding: '10px 12px' }}
                      />
                    </div>

                    {/* Bot Pause Duration on Staff Reply */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '6px' }}>
                        Staff Takeover Bot Pause Duration
                      </label>
                      <select
                        className="saas-input"
                        value={autoReplySettings.takeoverPauseMinutes || 60}
                        onChange={e => setAutoReplySettings({ ...autoReplySettings, takeoverPauseMinutes: parseInt(e.target.value, 10) })}
                        style={{ width: '100%', fontSize: '0.85rem', padding: '9px 12px' }}
                      >
                        <option value={15}>15 Minutes</option>
                        <option value={30}>30 Minutes</option>
                        <option value={60}>60 Minutes (1 Hour - Recommended)</option>
                        <option value={120}>120 Minutes (2 Hours)</option>
                        <option value={1440}>24 Hours (Full Day)</option>
                      </select>
                      <span style={{ fontSize: '0.72rem', color: '#96969C', marginTop: '4px', display: 'block' }}>
                        When a staff member replies manually or the guest clicks &ldquo;Talk to Staff&rdquo;, automated bot replies are paused for this duration.
                      </span>
                    </div>
                  </div>
                )}

                {/* TAB 5: Dynamic Rules & Programmable Actions (Admin) */}
                {autoReplyActiveTab === 'dynamic' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* Admin Access Banner */}
                    <div style={{
                      background: 'linear-gradient(135deg, #F8FAF5 0%, #EDF4E6 100%)',
                      border: '1px solid #C3D1AC',
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '10px',
                          background: '#2F5219',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Bot size={22} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#171719' }}>
                              Dynamic Concierge Rules & Programmable Actions
                            </span>
                            <span style={{
                              fontSize: '0.68rem',
                              background: '#2F5219',
                              color: '#FFFFFF',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              fontWeight: 700,
                              letterSpacing: '0.04em'
                            }}>
                              ADMIN EXCLUSIVE
                            </span>
                          </div>
                          <span style={{ fontSize: '0.78rem', color: '#67676B', marginTop: '2px', display: 'block' }}>
                            Create custom trigger keywords, custom replies, Meta Flows, and follow-up buttons with complete programming freedom.
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenDynOptionModal(null)}
                        className="btn btn-action-green"
                        style={{ padding: '8px 16px', fontSize: '0.825rem', gap: '6px' }}
                      >
                        <PlusCircle size={15} />
                        <span>+ Create Custom Option</span>
                      </button>
                    </div>

                    {/* Starter Templates Fast-Add Row */}
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={14} color="#2F5219" />
                        <span>1-Click Starter Templates (Add & Customize)</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {DYNAMIC_STARTER_TEMPLATES.map((tpl, tIdx) => {
                          const alreadyExists = (autoReplySettings.dynamicOptions || []).some(o => o.title === tpl.title);
                          return (
                            <button
                              key={tIdx}
                              type="button"
                              onClick={() => handleApplyStarterTemplate(tpl)}
                              disabled={alreadyExists}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                border: alreadyExists ? '1px dashed #D4D4D9' : '1px solid #C3D1AC',
                                background: alreadyExists ? '#F5F5F6' : '#FFFFFF',
                                color: alreadyExists ? '#96969C' : '#2F5219',
                                cursor: alreadyExists ? 'default' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                              title={alreadyExists ? "Already added" : "Click to add this dynamic rule"}
                            >
                              <span>+ {tpl.title}</span>
                              {alreadyExists && <Check size={12} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Dynamic Rules List / Cards */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <label style={{ fontSize: '0.825rem', fontWeight: 800, color: '#3A3A3E' }}>
                          Active Dynamic Rules ({(autoReplySettings.dynamicOptions || []).length})
                        </label>
                        <span style={{ fontSize: '0.72rem', color: '#67676B' }}>
                          Rules are evaluated in order of matching priority.
                        </span>
                      </div>

                      {(!autoReplySettings.dynamicOptions || autoReplySettings.dynamicOptions.length === 0) ? (
                        <div style={{
                          padding: '30px 16px',
                          textAlign: 'center',
                          background: '#F9FAFB',
                          border: '1.5px dashed #E5E5E8',
                          borderRadius: '12px',
                          color: '#67676B'
                        }}>
                          <Bot size={32} style={{ color: '#96969C', margin: '0 auto 8px auto' }} />
                          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#3A3A3E' }}>No Dynamic Rules Configured Yet</div>
                          <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>
                            Click &ldquo;+ Create Custom Option&rdquo; or pick one of the 1-click starter templates above to begin customizing.
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {(autoReplySettings.dynamicOptions || []).map((dyn, idx) => (
                            <div
                              key={dyn.id || idx}
                              style={{
                                background: dyn.active !== false ? '#FFFFFF' : '#FAFAFA',
                                border: dyn.active !== false ? '1px solid #C3D1AC' : '1px solid #E5E5E8',
                                borderRadius: '10px',
                                padding: '14px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px',
                                boxShadow: dyn.active !== false ? '0 1px 3px rgba(47, 82, 25, 0.05)' : 'none',
                                opacity: dyn.active !== false ? 1 : 0.75
                              }}
                            >
                              {/* Row 1: Header & Badges */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleDynamicOption(dyn.id)}
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: '12px',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                      border: 'none',
                                      cursor: 'pointer',
                                      background: dyn.active !== false ? '#EDF4E6' : '#EEEEF0',
                                      color: dyn.active !== false ? '#2F5219' : '#67676B'
                                    }}
                                  >
                                    {dyn.active !== false ? '● ACTIVE' : '○ PAUSED'}
                                  </button>

                                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#171719' }}>
                                    {dyn.title}
                                  </span>

                                  {dyn.buttonLabel && (
                                    <span style={{
                                      fontSize: '0.72rem',
                                      background: '#F1F5F9',
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                      color: '#475569',
                                      fontWeight: 600
                                    }}>
                                      Button: &ldquo;{dyn.buttonLabel}&rdquo;
                                    </span>
                                  )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{
                                    fontSize: '0.68rem',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    background: '#EFF6FF',
                                    color: '#2876B8',
                                    border: '1px solid #BFDBFE',
                                    fontWeight: 700
                                  }}>
                                    {dyn.actionType === 'REPLY_TEXT' && '💬 Text Message'}
                                    {dyn.actionType === 'DISPATCH_FLOW' && '📋 Meta Flow'}
                                    {dyn.actionType === 'OPEN_URL' && '🌐 Web Link'}
                                    {dyn.actionType === 'STAFF_TAKEOVER' && '📞 Staff Takeover'}
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDynPreviewOptionId(dyn.id);
                                      setPreviewStage('dynamic');
                                    }}
                                    className="btn btn-secondary"
                                    style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
                                    title="Test this rule in the live preview"
                                  >
                                    <Play size={12} />
                                    <span>Preview</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenDynOptionModal(dyn)}
                                    className="btn btn-secondary"
                                    style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
                                  >
                                    <Edit3 size={12} />
                                    <span>Edit</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDynamicOption(dyn.id)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#DC2626',
                                      cursor: 'pointer',
                                      padding: '4px',
                                      display: 'flex',
                                      alignItems: 'center'
                                    }}
                                    title="Delete rule"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>

                              {/* Row 2: Trigger Keywords */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#67676B' }}>
                                  Triggers ({dyn.matchType || 'CONTAINS'}):
                                </span>
                                {(dyn.triggers || '').split(',').map(t => t.trim()).filter(Boolean).map((trig, tIdx) => (
                                  <span
                                    key={tIdx}
                                    style={{
                                      background: '#F8FAF5',
                                      border: '1px solid #C3D1AC',
                                      borderRadius: '4px',
                                      padding: '1px 6px',
                                      fontSize: '0.7rem',
                                      color: '#2F5219',
                                      fontWeight: 600
                                    }}
                                  >
                                    {trig}
                                  </span>
                                ))}
                              </div>

                              {/* Row 3: Response Text or Target Preview */}
                              <div style={{
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '6px',
                                padding: '8px 10px',
                                fontSize: '0.78rem',
                                color: '#334155',
                                whiteSpace: 'pre-wrap',
                                maxHeight: '70px',
                                overflowY: 'auto',
                                lineHeight: 1.4
                              }}>
                                {dyn.actionType === 'REPLY_TEXT' && (dyn.responseText || 'No response text configured.')}
                                {dyn.actionType === 'DISPATCH_FLOW' && `🚀 Dispatches WhatsApp Flow: ${publishedFlows.find(f => f.id === dyn.flowId)?.name || dyn.flowId || 'Default Flow'}`}
                                {dyn.actionType === 'OPEN_URL' && `🌐 Opens URL: ${dyn.url || 'Not set'}\n${dyn.responseText || ''}`}
                                {dyn.actionType === 'STAFF_TAKEOVER' && `📞 Alerts front desk & pauses bot for ${autoReplySettings.takeoverPauseMinutes || 60} minutes`}
                              </div>

                              {/* Follow-up Buttons Preview */}
                              {Array.isArray(dyn.followUpButtons) && dyn.followUpButtons.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '0.7rem', color: '#96969C', fontWeight: 600 }}>Follow-up Buttons:</span>
                                  {dyn.followUpButtons.map((fb, fIdx) => (
                                    <span
                                      key={fIdx}
                                      style={{
                                        fontSize: '0.7rem',
                                        background: '#EDF4E6',
                                        border: '1px solid #C3D1AC',
                                        color: '#2F5219',
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        fontWeight: 700
                                      }}
                                    >
                                      {fb.title || fb.label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* REAL-TIME WHATSAPP & WEB LIVE PREVIEW */}
                <div style={{
                  borderTop: '1px solid #EEEEF0',
                  paddingTop: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Smartphone size={14} color="#2F5219" />
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#3A3A3E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Live WhatsApp & Web Preview
                      </span>
                    </div>

                    {/* Stage Switcher Pills */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[
                        { id: 'welcome', label: '👋 Greeting' },
                        { id: 'flow', label: '📋 Flow Screen' },
                        { id: 'quote', label: '💰 Quote' },
                        { id: 'confirmed', label: '🎉 Confirmed' },
                        { id: 'handoff', label: '📞 Handoff' },
                        { id: 'dynamic', label: '⚡ Dynamic Rule' }
                      ].map(st => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setPreviewStage(st.id)}
                          style={{
                            padding: '3px 8px',
                            fontSize: '0.72rem',
                            fontWeight: previewStage === st.id ? 700 : 500,
                            borderRadius: '6px',
                            border: previewStage === st.id ? '1px solid #2F5219' : '1px solid #E5E5E8',
                            background: previewStage === st.id ? '#EDF4E6' : '#FFFFFF',
                            color: previewStage === st.id ? '#2F5219' : '#67676B',
                            cursor: 'pointer'
                          }}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* WhatsApp Message Bubble Simulation */}
                  <div style={{
                    background: '#ECE5DD',
                    borderRadius: '12px',
                    padding: '16px',
                    border: '1px solid #E5E5E8',
                    display: 'flex',
                    justifyContent: 'flex-start'
                  }}>
                    <div style={{
                      background: '#FFFFFF',
                      borderRadius: '0 10px 10px 10px',
                      padding: '12px 14px',
                      maxWidth: '92%',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '4px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#2F5219' }}>
                          {previewStage === 'welcome' && 'Plan Your Stay'}
                          {previewStage === 'flow' && 'Booking Intake Flow'}
                          {previewStage === 'quote' && 'Estimated Price Quote'}
                          {previewStage === 'confirmed' && 'Inquiry Submitted'}
                          {previewStage === 'handoff' && 'Connecting to Front Desk'}
                          {previewStage === 'dynamic' && 'Dynamic Programmable Action'}
                        </span>
                        <span style={{ fontSize: '0.675rem', color: '#94A3B8' }}>WhatsApp Verified</span>
                      </div>

                      {/* Body */}
                      <div style={{ fontSize: '0.825rem', color: '#171719', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                        {previewStage === 'welcome' && (
                          (autoReplySettings.welcomeMessage || '')
                            .replace(/\{\{name\}\}/gi, 'Shivam')
                            .replace(/\{\{business_name\}\}/gi, autoReplySettings.businessName || 'KonkanTrip Beach Resort & Spa')
                        )}
                        {previewStage === 'flow' && (
                          `👋 *Plan Your Stay - Room & Date Selection*\n\nPlease tap the button below to pick your check-in dates, guest count, and preferred room type:`
                        )}
                        {previewStage === 'quote' && (
                          simulatorQuote ? (
                            `🏷️ *${simulatorQuote.room}* - ${simulatorQuote.nights} Night${simulatorQuote.nights > 1 ? 's' : ''} Stay\n📅 *Dates*: ${simulatorQuote.check_in} to ${simulatorQuote.check_out} (${simulatorQuote.nights} Night${simulatorQuote.nights > 1 ? 's' : ''})\n👥 *Guests*: ${simulatorQuote.adults} Adults${simulatorQuote.children && simulatorQuote.children !== '0' ? `, ${simulatorQuote.children} Children` : ''}\n💰 *Total Quote*: ₹${simulatorQuote.total.toLocaleString('en-IN')} (Incl. Taxes & Breakfast)\n\n👇 Ready to confirm your room or explore other options?`
                          ) : (
                            `🏷️ *Deluxe Sea View Room* - 2 Nights Stay\n📅 *Dates*: 21 Nov - 23 Nov (2 Nights)\n👥 *Guests*: 2 Adults\n💰 *Total Quote*: ₹9,000 (Incl. Taxes & Breakfast)\n\n👇 Ready to confirm your room or explore other options?`
                          )
                        )}
                        {previewStage === 'confirmed' && (
                          simulatorQuote ? (
                            `🎉 *Stay Inquiry Submitted!*\n\nEnquiry ID: *#ENQ-1236*\nGuest: *${simulatorQuote.guest_name}*\nRoom: *${simulatorQuote.room}*\nDates: *${simulatorQuote.check_in} to ${simulatorQuote.check_out}* (${simulatorQuote.nights} Night${simulatorQuote.nights > 1 ? 's' : ''})\nTotal: *₹${simulatorQuote.total.toLocaleString('en-IN')}*\n\nOur team is reviewing your dates. Explore more details below:`
                          ) : (
                            `🎉 *Stay Inquiry Submitted!*\n\nEnquiry ID: *#ENQ-1236*\nGuest: *Shivam*\nRoom: *Deluxe Sea View Room*\n\nOur team is reviewing your dates. Explore more details below:`
                          )
                        )}
                        {previewStage === 'handoff' && (
                          (autoReplySettings.handoffMessage || '')
                            .replace(/\{\{phone\}\}/gi, autoReplySettings.handoffPhone || '+91 87665 90634')
                            .replace(/\{\{business_name\}\}/gi, autoReplySettings.businessName || 'KonkanTrip Beach Resort & Spa')
                        )}
                        {previewStage === 'dynamic' && (() => {
                          const dyn = (autoReplySettings.dynamicOptions || []).find(o => o.id === dynPreviewOptionId) ||
                                      (autoReplySettings.dynamicOptions || [])[0];
                          if (!dyn) return "No dynamic rules created yet. Go to the ⚡ Dynamic Rules tab to add your first rule!";
                          let msg = (dyn.responseText || `Thank you for asking about ${dyn.title}! Our team is delighted to assist you.`)
                            .replace(/\{\{name\}\}/gi, 'Shivam')
                            .replace(/\{\{business_name\}\}/gi, autoReplySettings.businessName || 'Guest Concierge')
                            .replace(/\{\{phone\}\}/gi, autoReplySettings.handoffPhone || '');
                          if (dyn.actionType === 'OPEN_URL' && dyn.url) msg += `\n\n🌐 Explore Link: ${dyn.url}`;
                          return msg;
                        })()}
                      </div>

                      {/* Footer */}
                      <div style={{ fontSize: '0.68rem', color: '#96969C' }}>
                        {autoReplySettings.businessName || 'Concierge Desk'} • 10:30 AM
                      </div>

                      {/* Interactive Buttons Mockup */}
                      {previewStage !== 'handoff' && (
                        <div style={{
                          borderTop: '1px solid #F1F5F9',
                          paddingTop: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}>
                          {previewStage === 'welcome' && [
                            autoReplySettings.button1 || 'This Weekend',
                            autoReplySettings.button2 || 'Tomorrow (2 N)',
                            autoReplySettings.button3 || 'Talk to Staff'
                          ].map((btnText, bIdx) => (
                            <div
                              key={bIdx}
                              style={{
                                background: '#F8FAF5',
                                border: '1px solid #C3D1AC',
                                color: '#2F5219',
                                textAlign: 'center',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                              }}
                            >
                              <span>{btnText}</span>
                            </div>
                          ))}

                          {previewStage === 'flow' && (
                            <div
                              style={{
                                background: '#2F5219',
                                border: '1px solid #1EBE5D',
                                color: '#FFFFFF',
                                textAlign: 'center',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                cursor: 'pointer'
                              }}
                            >
                              <span>📋 {autoReplySettings.flowCta || 'Select Dates & Room'}</span>
                            </div>
                          )}

                          {previewStage === 'quote' && [
                            autoReplySettings.quoteConfirm || 'Confirm Booking',
                            autoReplySettings.quoteModify || 'Change Dates',
                            autoReplySettings.quoteRooms || 'Other Rooms'
                          ].map((btnText, bIdx) => (
                            <div
                              key={bIdx}
                              style={{
                                background: bIdx === 0 ? '#2F5219' : '#F8FAF5',
                                border: '1px solid #C3D1AC',
                                color: bIdx === 0 ? '#FFFFFF' : '#2F5219',
                                textAlign: 'center',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                              }}
                            >
                              <span>{btnText}</span>
                            </div>
                          ))}

                          {previewStage === 'confirmed' && [
                            autoReplySettings.confirmedButton1 || 'Facilities',
                            autoReplySettings.confirmedButton2 || 'Dining Menu',
                            autoReplySettings.confirmedButton3 || 'Location / Map'
                          ].map((btnText, bIdx) => (
                            <div
                              key={bIdx}
                              style={{
                                background: '#F8FAF5',
                                border: '1px solid #C3D1AC',
                                color: '#2F5219',
                                textAlign: 'center',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                              }}
                            >
                              <span>{btnText}</span>
                            </div>
                          ))}

                          {previewStage === 'dynamic' && (() => {
                            const dyn = (autoReplySettings.dynamicOptions || []).find(o => o.id === dynPreviewOptionId) ||
                                        (autoReplySettings.dynamicOptions || [])[0];
                            const buttons = dyn?.followUpButtons && dyn.followUpButtons.length > 0 
                              ? dyn.followUpButtons.map(b => b.title || b.label)
                              : ['Check Rates', autoReplySettings.button3 || 'Talk to Staff'];
                            return buttons.map((btnText, bIdx) => (
                              <div
                                key={bIdx}
                                style={{
                                  background: '#F8FAF5',
                                  border: '1px solid #C3D1AC',
                                  color: '#2F5219',
                                  textAlign: 'center',
                                  padding: '6px 12px',
                                  borderRadius: '8px',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px'
                                }}
                              >
                                <span>{btnText}</span>
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* WhatsApp Flow Screen Mobile Simulator when Flow stage is selected */}
                  {previewStage === 'flow' && (
                    <div style={{
                      marginTop: '4px',
                      background: '#FFFFFF',
                      borderRadius: '12px',
                      border: '1.5px solid #2F5219',
                      boxShadow: '0 4px 12px rgba(47, 82, 25, 0.08)',
                      overflow: 'hidden'
                    }}>
                      {/* Flow Mockup Header */}
                      <div style={{
                        background: '#2F5219',
                        color: '#FFFFFF',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={16} />
                          <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                            {activePublishedFlow?.name || 'Active Booking Intake'}
                          </span>
                        </div>
                        <span style={{
                          fontSize: '0.68rem',
                          background: 'rgba(255,255,255,0.2)',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontWeight: 600
                        }}>
                          Meta Flow v3.1
                        </span>
                      </div>

                      {/* Interactive Flow Form */}
                      <form onSubmit={handleSimulatorSubmit} style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ fontSize: '0.78rem', color: '#67676B', lineHeight: 1.4 }}>
                          Fill out this live Meta Flow screen. On submit, the system validates your input, calculates pricing, and transitions to the live Quote preview.
                        </div>

                        {simulatorValidationError && (
                          <div style={{
                            background: '#FEE2E2',
                            border: '1px solid #FCA5A5',
                            color: '#991B1B',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 600
                          }}>
                            ⚠️ {simulatorValidationError}
                          </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '2px' }}>
                              Guest Name *
                            </label>
                            <input
                              type="text"
                              required
                              value={simulatorValues.guest_name}
                              onChange={e => setSimulatorValues({ ...simulatorValues, guest_name: e.target.value })}
                              placeholder="e.g. Sunil Gavaskar"
                              className="saas-input"
                              style={{ width: '100%', fontSize: '0.8rem', padding: '6px 10px' }}
                            />
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '2px' }}>
                                Check-in Date *
                              </label>
                              <input
                                type="date"
                                required
                                value={simulatorValues.check_in}
                                onChange={e => setSimulatorValues({ ...simulatorValues, check_in: e.target.value })}
                                className="saas-input"
                                style={{ width: '100%', fontSize: '0.8rem', padding: '6px 10px' }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '2px' }}>
                                Check-out Date *
                              </label>
                              <input
                                type="date"
                                required
                                value={simulatorValues.check_out}
                                onChange={e => setSimulatorValues({ ...simulatorValues, check_out: e.target.value })}
                                className="saas-input"
                                style={{ width: '100%', fontSize: '0.8rem', padding: '6px 10px' }}
                              />
                            </div>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '2px' }}>
                              Room / Suite Preference *
                            </label>
                            <select
                              value={simulatorValues.room_preference}
                              onChange={e => setSimulatorValues({ ...simulatorValues, room_preference: e.target.value })}
                              className="saas-input"
                              style={{ width: '100%', fontSize: '0.8rem', padding: '6px 10px' }}
                            >
                              <option value="Deluxe Sea View Room">Deluxe Sea View Room (₹4,500/night)</option>
                              <option value="Luxury Coconut Cottage">Luxury Coconut Cottage (₹6,500/night)</option>
                              <option value="Family Ocean Suite">Family Ocean Suite (₹8,500/night)</option>
                            </select>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '2px' }}>
                                Adults
                              </label>
                              <select
                                value={simulatorValues.adults}
                                onChange={e => setSimulatorValues({ ...simulatorValues, adults: e.target.value })}
                                className="saas-input"
                                style={{ width: '100%', fontSize: '0.8rem', padding: '6px 10px' }}
                              >
                                <option value="1">1 Adult</option>
                                <option value="2">2 Adults</option>
                                <option value="3">3 Adults</option>
                                <option value="4">4+ Adults</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '2px' }}>
                                Children
                              </label>
                              <select
                                value={simulatorValues.children}
                                onChange={e => setSimulatorValues({ ...simulatorValues, children: e.target.value })}
                                className="saas-input"
                                style={{ width: '100%', fontSize: '0.8rem', padding: '6px 10px' }}
                              >
                                <option value="0">None (0)</option>
                                <option value="1">1 Child</option>
                                <option value="2">2 Children</option>
                                <option value="3">3+ Children</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '2px' }}>
                              Special Requests (Optional)
                            </label>
                            <input
                              type="text"
                              value={simulatorValues.special_requests}
                              onChange={e => setSimulatorValues({ ...simulatorValues, special_requests: e.target.value })}
                              placeholder="e.g. Ground floor villa, late check-in"
                              className="saas-input"
                              style={{ width: '100%', fontSize: '0.8rem', padding: '6px 10px' }}
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="btn btn-action-green"
                          style={{
                            width: '100%',
                            marginTop: '4px',
                            padding: '8px 14px',
                            fontSize: '0.825rem',
                            fontWeight: 700,
                            justifyContent: 'center',
                            gap: '6px'
                          }}
                        >
                          <Send size={14} />
                          <span>🚀 Submit Form & Request Quote</span>
                        </button>
                      </form>
                    </div>
                  )}
                </div>

                {/* Save Success Alert */}
                {autoReplySaveSuccess && (
                  <div style={{
                    background: '#EDF4E6',
                    border: '1px solid #C3D1AC',
                    color: '#2F5219',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <CheckCircle2 size={16} />
                    <span>Bot configuration saved successfully! WhatsApp and Website Concierge are now using your custom wording and buttons.</span>
                  </div>
                )}

                {/* Modal Footer Buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', borderTop: '1px solid #EEEEF0', paddingTop: '16px' }}>
                  <button
                    type="button"
                    onClick={handleResetAutoReplyDefaults}
                    className="btn btn-secondary"
                    style={{ padding: '8px 14px', fontSize: '0.8rem', gap: '6px', color: '#67676B' }}
                    title="Reset all messages and buttons to recommended defaults"
                  >
                    <RotateCcw size={13} />
                    <span>Reset Defaults</span>
                  </button>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setShowAutoReplyModal(false)}
                      className="btn btn-secondary"
                      style={{ padding: '8px 16px', fontSize: '0.825rem' }}
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      disabled={savingAutoReply}
                      className="btn btn-action-green"
                      style={{ padding: '8px 20px', fontSize: '0.825rem', gap: '6px' }}
                    >
                      <CheckCircle2 size={15} />
                      <span>{savingAutoReply ? 'Saving...' : 'Save Configuration'}</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* No-Code WhatsApp Flow Creator Modal */}
      {isCreateFlowModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1060,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #E5E5E8',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid #EEEEF0',
              background: '#F8FAF5'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#EDF4E6',
                  color: '#2F5219',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <PlusCircle size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#171719' }}>
                    Create Custom WhatsApp Flow
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#67676B' }}>
                    Build an interactive Meta Flow intake screen directly from here
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateFlowModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#96969C',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateNewFlow} style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '4px' }}>
                  Flow Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={newFlowForm.name}
                  onChange={e => setNewFlowForm({ ...newFlowForm, name: e.target.value })}
                  placeholder="e.g. Weekend Getaway Booking Flow"
                  className="saas-input"
                  style={{ width: '100%', fontSize: '0.85rem', padding: '8px 12px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '4px' }}>
                  Form Screen Description / Subtitle
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={newFlowForm.description}
                  onChange={e => setNewFlowForm({ ...newFlowForm, description: e.target.value })}
                  placeholder="e.g. Share your dates and preferences. Our concierge will send you an official quote."
                  className="saas-input"
                  style={{ width: '100%', fontSize: '0.85rem', padding: '8px 12px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '4px' }}>
                    Category
                  </label>
                  <select
                    value={newFlowForm.category}
                    onChange={e => setNewFlowForm({ ...newFlowForm, category: e.target.value })}
                    className="saas-input"
                    style={{ width: '100%', fontSize: '0.85rem', padding: '8px 12px' }}
                  >
                    <option value="LEAD_GENERATION">Lead Generation</option>
                    <option value="APPOINTMENT_BOOKING">Appointment Booking</option>
                    <option value="CUSTOMER_SUPPORT">Customer Support</option>
                    <option value="CONTACT_US">Contact Us</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '4px' }}>
                    Flow CTA Button Label
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    value={newFlowForm.ctaText}
                    onChange={e => setNewFlowForm({ ...newFlowForm, ctaText: e.target.value })}
                    placeholder="e.g. Select Dates & Room"
                    className="saas-input"
                    style={{ width: '100%', fontSize: '0.85rem', padding: '8px 12px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '4px' }}>
                  Room / Package Categories (Comma-separated)
                </label>
                <input
                  type="text"
                  value={newFlowForm.roomOptions}
                  onChange={e => setNewFlowForm({ ...newFlowForm, roomOptions: e.target.value })}
                  placeholder="Deluxe Sea View Room, Luxury Coconut Cottage, Family Ocean Suite"
                  className="saas-input"
                  style={{ width: '100%', fontSize: '0.85rem', padding: '8px 12px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '8px' }}>
                  Intake Fields to Include in Flow Screen
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    { id: 'collectName', label: 'Guest Full Name' },
                    { id: 'collectCheckin', label: 'Check-in Date' },
                    { id: 'collectCheckout', label: 'Check-out Date' },
                    { id: 'collectRoom', label: 'Room Preference Dropdown' },
                    { id: 'collectGuests', label: 'Adults & Children Dropdowns' },
                    { id: 'collectNotes', label: 'Special Requests / Notes' }
                  ].map(fld => (
                    <label
                      key={fld.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #E5E5E8',
                        background: newFlowForm[fld.id] ? '#F8FAF5' : '#FFFFFF',
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!newFlowForm[fld.id]}
                        onChange={e => setNewFlowForm({ ...newFlowForm, [fld.id]: e.target.checked })}
                      />
                      <span style={{ fontWeight: newFlowForm[fld.id] ? 600 : 400, color: newFlowForm[fld.id] ? '#2F5219' : '#3A3A3E' }}>
                        {fld.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{
                background: '#EDF4E6',
                border: '1px solid #C3D1AC',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '0.78rem',
                color: '#2F5219',
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start'
              }}>
                <Sparkles size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  This will generate a valid Meta Flow JSON v3.1 specification, save it to your database, and immediately set it as the active intake flow for your automated concierge!
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #EEEEF0', paddingTop: '14px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateFlowModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '0.825rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingFlow}
                  className="btn btn-action-green"
                  style={{ padding: '8px 20px', fontSize: '0.825rem', gap: '6px' }}
                >
                  <PlusCircle size={15} />
                  <span>{creatingFlow ? 'Creating Flow...' : '⚡ Create & Activate Flow'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dynamic Rule Editor Modal (Admin) */}
      {isDynOptionModalOpen && editingDynOption && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1070,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '580px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #E5E5E8',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid #EEEEF0',
              background: '#F8FAF5'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#EDF4E6',
                  color: '#2F5219',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Code size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#171719' }}>
                    {editingDynOption.title ? `Edit: ${editingDynOption.title}` : 'Create Dynamic Bot Rule'}
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#67676B' }}>
                    Configure trigger matching, automated response, and interactive actions
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDynOptionModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#96969C',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveDynamicOption} style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '4px' }}>
                    Rule Name / Internal Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingDynOption.title || ''}
                    onChange={e => setEditingDynOption({ ...editingDynOption, title: e.target.value })}
                    placeholder="e.g. Spa & Wellness Packages"
                    className="saas-input"
                    style={{ width: '100%', fontSize: '0.85rem', padding: '8px 10px' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#3A3A3E' }}>
                      WhatsApp Button Label
                    </label>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B' }}>
                      {String(editingDynOption.buttonLabel || '').length}/20
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={20}
                    value={editingDynOption.buttonLabel || ''}
                    onChange={e => setEditingDynOption({ ...editingDynOption, buttonLabel: e.target.value })}
                    placeholder="e.g. Spa & Wellness"
                    className="saas-input"
                    style={{ width: '100%', fontSize: '0.85rem', padding: '8px 10px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '4px' }}>
                  Trigger Keywords (Comma-separated) *
                </label>
                <input
                  type="text"
                  required
                  value={editingDynOption.triggers || ''}
                  onChange={e => setEditingDynOption({ ...editingDynOption, triggers: e.target.value })}
                  placeholder="e.g. spa, massage, wellness, ayurveda, relaxation"
                  className="saas-input"
                  style={{ width: '100%', fontSize: '0.85rem', padding: '8px 10px' }}
                />
                <span style={{ fontSize: '0.72rem', color: '#96969C', marginTop: '3px', display: 'block' }}>
                  The bot triggers this rule whenever an inbound message contains any of these words or when the guest clicks the button.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '4px' }}>
                    Matching Algorithm
                  </label>
                  <select
                    value={editingDynOption.matchType || 'CONTAINS'}
                    onChange={e => setEditingDynOption({ ...editingDynOption, matchType: e.target.value })}
                    className="saas-input"
                    style={{ width: '100%', fontSize: '0.85rem', padding: '8px 10px' }}
                  >
                    <option value="CONTAINS">Contains (Any trigger in message - Recommended)</option>
                    <option value="EXACT">Exact (Strict full phrase match)</option>
                    <option value="REGEX">Regular Expression (Advanced)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '4px' }}>
                    Action Type
                  </label>
                  <select
                    value={editingDynOption.actionType || 'REPLY_TEXT'}
                    onChange={e => setEditingDynOption({ ...editingDynOption, actionType: e.target.value })}
                    className="saas-input"
                    style={{ width: '100%', fontSize: '0.85rem', padding: '8px 10px' }}
                  >
                    <option value="REPLY_TEXT">💬 Instant Custom Message</option>
                    <option value="DISPATCH_FLOW">📋 Launch Meta Flow Intake Screen</option>
                    <option value="OPEN_URL">🌐 Send Web Link / Brochure / Maps</option>
                    <option value="STAFF_TAKEOVER">📞 Human Staff Takeover (Pause Bot)</option>
                  </select>
                </div>
              </div>

              {/* Conditional: Flow Selector */}
              {editingDynOption.actionType === 'DISPATCH_FLOW' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '4px' }}>
                    Select WhatsApp Flow Form *
                  </label>
                  <select
                    value={editingDynOption.flowId || ''}
                    onChange={e => setEditingDynOption({ ...editingDynOption, flowId: e.target.value })}
                    className="saas-input"
                    style={{ width: '100%', fontSize: '0.85rem', padding: '8px 10px' }}
                  >
                    <option value="">-- Choose a Meta Flow --</option>
                    {publishedFlows.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.category}) - {f.meta_status || 'Draft'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Conditional: URL input */}
              {editingDynOption.actionType === 'OPEN_URL' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '4px' }}>
                    External Web URL *
                  </label>
                  <input
                    type="url"
                    value={editingDynOption.url || ''}
                    onChange={e => setEditingDynOption({ ...editingDynOption, url: e.target.value })}
                    placeholder="https://maps.google.com/?q=..."
                    className="saas-input"
                    style={{ width: '100%', fontSize: '0.85rem', padding: '8px 10px' }}
                  />
                </div>
              )}

              {/* Message Content */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#3A3A3E' }}>
                    Automated Response Text (Supports Markdown & Emojis)
                  </label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {['{{name}}', '{{phone}}', '{{business_name}}'].map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          const cur = editingDynOption.responseText || '';
                          setEditingDynOption({ ...editingDynOption, responseText: cur + ' ' + v + ' ' });
                        }}
                        className="btn btn-secondary"
                        style={{ padding: '2px 6px', fontSize: '0.7rem', fontWeight: 600 }}
                      >
                        + <code>{v}</code>
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={4}
                  value={editingDynOption.responseText || ''}
                  onChange={e => setEditingDynOption({ ...editingDynOption, responseText: e.target.value })}
                  placeholder="Enter custom response message..."
                  className="saas-input"
                  style={{ width: '100%', resize: 'vertical', fontSize: '0.85rem', padding: '8px 10px', lineHeight: 1.45 }}
                />
              </div>

              {/* Follow-up Interactive Buttons */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '4px' }}>
                  Follow-up Quick Reply Buttons (Max 3 WhatsApp buttons)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[0, 1, 2].map(idx => {
                    const btn = (editingDynOption.followUpButtons || [])[idx] || { title: '' };
                    return (
                      <div key={idx}>
                        <div style={{ fontSize: '0.7rem', color: '#67676B', marginBottom: '2px' }}>
                          Button {idx + 1}
                        </div>
                        <input
                          type="text"
                          maxLength={20}
                          value={btn.title || ''}
                          onChange={e => {
                            const newBtns = [...(editingDynOption.followUpButtons || [])];
                            newBtns[idx] = { id: `btn_fup_${idx}`, title: e.target.value.substring(0, 20) };
                            setEditingDynOption({ ...editingDynOption, followUpButtons: newBtns });
                          }}
                          placeholder={idx === 0 ? "Check Rates" : (idx === 1 ? "Talk to Staff" : "Optional")}
                          className="saas-input"
                          style={{ width: '100%', fontSize: '0.8rem', padding: '6px 8px' }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Toggles */}
              <div style={{ display: 'flex', gap: '16px', borderTop: '1px solid #EEEEF0', paddingTop: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editingDynOption.active !== false}
                    onChange={e => setEditingDynOption({ ...editingDynOption, active: e.target.checked })}
                  />
                  <span style={{ fontWeight: 600, color: '#2F5219' }}>Enable this rule in bot engine</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!editingDynOption.showInGreeting}
                    onChange={e => setEditingDynOption({ ...editingDynOption, showInGreeting: e.target.checked })}
                  />
                  <span style={{ color: '#3A3A3E' }}>Include as button in welcome greeting</span>
                </label>
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #EEEEF0', paddingTop: '14px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setIsDynOptionModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '0.825rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-action-green"
                  style={{ padding: '8px 20px', fontSize: '0.825rem', gap: '6px' }}
                >
                  <CheckCircle2 size={15} />
                  <span>Save Dynamic Rule</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WhatsApp Flows Modal */}
      {showFlowModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1050,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #E5E5E8',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 24px',
              borderBottom: '1px solid #EEEEF0'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#EDF4E6',
                  color: '#2F5219',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Layers size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#171719' }}>
                    Send WhatsApp Flow
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#67676B' }}>
                    Send an interactive native form to {selectedConvo?.name || selectedConvo?.phone}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFlowModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#96969C',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              {availableFlows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 12px' }}>
                  <Layers size={40} style={{ color: '#96969C', margin: '0 auto 12px' }} />
                  <h4 style={{ margin: '0 0 6px', color: '#3A3A3E', fontWeight: 600 }}>No Meta Flows Available</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#67676B' }}>
                    You have not published or synchronized any WhatsApp Flows with Meta yet. Go to the WhatsApp Flows tab to create or sync your flows.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#3A3A3E', marginBottom: '6px' }}>
                      Select Flow Form
                    </label>
                    <select
                      value={selectedFlowId}
                      onChange={(e) => {
                        setSelectedFlowId(e.target.value);
                        const sel = availableFlows.find(f => f.id === e.target.value);
                        if (sel) {
                          setFlowBodyText(`Hi ${selectedConvo?.name || 'there'}! Please take a moment to complete our ${sel.name} form:`);
                        }
                      }}
                      className="form-control"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D4D4D9', fontSize: '0.9rem' }}
                    >
                      {availableFlows.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.category}) - {f.meta_status || 'Draft'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#3A3A3E', marginBottom: '6px' }}>
                      Accompanying Message
                    </label>
                    <textarea
                      rows={3}
                      value={flowBodyText}
                      onChange={(e) => setFlowBodyText(e.target.value)}
                      placeholder="Enter a message to introduce the interactive form..."
                      className="form-control"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D4D4D9', fontSize: '0.875rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#3A3A3E', marginBottom: '6px' }}>
                      Button CTA Label
                    </label>
                    <input
                      type="text"
                      maxLength={20}
                      value={flowCtaText}
                      onChange={(e) => setFlowCtaText(e.target.value)}
                      placeholder="e.g. Open Form, Book Now"
                      className="form-control"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D4D4D9', fontSize: '0.9rem' }}
                    />
                  </div>

                  <div style={{
                    background: '#F5F5F6',
                    borderRadius: '8px',
                    padding: '12px',
                    border: '1px solid #E5E5E8',
                    fontSize: '0.8rem',
                    color: '#67676B'
                  }}>
                    💡 The customer will see an interactive WhatsApp message with an open-form button. When they submit, their responses will automatically appear right here in this chat!
                  </div>
                </div>
              )}
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '12px',
              padding: '16px 24px',
              borderTop: '1px solid #EEEEF0',
              background: '#F5F5F6'
            }}>
              <button
                type="button"
                onClick={() => setShowFlowModal(false)}
                className="btn btn-secondary"
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              {availableFlows.length > 0 && (
                <button
                  type="button"
                  onClick={handleSendFlowMessage}
                  disabled={sendingFlow || !selectedFlowId}
                  className="btn btn-action-green"
                  style={{
                    padding: '8px 20px',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Send size={15} />
                  <span>{sendingFlow ? 'Sending...' : 'Send Flow'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
