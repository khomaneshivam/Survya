import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Calendar,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Link2,
  MessageCircle,
  MessageSquare,
  Phone,
  QrCode,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  X,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Eye,
  Star
} from 'lucide-react';
import { formatIndianTime } from '../utils/indianTime';

const DEFAULT_INTAKE_FIELDS = [
  { id: 'check_in', label: 'Check-in Date', type: 'date', required: true, enabled: true },
  { id: 'check_out', label: 'Check-out Date', type: 'date', required: true, enabled: true },
  { id: 'total_guests', label: 'Total Guests', type: 'number', min: 1, max: 20, defaultValue: 2, required: true, enabled: true },
  { id: 'room_preference', label: 'Preferred Room Category', type: 'select', options: ['Any Available Room', 'Deluxe Sea View Room', 'Luxury Coconut Cottage', 'Family Ocean Suite'], required: false, enabled: false },
  { id: 'special_requests', label: 'Special Requests / Occasion', type: 'text', required: false, enabled: false }
];

/**
 * Renders WhatsApp-style *bold*, _italic_, and URLs with linebreaks preserved
 */
function formatChatText(text) {
  if (!text) return '';
  const str = String(text);
  const lines = str.split('\n');

  return lines.map((line, lineIdx) => {
    const parts = [];
    let matchIdx = 0;
    const regex = /(\*[^*]+\*|_[^_]+_|https?:\/\/[^\s]+)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
        parts.push(<strong key={`b_${lineIdx}_${matchIdx++}`}>{token.slice(1, -1)}</strong>);
      } else if (token.startsWith('_') && token.endsWith('_') && token.length > 2) {
        parts.push(<em key={`i_${lineIdx}_${matchIdx++}`}>{token.slice(1, -1)}</em>);
      } else if (token.startsWith('http://') || token.startsWith('https://')) {
        parts.push(
          <a
            key={`a_${lineIdx}_${matchIdx++}`}
            href={token}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 600 }}
          >
            {token}
          </a>
        );
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    return (
      <React.Fragment key={lineIdx}>
        {parts.length > 0 ? parts : ' '}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

const QUICK_SUGGESTIONS = [
  { icon: '🖼️', label: 'View Photos', text: 'Hi! Could you show me the photos and gallery of the resort property and villas?' },
  { icon: '🌴', label: 'Villa & Room Rates', text: 'Hi! Could you please share the available villa types, amenities, and current room rates?' },
  { icon: '📅', label: 'Check Availability', text: 'Hi! I would like to check villa availability for my upcoming trip dates.' },
  { icon: '🍽️', label: 'Dining & Food Menu', text: 'Hello! Can you share details about the resort dining options, breakfast timings, and food menu?' },
  { icon: '📍', label: 'Location & How to Reach', text: 'Hi, could you send the exact resort location and driving directions from Mumbai / Pune?' },
  { icon: '📞', label: 'Request Call Back', text: 'Hi Concierge, could a reservation executive please give me a quick call regarding a booking?' }
];

/**
 * Interactive In-Chat Meta-Flow Card
 * Provides native in-chat stay criteria collection fields (check-in/out, guests, room category, custom fields)
 * with real-time validation and instant quote calculation.
 */
function InChatFlowCard({ msgId, payload, onSubmit, disabled, isAlreadySubmitted }) {
  const fields = payload.fields || [];

  const [formValues, setFormValues] = useState(() => {
    const initial = {};
    fields.forEach(f => {
      initial[f.id] = f.defaultValue !== undefined ? f.defaultValue : (f.type === 'number' ? (f.min || 1) : '');
    });
    return initial;
  });

  const [formErrors, setFormErrors] = useState({});
  const [submitted, setSubmitted] = useState(Boolean(isAlreadySubmitted));

  const checkInField = fields.find(f => f.id === 'check_in');
  const checkOutField = fields.find(f => f.id === 'check_out');
  const guestsField = fields.find(f => f.id === 'total_guests');
  const roomPrefField = fields.find(f => f.id === 'room_preference');
  const customFields = fields.filter(f => !['check_in', 'check_out', 'total_guests', 'room_preference'].includes(f.id));

  if (submitted || isAlreadySubmitted) {
    const cin = formValues.check_in;
    const cout = formValues.check_out;
    const g = formValues.total_guests || 2;
    return (
      <div style={{
        marginTop: '10px',
        padding: '10px 14px',
        borderRadius: '10px',
        background: '#EDF4E6',
        border: '1px solid #C3D1AC',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color: '#2F5219',
        fontSize: '0.8rem',
        fontWeight: 600
      }}>
        <CheckCircle2 size={16} color="#2F5219" />
        <span>Stay criteria submitted ({cin} to {cout} · {g} Guest{g > 1 ? 's' : ''}). Real-time availability & quotes calculated above!</span>
      </div>
    );
  }

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    const errors = {};

    if (checkInField && !formValues.check_in) {
      errors.check_in = 'Check-in date is required.';
    }
    if (checkOutField && !formValues.check_out) {
      errors.check_out = 'Check-out date is required.';
    }
    if (formValues.check_in && formValues.check_out && formValues.check_out <= formValues.check_in) {
      errors.check_out = 'Check-out must be after check-in.';
    }

    customFields.forEach(cf => {
      if (cf.required && !formValues[cf.id]) {
        errors[cf.id] = `${cf.label} is required.`;
      }
    });

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setSubmitted(true);

    const cin = formValues.check_in;
    const cout = formValues.check_out;
    const guests = formValues.total_guests || 2;
    const pref = formValues.room_preference;
    let summaryText = `📅 Check Availability: ${cin} to ${cout} (${guests} Guests)`;
    if (pref && pref !== 'Any Available Room') {
      summaryText += ` · ${pref}`;
    }

    onSubmit(summaryText, formValues, msgId);
  };

  return (
    <div style={{
      marginTop: '12px',
      background: '#FFFFFF',
      border: '1.5px solid #2876B8',
      borderRadius: '12px',
      padding: '14px',
      boxShadow: '0 4px 14px rgba(40, 118, 184, 0.12)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          width: '28px',
          height: '28px',
          borderRadius: '8px',
          background: '#E9F2FA',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#2876B8',
          flexShrink: 0
        }}>
          <Sparkles size={16} />
        </div>
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#171719' }}>
            {payload.flow_title || 'Plan Your Stay & Check Rates'}
          </div>
          <div style={{ fontSize: '0.725rem', color: '#67676B' }}>
            {payload.flow_description || 'Select dates & guests to see real-time availability and prices'}
          </div>
        </div>
      </div>

      {/* Dates row */}
      {(checkInField || checkOutField) && (
        <div className="public-chat-dates-grid">
          {checkInField && (
            <div>
              <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#171719', marginBottom: '3px' }}>
                Check-in <span style={{ color: '#9B2C2C' }}>*</span>
              </label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                borderRadius: '8px',
                border: formErrors.check_in ? '1px solid #F87171' : '1px solid #D4D4D9',
                background: formErrors.check_in ? '#FEF2F2' : '#FBFBFB',
                padding: '7px 8px',
                minHeight: '40px',
                boxSizing: 'border-box'
              }}>
                <Calendar size={14} color="#67676B" style={{ flexShrink: 0 }} />
                <input
                  type="date"
                  className="public-chat-form-input"
                  min={checkInField.min}
                  value={formValues.check_in || ''}
                  onChange={e => {
                    const newCin = e.target.value;
                    setFormValues(prev => {
                      const updated = { ...prev, check_in: newCin };
                      if (prev.check_out && prev.check_out <= newCin) {
                        const d = new Date(newCin);
                        d.setDate(d.getDate() + 1);
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        updated.check_out = `${y}-${m}-${day}`;
                      }
                      return updated;
                    });
                    if (formErrors.check_in) setFormErrors(prev => ({ ...prev, check_in: null }));
                  }}
                  style={{
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    minWidth: 0,
                    fontSize: '0.8rem',
                    color: '#171719',
                    background: 'transparent',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
              {formErrors.check_in && <div style={{ color: '#9B2C2C', fontSize: '0.675rem', marginTop: '2px' }}>{formErrors.check_in}</div>}
            </div>
          )}

          {checkOutField && (
            <div>
              <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#171719', marginBottom: '3px' }}>
                Check-out <span style={{ color: '#9B2C2C' }}>*</span>
              </label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                borderRadius: '8px',
                border: formErrors.check_out ? '1px solid #F87171' : '1px solid #D4D4D9',
                background: formErrors.check_out ? '#FEF2F2' : '#FBFBFB',
                padding: '7px 8px',
                minHeight: '40px',
                boxSizing: 'border-box'
              }}>
                <Calendar size={14} color="#67676B" style={{ flexShrink: 0 }} />
                <input
                  type="date"
                  className="public-chat-form-input"
                  min={formValues.check_in || checkOutField.min}
                  value={formValues.check_out || ''}
                  onChange={e => {
                    setFormValues(prev => ({ ...prev, check_out: e.target.value }));
                    if (formErrors.check_out) setFormErrors(prev => ({ ...prev, check_out: null }));
                  }}
                  style={{
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    minWidth: 0,
                    fontSize: '0.8rem',
                    color: '#171719',
                    background: 'transparent',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
              {formErrors.check_out && <div style={{ color: '#9B2C2C', fontSize: '0.675rem', marginTop: '2px' }}>{formErrors.check_out}</div>}
            </div>
          )}
        </div>
      )}

      {/* Total Guests Stepper */}
      {guestsField && (
        <div>
          <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#171719', marginBottom: '3px' }}>
            {guestsField.label || 'Total Guests'}
          </label>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderRadius: '8px',
            border: '1px solid #D4D4D9',
            background: '#FBFBFB',
            padding: '6px 10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={14} color="#67676B" />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#171719' }}>
                {formValues.total_guests || 2} Guest{(formValues.total_guests || 2) > 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => {
                  const current = Number(formValues.total_guests || 2);
                  if (current > (guestsField.min || 1)) {
                    setFormValues(prev => ({ ...prev, total_guests: current - 1 }));
                  }
                }}
                disabled={disabled}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  border: '1px solid #D4D4D9',
                  background: '#FFFFFF',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  touchAction: 'manipulation'
                }}
              >
                -
              </button>
              <span style={{ minWidth: '22px', textAlign: 'center', fontWeight: 700, fontSize: '0.85rem' }}>
                {formValues.total_guests || 2}
              </span>
              <button
                type="button"
                onClick={() => {
                  const current = Number(formValues.total_guests || 2);
                  if (current < (guestsField.max || 20)) {
                    setFormValues(prev => ({ ...prev, total_guests: current + 1 }));
                  }
                }}
                disabled={disabled}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  border: '1px solid #D4D4D9',
                  background: '#FFFFFF',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  touchAction: 'manipulation'
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room Preference Dropdown */}
      {roomPrefField && Array.isArray(roomPrefField.options) && (
        <div>
          <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#171719', marginBottom: '3px' }}>
            {roomPrefField.label}
          </label>
          <select
            className="public-chat-form-select"
            value={formValues.room_preference || 'Any Available Room'}
            onChange={e => setFormValues(prev => ({ ...prev, room_preference: e.target.value }))}
            disabled={disabled}
            style={{
              width: '100%',
              borderRadius: '8px',
              border: '1px solid #D4D4D9',
              background: '#FBFBFB',
              padding: '8px 10px',
              fontSize: '0.8rem',
              color: '#171719',
              outline: 'none',
              minHeight: '40px',
              boxSizing: 'border-box'
            }}
          >
            {roomPrefField.options.map((opt, i) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      )}

      {/* Custom Fields */}
      {customFields.map(cf => (
        <div key={cf.id}>
          <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#171719', marginBottom: '3px' }}>
            {cf.label} {cf.required && <span style={{ color: '#9B2C2C' }}>*</span>}
          </label>
          {cf.type === 'select' && Array.isArray(cf.options) ? (
            <select
              className="public-chat-form-select"
              value={formValues[cf.id] || ''}
              onChange={e => {
                setFormValues(prev => ({ ...prev, [cf.id]: e.target.value }));
                if (formErrors[cf.id]) setFormErrors(prev => ({ ...prev, [cf.id]: null }));
              }}
              disabled={disabled}
              style={{
                width: '100%',
                borderRadius: '8px',
                border: formErrors[cf.id] ? '1px solid #F87171' : '1px solid #D4D4D9',
                background: '#FBFBFB',
                padding: '8px 10px',
                fontSize: '0.8rem',
                color: '#171719',
                outline: 'none',
                minHeight: '40px',
                boxSizing: 'border-box'
              }}
            >
              <option value="">{cf.placeholder || `Select ${cf.label}`}</option>
              {cf.options.map((opt, idx) => (
                <option key={idx} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              type={cf.type || 'text'}
              className="public-chat-form-input"
              placeholder={cf.placeholder || `Enter ${cf.label}`}
              value={formValues[cf.id] || ''}
              onChange={e => {
                setFormValues(prev => ({ ...prev, [cf.id]: e.target.value }));
                if (formErrors[cf.id]) setFormErrors(prev => ({ ...prev, [cf.id]: null }));
              }}
              disabled={disabled}
              style={{
                width: '100%',
                borderRadius: '8px',
                border: formErrors[cf.id] ? '1px solid #F87171' : '1px solid #D4D4D9',
                background: '#FBFBFB',
                padding: '8px 10px',
                fontSize: '0.8rem',
                color: '#171719',
                outline: 'none',
                minHeight: '40px',
                boxSizing: 'border-box'
              }}
            />
          )}
          {formErrors[cf.id] && <div style={{ color: '#9B2C2C', fontSize: '0.675rem', marginTop: '2px' }}>{formErrors[cf.id]}</div>}
        </div>
      ))}

      {/* Submit Button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '11px 16px',
          minHeight: '44px',
          borderRadius: '8px',
          background: '#2876B8',
          color: '#FFFFFF',
          border: 'none',
          fontSize: '0.85rem',
          fontWeight: 700,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          boxShadow: '0 2px 6px rgba(40, 118, 184, 0.25)',
          transition: 'all 0.15s ease',
          touchAction: 'manipulation'
        }}
      >
        <span>{payload.submit_label || 'Check Real-Time Availability & Rates ➔'}</span>
      </button>
    </div>
  );
}

export default function PublicChatLandingPage({ slug }) {
  const [loading, setLoading] = useState(true);
  const [linkData, setLinkData] = useState(null);
  const [error, setError] = useState('');

  // Customer identity and session state
  const [customerName, setCustomerName] = useState(() => {
    try {
      return localStorage.getItem('sarvya_guest_name') || '';
    } catch {
      return '';
    }
  });
  const [customerPhone, setCustomerPhone] = useState(() => {
    try {
      return localStorage.getItem('sarvya_guest_phone') || '';
    } catch {
      return '';
    }
  });
  const [nameError, setNameError] = useState('');
  const [activeMessage, setActiveMessage] = useState('');
  const [inAppChatOpen, setInAppChatOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    try {
      const cached = localStorage.getItem(`sarvya_chat_${slug}_messages`);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [isReturningGuest, setIsReturningGuest] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [submittedFlowMsgIds, setSubmittedFlowMsgIds] = useState(() => new Set());

  // Property Photo Gallery states
  const [galleryPhotos, setGalleryPhotos] = useState([]);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [activeGalleryCategory, setActiveGalleryCategory] = useState('ALL');
  const [lightboxPhotoIndex, setLightboxPhotoIndex] = useState(null);
  const [loadingGallery, setLoadingGallery] = useState(false);

  // Derive unique categories from gallery photos
  const galleryCategories = useMemo(() => {
    const cats = new Set();
    galleryPhotos.forEach(p => {
      if (p.category) cats.add(p.category);
    });
    return ['ALL', ...Array.from(cats)];
  }, [galleryPhotos]);

  // Photos filtered by active category tab
  const filteredGalleryPhotos = useMemo(() => {
    if (activeGalleryCategory === 'ALL') return galleryPhotos;
    return galleryPhotos.filter(p => p.category === activeGalleryCategory);
  }, [galleryPhotos, activeGalleryCategory]);

  // Inquire about specific photo in chat
  const handleInquireAboutPhoto = (photo) => {
    const photoTitle = photo.caption || photo.category || 'the resort villa';
    const text = `Hi, I loved this photo of "${photoTitle}"! Could you tell me more about this and check availability?`;
    setActiveMessage(text);
    setLightboxPhotoIndex(null);
    setShowGalleryModal(false);
    setInAppChatOpen(true);
  };

  // Keyboard navigation for photo lightbox
  useEffect(() => {
    if (lightboxPhotoIndex === null) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setLightboxPhotoIndex(null);
      } else if (e.key === 'ArrowLeft') {
        setLightboxPhotoIndex(prev => (prev > 0 ? prev - 1 : filteredGalleryPhotos.length - 1));
      } else if (e.key === 'ArrowRight') {
        setLightboxPhotoIndex(prev => (prev < filteredGalleryPhotos.length - 1 ? prev + 1 : 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxPhotoIndex, filteredGalleryPhotos.length]);

  // Helper date generators for default stay intake
  const getTodayStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getTomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getDayAfterTomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [intakeValues, setIntakeValues] = useState({
    check_in: getTomorrowStr(),
    check_out: getDayAfterTomorrowStr(),
    total_guests: 2
  });
  const [intakeErrors, setIntakeErrors] = useState({});

  // Configured intake fields: from chat link custom_fields or default hospitality set
  const configuredFields = useMemo(() => {
    if (Array.isArray(linkData?.custom_fields) && linkData.custom_fields.length > 0) {
      return linkData.custom_fields.filter(f => f.enabled !== false);
    }
    if (Array.isArray(linkData?.customFields) && linkData.customFields.length > 0) {
      return linkData.customFields.filter(f => f.enabled !== false);
    }
    return DEFAULT_INTAKE_FIELDS.filter(f => f.enabled !== false);
  }, [linkData]);

  // Sync messages into device localStorage for persistent offline recovery
  useEffect(() => {
    if (messages && messages.length > 0 && slug) {
      try {
        localStorage.setItem(`sarvya_chat_${slug}_messages`, JSON.stringify(messages));
      } catch {}
    }
  }, [messages, slug]);

  // Extract query parameters from window.location.search
  const queryParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const queryObj = Object.fromEntries(queryParams.entries());

  const chatMessagesEndRef = useRef(null);
  const chatScrollContainerRef = useRef(null);
  const inputRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const userJustSentRef = useRef(false);
  const initialScrollDoneRef = useRef(false);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const [hasUnseenNewMessages, setHasUnseenNewMessages] = useState(false);

  // Monitor user scroll position inside chat canvas
  const handleScroll = useCallback(() => {
    const container = chatScrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isBottom = distanceFromBottom < 80;
    isAtBottomRef.current = isBottom;

    if (isBottom) {
      setShowScrollBottomBtn(false);
      setHasUnseenNewMessages(false);
    } else if (distanceFromBottom > 150) {
      setShowScrollBottomBtn(true);
    }
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    if (chatScrollContainerRef.current) {
      chatScrollContainerRef.current.scrollTo({
        top: chatScrollContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
      isAtBottomRef.current = true;
      setShowScrollBottomBtn(false);
      setHasUnseenNewMessages(false);
    }
  }, []);

  // Auto-detect existing active session or URL ?phone= parameter for instant continuity
  useEffect(() => {
    const queryPhone = queryParams.get('phone');
    const localPhone = typeof window !== 'undefined' ? localStorage.getItem('sarvya_guest_phone') : null;
    const phoneToCheck = queryPhone || localPhone;

    if (phoneToCheck) {
      fetch(`/api/v1/public/chat-links/${encodeURIComponent(slug)}/messages?phone=${encodeURIComponent(phoneToCheck)}`)
        .then(r => r.json())
        .then(d => {
          if (d.success && Array.isArray(d.messages) && d.messages.length > 0) {
            setCustomerPhone(phoneToCheck);
            setMessages(d.messages);
            setIsReturningGuest(true);
            const savedName = localStorage.getItem('sarvya_guest_name');
            if (savedName) setCustomerName(savedName);
            // Auto open if navigated with ?phone or if this was the last active chat slug
            if (queryPhone || localStorage.getItem('sarvya_active_chat_slug') === slug) {
              setInAppChatOpen(true);
            }
          }
        })
        .catch(() => {});
    }
  }, [slug]);

  const handleCopyRecoveryLink = () => {
    if (!customerPhone) return;
    const recoveryUrl = `${window.location.origin}/c/${encodeURIComponent(slug)}?phone=${encodeURIComponent(customerPhone)}`;
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(recoveryUrl);
      } else {
        const ta = document.createElement('textarea');
        ta.value = recoveryUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {}
  };

  const fetchPropertyGallery = useCallback(async () => {
    if (!slug) return;
    setLoadingGallery(true);
    try {
      const res = await fetch(`/api/v1/public/chat-links/${encodeURIComponent(slug)}/gallery`);
      const data = await res.json();
      if (data.success && Array.isArray(data.photos)) {
        setGalleryPhotos(data.photos);
      }
    } catch {
      // ignore
    } finally {
      setLoadingGallery(false);
    }
  }, [slug]);

  const loadLink = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const searchStr = window.location.search ? window.location.search : '';
      const res = await fetch(`/api/v1/public/chat-links/${encodeURIComponent(slug)}${searchStr}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Conversation link not found.');
      }
      const lk = data.link || data.data;
      setLinkData(lk);
      setActiveMessage(lk.defaultMessage || lk.default_message || '');

      const initialPhotos = lk.gallery || lk.galleryData?.all_photos || [];
      if (Array.isArray(initialPhotos) && initialPhotos.length > 0) {
        setGalleryPhotos(initialPhotos);
      } else {
        fetchPropertyGallery();
      }

      // Direct WhatsApp redirect support if requested in query parameters
      const currentQuery = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      if (currentQuery.get('redirect') === 'whatsapp' || currentQuery.get('wa') === '1') {
        const targetWaUrl = lk.waMeUrl || lk.urls?.waMeUrl;
        if (targetWaUrl) {
          window.location.href = targetWaUrl;
          return;
        }
      }
    } catch (err) {
      setError(err.message || 'Unable to load conversation link.');
    } finally {
      setLoading(false);
    }
  }, [slug, fetchPropertyGallery]);

  useEffect(() => {
    loadLink();
  }, [loadLink]);

  // Live 2-way sync: fetch latest replies from concierge every 2.5 seconds while chat is active
  useEffect(() => {
    if (!inAppChatOpen || !customerPhone) return;

    let isMounted = true;
    const fetchLatestMessages = async () => {
      try {
        const res = await fetch(`/api/v1/public/chat-links/${encodeURIComponent(slug)}/messages?phone=${encodeURIComponent(customerPhone)}`);
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.messages)) {
          setMessages(prev => {
            // Retain any pending optimistic messages that haven't appeared in backend yet
            const pendingOptimistic = prev.filter(m => m.is_optimistic && !data.messages.some(dm => dm.message_body === m.message_body));
            const merged = [...data.messages, ...pendingOptimistic];

            // If length and last message ID match, return previous state reference to prevent re-render
            if (prev.length === merged.length) {
              const prevLast = prev[prev.length - 1];
              const mergedLast = merged[merged.length - 1];
              if (prevLast?.id === mergedLast?.id && prevLast?.message_body === mergedLast?.message_body) {
                return prev;
              }
            }

            // If new messages arrived while user is scrolled up reading earlier messages
            if (!isAtBottomRef.current && merged.length > prev.length) {
              setHasUnseenNewMessages(true);
              setShowScrollBottomBtn(true);
            }

            return merged;
          });
        }
      } catch {
        // Polling retry
      }
    };

    const interval = setInterval(fetchLatestMessages, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [inAppChatOpen, customerPhone, slug]);

  // Smooth scroll strictly within chat body on message updates
  useEffect(() => {
    if (!inAppChatOpen || !chatScrollContainerRef.current) return;
    const container = chatScrollContainerRef.current;

    // Initial load when opening chat: jump straight to bottom
    if (!initialScrollDoneRef.current) {
      container.scrollTop = container.scrollHeight;
      initialScrollDoneRef.current = true;
      return;
    }

    // Auto-scroll only if user just sent a message or was already reading at the bottom
    if (userJustSentRef.current || isAtBottomRef.current) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: userJustSentRef.current ? 'smooth' : 'auto'
      });
      userJustSentRef.current = false;
      setShowScrollBottomBtn(false);
      setHasUnseenNewMessages(false);
    }
  }, [messages, inAppChatOpen]);

  const handleStartChat = async (channel = 'WEB') => {
    const cleanName = customerName.trim();
    if (!cleanName) {
      setNameError('Please enter your name so our concierge can personally assist you.');
      const el = document.getElementById('customer-name-input');
      if (el) el.focus();
      return;
    }

    // Validate intake fields only if dates were provided on landing screen
    const errors = {};
    const checkInField = configuredFields.find(f => f.id === 'check_in');
    const checkOutField = configuredFields.find(f => f.id === 'check_out');

    if (checkInField && intakeValues.check_in && intakeValues.check_in < getTodayStr()) {
      errors.check_in = 'Check-in date cannot be in the past.';
    }
    if (checkInField && checkOutField && intakeValues.check_in && intakeValues.check_out && intakeValues.check_out <= intakeValues.check_in) {
      errors.check_out = 'Check-out date must be strictly after check-in date.';
    }

    if (Object.keys(errors).length > 0) {
      setIntakeErrors(errors);
      return;
    }
    setIntakeErrors({});

    setSubmitting(true);
    setNameError('');

    try {
      const hasDates = Boolean(intakeValues.check_in && intakeValues.check_out);
      const datesText = hasDates ? `from ${intakeValues.check_in} to ${intakeValues.check_out}` : '';
      const guestsText = hasDates && intakeValues.total_guests ? `for ${intakeValues.total_guests} guests` : '';
      const specsSummary = [datesText, guestsText].filter(Boolean).join(' ');

      const defaultIntro = specsSummary
        ? `I would like to check villa availability and rates ${specsSummary}.`
        : (linkData?.defaultMessage || linkData?.default_message || 'Hello, I would like to inquire about booking.');

      const introMsg = activeMessage.trim() || defaultIntro;
      const fullMessage = `Hi ${linkData?.welcomeTitle || 'KonkanTrip Resort'}, my name is ${cleanName}. ${introMsg}`;

      const res = await fetch(`/api/v1/public/chat-links/${encodeURIComponent(slug)}/start-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: cleanName,
          customerPhone: customerPhone.trim(),
          message: fullMessage,
          queryParams: queryObj,
          intakeData: hasDates ? intakeValues : null,
          channel
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to start conversation.');
      }

      // Persist contact name, phone/session ID, and slug for returning continuity
      const assignedPhone = data.data?.customerPhone || customerPhone.trim();
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('sarvya_guest_name', cleanName);
          if (assignedPhone) {
            localStorage.setItem('sarvya_guest_phone', assignedPhone);
          }
          localStorage.setItem('sarvya_active_chat_slug', slug);
        } catch {}
      }

      if (channel === 'WHATSAPP') {
        const waUrl = data.data?.personalizedWaMeUrl || `https://wa.me/${linkData.phoneNumber}?text=${encodeURIComponent(fullMessage)}`;
        window.location.href = waUrl;
      } else {
        const isReturning = Boolean(data.data?.isExistingGuest);
        setIsReturningGuest(isReturning);
        setCustomerPhone(data.data?.customerPhone || customerPhone.trim());
        setMessages(data.data?.messages || []);
        setInAppChatOpen(true);
        setActiveMessage('');
        initialScrollDoneRef.current = false;
        isAtBottomRef.current = true;
        userJustSentRef.current = true;
        setTimeout(() => {
          scrollToBottom(false);
          inputRef.current?.focus();
        }, 150);
      }
    } catch (err) {
      alert(err.message || 'Error connecting to concierge.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendMessage = async (textToSend, options = {}) => {
    const cleanText = (textToSend || activeMessage).trim();
    if (!cleanText || !customerPhone || sendingFollowUp) return;

    setActiveMessage('');
    setSendingFollowUp(true);
    userJustSentRef.current = true;
    isAtBottomRef.current = true;

    // Optimistic message append
    const tempMsg = {
      id: `temp_${Date.now()}`,
      from_phone: customerPhone,
      message_body: cleanText,
      received_at: new Date().toISOString(),
      source: 'CHAT_LINK',
      is_optimistic: true
    };
    setMessages(prev => [...prev, tempMsg]);
    setTimeout(() => scrollToBottom(true), 10);

    try {
      const res = await fetch(`/api/v1/public/chat-links/${encodeURIComponent(slug)}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: customerPhone,
          message: cleanText,
          flowSubmission: options.flowSubmission || options.flow_submission || null,
          intakeData: options.intakeData || options.intake_data || null
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to deliver message.');
      }

      if (data.autoReply) {
        setMessages(prev => {
          const withoutTemp = prev.filter(m => m.id !== tempMsg.id);
          const savedCustomerMsg = data.message || data.data || tempMsg;
          return [...withoutTemp, savedCustomerMsg, data.autoReply];
        });
      } else if (data.message || data.data) {
        setMessages(prev => {
          const withoutTemp = prev.filter(m => m.id !== tempMsg.id);
          return [...withoutTemp, data.message || data.data];
        });
      }
    } catch (err) {
      console.error('[Public Chat] Message send note:', err.message);
    } finally {
      setSendingFollowUp(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleFlowSubmit = (summaryText, formValues, msgId) => {
    if (msgId) {
      setSubmittedFlowMsgIds(prev => new Set([...prev, msgId]));
    }
    handleSendMessage(summaryText, {
      flowSubmission: { intake_data: formValues }
    });
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    handleSendMessage(activeMessage);
  };

  const waUrl = linkData?.urls?.waMeUrl 
    || `https://wa.me/${linkData?.phoneNumber || linkData?.phone_number || '919209967364'}?text=${encodeURIComponent(`Hi ${linkData?.welcomeTitle || 'KonkanTrip'}! My name is ${customerName || 'Guest'}.`)}`;

  if (loading) {
    return (
      <div className="public-chat-page">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'var(--sarvya-blue)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            fontWeight: 800,
            fontSize: '1.25rem',
            boxShadow: 'var(--shadow-md)',
            animation: 'sarvyaPulse 1.8s infinite'
          }}>
            S
          </div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#171719' }}>Connecting to Guest Concierge...</div>
        </div>
      </div>
    );
  }

  if (error || !linkData) {
    return (
      <div className="public-chat-page">
        <div style={{
          width: '100%',
          maxWidth: '440px',
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          padding: '32px 24px',
          textAlign: 'center',
          boxShadow: '0 12px 36px rgba(0,0,0,0.08)'
        }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            background: '#FDF0F0',
            color: '#9B2C2C',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto'
          }}>
            <MessageSquare size={24} />
          </div>
          <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#171719', margin: '0 0 8px 0' }}>Link Unavailable</h1>
          <p style={{ fontSize: '0.85rem', color: '#67676B', margin: '0 0 20px 0', lineHeight: 1.5 }}>
            {error || 'This conversation link is either inactive or does not exist.'}
          </p>
          <a
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '9px 18px',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: 700,
              background: '#2876B8',
              color: '#FFFFFF',
              textDecoration: 'none'
            }}
          >
            Visit Homepage
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="public-chat-page">
      <div className="public-chat-shell">
        
        {/* Top Concierge Header */}
        <div className="public-chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
            {/* Business Avatar with Online Status */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.18)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                fontWeight: 800,
                fontSize: '1rem'
              }}>
                <MessageCircle size={20} color="#FFFFFF" />
              </div>
              <span
                className="public-chat-online-dot"
                style={{ position: 'absolute', bottom: '1px', right: '1px' }}
                title="Concierge is online"
              />
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <h1 style={{
                  fontSize: 'clamp(0.85rem, 2.6vw, 0.95rem)',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  margin: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {linkData.welcomeTitle || 'KonkanTrip Beach Resort & Spa'}
                </h1>
                <ShieldCheck size={15} color="#C3D1AC" title="Verified WhatsApp Business" style={{ flexShrink: 0 }} />
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                marginTop: '1px',
                fontSize: '0.7rem',
                color: 'rgba(255, 255, 255, 0.88)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                <span>⚡ Live Concierge</span>
                <span>•</span>
                <span>Replies in ~2 mins</span>
              </div>
            </div>
          </div>

          {/* Action buttons on header right */}
          <div className="public-chat-header-actions">
            {/* Copy Recovery Link Pill */}
            {inAppChatOpen && customerPhone && (
              <button
                type="button"
                onClick={handleCopyRecoveryLink}
                style={{
                  background: copiedLink ? '#EDF4E6' : 'rgba(255, 255, 255, 0.14)',
                  color: copiedLink ? '#2F5219' : '#FFFFFF',
                  border: copiedLink ? '1px solid #C3D1AC' : '1px solid rgba(255, 255, 255, 0.22)',
                  borderRadius: '20px',
                  padding: '5px 9px',
                  fontSize: '0.725rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease'
                }}
                title="Save or copy link to resume chat on any device"
              >
                {copiedLink ? <Check size={13} color="#2F5219" /> : <Link2 size={13} />}
                <span className="hide-on-mobile-xs">{copiedLink ? 'Saved' : 'Save'}</span>
              </button>
            )}

            {/* View Property Photos Topbar Pill */}
            <button
              type="button"
              onClick={() => setShowGalleryModal(true)}
              className="public-chat-gallery-pill"
              title="View resort & villa photo gallery"
            >
              <ImageIcon size={13} />
              <span className="hide-on-mobile-xs">Photos</span>
              {galleryPhotos.length > 0 && <span style={{ opacity: 0.9 }}>({galleryPhotos.length})</span>}
            </button>

            {/* Seamless WhatsApp Switch */}
            <a
              href={waUrl}
              target="_blank"
              rel="noreferrer"
              className="public-chat-wa-pill"
              title="Open chat in WhatsApp app"
            >
              <MessageCircle size={14} fill="#FFFFFF" />
              <span className="hide-on-mobile-xs">WhatsApp</span>
            </a>

            {/* QR Code trigger on desktop */}
            {linkData.qrSvg && (
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="hide-on-mobile"
                style={{
                  background: 'rgba(255, 255, 255, 0.14)',
                  border: '1px solid rgba(255, 255, 255, 0.22)',
                  color: '#FFFFFF',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  cursor: 'pointer',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
                title="Scan QR Code to chat on mobile"
              >
                <QrCode size={15} />
              </button>
            )}
          </div>
        </div>

        {/* =========================================================================
            STATE 1: Guest Intake / Pre-Chat Welcome Screen
            ========================================================================= */}
        {!inAppChatOpen ? (
          <div className="public-chat-prechat-body">
            <div className="public-chat-prechat-card">
              
              {/* Header Badge & Title */}
              <div>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#EDF4E6',
                  color: '#2F5219',
                  border: '1px solid #C3D1AC',
                  fontSize: '0.725rem',
                  fontWeight: 700,
                  padding: '3px 9px',
                  borderRadius: '12px',
                  marginBottom: '8px'
                }}>
                  <Sparkles size={12} /> Direct CRM Concierge
                </div>
                <h2 style={{ fontSize: 'clamp(1rem, 3.5vw, 1.2rem)', fontWeight: 800, color: '#171719', margin: '0 0 6px 0' }}>
                  {linkData.welcomeTitle || linkData.title || 'Welcome!'}
                </h2>
                <p style={{ fontSize: '0.85rem', color: '#67676B', margin: 0, lineHeight: 1.5 }}>
                  {linkData.welcomeDescription || 'Connect directly with our team for reservations, catalog inquiries, and live assistance.'}
                </p>
              </div>

              {/* Property & Villa Photo Gallery Preview Banner */}
              {galleryPhotos.length > 0 && (
                <div className="public-chat-gallery-banner">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                    <div style={{
                      display: 'flex',
                      position: 'relative',
                      width: '56px',
                      height: '38px',
                      flexShrink: 0
                    }}>
                      {galleryPhotos.slice(0, 3).map((photo, i) => (
                        <img
                          key={photo.id || i}
                          src={photo.image_url}
                          alt={photo.caption || 'Resort Photo'}
                          style={{
                            width: '38px',
                            height: '38px',
                            objectFit: 'cover',
                            borderRadius: '8px',
                            border: '2px solid #FFFFFF',
                            position: 'absolute',
                            left: `${i * 10}px`,
                            boxShadow: '0 2px 5px rgba(0,0,0,0.15)'
                          }}
                        />
                      ))}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.825rem', fontWeight: 700, color: '#171719', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Resort Photo Gallery
                      </div>
                      <div style={{ fontSize: '0.725rem', color: '#67676B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {galleryPhotos.length} photos of villas & amenities
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGalleryModal(true)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '8px',
                      background: '#FFFFFF',
                      color: '#2876B8',
                      border: '1px solid #C4DCF0',
                      fontSize: '0.775rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      flexShrink: 0,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      transition: 'all 0.15s ease',
                      minHeight: '38px',
                      touchAction: 'manipulation'
                    }}
                  >
                    <Eye size={13} />
                    <span>View Images</span>
                  </button>
                </div>
              )}

              {/* Active Conversation in Progress Banner */}
              {messages.length > 0 && customerPhone && (
                <div style={{
                  background: '#EDF4E6',
                  border: '1px solid #C3D1AC',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#2F5219' }}>
                      Active Chat in Progress ({messages.length} messages)
                    </div>
                    <div style={{ fontSize: '0.725rem', color: '#67676B' }}>
                      Pick up right where you left off
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInAppChatOpen(true)}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      background: '#2876B8',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      boxShadow: '0 2px 6px rgba(40, 118, 184, 0.25)'
                    }}
                  >
                    <span>Resume Chat</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}

              {/* Returning Guest Quick Recall Card */}
              {customerName && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#EEF5FB',
                  border: '1px solid #C4DCF0',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  fontSize: '0.8rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={16} color="#2876B8" />
                    <span style={{ color: '#171719', fontWeight: 600 }}>
                      Welcome back, <strong>{customerName}</strong>!
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerName('');
                      setCustomerPhone('');
                      try {
                        localStorage.removeItem('sarvya_guest_name');
                        localStorage.removeItem('sarvya_guest_phone');
                      } catch {}
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2876B8',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: '2px 6px'
                    }}
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Input Fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Full Name */}
                <div>
                  <label htmlFor="customer-name-input" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#171719', marginBottom: '6px' }}>
                    Your Full Name <span style={{ color: '#9B2C2C' }}>*</span>
                  </label>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    borderRadius: '8px',
                    border: nameError ? '1px solid #F87171' : '1px solid #D4D4D9',
                    background: nameError ? '#FEF2F2' : '#FFFFFF',
                    padding: '10px 14px',
                    transition: 'all 0.15s ease'
                  }}>
                    <User size={16} color="#96969C" style={{ flexShrink: 0 }} />
                    <input
                      id="customer-name-input"
                      className="public-chat-form-input"
                      type="text"
                      placeholder="e.g. Rahul Patil"
                      value={customerName}
                      onChange={e => {
                        setCustomerName(e.target.value);
                        if (nameError) setNameError('');
                      }}
                      style={{
                        border: 'none',
                        outline: 'none',
                        width: '100%',
                        fontSize: '0.875rem',
                        color: '#171719',
                        background: 'transparent'
                      }}
                      autoFocus
                    />
                  </div>
                  {nameError && (
                    <div style={{ color: '#9B2C2C', fontSize: '0.75rem', fontWeight: 600, marginTop: '5px' }}>
                      {nameError}
                    </div>
                  )}
                </div>

                {/* Phone Number */}
                <div>
                  <label htmlFor="customer-phone-input" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#171719', marginBottom: '6px' }}>
                    WhatsApp / Mobile Number <span style={{ fontSize: '0.75rem', color: '#96969C', fontWeight: 400 }}>(Optional for booking confirmation)</span>
                  </label>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    borderRadius: '8px',
                    border: '1px solid #D4D4D9',
                    background: '#FFFFFF',
                    padding: '10px 14px'
                  }}>
                    <Phone size={16} color="#96969C" style={{ flexShrink: 0 }} />
                    <input
                      id="customer-phone-input"
                      className="public-chat-form-input"
                      type="tel"
                      placeholder="e.g. +91 98765 43210"
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      style={{
                        border: 'none',
                        outline: 'none',
                        width: '100%',
                        fontSize: '0.875rem',
                        color: '#171719',
                        background: 'transparent'
                      }}
                    />
                  </div>
                </div>

                {/* Customizable Intake Fields (Check-in, Check-out, Guests, and Custom Fields) */}
                {configuredFields.length > 0 && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    padding: '12px',
                    borderRadius: '10px',
                    background: '#F8FAF5',
                    border: '1px solid #D9E4CC'
                  }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2F5219', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Stay & Booking Details
                    </div>

                    <div className="public-chat-dates-grid">
                      {configuredFields.filter(f => f.id === 'check_in' || f.id === 'check_out').map((field) => {
                        const val = intakeValues[field.id] !== undefined ? intakeValues[field.id] : '';
                        const err = intakeErrors[field.id];
                        return (
                          <div key={field.id}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#171719', marginBottom: '4px' }}>
                              {field.label} {field.required && <span style={{ color: '#9B2C2C' }}>*</span>}
                            </label>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              borderRadius: '8px',
                              border: err ? '1px solid #F87171' : '1px solid #D4D4D9',
                              background: err ? '#FEF2F2' : '#FFFFFF',
                              padding: '8px 10px',
                              minHeight: '42px',
                              boxSizing: 'border-box'
                            }}>
                              <Calendar size={14} color="#67676B" style={{ flexShrink: 0 }} />
                              <input
                                type="date"
                                className="public-chat-form-input"
                                min={field.id === 'check_out' && intakeValues.check_in ? intakeValues.check_in : getTodayStr()}
                                value={val}
                                onChange={e => {
                                  setIntakeValues(prev => ({ ...prev, [field.id]: e.target.value }));
                                  if (err) setIntakeErrors(prev => ({ ...prev, [field.id]: null }));
                                }}
                                style={{
                                  border: 'none',
                                  outline: 'none',
                                  width: '100%',
                                  minWidth: 0,
                                  fontSize: '0.8rem',
                                  color: '#171719',
                                  background: 'transparent',
                                  fontFamily: 'inherit'
                                }}
                              />
                            </div>
                            {err && <div style={{ color: '#9B2C2C', fontSize: '0.7rem', fontWeight: 600, marginTop: '2px' }}>{err}</div>}
                          </div>
                        );
                      })}
                    </div>

                    {/* Total Guests Stepper if enabled */}
                    {configuredFields.some(f => f.id === 'total_guests') && (() => {
                      const field = configuredFields.find(f => f.id === 'total_guests');
                      const val = Number(intakeValues.total_guests || 2);
                      const err = intakeErrors.total_guests;
                      return (
                        <div key="total_guests">
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#171719', marginBottom: '4px' }}>
                            {field.label} {field.required && <span style={{ color: '#9B2C2C' }}>*</span>}
                          </label>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderRadius: '8px',
                            border: err ? '1px solid #F87171' : '1px solid #D4D4D9',
                            background: err ? '#FEF2F2' : '#FFFFFF',
                            padding: '6px 12px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Users size={15} color="#67676B" />
                              <span style={{ fontSize: '0.825rem', fontWeight: 700, color: '#171719' }}>
                                {val} Guest{val > 1 ? 's' : ''}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (val > (field.min || 1)) {
                                    setIntakeValues(prev => ({ ...prev, total_guests: val - 1 }));
                                  }
                                }}
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '6px',
                                  border: '1px solid #D4D4D9',
                                  background: '#F5F5F6',
                                  fontSize: '0.9rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                -
                              </button>
                              <span style={{ minWidth: '22px', textAlign: 'center', fontWeight: 700, fontSize: '0.825rem' }}>{val}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (val < (field.max || 20)) {
                                    setIntakeValues(prev => ({ ...prev, total_guests: val + 1 }));
                                  }
                                }}
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '6px',
                                  border: '1px solid #D4D4D9',
                                  background: '#F5F5F6',
                                  fontSize: '0.9rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                +
                              </button>
                            </div>
                          </div>
                          {err && <div style={{ color: '#9B2C2C', fontSize: '0.7rem', fontWeight: 600, marginTop: '2px' }}>{err}</div>}
                        </div>
                      );
                    })()}

                    {/* Custom / Other Fields */}
                    {configuredFields.filter(f => f.id !== 'check_in' && f.id !== 'check_out' && f.id !== 'total_guests').map((field) => {
                      const val = intakeValues[field.id] !== undefined ? intakeValues[field.id] : (field.defaultValue || '');
                      const err = intakeErrors[field.id];

                      if (field.type === 'select' && Array.isArray(field.options)) {
                        return (
                          <div key={field.id}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#171719', marginBottom: '4px' }}>
                              {field.label} {field.required && <span style={{ color: '#9B2C2C' }}>*</span>}
                            </label>
                            <select
                              className="public-chat-form-select"
                              value={val}
                              onChange={e => {
                                setIntakeValues(prev => ({ ...prev, [field.id]: e.target.value }));
                                if (err) setIntakeErrors(prev => ({ ...prev, [field.id]: null }));
                              }}
                              style={{
                                width: '100%',
                                minHeight: '42px',
                                borderRadius: '8px',
                                border: err ? '1px solid #F87171' : '1px solid #D4D4D9',
                                background: '#FFFFFF',
                                padding: '8px 10px',
                                fontSize: '0.825rem',
                                color: '#171719',
                                outline: 'none',
                                boxSizing: 'border-box',
                                touchAction: 'manipulation'
                              }}
                            >
                              <option value="">{field.placeholder || `Select ${field.label}`}</option>
                              {field.options.map((opt, i) => (
                                <option key={i} value={opt}>{opt}</option>
                              ))}
                            </select>
                            {err && <div style={{ color: '#9B2C2C', fontSize: '0.7rem', fontWeight: 600, marginTop: '2px' }}>{err}</div>}
                          </div>
                        );
                      }

                      return (
                        <div key={field.id}>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#171719', marginBottom: '4px' }}>
                            {field.label} {field.required && <span style={{ color: '#9B2C2C' }}>*</span>}
                          </label>
                          <input
                            type={field.type || 'text'}
                            className="public-chat-form-input"
                            placeholder={field.placeholder || `Enter ${field.label}`}
                            value={val}
                            onChange={e => {
                              setIntakeValues(prev => ({ ...prev, [field.id]: e.target.value }));
                              if (err) setIntakeErrors(prev => ({ ...prev, [field.id]: null }));
                            }}
                            style={{
                              width: '100%',
                              minHeight: '42px',
                              borderRadius: '8px',
                              border: err ? '1px solid #F87171' : '1px solid #D4D4D9',
                              background: '#FFFFFF',
                              padding: '8px 10px',
                              fontSize: '0.825rem',
                              color: '#171719',
                              outline: 'none',
                              boxSizing: 'border-box',
                              touchAction: 'manipulation'
                            }}
                          />
                          {err && <div style={{ color: '#9B2C2C', fontSize: '0.7rem', fontWeight: 600, marginTop: '2px' }}>{err}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Inquiry Preview */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#171719', marginBottom: '6px' }}>
                    Your Inquiry Message
                  </label>
                  <div style={{
                    background: 'var(--status-success-bg)',
                    border: '1px solid var(--status-success-border)',
                    borderRadius: '14px 14px 2px 14px',
                    padding: '12px 14px',
                    fontSize: '0.85rem',
                    color: 'var(--text-primary)',
                    boxShadow: 'var(--shadow-xs)'
                  }}>
                    <textarea
                      rows={2}
                      className="public-chat-form-textarea"
                      value={activeMessage}
                      onChange={e => setActiveMessage(e.target.value)}
                      placeholder="Type your question or request here..."
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        resize: 'none',
                        fontSize: '0.85rem',
                        color: 'var(--text-primary)',
                        lineHeight: 1.45,
                        fontFamily: 'inherit',
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', fontSize: '0.675rem', color: '#2F5219', marginTop: '4px' }}>
                      <span>Ready to send</span>
                      <CheckCircle2 size={12} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => handleStartChat('WEB')}
                  disabled={submitting}
                  style={{
                    width: '100%',
                    minHeight: '48px',
                    padding: '12px 18px',
                    borderRadius: '10px',
                    background: '#2876B8',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 3px 8px rgba(40, 118, 184, 0.25)',
                    transition: 'all 0.15s ease',
                    touchAction: 'manipulation'
                  }}
                >
                  <MessageSquare size={17} />
                  <span>{submitting ? 'Connecting...' : 'Start Concierge Chat (Web)'}</span>
                  <ArrowRight size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => handleStartChat('WHATSAPP')}
                  disabled={submitting}
                  style={{
                    width: '100%',
                    minHeight: '46px',
                    padding: '12px 18px',
                    borderRadius: '10px',
                    background: '#F3F6EE',
                    color: '#2F5219',
                    border: '1px solid #C3D1AC',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                    touchAction: 'manipulation'
                  }}
                >
                  <MessageCircle size={17} color="var(--status-success-text)" />
                  <span>Continue on WhatsApp App</span>
                  <ExternalLink size={13} color="var(--status-success-text)" />
                </button>
              </div>

              <div style={{ textAlign: 'center', fontSize: '0.725rem', color: '#96969C' }}>
                🔒 Direct 2-Way CRM Sync • End-to-End Encrypted
              </div>
            </div>
          </div>
        ) : (
          /* =========================================================================
             STATE 2: Interactive Real-Time Concierge Chat Room
             ========================================================================= */
          <>
            {/* Scrollable Message Thread */}
            <div ref={chatScrollContainerRef} className="public-chat-body" onScroll={handleScroll}>
              
              {/* Date Separator */}
              <div className="public-chat-date-pill">Today</div>

              {/* Returning Guest Greeting Toast */}
              {isReturningGuest && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#EDF4E6',
                  border: '1px solid #C3D1AC',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  fontSize: '0.775rem',
                  color: '#2F5219',
                  alignSelf: 'center',
                  maxWidth: '90%'
                }}>
                  <CheckCircle2 size={15} color="#2F5219" style={{ flexShrink: 0 }} />
                  <span>
                    <strong>Welcome back, {customerName}!</strong> Your past conversation history is synced.
                  </span>
                </div>
              )}

              {/* Automated Concierge Welcome Bubble only if thread has no outbound replies yet */}
              {!messages.some(m => m.message_type === 'outbound' || m.reply_status === 'SENT' || m.source === 'INBOX' || m.is_outbound) && (
                <div className="public-chat-bubble-concierge">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.75rem', color: '#2876B8' }}>
                      {linkData.welcomeTitle || 'KonkanTrip Concierge'}
                    </span>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      background: '#EDF4E6',
                      color: '#2F5219',
                      padding: '1px 6px',
                      borderRadius: '8px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}>
                      <Sparkles size={9} /> Automated Reception
                    </span>
                  </div>
                  <div style={{ color: '#171719', lineHeight: 1.5 }}>
                    {formatChatText(linkData.autoReplyMessage || `Hello ${customerName}! Thank you for reaching out to ${linkData.welcomeTitle || 'KonkanTrip'}. We have received your inquiry and our desk is assisting you.`)}
                  </div>
                  <div style={{ fontSize: '0.675rem', color: '#96969C', textAlign: 'right', marginTop: '4px' }}>
                    Just now
                  </div>
                </div>
              )}

              {/* Live Messages Canvas */}
              {messages.map((m, idx) => {
                const isOutbound = m.message_type === 'outbound' || m.source === 'INBOX' || m.is_outbound === true;
                const formattedTime = m.received_at ? formatIndianTime(m.received_at) : 'Just now';
                const bodyText = m.message_body || m.reply_text || '';

                if (isOutbound) {
                  // Message from Concierge / Agent
                  return (
                    <div key={m.id || idx} className="public-chat-bubble-concierge">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.75rem', color: '#1E5E94' }}>
                          {linkData.welcomeTitle || linkData.title || 'Concierge'}
                        </span>
                        {m.is_auto && (
                          <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            background: '#EDF4E6',
                            color: '#2F5219',
                            padding: '1px 6px',
                            borderRadius: '8px'
                          }}>
                            Auto-Reply
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#171719', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                        {formatChatText(bodyText)}
                      </div>

                      {/* Interactive Flow Step Options & Actions */}
                      {(() => {
                        let payload = null;
                        if (m.raw_payload) {
                          try {
                            payload = typeof m.raw_payload === 'string' ? JSON.parse(m.raw_payload) : m.raw_payload;
                          } catch {}
                        }
                        if (!payload) return null;

                        if (payload.interactive_type === 'in_chat_flow') {
                          const cardId = m.id || m.wa_message_id || `flow_${m.received_at || 'msg'}`;
                          return (
                            <InChatFlowCard
                              key={`flow_card_${cardId}`}
                              msgId={cardId}
                              payload={payload}
                              onSubmit={handleFlowSubmit}
                              disabled={sendingFollowUp}
                              isAlreadySubmitted={submittedFlowMsgIds.has(cardId)}
                            />
                          );
                        }

                        if (payload.interactive_type === 'flow_step' && payload.step === 'ROOM_SELECTION' && Array.isArray(payload.options)) {
                          const anyAvail = payload.options.some(opt => opt.available);
                          return (
                            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: anyAvail ? '#1E5E94' : '#9B2C2C', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                {anyAvail ? 'Tap an available room to choose:' : 'All categories are currently sold out:'}
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {payload.options.map((opt) => {
                                  const isSoldOut = opt.available === false || opt.available_count === 0;
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() => !isSoldOut && handleSendMessage(opt.name)}
                                      disabled={sendingFollowUp || isSoldOut}
                                      style={{
                                        minHeight: '42px',
                                        padding: '8px 14px',
                                        borderRadius: '8px',
                                        border: isSoldOut ? '1px solid #E2E8F0' : '1px solid #C4DCF0',
                                        background: isSoldOut ? '#F8FAFC' : '#F0F6FB',
                                        color: isSoldOut ? '#94A3B8' : '#1E5E94',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        cursor: isSoldOut ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        opacity: isSoldOut ? 0.75 : 1,
                                        transition: 'all 0.15s ease',
                                        touchAction: 'manipulation',
                                        boxSizing: 'border-box'
                                      }}
                                    >
                                      <span>🛏️ {opt.name}</span>
                                      {isSoldOut ? (
                                        <span style={{ background: '#E2E8F0', color: '#64748B', padding: '1px 6px', borderRadius: '10px', fontSize: '0.675rem', fontWeight: 700 }}>
                                          Sold Out
                                        </span>
                                      ) : opt.available_count <= 2 ? (
                                        <span style={{ background: '#FEF3C7', color: '#B45309', padding: '1px 6px', borderRadius: '10px', fontSize: '0.675rem', fontWeight: 700 }}>
                                          Only {opt.available_count} left!
                                        </span>
                                      ) : null}
                                      {opt.total_price && !isSoldOut && (
                                        <span style={{ background: '#2876B8', color: '#FFFFFF', padding: '1px 6px', borderRadius: '10px', fontSize: '0.7rem' }}>
                                          ₹{opt.total_price.toLocaleString('en-IN')}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }

                        if (payload.interactive_type === 'room_sold_out') {
                          return (
                            <div style={{
                              marginTop: '10px',
                              background: '#FEF2F2',
                              color: '#991B1B',
                              border: '1px solid #FECACA',
                              borderRadius: '8px',
                              padding: '10px 14px',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              flexWrap: 'wrap'
                            }}>
                              <span>⚠️ Room is currently sold out for these dates.</span>
                              <button
                                type="button"
                                onClick={() => handleSendMessage('Change dates')}
                                disabled={sendingFollowUp}
                                style={{
                                  minHeight: '38px',
                                  background: '#FFFFFF',
                                  border: '1px solid #FCA5A5',
                                  color: '#991B1B',
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  touchAction: 'manipulation'
                                }}
                              >
                                Change Dates
                              </button>
                            </div>
                          );
                        }

                        if (payload.interactive_type === 'quote_summary' && payload.quote) {
                          const q = payload.quote;
                          return (
                            <div style={{
                              marginTop: '12px',
                              background: '#F8FAF5',
                              border: '1px solid #C3D1AC',
                              borderRadius: '10px',
                              padding: '12px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#2F5219' }}>
                                  ₹{q.pricing_summary?.estimated_grand_total?.toLocaleString('en-IN')} Estimated Total
                                </span>
                                <span style={{ fontSize: '0.7rem', color: '#67676B' }}>
                                  {q.reservation_specs?.nights} night(s) • {q.reservation_specs?.adults} adult(s)
                                  {payload.available_rooms !== undefined && ` • ${payload.available_rooms} room(s) left`}
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  onClick={() => handleSendMessage('CONFIRM')}
                                  disabled={sendingFollowUp}
                                  style={{
                                    flex: '1 1 180px',
                                    minHeight: '44px',
                                    padding: '9px 14px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#2F5219',
                                    color: '#FFFFFF',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    touchAction: 'manipulation'
                                  }}
                                >
                                  <CheckCircle2 size={14} />
                                  <span>Confirm Stay Request</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSendMessage('Change dates')}
                                  disabled={sendingFollowUp}
                                  style={{
                                    minHeight: '44px',
                                    padding: '9px 14px',
                                    borderRadius: '8px',
                                    border: '1px solid #D4D4D9',
                                    background: '#FFFFFF',
                                    color: '#171719',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    touchAction: 'manipulation'
                                  }}
                                >
                                  Modify
                                </button>
                              </div>
                            </div>
                          );
                        }

                        if (payload.interactive_type === 'enquiry_confirmed') {
                          return (
                            <div style={{
                              marginTop: '10px',
                              background: '#EDF4E6',
                              color: '#2F5219',
                              border: '1px solid #C3D1AC',
                              borderRadius: '8px',
                              padding: '8px 12px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              <CheckCircle2 size={14} />
                              <span>Enquiry #{payload.enquiry_id} submitted to Front Desk Concierge</span>
                            </div>
                          );
                        }

                        if (payload.interactive_type === 'property_gallery' || (Array.isArray(payload.web_cards) && payload.web_cards.some(c => c.type === 'property_gallery'))) {
                          const galleryCard = Array.isArray(payload.web_cards) ? payload.web_cards.find(c => c.type === 'property_gallery') : null;
                          const cardPhotos = payload.photos || galleryCard?.photos || galleryPhotos.slice(0, 4);
                          return (
                            <div style={{
                              marginTop: '12px',
                              background: '#F0F6FB',
                              border: '1px solid #C4DCF0',
                              borderRadius: '12px',
                              padding: '12px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E5E94' }}>
                                  📸 {galleryCard?.title || 'Resort Photo Gallery'}
                                </span>
                                <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>
                                  {galleryCard?.total_photos || galleryPhotos.length || cardPhotos.length} Photos
                                </span>
                              </div>
                              {cardPhotos.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                                  {cardPhotos.slice(0, 4).map((p, pIdx) => (
                                    <div
                                      key={p.id || pIdx}
                                      onClick={() => setShowGalleryModal(true)}
                                      style={{
                                        aspectRatio: '1',
                                        borderRadius: '8px',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                        position: 'relative'
                                      }}
                                    >
                                      <img
                                        src={p.image_url}
                                        alt={p.caption || 'Resort'}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => setShowGalleryModal(true)}
                                className="public-chat-view-gallery-btn"
                              >
                                <ImageIcon size={15} />
                                <span>View Images of the Property ({galleryPhotos.length || cardPhotos.length} Photos) ➔</span>
                              </button>
                            </div>
                          );
                        }

                        return null;
                      })()}

                      {/* View Gallery Action Button if message refers to photos/gallery */}
                      {/(photo|photos|image|images|gallery|pictures)/i.test(bodyText) && galleryPhotos.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowGalleryModal(true)}
                          className="public-chat-view-gallery-btn"
                        >
                          <ImageIcon size={14} />
                          <span>View Images of the Property ({galleryPhotos.length} Photos) ➔</span>
                        </button>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', fontSize: '0.675rem', color: '#96969C', marginTop: '4px' }}>
                        <Clock size={10} />
                        <span>{formattedTime}</span>
                      </div>
                    </div>
                  );
                }

                // Message from Customer / Guest
                return (
                  <div key={m.id || idx} className="public-chat-bubble-guest">
                    <div style={{ color: '#0F172A', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {formatChatText(bodyText)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', fontSize: '0.675rem', color: '#2F5219', marginTop: '4px' }}>
                      <span>{formattedTime}</span>
                      <CheckCheck size={13} color="#2876B8" title="Received by CRM" />
                    </div>
                  </div>
                );
              })}

              <div ref={chatMessagesEndRef} />
            </div>

            {/* Floating Jump to Latest / New Message Pill */}
            {showScrollBottomBtn && (
              <button
                type="button"
                onClick={() => scrollToBottom(true)}
                className="public-chat-scroll-bottom-pill"
                style={{
                  background: hasUnseenNewMessages ? 'var(--sarvya-blue)' : '#FFFFFF',
                  color: hasUnseenNewMessages ? '#FFFFFF' : '#171719',
                  border: hasUnseenNewMessages ? '1px solid var(--sarvya-blue)' : '1px solid var(--border-color)'
                }}
              >
                <ArrowDown size={14} color={hasUnseenNewMessages ? '#FFFFFF' : 'var(--sarvya-blue)'} />
                <span>{hasUnseenNewMessages ? 'New Message Received ↓' : 'Scroll to Latest'}</span>
              </button>
            )}

            {/* Quick Inquiry Chips Carousel */}
            <div className="public-chat-quick-chips">
              {QUICK_SUGGESTIONS.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="public-chat-chip"
                  onClick={() => {
                    if (item.label === 'View Photos') {
                      setShowGalleryModal(true);
                    } else {
                      handleSendMessage(item.text);
                    }
                  }}
                  disabled={sendingFollowUp}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {/* Floating Composer / Input Bar */}
            <div className="public-chat-composer">
              <form onSubmit={handleFormSubmit} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  ref={inputRef}
                  type="text"
                  required
                  className="public-chat-input"
                  placeholder={`Reply as ${customerName || 'Guest'}...`}
                  value={activeMessage}
                  onChange={e => setActiveMessage(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleFormSubmit(e);
                    }
                  }}
                  onFocus={() => {
                    setTimeout(() => {
                      if (isAtBottomRef.current && chatScrollContainerRef.current) {
                        chatScrollContainerRef.current.scrollTop = chatScrollContainerRef.current.scrollHeight;
                      }
                    }, 120);
                  }}
                />

                <button
                  type="submit"
                  disabled={!activeMessage.trim() || sendingFollowUp}
                  className="public-chat-send-btn"
                  title="Send message to concierge"
                >
                  <Send size={16} />
                </button>
              </form>

              {/* Micro-footer bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.7rem',
                color: '#96969C',
                paddingTop: '2px',
                flexWrap: 'wrap',
                gap: '4px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Prefer WhatsApp?</span>
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--sarvya-blue)', fontWeight: 700, textDecoration: 'none' }}
                  >
                    Open in WhatsApp ↗
                  </a>
                </div>
                <span>Powered by SARVYA OS</span>
              </div>
            </div>
          </>
        )}

      </div>

      {/* Desktop QR Code Modal */}
      {showQrModal && linkData.qrSvg && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgba(23, 23, 25, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setShowQrModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '360px',
              background: '#FFFFFF',
              borderRadius: '20px',
              padding: '24px',
              textAlign: 'center',
              boxShadow: '0 20px 48px rgba(0,0,0,0.2)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#171719', margin: 0 }}>
                Scan to Chat on Mobile
              </h3>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#96969C',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={18} />
              </button>
            </div>
            
            <p style={{ fontSize: '0.8rem', color: '#67676B', margin: '0 0 16px 0', lineHeight: 1.45 }}>
              Point your smartphone camera at this QR code to continue this conversation directly in WhatsApp.
            </p>

            <div
              style={{
                width: '200px',
                height: '200px',
                margin: '0 auto 18px auto',
                padding: '10px',
                background: '#FFFFFF',
                border: '1px solid var(--border-color)',
                borderRadius: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              dangerouslySetInnerHTML={{ __html: linkData.qrSvg }}
            />

            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                background: '#F5F5F6',
                border: '1px solid #E5E5E8',
                color: '#171719',
                fontSize: '0.825rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Property & Villa Photo Gallery Modal */}
      {showGalleryModal && (
        <div
          className="public-gallery-modal-overlay"
          onClick={() => setShowGalleryModal(false)}
        >
          <div
            className="public-gallery-modal-content"
            onClick={e => e.stopPropagation()}
          >
            {/* Gallery Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#FFFFFF'
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
                  <ImageIcon size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#171719', margin: 0 }}>
                    {linkData?.welcomeTitle ? `${linkData.welcomeTitle} • Photo Gallery` : 'Property & Villa Photo Gallery'}
                  </h3>
                  <div style={{ fontSize: '0.725rem', color: '#67676B', marginTop: '2px' }}>
                    {filteredGalleryPhotos.length} {filteredGalleryPhotos.length === 1 ? 'photo' : 'photos'} {activeGalleryCategory !== 'ALL' ? `in "${activeGalleryCategory}"` : 'available'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowGalleryModal(false)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: '#F5F5F6',
                  color: '#67676B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Category Filter Tabs */}
            {galleryCategories.length > 1 && (
              <div style={{
                padding: '10px 20px',
                background: '#FAFAFB',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                gap: '8px',
                overflowX: 'auto',
                scrollbarWidth: 'none'
              }}>
                {galleryCategories.map(cat => {
                  const isActive = activeGalleryCategory === cat;
                  const count = cat === 'ALL' ? galleryPhotos.length : galleryPhotos.filter(p => p.category === cat).length;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveGalleryCategory(cat)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '0.775rem',
                        fontWeight: 700,
                        border: isActive ? '1px solid #2876B8' : '1px solid var(--border-color)',
                        background: isActive ? '#2876B8' : '#FFFFFF',
                        color: isActive ? '#FFFFFF' : '#67676B',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {cat === 'ALL' ? `All Photos (${count})` : `${cat} (${count})`}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Gallery Grid Body */}
            <div style={{
              padding: 'clamp(10px, 3vw, 20px)',
              overflowY: 'auto',
              flex: 1,
              background: '#F5F5F6'
            }}>
              {loadingGallery ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#67676B' }}>
                  <ImageIcon size={32} style={{ animation: 'sarvyaSpin 1.5s linear infinite', marginBottom: '8px' }} />
                  <div>Loading property photos...</div>
                </div>
              ) : filteredGalleryPhotos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#67676B', background: '#FFFFFF', borderRadius: '12px' }}>
                  <ImageIcon size={32} color="#96969C" style={{ marginBottom: '8px' }} />
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#171719' }}>No photos found</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>There are no photos under the selected category.</div>
                </div>
              ) : (
                <div className="public-gallery-grid">
                  {filteredGalleryPhotos.map((photo, index) => (
                    <div
                      key={photo.id || index}
                      onClick={() => setLightboxPhotoIndex(index)}
                      style={{
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid var(--border-color)',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.08)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.04)';
                      }}
                    >
                      <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', overflow: 'hidden', background: '#E2E8F0' }}>
                        <img
                          src={photo.image_url}
                          alt={photo.caption || photo.alt_text || 'Resort Photo'}
                          loading="lazy"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            transition: 'transform 0.3s ease'
                          }}
                        />
                        {photo.category && (
                          <span style={{
                            position: 'absolute',
                            top: '8px',
                            left: '8px',
                            background: 'rgba(15, 23, 42, 0.75)',
                            color: '#FFFFFF',
                            backdropFilter: 'blur(4px)',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.675rem',
                            fontWeight: 700
                          }}>
                            {photo.category}
                          </span>
                        )}
                        <span style={{
                          position: 'absolute',
                          bottom: '8px',
                          right: '8px',
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.9)',
                          color: '#171719',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                        }}>
                          <Maximize2 size={13} />
                        </span>
                      </div>

                      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#171719', lineHeight: 1.3 }}>
                            {photo.caption || photo.alt_text || 'Resort View'}
                          </div>
                          {photo.scope === 'room' && photo.room_name && (
                            <div style={{ fontSize: '0.7rem', color: '#2876B8', fontWeight: 600, marginTop: '2px' }}>
                              🛏️ {photo.room_name}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInquireAboutPhoto(photo);
                          }}
                          style={{
                            marginTop: '6px',
                            minHeight: '36px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            background: '#F0F6FB',
                            color: '#1E5E94',
                            border: '1px solid #C4DCF0',
                            fontSize: '0.725rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            transition: 'all 0.15s ease',
                            touchAction: 'manipulation'
                          }}
                        >
                          <MessageCircle size={12} />
                          <span>Inquire About This</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Photo Lightbox */}
      {lightboxPhotoIndex !== null && filteredGalleryPhotos[lightboxPhotoIndex] && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(10, 15, 25, 0.96)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '16px'
          }}
          onClick={() => setLightboxPhotoIndex(null)}
        >
          {/* Lightbox Topbar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: '#FFFFFF',
              zIndex: 1
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#94A3B8' }}>
                {lightboxPhotoIndex + 1} / {filteredGalleryPhotos.length}
              </span>
              {filteredGalleryPhotos[lightboxPhotoIndex].category && (
                <span style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '0.725rem',
                  fontWeight: 600
                }}>
                  {filteredGalleryPhotos[lightboxPhotoIndex].category}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setLightboxPhotoIndex(null)}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Lightbox Stage (Image & Prev / Next Arrows) */}
          <div
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px',
              minHeight: 0
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Prev Button */}
            {filteredGalleryPhotos.length > 1 && (
              <button
                type="button"
                onClick={() => setLightboxPhotoIndex(prev => (prev > 0 ? prev - 1 : filteredGalleryPhotos.length - 1))}
                style={{
                  position: 'absolute',
                  left: '8px',
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.35)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 2,
                  backdropFilter: 'blur(4px)',
                  transition: 'all 0.15s ease',
                  touchAction: 'manipulation'
                }}
              >
                <ChevronLeft size={22} />
              </button>
            )}

            {/* Current Image */}
            <img
              src={filteredGalleryPhotos[lightboxPhotoIndex].image_url}
              alt={filteredGalleryPhotos[lightboxPhotoIndex].caption || 'Resort Photo'}
              style={{
                maxWidth: '94vw',
                maxHeight: '68dvh',
                objectFit: 'contain',
                borderRadius: '12px',
                boxShadow: '0 20px 48px rgba(0,0,0,0.5)',
                userSelect: 'none'
              }}
            />

            {/* Next Button */}
            {filteredGalleryPhotos.length > 1 && (
              <button
                type="button"
                onClick={() => setLightboxPhotoIndex(prev => (prev < filteredGalleryPhotos.length - 1 ? prev + 1 : 0))}
                style={{
                  position: 'absolute',
                  right: '8px',
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.35)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 2,
                  backdropFilter: 'blur(4px)',
                  transition: 'all 0.15s ease',
                  touchAction: 'manipulation'
                }}
              >
                <ChevronRight size={22} />
              </button>
            )}
          </div>

          {/* Lightbox Footer Bar */}
          <div
            style={{
              padding: '10px 14px',
              background: 'rgba(15, 23, 42, 0.85)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              maxWidth: '800px',
              margin: '0 auto',
              width: '100%',
              zIndex: 1,
              flexWrap: 'wrap',
              boxSizing: 'border-box'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ color: '#FFFFFF', minWidth: 0, flex: '1 1 200px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {filteredGalleryPhotos[lightboxPhotoIndex].caption || filteredGalleryPhotos[lightboxPhotoIndex].alt_text || 'Resort View'}
              </div>
              {filteredGalleryPhotos[lightboxPhotoIndex].room_name && (
                <div style={{ fontSize: '0.725rem', color: '#93C5FD', marginTop: '2px' }}>
                  Category: {filteredGalleryPhotos[lightboxPhotoIndex].room_name}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleInquireAboutPhoto(filteredGalleryPhotos[lightboxPhotoIndex])}
              style={{
                minHeight: '44px',
                padding: '9px 16px',
                borderRadius: '8px',
                background: '#2876B8',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(40, 118, 184, 0.4)',
                touchAction: 'manipulation'
              }}
            >
              <MessageSquare size={14} />
              <span>Inquire In Chat</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
