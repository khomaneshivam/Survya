import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  AlertTriangle,
  AlertCircle,
  Tag,
  Copy,
  Check,
  Link2,
  Key,
  ShieldCheck
} from 'lucide-react';
import { validateFlowGraph } from './flowGraphValidator';

const APPROVED_ACTIONS = [
  { id: 'HOSPITALITY_CHECK_AVAILABILITY', label: '🏨 Check Room Inventory Availability', desc: 'Validates sellable room counts between check-in and check-out dates' },
  { id: 'HOSPITALITY_CALCULATE_QUOTE', label: '💵 Calculate Stay Quotation & Taxes', desc: 'Authoritative dynamic pricing with seasonal slabs, extra adult/child rates & GST' },
  { id: 'HOSPITALITY_CREATE_ENQUIRY', label: '📋 Create CRM Booking Enquiry', desc: 'Records verified booking enquiry, links quote and assigns front-desk staff' },
  { id: 'HOSPITALITY_LOOKUP_FAQ', label: '📖 Lookup Concierge Property FAQ', desc: 'Retrieves answers on timings, dining, pool, policies or travel routes' },
  { id: 'FETCH_PROPERTY_INFO', label: '🏷️ Fetch Property Details', desc: 'Loads property name, address, contact numbers, and amenities' },
  { id: 'ASSIGN_STAFF', label: '👤 Assign Staff Member', desc: 'Routes conversation to on-duty reservations officer' },
  { id: 'B2B_CALCULATE_SALES_QUOTE', label: '💼 Calculate B2B Software Quote & GST', desc: 'Dynamic software tier calculation based on seats and monthly volume' },
  { id: 'B2B_CREATE_SALES_DEAL', label: '🚀 Create CRM B2B Sales Deal', desc: 'Initializes deal record with stage QUALIFIED_PROSPECT and assigns account exec' },
  { id: 'GENERATE_PAYMENT_LINK', label: '💳 Generate Secure Payment Deposit Link', desc: 'Generates Razorpay / Survya Pay checkout link with payment ID' }
];

const EMPTY_OBJECT = Object.freeze({});
const EMPTY_ARRAY = Object.freeze([]);

