import React, { useRef } from 'react';

/**
 * Compact horizontal page-level navigation tabs with non-color underline indicator.
 */
export default function Tabs({ tabs, activeTab, onChange, ariaLabel = 'Section navigation' }) {
  const listRef = useRef(null);

  function handleKeyDown(e, index) {
    if (!tabs || tabs.length === 0) return;
    let nextIndex = null;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (e.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') nextIndex = 0;
    if (e.key === 'End') nextIndex = tabs.length - 1;

    if (nextIndex !== null) {
      e.preventDefault();
      const buttons = listRef.current?.querySelectorAll('[role="tab"]');
      buttons?.[nextIndex]?.focus();
      onChange(tabs[nextIndex].id);
    }
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      focusgroup="tablist nomemory"
      className="sarvya-tablist"
    >
      {tabs.map((tab, index) => {
        const Icon = tab.icon;
        const selected = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`sarvya-tab ${selected ? 'is-active' : ''}`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {Icon && <Icon size={15} />}
            <span>{tab.label}</span>
            {tab.count !== undefined && tab.count !== null && (
              <span className={selected ? 'sarvya-badge sarvya-badge-blue' : 'sarvya-badge sarvya-badge-neutral'}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

