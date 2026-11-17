import React from 'react';
import { Search, Inbox } from 'lucide-react';

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

export function Badge({ tone = 'neutral', dot = false, className = '', children }) {
  const toneClass = {
    neutral: 'sarvya-badge-neutral',
    blue: 'sarvya-badge-blue',
    green: 'sarvya-badge-green',
    purple: 'sarvya-badge-purple',
    taupe: 'sarvya-badge-taupe',
    coral: 'sarvya-badge-coral'
  }[tone] || 'sarvya-badge-neutral';

  const dotColor = {
    neutral: '#96969C',
    blue: '#2876B8',
    green: '#4C7A2B',
    purple: '#9E3BA8',
    taupe: '#8E7B7A',
    coral: '#C9403D'
  }[tone] || '#96969C';

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

export function CardHeader({ title, subtitle, actions }) {
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
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>{actions}</div>}
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

export function PageHeader({ title, description, actions, children }) {
  return (
    <div className="sarvya-page-header">
      <div style={{ minWidth: 0 }}>
        <h1 className="sarvya-page-title">{title}</h1>
        {description && <p className="sarvya-page-desc">{description}</p>}
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

export function KpiCard({ label, title, value, meta, subtitle, icon: Icon, accentTone = 'blue', onClick }) {
  const displayLabel = label || title;
  const displayMeta = meta || subtitle;

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
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 140ms ease'
      }}
    >
      <div className="sarvya-kpi-label">
        <span>{displayLabel}</span>
        {Icon && (
          <span style={{
            width: '26px',
            height: '26px',
            borderRadius: '6px',
            background: pillStyles.bg,
            color: pillStyles.color,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {React.isValidElement(Icon) ? Icon : (typeof Icon === 'function' || typeof Icon === 'object') ? <Icon size={14} /> : null}
          </span>
        )}
      </div>
      <div className="sarvya-kpi-value">{value}</div>
      {displayMeta && <div className="sarvya-kpi-meta">{displayMeta}</div>}
    </div>
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
        <Icon size={20} />
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

