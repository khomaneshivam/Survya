import React, { useState } from 'react';
import { Search, Inbox, HelpCircle } from 'lucide-react';

export function Button({ variant = 'secondary', size = 'md', className = '', children, loading, ...props }) {
  const variantClass = {
    primary: 'sarvya-btn-primary',
    secondary: 'sarvya-btn-secondary',
    ghost: 'sarvya-btn-ghost',
    danger: 'sarvya-btn-danger'
  }[variant] || 'sarvya-btn-secondary';

  const sizeClass = size === 'sm' ? 'sarvya-btn-sm' : '';
  return (
    <button
      className={`sarvya-btn ${variantClass} ${sizeClass} ${className}`.trim()}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '12px',
              height: '12px',
              border: '2px solid currentColor',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              display: 'inline-block',
              animation: 'spin 0.6s linear infinite'
            }}
          />
          <span>{children}</span>
        </span>
      ) : children}
    </button>
  );
}

export function Badge({ tone, variant, dot = false, className = '', children }) {
  const variantToTone = {
    neutral: 'neutral',
    secondary: 'neutral',
    default: 'neutral',
    blue: 'blue',
    info: 'blue',
    primary: 'blue',
    green: 'green',
    success: 'green',
    purple: 'purple',
    taupe: 'taupe',
    warning: 'taupe',
    coral: 'coral',
    danger: 'coral',
    error: 'coral'
  };
  const resolvedTone = tone || variantToTone[variant] || 'neutral';

  const toneClass = {
    neutral: 'sarvya-badge-neutral',
    blue: 'sarvya-badge-blue',
    green: 'sarvya-badge-green',
    purple: 'sarvya-badge-purple',
    taupe: 'sarvya-badge-taupe',
    coral: 'sarvya-badge-coral'
  }[resolvedTone] || 'sarvya-badge-neutral';

  const dotColor = {
    neutral: '#96969C',
    blue: '#2876B8',
    green: '#4C7A2B',
    purple: '#9E3BA8',
    taupe: '#8E7B7A',
    coral: '#C9403D'
  }[resolvedTone] || '#96969C';

  return (
    <span className={`sarvya-badge ${toneClass} ${className}`.trim()}>
      {dot && <span className="sarvya-status-dot" style={{ background: dotColor }} />}
      {children}
    </span>
  );
}

export function Card({ children, className = '', style }) {
  return (
    <div className={`sarvya-card ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions, action }) {
  const headerActions = actions || action;
  return (
    <div className="sarvya-card-header">
      <div>
        <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h2>
        {subtitle && (
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {subtitle}
          </div>
        )}
      </div>
      {headerActions && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>{headerActions}</div>}
    </div>
  );
}

export function CardBody({ children, style }) {
  return (
    <div className="sarvya-card-body" style={style}>
      {children}
    </div>
  );
}

export function PageHeader({ title, description, subtitle, actions, children }) {
  const shortDesc = description || subtitle;
  const displayDesc = shortDesc ? (shortDesc.length > 65 ? `${shortDesc.slice(0, 62)}...` : shortDesc) : null;

  return (
    <div
      className="sarvya-page-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
        paddingBottom: '10px',
        marginBottom: '16px',
        borderBottom: '1px solid var(--border-color)'
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <h1 className="sarvya-page-title" style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          {title}
        </h1>
        {displayDesc && (
          <p className="sarvya-page-desc" style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }} title={shortDesc}>
            {displayDesc}
          </p>
        )}
        {children}
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  );
}

export function KpiCard({ label, title, value, meta, subtitle, delta, icon: Icon, accentTone = 'blue', onClick }) {
  const displayLabel = label || title;
  const displayMeta = meta || subtitle || delta;

  const pillStyles = {
    blue: { bg: '#EAF4FB', color: '#1B5886' },
    green: { bg: '#EDF4E6', color: '#2F5219' },
    purple: { bg: '#FCF2FE', color: '#7A2E83' },
    coral: { bg: '#FDF0F0', color: '#9B2C2C' },
    taupe: { bg: '#F4F1F1', color: '#5E4D4C' }
  }[accentTone] || { bg: '#EAF4FB', color: '#1B5886' };

  return (
    <div
      className="sarvya-kpi-card"
      onClick={onClick}
      style={{
        padding: '10px 14px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 140ms ease'
      }}
    >
      <div className="sarvya-kpi-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11.5px', fontWeight: 500, color: 'var(--text-secondary)' }}>{displayLabel}</span>
        {Icon && (
          <span style={{
            width: '20px',
            height: '20px',
            borderRadius: '5px',
            background: pillStyles.bg,
            color: pillStyles.color,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {React.isValidElement(Icon) ? Icon : (typeof Icon === 'function' || typeof Icon === 'object') && Icon ? <Icon size={12} /> : null}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
        <div className="sarvya-kpi-value tabular-nums" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {value}
        </div>
        {displayMeta && (
          <span className="sarvya-kpi-meta" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {displayMeta}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Compact, accessible help tooltip popover
 */
export function HelpTip({ text, title, align = 'center' }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;

  return (
    <span
      className="sarvya-helptip-wrapper"
      style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle', marginInlineStart: '4px' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        className="sarvya-helptip-btn"
        aria-label={title || 'More information'}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((prev) => !prev); }}
        style={{
          background: 'transparent',
          border: 'none',
          padding: '2px',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%'
        }}
      >
        <HelpCircle size={13} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="sarvya-helptip-popover"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: align === 'right' ? 'auto' : align === 'left' ? '0' : '50%',
            right: align === 'right' ? '0' : 'auto',
            transform: align === 'center' ? 'translateX(-50%)' : 'none',
            background: '#0F172A',
            color: '#F8FAFC',
            fontSize: '11px',
            lineHeight: '1.4',
            padding: '6px 10px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            whiteSpace: 'normal',
            width: 'max-content',
            maxWidth: '240px',
            zIndex: 1000,
            pointerEvents: 'none',
            textAlign: 'start'
          }}
        >
          {title && <strong style={{ display: 'block', marginBottom: '2px', color: '#E2E8F0' }}>{title}</strong>}
          {text}
        </span>
      )}
    </span>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search...', style, 'aria-label': ariaLabel = 'Search' }) {
  return (
    <div className="sarvya-search-box" style={style}>
      <Search size={14} className="sarvya-search-icon" />
      <input
        type="search"
        className="sarvya-input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    </div>
  );
}

export function FilterBar({ left, right }) {
  return (
    <div className="sarvya-filter-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
        {left}
      </div>
      {right && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {right}
        </div>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="sarvya-empty-state">
      <div className="sarvya-empty-icon">
        {React.isValidElement(Icon) ? Icon : (typeof Icon === 'function' || typeof Icon === 'object') && Icon ? <Icon size={20} /> : null}
      </div>
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
      {description && (
        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', maxWidth: '400px' }}>
          {description}
        </div>
      )}
      {action}
    </div>
  );
}

export function Skeleton({ height = '20px', width = '100%' }) {
  return <div className="sarvya-skeleton" style={{ height, width }} />;
}

