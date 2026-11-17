import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Slide-over detail drawer for CRM records, message dossiers, and node inspectors.
 */
export default function Drawer({
  isOpen,
  open,
  onClose,
  title,
  subtitle,
  headerActions,
  footer,
  width = '480px',
  children
}) {
  const show = Boolean(isOpen !== undefined ? isOpen : open);

  useEffect(() => {
    if (!show) return;
    function onKeyDown(e) {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div
      className="sarvya-drawer-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
      role="presentation"
    >
      <aside
        className="sarvya-drawer-panel"
        style={{ width: `min(${width}, 100vw)` }}
        aria-label={title || 'Details panel'}
      >
        <div className="sarvya-dialog-header">
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: '15.5px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </h3>
            {subtitle && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {subtitle}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {headerActions}
            <button
              type="button"
              className="sarvya-btn sarvya-btn-ghost sarvya-btn-sm"
              onClick={onClose}
              aria-label="Close panel"
              style={{ padding: '6px' }}
            >
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="sarvya-dialog-body">
          {children}
        </div>

        {footer && (
          <div className="sarvya-dialog-footer">
            {footer}
          </div>
        )}
      </aside>
    </div>
  );
}

