import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Copy,
  Trash2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  PhoneCall
} from 'lucide-react';
import { getNodeDefinition } from './nodeDefinitions';

function CustomFlowNodeComponent({ id, data, selected }) {
  const nodeDef = getNodeDefinition(data?.type);
  const Icon = nodeDef.icon;
  const isTrigger = ['START', 'TRIGGER_WHATSAPP', 'TRIGGER_EVENT'].includes(data?.type);
  const isTerminal = ['END', 'HUMAN_HANDOFF', 'HANDOFF'].includes(data?.type);
  const isSimulatedActive = data?.activeSimulatedNodeId === id;

  const validationIssues = data?.validationIssues || [];
  const hasError = validationIssues.some(i => i.severity === 'error');
  const hasWarning = validationIssues.some(i => i.severity === 'warning');

  const handles = nodeDef.getOutputHandles ? nodeDef.getOutputHandles(data) : [];
  const hasMultipleHandles = handles.length > 1;

  // Extract a 2-line preview of node content
  const renderPreview = () => {
    const config = data?.config || {};
    const type = data?.type;

    if (type === 'TRIGGER_WHATSAPP') {
      const kw = config.keywords || [];
      return `Keywords: ${kw.slice(0, 3).join(', ')}${kw.length > 3 ? '...' : ''}`;
    }
    if (type === 'TRIGGER_EVENT') {
      return `Event: ${config.eventName || 'lifecycle_event'}`;
    }
    if (type === 'SEND_MESSAGE' || type === 'MESSAGE') {
      if (config.text) {
        return config.text.length > 65 ? `${config.text.substring(0, 65)}...` : config.text;
      }
      return `${(config.options || []).length} interactive buttons`;
    }
    if (type === 'SEND_TEMPLATE') {
      return `Template: ${config.templateName || 'unnamed'}`;
    }
    if (type === 'SEND_WHATSAPP_FLOW') {
      return `Meta Flow ID: ${config.metaFlowId || 'unassigned'}`;
    }
    if (type === 'COLLECT_INPUT' || type === 'INPUT_COLLECTION' || type === 'QUESTION') {
      return `Collects {{${config.saveAs || config.variable || 'input'}}}`;
    }
    if (type === 'CONDITION') {
      const rules = config.rules || [];
      if (rules.length > 0) {
        const r = rules[0];
        return `If {{${r.variable || 'var'}}} ${r.operator || 'eq'} "${r.value || ''}"`;
      }
      return 'Branch evaluation rules';
    }
    if (type === 'SET_VARIABLE') {
      return `${config.operation || 'SET'} {{${config.targetVar || 'var'}}} = "${config.value || ''}"`;
    }
    if (type === 'WAIT_DELAY') {
      return `Wait ${config.durationValue || 2} ${String(config.durationUnit || 'HOURS').toLowerCase()}`;
    }
    if (type === 'CRM_UPSERT') {
      return `Stage: ${config.stage || 'QUALIFIED'}`;
    }
    if (type === 'CATALOG_BOOKING' || type === 'BUSINESS_ACTION') {
      return `Action: ${(config.action || 'Availability').replace('HOSPITALITY_', '')}`;
    }
    if (type === 'HTTP_WEBHOOK' || type === 'API_INTEGRATION') {
      return `${config.method || 'POST'} ${config.url || 'endpoint'}`;
    }
    if (type === 'HUMAN_HANDOFF' || type === 'HANDOFF') {
      return `Handoff to: ${config.team || 'FRONT_DESK'}`;
    }
    if (type === 'END') {
      return config.farewellMessage ? `${config.farewellMessage.substring(0, 50)}...` : 'Journey Completed';
    }

    return 'Workflow Step';
  };

  const handleDuplicate = (e) => {
    e.stopPropagation();
    data?.onDuplicateNode?.(id);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    data?.onDeleteNode?.(id);
  };

  // Card border and shadow
  let borderColor = '#E5E5E8';
  let boxShadow = '0 2px 8px rgba(0,0,0,0.04)';

  if (selected) {
    borderColor = nodeDef.color || '#2F5219';
    boxShadow = `0 6px 18px rgba(0,0,0,0.08), 0 0 0 2px ${nodeDef.bg || '#E8F5E9'}`;
  }

  if (isSimulatedActive) {
    borderColor = '#2F5219';
    boxShadow = '0 0 0 3px #2F5219, 0 0 16px rgba(47,82,25,0.45)';
  } else if (hasError) {
    borderColor = '#EF4444';
  } else if (hasWarning && !selected) {
    borderColor = '#F59E0B';
  }

  return (
    <div
      style={{
        width: '270px',
        background: '#FFFFFF',
        borderRadius: '10px',
        border: `1.5px solid ${borderColor}`,
        boxShadow,
        position: 'relative',
        transition: 'all 0.15s ease',
        cursor: 'pointer',
        fontSize: '0.80rem'
      }}
    >
      {/* Top Input Connection Port (omitted for triggers) */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          id="target"
          style={{
            top: '-7px',
            background: '#94A3B8',
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            border: '2px solid #FFFFFF',
            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            zIndex: 10,
            cursor: 'crosshair'
          }}
        />
      )}

      {/* Top Category Strip */}
      <div
        style={{
          height: '4px',
          background: nodeDef.color,
          borderRadius: '8px 8px 0 0'
        }}
      />

      {/* Card Header */}
      <div
        style={{
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #F1F5F9',
          background: selected ? nodeDef.bg : '#FAFAFB'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              background: nodeDef.bg,
              color: nodeDef.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <Icon size={14} />
          </div>
          <div style={{ minWidth: 0 }}>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                color: nodeDef.color,
                letterSpacing: '0.04em',
                textTransform: 'uppercase'
              }}
            >
              {nodeDef.badge || nodeDef.label}
            </span>
          </div>
        </div>

        {/* Action icons & validation status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          {hasError && (
            <span title={validationIssues.map(i => i.message).join('\n')} style={{ color: '#EF4444', display: 'flex' }}>
              <AlertCircle size={14} />
            </span>
          )}
          {!hasError && hasWarning && (
            <span title={validationIssues.map(i => i.message).join('\n')} style={{ color: '#F59E0B', display: 'flex' }}>
              <AlertTriangle size={14} />
            </span>
          )}

          <button
            type="button"
            onClick={handleDuplicate}
            title="Duplicate step"
            style={{
              border: 'none',
              background: 'transparent',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <Copy size={12} />
          </button>

          {!isTrigger && (
            <button
              type="button"
              onClick={handleDelete}
              title="Delete step"
              style={{
                border: 'none',
                background: 'transparent',
                color: '#EF4444',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div style={{ padding: '10px 12px' }}>
        <div
          style={{
            fontWeight: 700,
            color: '#1C1C1E',
            marginBottom: '4px',
            fontSize: '0.84rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {data?.title || nodeDef.label}
        </div>
        <div
          style={{
            fontSize: '0.74rem',
            color: '#64748B',
            lineHeight: '1.4',
            minHeight: '28px',
            wordBreak: 'break-word'
          }}
        >
          {renderPreview()}
        </div>

        {/* Dynamic Branch Handle Rows (for nodes with multiple outputs like buttons, conditions) */}
        {hasMultipleHandles && (
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {handles.map((h) => (
              <div
                key={h.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                  background: '#F8FAFC',
                  borderRadius: '5px',
                  border: '1px solid #E2E8F0',
                  position: 'relative'
                }}
              >
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: h.color || '#334155',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '210px'
                  }}
                >
                  {h.label}
                </span>

                {/* Right-aligned handle for each option */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={h.id}
                  style={{
                    top: '50%',
                    transform: 'translateY(-50%)',
                    right: '-19px',
                    background: h.color || nodeDef.color,
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    border: '2px solid #FFFFFF',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    zIndex: 10,
                    cursor: 'crosshair'
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Terminal Badge for End & Handoff nodes */}
        {isTerminal && (
          <div
            style={{
              marginTop: '6px',
              padding: '4px 8px',
              borderRadius: '5px',
              background: data?.type === 'END' ? '#F1F5F9' : '#FFF1F2',
              color: data?.type === 'END' ? '#475569' : '#BE123C',
              fontSize: '0.70rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {data?.type === 'END' ? <CheckCircle2 size={12} /> : <PhoneCall size={12} />}
            <span>{data?.type === 'END' ? 'Terminal End Point' : 'Transfers to Live Agent'}</span>
          </div>
        )}

        {/* Live Visual Analytics Overlay (Entered & Drop-off Rate) */}
        {data?.showAnalyticsOverlay && (
          <div
            style={{
              marginTop: '8px',
              padding: '6px 8px',
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.68rem',
              fontWeight: 600,
              color: '#166534'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: '#15803D' }}>●</span>
              <span>Entered: <strong>{data.metrics?.entered ?? 0}</strong></span>
            </div>
            <div
              style={{
                color: (data.metrics?.dropoffRate || 0) > 30 ? '#DC2626' : '#15803D',
                background: (data.metrics?.dropoffRate || 0) > 30 ? '#FEE2E2' : '#DCFCE7',
                padding: '2px 6px',
                borderRadius: '4px'
              }}
            >
              Drop-off: {data.metrics?.dropoffRate ?? 0}%
            </div>
          </div>
        )}
      </div>

      {/* Single Output Handle at Bottom Center for single-output nodes */}
      {!isTerminal && !hasMultipleHandles && (
        <Handle
          type="source"
          position={Position.Bottom}
          id={handles[0]?.id || 'default'}
          style={{
            bottom: '-7px',
            background: handles[0]?.color || nodeDef.color,
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            border: '2px solid #FFFFFF',
            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            zIndex: 10,
            cursor: 'crosshair'
          }}
        />
      )}
    </div>
  );
}

export default memo(CustomFlowNodeComponent);
