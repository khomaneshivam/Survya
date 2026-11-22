import React, { useState } from 'react';
import {
  Search,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { NODE_DEFINITIONS, NODE_CATEGORIES } from './nodeDefinitions';

export default function NodePaletteSidebar({ onAddNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState({});

  const toggleCategory = (catId) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };

  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const filteredNodes = NODE_DEFINITIONS.filter(def => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      def.label.toLowerCase().includes(q) ||
      def.desc.toLowerCase().includes(q) ||
      def.type.toLowerCase().includes(q)
    );
  });

  // Group nodes by category
  const categories = Object.values(NODE_CATEGORIES);

  if (isCollapsed) {
    return (
      <div
        style={{
          width: '44px',
          background: '#FFFFFF',
          borderRight: '1px solid #E5E5E8',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '12px 0',
          gap: '12px',
          zIndex: 10
        }}
      >
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          title="Expand Step Palette"
          style={{
            border: 'none',
            background: '#F4F4F6',
            borderRadius: '6px',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#1C1C1E'
          }}
        >
          <PanelLeftOpen size={16} />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '260px',
        background: '#FFFFFF',
        borderRight: '1px solid #E5E5E8',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        zIndex: 10,
        flexShrink: 0
      }}
    >
      {/* Header with Search and Collapse button */}
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid #E5E5E8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#FAFAFB'
        }}
      >
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1C1C1E' }}>
          Workflow Palette
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          title="Collapse Palette"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: '#67676B',
            display: 'flex',
            alignItems: 'center',
            padding: '2px'
          }}
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      {/* Search Input */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #F1F5F9' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#F4F4F6',
            borderRadius: '6px',
            padding: '6px 10px'
          }}
        >
          <Search size={14} color="#8E8E93" />
          <input
            type="text"
            placeholder="Search steps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              width: '100%',
              fontSize: '0.78rem',
              color: '#1C1C1E'
            }}
          />
        </div>

        {/* Quick Master Nodes Shortcut Bar */}
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            ⚡ Master Nodes
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {[
              { label: 'Category', masterType: 'master_categories' },
              { label: 'Location', masterType: 'master_locations' },
              { label: 'Staff/Doctor', masterType: 'master_resources' },
              { label: 'Payment', masterType: 'master_payment_modes' }
            ].map(m => (
              <button
                key={m.masterType}
                type="button"
                onClick={() => onAddNode('MASTER_PICKER')}
                style={{
                  fontSize: '0.67rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid #A7F3D0',
                  background: '#ECFDF5',
                  color: '#047857',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
                title={`Add dynamic ${m.label} picker node`}
              >
                + {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Categories & Nodes list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        {search.trim() ? (
          // Flat list when searching
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {filteredNodes.map((def) => {
              const Icon = def.icon;
              return (
                <div
                  key={def.type}
                  draggable
                  onDragStart={(e) => onDragStart(e, def.type)}
                  onClick={() => onAddNode(def.type)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    background: '#FFFFFF',
                    border: '1px solid #E5E5E8',
                    borderRadius: '8px',
                    cursor: 'grab',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = def.color;
                    e.currentTarget.style.background = def.bg;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#E5E5E8';
                    e.currentTarget.style.background = '#FFFFFF';
                  }}
                >
                  <GripVertical size={13} color="#CBD5E1" />
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      background: def.bg,
                      color: def.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <Icon size={14} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#1C1C1E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {def.label}
                    </div>
                  </div>
                  <Plus size={13} color="#94A3B8" />
                </div>
              );
            })}
            {filteredNodes.length === 0 && (
              <div style={{ fontSize: '0.75rem', color: '#8E8E93', textAlign: 'center', padding: '16px 0' }}>
                No steps matching "{search}"
              </div>
            )}
          </div>
        ) : (
          // Categorized groups
          categories.map((cat) => {
            const catNodes = NODE_DEFINITIONS.filter((d) => d.category === cat.id);
            if (catNodes.length === 0) return null;
            const isCatCollapsed = Boolean(collapsedCategories[cat.id]);

            return (
              <div key={cat.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: 'none',
                    background: 'transparent',
                    padding: '4px 4px',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#67676B',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: cat.color
                      }}
                    />
                    <span>{cat.label}</span>
                  </div>
                  {isCatCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </button>

                {!isCatCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '4px' }}>
                    {catNodes.map((def) => {
                      const Icon = def.icon;
                      return (
                        <div
                          key={def.type}
                          draggable
                          onDragStart={(e) => onDragStart(e, def.type)}
                          onClick={() => onAddNode(def.type)}
                          title={`${def.desc} (Drag onto canvas or click to add)`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '7px 9px',
                            background: '#FFFFFF',
                            border: '1px solid #E5E5E8',
                            borderRadius: '8px',
                            cursor: 'grab',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = def.color;
                            e.currentTarget.style.background = def.bg;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#E5E5E8';
                            e.currentTarget.style.background = '#FFFFFF';
                          }}
                        >
                          <GripVertical size={12} color="#CBD5E1" />
                          <div
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '5px',
                              background: def.bg,
                              color: def.color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            <Icon size={13} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#1C1C1E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {def.label}
                            </div>
                          </div>
                          <Plus size={12} color="#94A3B8" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