export default function NodeInspectorDrawer({
  node,
  nodes = EMPTY_ARRAY,
  variables = EMPTY_OBJECT,
  onUpdateNode,
  onClose
}) {
  // Call hooks unconditionally at top level (preserves React Rules of Hooks)
  const [activeTab, setActiveTab] = useState('config'); // 'config' | 'variables' | 'json'
  const [variablePickerField, setVariablePickerField] = useState(null); // field key targeted for variable insertion
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Collect available variables from system and upstream graph nodes
  const availableVariables = useMemo(() => {
    const list = [
      { key: 'contact.name', label: 'Guest / Customer Name', source: 'System' },
      { key: 'contact.phone', label: 'Guest WhatsApp Number', source: 'System' },
      { key: 'property.name', label: 'Business / Resort Name', source: 'System' },
      { key: 'property.phone', label: 'Duty Desk Phone', source: 'System' }
    ];

    // Variables from props
    Object.entries(variables || {}).forEach(([k, v]) => {
      if (!list.some(item => item.key === k)) {
        list.push({ key: k, label: v?.label || k, source: 'Session' });
      }
    });

    // Upstream variables produced by nodes in this flow
    (nodes || []).forEach(n => {
      const c = n.config || {};
      if ((n.type === 'COLLECT_INPUT' || n.type === 'INPUT_COLLECTION' || n.type === 'QUESTION') && (c.saveAs || c.variable)) {
        const varName = c.saveAs || c.variable;
        if (!list.some(item => item.key === varName)) {
          list.push({ key: varName, label: `Collected from "${n.title || n.id}"`, source: 'Step Input' });
        }
      }
      if (n.type === 'SET_VARIABLE' && c.targetVar) {
        if (!list.some(item => item.key === c.targetVar)) {
          list.push({ key: c.targetVar, label: `Set by "${n.title || n.id}"`, source: 'Variable' });
        }
      }
      if (n.type === 'CATALOG_BOOKING' || n.type === 'BUSINESS_ACTION' || n.type === 'QUOTATION') {
        const quoteVars = ['quote_total', 'quote_subtotal', 'tax_total', 'room_type_name', 'nights'];
        quoteVars.forEach(qv => {
          if (!list.some(item => item.key === qv)) {
            list.push({ key: qv, label: `Quote Calculation (${qv})`, source: 'Catalog' });
          }
        });
      }
      if ((n.type === 'HTTP_WEBHOOK' || n.type === 'API_INTEGRATION') && Array.isArray(c.responseMappings)) {
        c.responseMappings.forEach(rm => {
          if (rm.mapToVariable && !list.some(item => item.key === rm.mapToVariable)) {
            list.push({ key: rm.mapToVariable, label: `API Response (${rm.jsonPath || ''})`, source: 'Webhook' });
          }
        });
      }
    });

    return list;
  }, [nodes, variables]);

  // Validation diagnostics for this specific node
  const nodeIssues = useMemo(() => {
    if (!node) return [];
    const report = validateFlowGraph(nodes, []);
    return report.allIssues.filter(i => i.nodeId === node.id);
  }, [node, nodes]);

  if (!node) return null;

  const handleTitleChange = (val) => {
    onUpdateNode({ ...node, title: val });
  };

  const handleConfigChange = (key, val) => {
    const updated = {
      ...node,
      config: {
        ...(node.config || {}),
        [key]: val
      }
    };
    onUpdateNode(updated);
  };

  // Helper to insert a variable chip into a specific string config field
  const handleInsertVariable = (fieldKey, varKey) => {
    const currentVal = node.config?.[fieldKey] || '';
    const token = `{{${varKey}}}`;
    const newVal = currentVal ? `${currentVal} ${token}` : token;
    handleConfigChange(fieldKey, newVal);
    setVariablePickerField(null);
  };

  // Button Options helpers
  const options = node.config?.options || [];

  const handleAddOption = () => {
    const newOpt = {
      id: `opt_${Date.now()}`,
      title: 'New Option',
      value: `OPTION_${options.length + 1}`
    };
    handleConfigChange('options', [...options, newOpt]);
  };

  const handleUpdateOption = (index, field, val) => {
    const next = [...options];
    next[index] = { ...next[index], [field]: val };
    handleConfigChange('options', next);
  };

  const handleRemoveOption = (index) => {
    const next = options.filter((_, i) => i !== index);
    handleConfigChange('options', next);
  };

  // Condition Rules helpers
  const conditionRules = node.config?.rules || [];

  const handleAddConditionRule = () => {
    const newRule = {
      variable: 'lead_score',
      operator: 'gte',
      value: '50'
    };
    handleConfigChange('rules', [...conditionRules, newRule]);
  };

  const handleUpdateConditionRule = (index, field, val) => {
    const next = [...conditionRules];
    next[index] = { ...next[index], [field]: val };
    handleConfigChange('rules', next);
  };

  const handleRemoveConditionRule = (index) => {
    const next = conditionRules.filter((_, i) => i !== index);
    handleConfigChange('rules', next);
  };

  const isTrigger = ['START', 'TRIGGER_WHATSAPP', 'TRIGGER_EVENT'].includes(node.type);
  const isMessage = ['SEND_MESSAGE', 'MESSAGE', 'BUTTON_MENU', 'CONFIRMATION'].includes(node.type);
  const isIntake = ['COLLECT_INPUT', 'INPUT_COLLECTION', 'QUESTION'].includes(node.type);
  const isCondition = node.type === 'CONDITION';
  const isSetVar = node.type === 'SET_VARIABLE';
  const isWaitDelay = node.type === 'WAIT_DELAY';
  const isCrm = node.type === 'CRM_UPSERT';
  const isBooking = ['CATALOG_BOOKING', 'BUSINESS_ACTION', 'QUOTATION', 'BOOKING', 'TRANSACTION'].includes(node.type);
  const isWebhook = ['HTTP_WEBHOOK', 'API_INTEGRATION'].includes(node.type);
  const isTemplate = node.type === 'SEND_TEMPLATE';
  const isMetaFlow = node.type === 'SEND_WHATSAPP_FLOW';
  const isHandoff = ['HUMAN_HANDOFF', 'HANDOFF'].includes(node.type);
  const isEnd = node.type === 'END';

  return (
    <div
      style={{
        width: '420px',
        background: '#FFFFFF',
        borderLeft: '1px solid #E5E5E8',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxShadow: '-4px 0 16px rgba(0,0,0,0.06)',
        zIndex: 20
      }}
    >
      {/* Drawer Header */}
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid #E5E5E8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#FAFAFB'
        }}
      >
        <div style={{ flex: 1, minWidth: 0, marginRight: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '2px 8px',
                borderRadius: '6px',
                background: '#EAEAEF',
                color: '#343438'
              }}
            >
              {node.type}
            </span>
            <span style={{ fontSize: '0.74rem', color: '#8E8E93', fontFamily: 'monospace' }}>
              #{node.id}
            </span>
          </div>
          <input
            type="text"
            value={node.title || ''}
            onChange={(e) => handleTitleChange(e.target.value)}
            style={{
              fontSize: '0.96rem',
              fontWeight: 700,
              color: '#1C1C1E',
              border: 'none',
              background: 'transparent',
              outline: 'none',
              marginTop: '4px',
              width: '100%',
              borderBottom: '1px dashed #CBD5E1',
              paddingBottom: '2px'
            }}
            placeholder="Step Title..."
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close Inspector"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: '6px',
            color: '#8E8E93',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Node Validation Diagnostics Banner */}
      {nodeIssues.length > 0 && (
        <div
          style={{
            background: nodeIssues.some(i => i.severity === 'error') ? '#FEF2F2' : '#FFFBEB',
            borderBottom: `1px solid ${nodeIssues.some(i => i.severity === 'error') ? '#FCA5A5' : '#FDE68A'}`,
            padding: '10px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}
        >
          {nodeIssues.map((issue, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '0.73rem' }}>
              {issue.severity === 'error' ? (
                <AlertCircle size={13} color="#EF4444" style={{ marginTop: '2px', flexShrink: 0 }} />
              ) : (
                <AlertTriangle size={13} color="#F59E0B" style={{ marginTop: '2px', flexShrink: 0 }} />
              )}
              <span style={{ color: issue.severity === 'error' ? '#991B1B' : '#92400E' }}>
                {issue.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #E5E5E8',
          padding: '0 16px',
          background: '#FFFFFF'
        }}
      >
        {['config', 'variables', 'json'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 14px',
              fontSize: '0.80rem',
              fontWeight: activeTab === tab ? 600 : 500,
              color: activeTab === tab ? '#2F5219' : '#67676B',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === tab ? '2px solid #2F5219' : '2px solid transparent',
              cursor: 'pointer',
              textTransform: 'capitalize'
            }}
          >
            {tab === 'config' ? 'Step Setup' : tab === 'variables' ? 'Variables' : 'Raw JSON'}
          </button>
        ))}
      </div>

      {/* Tab 1: Config */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
        {activeTab === 'config' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* 1. TRIGGER NODES */}
            {isTrigger && (
              <>
                {node.type === 'TRIGGER_EVENT' ? (
                  <>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Event Trigger Type</label>
                      <select
                        className="form-input"
                        value={node.config?.eventType || 'WEBHOOK'}
                        onChange={(e) => handleConfigChange('eventType', e.target.value)}
                      >
                        <option value="WEBHOOK">Inbound Webhook (External API / Lead Form)</option>
                        <option value="CRM_STATUS_CHANGE">CRM Stage Changed</option>
                        <option value="PAYMENT_SUCCESS">Payment Completed</option>
                        <option value="META_FLOW_SUBMITTED">Meta Flow Submitted</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Unique Trigger Key</label>
                      <input
                        type="text"
                        className="form-input"
                        value={node.config?.triggerKey || `hook_${node.id}`}
                        onChange={(e) => handleConfigChange('triggerKey', e.target.value)}
                        placeholder="e.g. hook_lead_gen_drip"
                      />
                    </div>

                    {/* Copyable Webhook URL and Secret Token */}
                    <div style={{
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 700, color: '#1E293B' }}>
                        <Link2 size={14} color="#2F5219" />
                        <span>Public Webhook Endpoint URL</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="text"
                          readOnly
                          className="form-input"
                          value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/workflows/hooks/${node.config?.triggerKey || `hook_${node.id}`}`}
                          style={{ fontSize: '0.74rem', background: '#FFFFFF', fontFamily: 'monospace' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${window.location.origin}/api/v1/workflows/hooks/${node.config?.triggerKey || `hook_${node.id}`}`;
                            navigator.clipboard?.writeText(url);
                            setCopiedUrl(true);
                            setTimeout(() => setCopiedUrl(false), 2000);
                          }}
                          style={{
                            padding: '6px 10px',
                            background: copiedUrl ? '#DCFCE7' : '#FFFFFF',
                            border: '1px solid #CBD5E1',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: copiedUrl ? '#166534' : '#475569'
                          }}
                        >
                          {copiedUrl ? <Check size={13} /> : <Copy size={13} />}
                          <span>{copiedUrl ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 700, color: '#1E293B', marginTop: '4px' }}>
                        <Key size={14} color="#D97706" />
                        <span>Webhook Secret Token (Optional Authorization)</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="text"
                          className="form-input"
                          value={node.config?.secretToken || node.data?.secretToken || 'sec_survya_token'}
                          onChange={(e) => handleConfigChange('secretToken', e.target.value)}
                          placeholder="Pass in header: x-webhook-secret"
                          style={{ fontSize: '0.74rem', background: '#FFFFFF', fontFamily: 'monospace' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const sec = node.config?.secretToken || node.data?.secretToken || 'sec_survya_token';
                            navigator.clipboard?.writeText(sec);
                            setCopiedSecret(true);
                            setTimeout(() => setCopiedSecret(false), 2000);
                          }}
                          style={{
                            padding: '6px 10px',
                            background: copiedSecret ? '#DCFCE7' : '#FFFFFF',
                            border: '1px solid #CBD5E1',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: copiedSecret ? '#166534' : '#475569'
                          }}
                        >
                          {copiedSecret ? <Check size={13} /> : <Copy size={13} />}
                          <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>

                      <div style={{ fontSize: '0.70rem', color: '#64748B', lineHeight: '1.4' }}>
                        💡 Send a <code>POST</code> request with JSON body containing <code>{`{ "phone": "91...", ... }`}</code> to launch this journey.
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Trigger Mode</label>
                      <select
                        className="form-input"
                        value={node.config?.triggerType || 'KEYWORD_MATCH'}
                        onChange={(e) => handleConfigChange('triggerType', e.target.value)}
                      >
                        <option value="KEYWORD_MATCH">Keyword Match (Contains any specified keyword)</option>
                        <option value="EXACT_MATCH">Exact Match (Customer message matches exactly)</option>
                        <option value="FIRST_MESSAGE">First Inbound Contact (New Guest / Contact)</option>
                        <option value="INBOUND_ANY">Inbound Any Message (Default Flow Entry)</option>
                        <option value="REGEX">Regular Expression Pattern</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>
                        Trigger Keywords (Comma-separated)
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        value={(() => {
                          const kw = node.config?.keywords || node.config?.triggerKeywords;
                          return Array.isArray(kw) ? kw.join(', ') : (kw || '');
                        })()}
                        onChange={(e) => {
                          const list = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                          handleConfigChange('keywords', list);
                          handleConfigChange('triggerKeywords', list);
                        }}
                        placeholder="hi, hello, book, rates, room, enquiry"
                      />
                      <div style={{ fontSize: '0.73rem', color: '#8E8E93', marginTop: '4px' }}>
                        Inbound WhatsApp messages matching these keywords will trigger this customer journey.
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {/* 2. MESSAGING NODES (SEND_MESSAGE, MESSAGE, BUTTON_MENU, CONFIRMATION) */}
            {isMessage && (
              <>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Message Content</label>
                    <button
                      type="button"
                      onClick={() => setVariablePickerField(variablePickerField === 'text' ? null : 'text')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        border: '1px solid #E2E8F0',
                        background: '#F8FAFC',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: '0.70rem',
                        color: '#2F5219',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <Tag size={11} />
                      <span>Insert Variable</span>
                    </button>
                  </div>

                  {/* Variable Picker Popover */}
                  {variablePickerField === 'text' && (
                    <div
                      style={{
                        margin: '6px 0',
                        padding: '8px 10px',
                        background: '#F8FAFC',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                        maxHeight: '120px',
                        overflowY: 'auto'
                      }}
                    >
                      {availableVariables.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => handleInsertVariable('text', v.key)}
                          style={{
                            fontSize: '0.72rem',
                            padding: '3px 7px',
                            borderRadius: '4px',
                            background: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            color: '#166534',
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          {`{{${v.key}}}`}
                        </button>
                      ))}
                    </div>
                  )}

                  <textarea
                    className="form-input"
                    rows={4}
                    value={node.config?.text || node.config?.prompt || ''}
                    onChange={(e) => {
                      handleConfigChange('text', e.target.value);
                      handleConfigChange('prompt', e.target.value);
                    }}
                    placeholder="Hello {{contact.name}}! Welcome to our resort..."
                  />
                  <div style={{ fontSize: '0.73rem', color: '#8E8E93', marginTop: '4px' }}>
                    Supports *bold*, _italics_, ~strike~ and dynamic {`{{variables}}`}.
                  </div>
                </div>

                {/* Interactive Buttons / Options */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem', margin: 0 }}>
                      Interactive Options ({options.length}/10)
                    </label>
                    {options.length < 10 && (
                      <button
                        type="button"
                        onClick={handleAddOption}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          border: 'none',
                          background: '#E8F5E9',
                          color: '#2F5219',
                          borderRadius: '4px',
                          padding: '3px 8px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        <Plus size={12} />
                        <span>Add Option</span>
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {options.map((opt, i) => (
                      <div
                        key={opt.id || i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 10px',
                          background: '#F8FAFC',
                          borderRadius: '6px',
                          border: '1px solid #E2E8F0'
                        }}
                      >
                        <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>#{i + 1}</span>
                        <input
                          type="text"
                          className="form-input"
                          style={{ flex: 1, padding: '4px 8px', fontSize: '0.76rem' }}
                          value={opt.title || ''}
                          onChange={(e) => handleUpdateOption(i, 'title', e.target.value)}
                          placeholder="Button Label"
                          maxLength={20}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(i)}
                          title="Delete option"
                          style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer', padding: '2px' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    {options.length === 0 && (
                      <div style={{ fontSize: '0.74rem', color: '#94A3B8', fontStyle: 'italic' }}>
                        No buttons added. Message will send as plain text.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* 3. SEND TEMPLATE */}
            {isTemplate && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Meta Approved Template Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={node.config?.templateName || ''}
                    onChange={(e) => handleConfigChange('templateName', e.target.value)}
                    placeholder="booking_confirmation_v1"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Language Code</label>
                  <input
                    type="text"
                    className="form-input"
                    value={node.config?.templateLanguage || 'en_US'}
                    onChange={(e) => handleConfigChange('templateLanguage', e.target.value)}
                    placeholder="en_US"
                  />
                </div>
              </>
            )}

            {/* 4. META FLOW SCREEN */}
            {isMetaFlow && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Meta Flow ID</label>
                  <input
                    type="text"
                    className="form-input"
                    value={node.config?.metaFlowId || ''}
                    onChange={(e) => handleConfigChange('metaFlowId', e.target.value)}
                    placeholder="1064803546265989"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Flow Button CTA Label</label>
                  <input
                    type="text"
                    className="form-input"
                    value={node.config?.flowCta || 'Open Booking Form'}
                    onChange={(e) => handleConfigChange('flowCta', e.target.value)}
                    placeholder="Open Form"
                  />
                </div>
              </>
            )}

            {/* 5. DATA INTAKE (COLLECT_INPUT, INPUT_COLLECTION) */}
            {isIntake && (
              <>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Question Prompt</label>
                    <button
                      type="button"
                      onClick={() => setVariablePickerField(variablePickerField === 'prompt' ? null : 'prompt')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        border: '1px solid #E2E8F0',
                        background: '#F8FAFC',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: '0.70rem',
                        color: '#2F5219',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <Tag size={11} />
                      <span>Insert Variable</span>
                    </button>
                  </div>

                  {variablePickerField === 'prompt' && (
                    <div style={{ margin: '6px 0', padding: '8px 10px', background: '#F8FAFC', borderRadius: '6px', border: '1px solid #CBD5E1', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {availableVariables.map((v) => (
                        <button key={v.key} type="button" onClick={() => handleInsertVariable('prompt', v.key)} style={{ fontSize: '0.72rem', padding: '3px 7px', borderRadius: '4px', background: '#FFFFFF', border: '1px solid #E2E8F0', color: '#166534', cursor: 'pointer', fontWeight: 600 }}>
                          {`{{${v.key}}}`}
                        </button>
                      ))}
                    </div>
                  )}

                  <textarea
                    className="form-input"
                    rows={3}
                    value={node.config?.prompt || ''}
                    onChange={(e) => handleConfigChange('prompt', e.target.value)}
                    placeholder="Please enter your check-in date (e.g. tomorrow or YYYY-MM-DD):"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Input Validation Type</label>
                  <select
                    className="form-input"
                    value={node.config?.inputType || node.config?.validation?.type || 'TEXT'}
                    onChange={(e) => {
                      handleConfigChange('inputType', e.target.value);
                      handleConfigChange('validation', { ...(node.config?.validation || {}), type: e.target.value });
                    }}
                  >
                    <option value="DATE">📅 Date (Today or future YYYY-MM-DD or "tomorrow")</option>
                    <option value="GUEST_PARSER">👥 Guest Count (e.g. "2 adults", "family of 4")</option>
                    <option value="NUMBER">🔢 Numeric Value (1 to 100)</option>
                    <option value="PHONE">📱 Phone Number</option>
                    <option value="EMAIL">✉️ Email Address</option>
                    <option value="TEXT">📝 Freeform Text</option>
                    <option value="REGEX">🔣 Custom Regex Pattern</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Save Answer As Variable Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={node.config?.saveAs || node.config?.variable || ''}
                    onChange={(e) => {
                      handleConfigChange('saveAs', e.target.value.trim());
                      handleConfigChange('variable', e.target.value.trim());
                    }}
                    placeholder="check_in_date"
                  />
                  <div style={{ fontSize: '0.73rem', color: '#8E8E93', marginTop: '4px' }}>
                    Available in downstream messages via {`{{${node.config?.saveAs || node.config?.variable || 'variable'}}}`}.
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Validation Retry Error Message</label>
                  <input
                    type="text"
                    className="form-input"
                    value={node.config?.retryMessage || node.config?.validation?.errorMessage || ''}
                    onChange={(e) => {
                      handleConfigChange('retryMessage', e.target.value);
                      handleConfigChange('validation', { ...(node.config?.validation || {}), errorMessage: e.target.value });
                    }}
                    placeholder="⚠️ Please enter a valid date in YYYY-MM-DD format (e.g. 2026-12-01):"
                  />
                </div>
              </>
            )}

            {/* 6. CONDITION & BRANCHING */}
            {isCondition && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem', margin: 0 }}>
                    Evaluation Rules ({conditionRules.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddConditionRule}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      border: 'none',
                      background: '#E8F5E9',
                      color: '#2F5219',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={12} />
                    <span>Add Rule</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {conditionRules.map((rule, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px',
                        background: '#F8FAFC',
                        borderRadius: '6px',
                        border: '1px solid #E2E8F0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="text"
                          className="form-input"
                          style={{ flex: 1, padding: '4px 6px', fontSize: '0.75rem' }}
                          value={rule.variable || ''}
                          onChange={(e) => handleUpdateConditionRule(idx, 'variable', e.target.value)}
                          placeholder="Variable (e.g. lead_score)"
                        />
                        <select
                          className="form-input"
                          style={{ width: '100px', padding: '4px 6px', fontSize: '0.75rem' }}
                          value={rule.operator || 'eq'}
                          onChange={(e) => handleUpdateConditionRule(idx, 'operator', e.target.value)}
                        >
                          <option value="eq">== (Equals)</option>
                          <option value="neq">!= (Not Equal)</option>
                          <option value="gt">&gt; (Greater)</option>
                          <option value="gte">&gt;= (Greater/Equal)</option>
                          <option value="lt">&lt; (Less)</option>
                          <option value="contains">Contains</option>
                          <option value="is_empty">Is Empty</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleRemoveConditionRule(idx)}
                          style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer', padding: '2px' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <input
                        type="text"
                        className="form-input"
                        style={{ padding: '4px 6px', fontSize: '0.75rem' }}
                        value={rule.value || ''}
                        onChange={(e) => handleUpdateConditionRule(idx, 'value', e.target.value)}
                        placeholder="Value to compare (e.g. 50 or BOOKING)"
                      />
                    </div>
                  ))}
                  {conditionRules.length === 0 && (
                    <div style={{ fontSize: '0.74rem', color: '#94A3B8', fontStyle: 'italic' }}>
                      No rules configured. Add a rule to enable True/False branching.
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 7. SET VARIABLE */}
            {isSetVar && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Target Variable</label>
                  <input
                    type="text"
                    className="form-input"
                    value={node.config?.targetVar || ''}
                    onChange={(e) => handleConfigChange('targetVar', e.target.value)}
                    placeholder="lead_score"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Operation</label>
                  <select
                    className="form-input"
                    value={node.config?.operation || 'SET'}
                    onChange={(e) => handleConfigChange('operation', e.target.value)}
                  >
                    <option value="SET">Set / Assign Value</option>
                    <option value="INCREMENT">Increment (+)</option>
                    <option value="DECREMENT">Decrement (-)</option>
                    <option value="CLEAR">Clear / Reset</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Value</label>
                  <input
                    type="text"
                    className="form-input"
                    value={node.config?.value || ''}
                    onChange={(e) => handleConfigChange('value', e.target.value)}
                    placeholder="10"
                  />
                </div>
              </>
            )}

            {/* 8. WAIT / DELAY */}
            {isWaitDelay && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Wait Duration</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: '90px' }}
                      value={node.config?.durationValue || 2}
                      onChange={(e) => handleConfigChange('durationValue', parseInt(e.target.value, 10) || 1)}
                    />
                    <select
                      className="form-input"
                      style={{ flex: 1 }}
                      value={node.config?.durationUnit || 'HOURS'}
                      onChange={(e) => handleConfigChange('durationUnit', e.target.value)}
                    >
                      <option value="MINUTES">Minutes</option>
                      <option value="HOURS">Hours</option>
                      <option value="DAYS">Days</option>
                    </select>
                  </div>
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="cancelOnReply"
                    checked={node.config?.cancelOnUserReply !== false}
                    onChange={(e) => handleConfigChange('cancelOnUserReply', e.target.checked)}
                  />
                  <label htmlFor="cancelOnReply" style={{ fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                    Cancel timer and route to "If Replied Early" if customer sends message
                  </label>
                </div>
              </>
            )}

            {/* 9. CRM UPSERT */}
            {isCrm && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Pipeline</label>
                  <select
                    className="form-input"
                    value={node.config?.pipeline || 'HOSPITALITY_ENQUIRIES'}
                    onChange={(e) => handleConfigChange('pipeline', e.target.value)}
                  >
                    <option value="HOSPITALITY_ENQUIRIES">Hospitality Booking Enquiries</option>
                    <option value="B2B_SALES">B2B SaaS Sales Deals</option>
                    <option value="LEAD_GENERATION">General Lead Inbound</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Stage</label>
                  <select
                    className="form-input"
                    value={node.config?.stage || 'QUALIFIED'}
                    onChange={(e) => handleConfigChange('stage', e.target.value)}
                  >
                    <option value="NEW_LEAD">New Inbound Lead</option>
                    <option value="QUALIFIED">Qualified Prospect</option>
                    <option value="IN_DISCUSSION">In Discussion / Negotiation</option>
                    <option value="WON">Deal Closed / Won</option>
                  </select>
                </div>
              </>
            )}

            {/* 10. CATALOG & BOOKING */}
            {isBooking && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Business Action</label>
                  <select
                    className="form-input"
                    value={node.config?.action || 'HOSPITALITY_CHECK_AVAILABILITY'}
                    onChange={(e) => handleConfigChange('action', e.target.value)}
                  >
                    {APPROVED_ACTIONS.map(a => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* 11. HTTP WEBHOOK */}
            {isWebhook && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Method &amp; Endpoint URL</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <select
                      className="form-input"
                      style={{ width: '90px' }}
                      value={node.config?.method || 'POST'}
                      onChange={(e) => handleConfigChange('method', e.target.value)}
                    >
                      <option value="POST">POST</option>
                      <option value="GET">GET</option>
                      <option value="PUT">PUT</option>
                    </select>
                    <input
                      type="text"
                      className="form-input"
                      style={{ flex: 1 }}
                      value={node.config?.url || ''}
                      onChange={(e) => handleConfigChange('url', e.target.value)}
                      placeholder="https://api.example.com/v1/webhook"
                    />
                  </div>
                </div>
              </>
            )}

            {/* 12. STAFF HANDOFF */}
            {isHandoff && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Destination Team</label>
                  <select
                    className="form-input"
                    value={node.config?.team || 'FRONT_DESK'}
                    onChange={(e) => handleConfigChange('team', e.target.value)}
                  >
                    <option value="FRONT_DESK">Front Desk Concierge</option>
                    <option value="RESERVATIONS">Reservations &amp; Sales Desk</option>
                    <option value="SUPPORT">Guest Experience / Duty Manager</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Customer Handoff Notice</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    value={node.config?.handoffMessage || ''}
                    onChange={(e) => handleConfigChange('handoffMessage', e.target.value)}
                    placeholder="🔔 You are now connected with our Front Desk team..."
                  />
                </div>
              </>
            )}

            {/* 13. END JOURNEY */}
            {isEnd && (
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>Farewell Message (Optional)</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={node.config?.farewellMessage || ''}
                  onChange={(e) => handleConfigChange('farewellMessage', e.target.value)}
                  placeholder="Thank you for contacting us. Have a wonderful day!"
                />
              </div>
            )}

          </div>
        )}

        {/* Tab 2: Variables */}
        {activeTab === 'variables' && (
          <div>
            <div style={{ fontSize: '0.80rem', fontWeight: 600, marginBottom: '10px', color: '#1C1C1E' }}>
              Available Session Variables ({availableVariables.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {availableVariables.map((v) => (
                <div
                  key={v.key}
                  style={{
                    padding: '8px 10px',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '6px',
                    fontSize: '0.76rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#166534' }}>
                      {`{{${v.key}}}`}
                    </span>
                    <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '4px', background: '#E2E8F0', color: '#475569' }}>
                      {v.source}
                    </span>
                  </div>
                  <div style={{ color: '#64748B', fontSize: '0.72rem', marginTop: '2px' }}>
                    {v.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Raw JSON */}
        {activeTab === 'json' && (
          <div>
            <pre
              style={{
                background: '#1C1C1E',
                color: '#34D399',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '0.74rem',
                overflowX: 'auto',
                maxHeight: '450px'
              }}
            >
              {JSON.stringify(node, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
