import React, { useState, useMemo } from 'react';
import { 
  GitBranch, 
  Play, 
  Pause, 
  Trash2, 
  Copy, 
  Settings, 
  History, 
  ExternalLink, 
  Search, 
  Filter, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Layers,
  ArrowUpRight,
  MoreVertical
} from 'lucide-react';
import { Badge, Button } from '../../../components/ui/Primitives';

export function AutomationHomePage({
  automations = [],
  metrics = {},
  loading = false,
  onOpenBuilder,
  onOpenDetails,
  onOpenHistory,
  onToggleStatus,
  onDeleteAutomation,
  onDuplicateAutomation,
  onBrowseTemplates
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | ACTIVE | DRAFT | PAUSED

  const filteredAutomations = useMemo(() => {
    return automations.filter((item) => {
      const name = (item.name || '').toLowerCase();
      const trigger = (item.trigger_keyword || '').toLowerCase();
      const status = (item.status || 'DRAFT').toUpperCase();

      const matchesSearch = !search || name.includes(search.toLowerCase()) || trigger.includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && (status === 'ACTIVE' || status === 'PUBLISHED')) ||
        (statusFilter === 'DRAFT' && status === 'DRAFT') ||
        (statusFilter === 'PAUSED' && status === 'PAUSED');

      return matchesSearch && matchesStatus;
    });
  }, [automations, search, statusFilter]);

  return (
    <div style={{ padding: '24px 24px 48px', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top High-Density Metric Cards */}
      <div className="studio-kpi-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px'
      }}>
        {/* Total */}
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`studio-kpi-card ${statusFilter === 'ALL' ? 'is-selected' : ''}`}
          style={{
            background: '#FFFFFF',
            border: statusFilter === 'ALL' ? '1px solid #2876B8' : '1px solid #E5E5E8',
            borderRadius: '10px',
            padding: '16px 20px',
            cursor: 'pointer',
            boxShadow: statusFilter === 'ALL' ? '0 0 0 1px #2876B8, 0 2px 6px rgba(40,118,184,0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
            transition: 'all 160ms ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#67676B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Automations
            </span>
            <GitBranch size={16} color="#96969C" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'monospace', color: '#171719', lineHeight: 1.1, marginBottom: '4px' }}>
            {metrics.total || 0}
          </div>
          <p style={{ fontSize: '11px', color: '#96969C', margin: 0 }}>Across all workspaces</p>
        </div>

        {/* Active & Live */}
        <div
          onClick={() => setStatusFilter('ACTIVE')}
          className={`studio-kpi-card ${statusFilter === 'ACTIVE' ? 'is-selected' : ''}`}
          style={{
            background: '#FFFFFF',
            border: statusFilter === 'ACTIVE' ? '1px solid #2F5219' : '1px solid #E5E5E8',
            borderRadius: '10px',
            padding: '16px 20px',
            cursor: 'pointer',
            boxShadow: statusFilter === 'ACTIVE' ? '0 0 0 1px #2F5219, 0 2px 6px rgba(47,82,25,0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
            transition: 'all 160ms ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#67676B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active &amp; Live
            </span>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#4C7A2B',
              boxShadow: '0 0 0 2px rgba(76,122,43,0.25)',
              display: 'inline-block'
            }} />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'monospace', color: '#2F5219', lineHeight: 1.1, marginBottom: '4px' }}>
            {metrics.active || 0}
          </div>
          <p style={{ fontSize: '11px', color: '#96969C', margin: 0 }}>Routing incoming chats</p>
        </div>

        {/* Drafts */}
        <div
          onClick={() => setStatusFilter('DRAFT')}
          className={`studio-kpi-card ${statusFilter === 'DRAFT' ? 'is-selected' : ''}`}
          style={{
            background: '#FFFFFF',
            border: statusFilter === 'DRAFT' ? '1px solid #D97706' : '1px solid #E5E5E8',
            borderRadius: '10px',
            padding: '16px 20px',
            cursor: 'pointer',
            boxShadow: statusFilter === 'DRAFT' ? '0 0 0 1px #D97706, 0 2px 6px rgba(217,119,6,0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
            transition: 'all 160ms ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#67676B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Drafts
            </span>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#D97706',
              display: 'inline-block'
            }} />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'monospace', color: '#7D4E1D', lineHeight: 1.1, marginBottom: '4px' }}>
            {metrics.drafts || 0}
          </div>
          <p style={{ fontSize: '11px', color: '#96969C', margin: 0 }}>Unpublished workflows</p>
        </div>

        {/* Needs Attention */}
        <div
          className="studio-kpi-card"
          style={{
            background: '#FFFFFF',
            border: '1px solid #E5E5E8',
            borderRadius: '10px',
            padding: '16px 20px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#67676B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Needs Attention
            </span>
            <AlertCircle size={16} color={metrics.needsAttention > 0 ? '#DC2626' : '#96969C'} />
          </div>
          <div style={{
            fontSize: '24px',
            fontWeight: 700,
            fontFamily: 'monospace',
            color: metrics.needsAttention > 0 ? '#9B2C2C' : '#3A3A3E',
            lineHeight: 1.1,
            marginBottom: '4px'
          }}>
            {metrics.needsAttention || 0}
          </div>
          <p style={{ fontSize: '11px', color: '#96969C', margin: 0 }}>Errors or broken bindings</p>
        </div>
      </div>

      {/* Control Bar: Search, Filters & Quick Actions */}
      <div className="studio-control-bar" style={{
        background: '#FFFFFF',
        border: '1px solid #E5E5E8',
        borderRadius: '10px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        {/* Search */}
        <div className="studio-search-wrapper" style={{ position: 'relative', flex: 1, maxWidth: '440px', minWidth: '240px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#96969C', pointerEvents: 'none' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by flow name, trigger keyword, or ID..."
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              fontSize: '12.5px',
              background: '#F5F5F6',
              border: '1px solid #E5E5E8',
              borderRadius: '8px',
              color: '#171719',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Filters and CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div className="studio-filter-group" style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: '#EEEEF0',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid #E5E5E8',
            gap: '2px'
          }}>
            {['ALL', 'ACTIVE', 'DRAFT', 'PAUSED'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: statusFilter === st ? 600 : 500,
                  color: statusFilter === st ? '#171719' : '#67676B',
                  background: statusFilter === st ? '#FFFFFF' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: statusFilter === st ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 120ms ease'
                }}
              >
                {st}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onBrowseTemplates}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#2876B8',
              background: '#EEF5FB',
              border: '1px solid #C4DCF0',
              cursor: 'pointer'
            }}
          >
            <Layers size={13} />
            <span>Template Library</span>
          </button>
        </div>
      </div>

      {/* Automations Table / List */}
      <div className="studio-table-card" style={{
        background: '#FFFFFF',
        border: '1px solid #E5E5E8',
        borderRadius: '10px',
        overflowX: 'auto',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        {filteredAutomations.length === 0 ? (
          <div style={{ padding: '56px 20px', textAlign: 'center', maxWidth: '420px', margin: '0 auto' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: '#EDF4E6',
              border: '1px solid #C3D1AC',
              color: '#2F5219',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px'
            }}>
              <GitBranch size={22} />
            </div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#171719', margin: '0 0 6px 0' }}>
              No automations found
            </h3>
            <p style={{ fontSize: '12px', color: '#67676B', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              {search || statusFilter !== 'ALL'
                ? 'No automations match your active search and filter criteria.'
                : 'Get started in under 3 minutes by selecting an industry template or building a custom workflow.'}
            </p>
            <button
              type="button"
              onClick={onBrowseTemplates}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 600,
                color: '#FFFFFF',
                background: '#2F5219',
                border: '1px solid #2F5219',
                cursor: 'pointer'
              }}
            >
              <Layers size={14} />
              <span>Browse Template Library</span>
            </button>
          </div>
        ) : (
          <table className="studio-table sarvya-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#FAFAFB', borderBottom: '1px solid #E5E5E8' }}>
                <th style={{ padding: '12px 18px', fontSize: '11px', fontWeight: 600, color: '#67676B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Automation Name
                </th>
                <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 600, color: '#67676B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Type &amp; Origin
                </th>
                <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 600, color: '#67676B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Trigger Keyword
                </th>
                <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 600, color: '#67676B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Status
                </th>
                <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 600, color: '#67676B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Performance
                </th>
                <th style={{ padding: '12px 18px', fontSize: '11px', fontWeight: 600, color: '#67676B', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAutomations.map((item) => {
                const status = (item.status || 'DRAFT').toUpperCase();
                const isActive = status === 'ACTIVE' || status === 'PUBLISHED';
                const isTemplate = item.isTemplateBased;

                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: '1px solid #EEEEF1',
                      transition: 'background 120ms ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#F9FAFB'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {/* Name & ID */}
                    <td style={{ padding: '12px 18px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          onClick={() => onOpenBuilder(item.id)}
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '8px',
                            background: '#F5F5F6',
                            border: '1px solid #E5E5E8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#67676B',
                            cursor: 'pointer',
                            flexShrink: 0
                          }}
                          title="Open Visual Builder"
                        >
                          <GitBranch size={16} />
                        </div>
                        <div>
                          <span
                            onClick={() => onOpenBuilder(item.id)}
                            style={{
                              fontWeight: 600,
                              color: '#171719',
                              fontSize: '13px',
                              cursor: 'pointer',
                              display: 'block'
                            }}
                          >
                            {item.name || 'Untitled Automation'}
                          </span>
                          <span style={{ fontSize: '11px', color: '#96969C', fontFamily: 'monospace' }}>
                            ID: {item.id}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Origin & Version */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                      {isTemplate ? (
                        <div>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#1E5B85',
                            background: '#EEF5FB',
                            border: '1px solid #C4DCF0',
                            padding: '2px 8px',
                            borderRadius: '4px'
                          }}>
                            <Sparkles size={10} color="#2876B8" />
                            <span>Template</span>
                          </span>
                          {item.installedVersion && (
                            <span style={{ fontSize: '10px', color: '#96969C', fontFamily: 'monospace', display: 'block', marginTop: '2px' }}>
                              v{item.installedVersion}
                              {item.hasUpgrade && (
                                <span style={{ color: '#D97706', fontWeight: 700, marginLeft: '4px' }}>● Update</span>
                              )}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{
                          display: 'inline-block',
                          fontSize: '11px',
                          fontWeight: 500,
                          color: '#67676B',
                          background: '#EEEEF0',
                          padding: '2px 8px',
                          borderRadius: '4px'
                        }}>
                          Custom Flow
                        </span>
                      )}
                    </td>

                    {/* Trigger Keyword */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                      {item.trigger_keyword ? (
                        <span style={{
                          fontFamily: 'monospace',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: '#EEEEF0',
                          color: '#3A3A3E',
                          border: '1px solid #E5E5E8',
                          padding: '2px 8px',
                          borderRadius: '5px'
                        }}>
                          {item.trigger_keyword}
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#96969C', fontStyle: 'italic' }}>
                          Default Inbound
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                      {isActive ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          color: '#2F5219',
                          background: '#EDF4E6',
                          border: '1px solid #C3D1AC',
                          padding: '2px 10px',
                          borderRadius: '999px'
                        }}>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#4C7A2B'
                          }} />
                          <span>Active</span>
                        </span>
                      ) : status === 'PAUSED' ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '11.5px',
                          fontWeight: 500,
                          color: '#67676B',
                          background: '#EEEEF0',
                          padding: '2px 10px',
                          borderRadius: '999px'
                        }}>
                          <span>Paused</span>
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '11.5px',
                          fontWeight: 500,
                          color: '#7D4E1D',
                          background: '#FBF4EB',
                          border: '1px solid #E8CFAF',
                          padding: '2px 10px',
                          borderRadius: '999px'
                        }}>
                          <span>Draft</span>
                        </span>
                      )}
                    </td>

                    {/* Performance Metric */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: '11.5px', color: '#67676B' }}>
                      <div>
                        <span>{item.execution_count || 0} runs</span>
                      </div>
                      {item.dropoff_rate !== undefined && (
                        <span style={{ fontSize: '10px', color: '#96969C' }}>
                          Dropoff: {(item.dropoff_rate * 100).toFixed(0)}%
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 18px', verticalAlign: 'middle', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {/* Toggle Status */}
                        <button
                          type="button"
                          onClick={() => onToggleStatus(item.id, item.status)}
                          title={isActive ? 'Pause Automation' : 'Publish / Activate'}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            border: isActive ? '1px solid #FDE68A' : '1px solid #C3D1AC',
                            background: isActive ? '#FEF3C7' : '#EDF4E6',
                            color: isActive ? '#D97706' : '#2F5219',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0
                          }}
                        >
                          {isActive ? <Pause size={12} /> : <Play size={12} />}
                        </button>

                        {/* Builder */}
                        <button
                          type="button"
                          onClick={() => onOpenBuilder(item.id)}
                          title="Open Visual Graph Editor"
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            border: '1px solid #E5E5E8',
                            background: '#FFFFFF',
                            color: '#3A3A3E',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0
                          }}
                        >
                          <GitBranch size={13} />
                        </button>

                        {/* Settings / Config Details */}
                        {item.installation ? (
                          <button
                            type="button"
                            onClick={() => onOpenDetails(item.id, item.installation.id)}
                            title="Configuration & Bindings"
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              border: '1px solid #E5E5E8',
                              background: '#FFFFFF',
                              color: '#2876B8',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0
                            }}
                          >
                            <Settings size={13} />
                          </button>
                        ) : null}

                        {/* History */}
                        <button
                          type="button"
                          onClick={() => onOpenHistory(item.id)}
                          title="Execution Logs"
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            border: '1px solid #E5E5E8',
                            background: '#FFFFFF',
                            color: '#7A2E83',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0
                          }}
                        >
                          <History size={13} />
                        </button>

                        {/* Duplicate */}
                        <button
                          type="button"
                          onClick={() => onDuplicateAutomation(item.id)}
                          title="Duplicate"
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            border: '1px solid #E5E5E8',
                            background: '#FFFFFF',
                            color: '#67676B',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0
                          }}
                        >
                          <Copy size={13} />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete "${item.name}"?`)) {
                              onDeleteAutomation(item.id);
                            }
                          }}
                          title="Delete Automation"
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            border: '1px solid #FCA5A5',
                            background: '#FEF2F2',
                            color: '#992F2D',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

