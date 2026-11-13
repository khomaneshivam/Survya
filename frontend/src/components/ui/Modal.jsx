import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Native accessible dialog wrapper backed by HTML <dialog>.showModal().
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  size = 'md',
  footer,
  children,
  closeOnBackdrop = true
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        // Fallback if already open in edge React strict mode cycles
      }
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  function handleCancel(e) {
    e.preventDefault();
    if (onClose) onClose();
  }

  function handleBackdropClick(e) {
    if (closeOnBackdrop && e.target === dialogRef.current && onClose) {
      onClose();
    }
  }

  if (!isOpen) {
    return null;
  }

  const sizeClass = size === 'lg' ? 'sarvya-dialog sarvya-dialog-lg' : 'sarvya-dialog';

  return (
    <dialog
      ref={dialogRef}
      className={sizeClass}
      closedby={closeOnBackdrop ? 'any' : 'closerequest'}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-labelledby="sarvya-dialog-title"
    >
      <div className="sarvya-dialog-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          {Icon && (
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: 'var(--sarvya-blue-soft)',
              border: '1px solid var(--sarvya-blue-border)',
              color: 'var(--sarvya-blue)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Icon size={17} />
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <h3
              id="sarvya-dialog-title"
              style={{ fontSize: '15.5px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}
            >
              {title}
            </h3>
            {subtitle && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          className="sarvya-btn sarvya-btn-ghost sarvya-btn-sm"
          onClick={onClose}
          aria-label="Close dialog"
          style={{ padding: '6px' }}
        >
          <X size={17} />
        </button>
      </div>

      <div className="sarvya-dialog-body">
        {children}
      </div>

      {footer && (
        <div className="sarvya-dialog-footer">
          {footer}
        </div>
      )}
    </dialog>
  );
}

