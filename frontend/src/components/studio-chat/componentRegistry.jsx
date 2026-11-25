import React, { useState } from 'react';
import DynamicFormScreen from '../inapp-runtime/DynamicFormScreen';
import CatalogExplorerScreen from '../inapp-runtime/CatalogExplorerScreen';
import ItemDetailScreen from '../inapp-runtime/ItemDetailScreen';
import RateNegotiationScreen from '../inapp-runtime/RateNegotiationScreen';
import CallConnectScreen from '../inapp-runtime/CallConnectScreen';
import LiveChatScreen from '../inapp-runtime/LiveChatScreen';
import {
  CheckCircle2,
  Calendar,
  Clock,
  CreditCard,
  Headphones,
  Minus,
  Plus,
  ShoppingBag,
  Sparkles,
  AlertTriangle,
  FileText,
  ArrowRight
} from 'lucide-react';

function SafeImg({ src, alt, style }) {
  if (!src || /^javascript:/i.test(String(src).trim())) return null;
  return <img src={src} alt={alt || ''} style={style} loading="lazy" />;
}

export function renderConversationalStep({
  screen,
  fields = [],
  experience = {},
  stateData = {},
  catalogItems = [],
  catalogMeta = {},
  sessionToken = null,
  slug = '',
  submitting = false,
  serverFieldErrors = {},
  onSelectItem,
  onAction,
  onSwitchChannel,
  onReset
}) {
  if (!screen) return null;
  const primaryColor = experience.theme?.primaryColor || '#2F5219';
  const cfg = screen.config || {};
  const componentType = cfg.componentType || cfg.component_type || screen.component?.componentType || '';
  const screenType = String(screen.screenType || '').toUpperCase();

  // Reuse specialized interactive panels seamlessly inside chat bubbles
  if (screenType === 'CATALOG_EXPLORER' || componentType === 'catalogue_carousel' || componentType === 'catalogue_card') {
    if (catalogItems.length > 0 || screenType === 'CATALOG_EXPLORER') {
      return (
        <div className="chat-card-embed">
          <CatalogExplorerScreen
            screen={screen}
            experience={experience}
            catalogItems={catalogItems}
            catalogMeta={catalogMeta}
            onSelectItem={onSelectItem}
            onAction={onAction}
          />
        </div>
      );
    }
  }

  if (screenType === 'ITEM_DETAIL' || componentType === 'product_details' || componentType === 'service_details') {
    const item = stateData.selectedItem || catalogItems[0] || {};
    return (
      <div className="chat-card-embed">
        <ItemDetailScreen item={item} experience={experience} onAction={onAction} />
      </div>
    );
  }

  if (screenType === 'RATE_NEGOTIATION') {
    return (
      <div className="chat-card-embed">
        <RateNegotiationScreen
          screen={screen}
          experience={experience}
          item={stateData.selectedItem || catalogItems[0] || {}}
          sessionToken={sessionToken}
          slug={slug}
          onAction={onAction}
        />
      </div>
    );
  }

  if (screenType === 'CALL_CONNECT') {
    return (
      <div className="chat-card-embed">
        <CallConnectScreen
          screen={screen}
          experience={experience}
          sessionToken={sessionToken}
          slug={slug}
          onAction={onAction}
        />
      </div>
    );
  }

  if (screenType === 'LIVE_CHAT' || componentType === 'human_assistance') {
    if (screenType === 'LIVE_CHAT') {
      return (
        <div className="chat-card-embed">
          <LiveChatScreen
            screen={screen}
            experience={experience}
            sessionToken={sessionToken}
            slug={slug}
            onAction={onAction}
          />
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13.5px', color: '#0f172a' }}>
          <Headphones size={16} color={primaryColor} />
          <span>{screen.title || 'Need a human specialist?'}</span>
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
          {screen.subtitle || 'Our team is ready to assist you right inside this conversation or on WhatsApp.'}
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={submitting}
            onClick={() => onSwitchChannel && onSwitchChannel('HUMAN')}
            style={btnPrimaryStyle(primaryColor)}
          >
            Connect to Specialist
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => onAction('NEXT')}
            style={btnSecondaryStyle()}
          >
            Continue Automated Chat
          </button>
        </div>
      </div>
    );
  }

  // Dynamic Form or Requirement Collection
  if ((screenType === 'DYNAMIC_FORM' || screenType === 'FORM' || componentType === 'requirement_collection') && fields.length > 0) {
    return (
      <div className="chat-card-embed">
        <DynamicFormScreen
          screen={screen}
          fields={fields}
          initialValues={stateData}
          serverFieldErrors={serverFieldErrors}
          experience={experience}
          submitting={submitting}
          onSubmit={(formValues) => onAction('NEXT', { formValues })}
        />
      </div>
    );
  }

  // Dedicated Component Registry Widgets
  switch (componentType) {
    case 'single_select':
      return (
        <SingleSelectWidget
          options={cfg.options || []}
          outputKey={cfg.outputKey || 'selected_option'}
          primaryColor={primaryColor}
          submitting={submitting}
          onSubmit={(val) => onAction('NEXT', { formValues: { [cfg.outputKey || 'selected_option']: val } })}
        />
      );

    case 'multi_select':
      return (
        <MultiSelectWidget
          options={cfg.options || []}
          outputKey={cfg.outputKey || 'selected_options'}
          primaryColor={primaryColor}
          submitting={submitting}
          onSubmit={(vals) => onAction('NEXT', { formValues: { [cfg.outputKey || 'selected_options']: vals } })}
        />
      );

    case 'date_picker':
      return (
        <DatePickerWidget
          primaryColor={primaryColor}
          submitting={submitting}
          initialDate={stateData.selected_date || ''}
          error={serverFieldErrors.selected_date}
          onSubmit={(date) => onAction('NEXT', { formValues: { selected_date: date } })}
        />
      );

    case 'date_range_picker':
      return (
        <DateRangeWidget
          primaryColor={primaryColor}
          submitting={submitting}
          initialStart={stateData.check_in || ''}
          initialEnd={stateData.check_out || ''}
          error={serverFieldErrors.date_range}
          onSubmit={(checkIn, checkOut) => onAction('NEXT', { formValues: { check_in: checkIn, check_out: checkOut } })}
        />
      );

    case 'time_slot_selector':
      return (
        <SingleSelectWidget
          icon={<Clock size={14} />}
          options={cfg.slots || ['10:00 AM', '12:00 PM', '03:00 PM', '05:30 PM']}
          outputKey="selected_slot"
          primaryColor={primaryColor}
          submitting={submitting}
          onSubmit={(slot) => onAction('NEXT', { formValues: { selected_slot: slot } })}
        />
      );

    case 'quantity_selector':
      return (
        <QuantityWidget
          primaryColor={primaryColor}
          submitting={submitting}
          min={cfg.min || 1}
          max={cfg.max || 50}
          initialValue={stateData.quantity || cfg.min || 1}
          onSubmit={(quantity) => onAction('NEXT', { formValues: { quantity } })}
        />
      );

    case 'number_input':
    case 'text_input':
    case 'email_input':
    case 'phone_input': {
      const inputKind = componentType === 'email_input'
        ? 'email'
        : componentType === 'phone_input'
          ? 'tel'
          : componentType === 'number_input'
            ? 'number'
            : 'text';
      const fieldKey = cfg.outputKey
        || (componentType === 'email_input' ? 'email' : componentType === 'phone_input' ? 'phone' : componentType === 'number_input' ? 'number_value' : 'text_value');
      return (
        <QuickInputWidget
          inputType={inputKind}
          fieldKey={fieldKey}
          placeholder={cfg.placeholder || `Enter ${screen.title || 'value'}...`}
          initialValue={stateData[fieldKey] || ''}
          error={serverFieldErrors[fieldKey]}
          primaryColor={primaryColor}
          submitting={submitting}
          onSubmit={(val) => onAction('NEXT', { formValues: { [fieldKey]: val } })}
        />
      );
    }

    case 'address_collection':
      return (
        <AddressCollectionWidget
          initialAddress={stateData.address || ''}
          initialCity={stateData.city || ''}
          initialPincode={stateData.pincode || ''}
          primaryColor={primaryColor}
          submitting={submitting}
          onSubmit={(vals) => onAction('NEXT', { formValues: vals })}
        />
      );

    case 'price_breakdown':
    case 'cart_summary':
    case 'booking_summary':
    case 'quotation_preview':
      return (
        <SummaryCardWidget
          componentType={componentType}
          screen={screen}
          stateData={stateData}
          primaryColor={primaryColor}
          submitting={submitting}
          onConfirm={() => onAction('NEXT', { formValues: { summary_confirmed: true } })}
        />
      );

    case 'terms_acceptance':
      return (
        <TermsWidget
          termsText={cfg.termsText || screen.subtitle || 'I agree to the business terms, pricing, and cancellation policy.'}
          error={serverFieldErrors.terms_accepted}
          primaryColor={primaryColor}
          submitting={submitting}
          onSubmit={() => onAction('NEXT', { formValues: { terms_accepted: true } })}
        />
      );

    case 'payment_action':
    case 'confirmation':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>
            {componentType === 'payment_action' ? <CreditCard size={16} color={primaryColor} /> : <CheckCircle2 size={16} color={primaryColor} />}
            <span>{screen.title || 'Confirm Request'}</span>
          </div>
          {screen.subtitle && <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>{screen.subtitle}</p>}
          <button
            type="button"
            disabled={submitting}
            onClick={() => onAction('COMPLETE', { formValues: { confirmed: true, checkout_complete: true } })}
            style={btnPrimaryStyle(primaryColor)}
          >
            {cfg.ctaLabel || (componentType === 'payment_action' ? 'Confirm & Proceed' : 'Confirm Now')}
          </button>
        </div>
      );

    case 'success_receipt':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#15803d', fontWeight: 700, fontSize: '14px' }}>
            <CheckCircle2 size={18} />
            <span>{screen.title || 'Completed Successfully'}</span>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#334155' }}>
            {screen.subtitle || 'Your request has been recorded and synced.'}
          </p>
          {(stateData.referenceCode || stateData.transaction_ref || stateData.selectedItemTitle || stateData.whatsapp_confirmation_sent || channelOwner === 'WHATSAPP') && (
            <div style={{ padding: '10px 12px', borderRadius: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '12.5px', color: '#166534', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {stateData.referenceCode || stateData.transaction_ref ? (
                <div>Reference: <strong>{stateData.referenceCode || stateData.transaction_ref}</strong></div>
              ) : null}
              {stateData.selectedItemTitle && <div>Selected: <strong>{stateData.selectedItemTitle}</strong></div>}
              {(stateData.whatsapp_confirmation_sent || channelOwner === 'WHATSAPP') && (
                <div style={{ fontWeight: 600 }}>Confirmation details have been shared on WhatsApp.</div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {onReset && (
              <button type="button" onClick={onReset} style={btnSecondaryStyle()}>
                Start Another Request
              </button>
            )}
            {onSwitchChannel && (
              <button type="button" onClick={() => onSwitchChannel('WHATSAPP')} style={btnPrimaryStyle('#25D366')}>
                Return to WhatsApp
              </button>
            )}
          </div>
        </div>
      );

    case 'error_recovery':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', color: '#991b1b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
            <AlertTriangle size={16} />
            <span>{screen.title || 'Unable to complete step'}</span>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>{screen.subtitle || 'Let us get you back on track.'}</p>
          {onReset && (
            <button type="button" onClick={onReset} style={btnSecondaryStyle()}>
              Retry Step
            </button>
          )}
        </div>
      );

    default:
      // Welcome / Media Card / Generic Informational Chat Bubble with quick actions
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {cfg.heroImage && <SafeImg src={cfg.heroImage} alt={screen.title} style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', borderRadius: '10px' }} />}
          {cfg.imageUrl && <SafeImg src={cfg.imageUrl} alt={screen.title} style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', borderRadius: '10px' }} />}
          <div style={{ fontWeight: 700, fontSize: '14.5px', color: '#0f172a' }}>{screen.title}</div>
          {screen.subtitle && <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>{screen.subtitle}</p>}
          <button
            type="button"
            disabled={submitting}
            onClick={() => onAction('NEXT')}
            style={btnPrimaryStyle(primaryColor)}
          >
            <span>{cfg.ctaText || cfg.ctaLabel || 'Continue'}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      );
  }
}

function SingleSelectWidget({ options = [], icon = null, primaryColor, submitting, onSubmit }) {
  const normalized = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
      {normalized.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={submitting}
          onClick={() => onSubmit(opt.value)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '999px',
            border: `1px solid ${primaryColor}40`,
            backgroundColor: '#FFFFFF',
            color: primaryColor,
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          {icon}
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

function MultiSelectWidget({ options = [], primaryColor, submitting, onSubmit }) {
  const [selected, setSelected] = useState([]);
  const normalized = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const toggle = (val) => {
    setSelected((prev) => (prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {normalized.map((opt) => {
          const active = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              style={{
                padding: '7px 12px',
                borderRadius: '999px',
                border: `1px solid ${active ? primaryColor : '#CBD5E1'}`,
                backgroundColor: active ? primaryColor : '#FFFFFF',
                color: active ? '#FFFFFF' : '#334155',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={submitting || selected.length === 0}
        onClick={() => onSubmit(selected)}
        style={btnPrimaryStyle(primaryColor)}
      >
        Confirm Selection ({selected.length})
      </button>
    </div>
  );
}

function DatePickerWidget({ initialDate, error, primaryColor, submitting, onSubmit }) {
  const [date, setDate] = useState(initialDate);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Calendar size={14} color={primaryColor} /> Select Date
      </label>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        style={inputStyle()}
      />
      {error && <div style={{ color: '#dc2626', fontSize: '12px' }}>{error}</div>}
      <button type="button" disabled={submitting || !date} onClick={() => onSubmit(date)} style={btnPrimaryStyle(primaryColor)}>
        Confirm Date
      </button>
    </div>
  );
}

function DateRangeWidget({ initialStart, initialEnd, error, primaryColor, submitting, onSubmit }) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div>
          <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569' }}>Check-in</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle()} />
        </div>
        <div>
          <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#475569' }}>Check-out</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle()} />
        </div>
      </div>
      {error && <div style={{ color: '#dc2626', fontSize: '12px' }}>{error}</div>}
      <button type="button" disabled={submitting || !start || !end} onClick={() => onSubmit(start, end)} style={btnPrimaryStyle(primaryColor)}>
        Confirm Dates
      </button>
    </div>
  );
}

function QuantityWidget({ min, max, initialValue, primaryColor, submitting, onSubmit }) {
  const [qty, setQty] = useState(initialValue);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button type="button" onClick={() => setQty(Math.max(min, qty - 1))} style={btnIconStyle()}><Minus size={14} /></button>
        <strong style={{ minWidth: '28px', textAlign: 'center', fontSize: '15px' }}>{qty}</strong>
        <button type="button" onClick={() => setQty(Math.min(max, qty + 1))} style={btnIconStyle()}><Plus size={14} /></button>
      </div>
      <button type="button" disabled={submitting} onClick={() => onSubmit(qty)} style={btnPrimaryStyle(primaryColor)}>
        Confirm ({qty})
      </button>
    </div>
  );
}

function QuickInputWidget({ inputType, placeholder, initialValue, error, primaryColor, submitting, onSubmit }) {
  const [val, setVal] = useState(initialValue);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <input
        type={inputType}
        value={val}
        placeholder={placeholder}
        onChange={(e) => setVal(e.target.value)}
        style={inputStyle()}
      />
      {error && <div style={{ color: '#dc2626', fontSize: '12px' }}>{error}</div>}
      <button type="button" disabled={submitting || !String(val).trim()} onClick={() => onSubmit(val)} style={btnPrimaryStyle(primaryColor)}>
        Send
      </button>
    </div>
  );
}

function AddressCollectionWidget({ initialAddress, initialCity, initialPincode, primaryColor, submitting, onSubmit }) {
  const [address, setAddress] = useState(initialAddress);
  const [city, setCity] = useState(initialCity);
  const [pincode, setPincode] = useState(initialPincode);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <input type="text" placeholder="Street / House Address" value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle()} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '8px' }}>
        <input type="text" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle()} />
        <input type="text" placeholder="Pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} style={inputStyle()} />
      </div>
      <button
        type="button"
        disabled={submitting || !address.trim()}
        onClick={() => onSubmit({ address, city, pincode })}
        style={btnPrimaryStyle(primaryColor)}
      >
        Save Address
      </button>
    </div>
  );
}

function SummaryCardWidget({ componentType, screen, stateData, primaryColor, submitting, onConfirm }) {
  const titleMap = {
    price_breakdown: 'Price Breakdown',
    cart_summary: 'Order Summary',
    booking_summary: 'Booking Summary',
    quotation_preview: 'Quotation Summary'
  };
  const price = Number(stateData.grand_total || stateData.selectedItemPrice || 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}>
        {componentType === 'quotation_preview' ? <FileText size={16} color={primaryColor} /> : <ShoppingBag size={16} color={primaryColor} />}
        <span>{screen.title || titleMap[componentType] || 'Summary'}</span>
      </div>
      <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '10px 12px', fontSize: '12.5px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {stateData.selectedItemTitle && <div>Item: <strong>{stateData.selectedItemTitle}</strong></div>}
        {stateData.quantity && <div>Quantity: <strong>{stateData.quantity}</strong></div>}
        {stateData.check_in && <div>Dates: <strong>{stateData.check_in} → {stateData.check_out || ''}</strong></div>}
        {price > 0 && <div>Estimated Total: <strong>₹{price.toLocaleString('en-IN')}</strong></div>}
      </div>
      <button type="button" disabled={submitting} onClick={onConfirm} style={btnPrimaryStyle(primaryColor)}>
        <Sparkles size={14} /> Proceed
      </button>
    </div>
  );
}

function TermsWidget({ termsText, error, primaryColor, submitting, onSubmit }) {
  const [accepted, setAccepted] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', color: '#334155', cursor: 'pointer' }}>
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ marginTop: '2px' }} />
        <span>{termsText}</span>
      </label>
      {error && <div style={{ color: '#dc2626', fontSize: '12px' }}>{error}</div>}
      <button type="button" disabled={submitting || !accepted} onClick={onSubmit} style={btnPrimaryStyle(primaryColor)}>
        Accept & Continue
      </button>
    </div>
  );
}

function inputStyle() {
  return {
    width: '100%',
    boxSizing: 'border-box',
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
    fontSize: '13.5px',
    backgroundColor: '#FFFFFF',
    color: '#0F172A'
  };
}

function btnPrimaryStyle(bg) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px 16px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: bg,
    color: '#FFFFFF',
    fontSize: '13.5px',
    fontWeight: 700,
    cursor: 'pointer'
  };
}

function btnSecondaryStyle() {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '9px 14px',
    borderRadius: '10px',
    border: '1px solid #CBD5E1',
    backgroundColor: '#FFFFFF',
    color: '#334155',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer'
  };
}

function btnIconStyle() {
  return {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
    background: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  };
}
