import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  AlertTriangle,
  Info,
  Sliders,
  Zap,
  Tag,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';

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

export default function NodeInspectorDrawer({
  node,
  nodes = [],
  variables = {},
  onUpdateNode,
  onClose
}) {
  if (!node) return null;

  const [activeTab, setActiveTab] = useState('config'); // 'config' | 'variables' | 'json'

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

  const handleNestedConfigChange = (parentKey, childKey, val) => {
    const currParent = node.config?.[parentKey] || {};
    const updated = {
      ...node,
      config: {
        ...(node.config || {}),
        [parentKey]: {
          ...currParent,
          [childKey]: val
        }
      }
    };
    onUpdateNode(updated);
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
    const otherNodes = nodes.filter(n => n.id !== node.id);
    const newRule = {
      operator: 'EQUALS',
      value: '',
      targetNodeId: otherNodes[0]?.id || ''
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

  return (
    <div style={{
      width: '420px',
      background: '#FFFFFF',
      borderLeft: '1px solid #E5E5E8',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxShadow: '-4px 0 16px rgba(0,0,0,0.06)',
      zIndex: 20
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #E5E5E8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#FAFAFB'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '2px 8px',
              borderRadius: '6px',
              background: '#EAEAEF',
              color: '#343438'
            }}>
              {node.type}
            </span>
            <span style={{ fontSize: '0.78rem', color: '#8E8E93', fontFamily: 'monospace' }}>
              #{node.id}
            </span>
          </div>
          <input
            type="text"
            value={node.title || ''}
            onChange={(e) => handleTitleChange(e.target.value)}
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: '#1C1C1E',
              border: 'none',
              background: 'transparent',
              outline: 'none',
              marginTop: '4px',
              width: '100%',
              borderBottom: '1px dashed transparent'
            }}
            placeholder="Node Title..."
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: '6px',
            color: '#8E8E93'
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #E5E5E8',
        padding: '0 16px',
        background: '#FFFFFF'
      }}>
        {['config', 'variables', 'json'].map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 14px',
              fontSize: '0.82rem',
              fontWeight: activeTab === tab ? 600 : 500,
              color: activeTab === tab ? '#2F5219' : '#67676B',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === tab ? '2px solid #2F5219' : '2px solid transparent',
              cursor: 'pointer',
              textTransform: 'capitalize'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {activeTab === 'config' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* START Node Config */}
            {node.type === 'START' && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Trigger Type</label>
                  <select
                    className="form-input"
                    value={node.config?.triggerType || 'INBOUND_ANY'}
                    onChange={(e) => handleConfigChange('triggerType', e.target.value)}
                  >
                    <option value="INBOUND_ANY">Inbound Any Message (Default Journey Entry)</option>
                    <option value="KEYWORD_MATCH">Keyword Match (Intent detection)</option>
                    <option value="WELCOME">Explicit Welcome Greeting</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                    Trigger Keywords (Comma-separated)
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={Array.isArray(node.config?.triggerKeywords) ? node.config.triggerKeywords.join(', ') : (node.config?.triggerKeywords || '')}
                    onChange={(e) => handleConfigChange('triggerKeywords', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                    placeholder="hi, hello, book, rates, room"
                  />
                  <div style={{ fontSize: '0.75rem', color: '#8E8E93', marginTop: '4px' }}>
                    Inbound messages containing any of these keywords will start this journey.
                  </div>
                </div>
              </>
            )}

            {/* MESSAGE Node Config */}
            {node.type === 'MESSAGE' && (
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Message Content</label>
                  <span style={{ fontSize: '0.74rem', color: '#8E8E93' }}>Supports *bold*, _italics_ & {`{{variables}}`}</span>
                </div>
                <textarea
                  className="form-input"
                  rows={6}
                  value={node.config?.text || ''}
                  onChange={(e) => handleConfigChange('text', e.target.value)}
                  placeholder="Type conversational message here..."
                  style={{ fontFamily: 'inherit', lineHeight: '1.45' }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                  <span style={{ fontSize: '0.72rem', color: '#67676B' }}>Quick Variables:</span>
                  {['property.name', 'property.city', 'guest_name', 'check_in_date', 'quote_total', 'enquiry_id'].map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleConfigChange('text', (node.config?.text || '') + ` {{${v}}}`)}
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: '1px solid #D1D1D6',
                        background: '#F2F2F7',
                        fontSize: '0.72rem',
                        cursor: 'pointer'
                      }}
                    >
                      +{`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* BUTTON_MENU Node Config */}
            {node.type === 'BUTTON_MENU' && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Prompt Message</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={node.config?.prompt || ''}
                    onChange={(e) => handleConfigChange('prompt', e.target.value)}
                    placeholder="Please select an option:"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Assign Result to Variable</label>
                  <input
                    type="text"
                    className="form-input"
                    value={node.config?.variable || ''}
                    onChange={(e) => handleConfigChange('variable', e.target.value)}
                    placeholder="e.g. enquiry_type, selected_room"
                  />
                </div>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem', margin: 0 }}>
                      Interactive Buttons / Options ({options.length}/10)
                    </label>
                    {options.length < 10 && (
                      <button
                        type="button"
                        onClick={handleAddOption}
                        className="btn btn-outline"
                        style={{ padding: '4px 10px', fontSize: '0.75rem', gap: '4px' }}
                      >
                        <Plus size={13} /> Add Option
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {options.map((opt, idx) => {
                      const isLong = (opt.title || '').length > 20;
                      return (
                        <div key={opt.id || idx} style={{
                          padding: '10px',
                          border: isLong ? '1px solid #DC2626' : '1px solid #E5E5E8',
                          borderRadius: '8px',
                          background: '#FAFAFB',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input
                              type="text"
                              value={opt.title || ''}
                              onChange={(e) => handleUpdateOption(idx, 'title', e.target.value)}
                              placeholder="Button Title (Max 20 chars)"
                              className="form-input"
                              style={{ flex: 1, fontSize: '0.82rem', padding: '6px 8px' }}
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(idx)}
                              style={{ border: 'none', background: 'transparent', color: '#DC2626', cursor: 'pointer', padding: '4px' }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <input
                              type="text"
                              value={opt.value || ''}
                              onChange={(e) => handleUpdateOption(idx, 'value', e.target.value)}
                              placeholder="Value (e.g. BOOKING)"
                              className="form-input"
                              style={{ flex: 1, fontSize: '0.76rem', padding: '4px 8px', color: '#67676B' }}
                            />
                            <span style={{ fontSize: '0.7rem', color: isLong ? '#DC2626' : '#8E8E93', marginLeft: '8px' }}>
                              {(opt.title || '').length}/20 chars
                            </span>
                          </div>
                          {isLong && (
                            <div style={{ fontSize: '0.7rem', color: '#DC2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <AlertTriangle size={12} /> WhatsApp limits button titles to 20 characters.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* INPUT_COLLECTION Node Config */}
            {node.type === 'INPUT_COLLECTION' && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Prompt Message</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={node.config?.prompt || ''}
                    onChange={(e) => handleConfigChange('prompt', e.target.value)}
                    placeholder="e.g. Please enter your Check-in date:"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Target Variable Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={node.config?.variable || ''}
                    onChange={(e) => handleConfigChange('variable', e.target.value)}
                    placeholder="e.g. check_in_date, guest_name"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Data Validation Type</label>
                  <select
                    className="form-input"
                    value={node.config?.validation?.type || 'TEXT'}
                    onChange={(e) => handleNestedConfigChange('validation', 'type', e.target.value)}
                  >
                    <option value="DATE">Calendar Date (YYYY-MM-DD or relative like 'tomorrow')</option>
                    <option value="GUEST_PARSER">Guest Count Parser (extracts adults & children)</option>
                    <option value="NUMBER">Numeric Value</option>
                    <option value="TEXT">Freeform Text</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Validation Error Message</label>
                  <input
                    type="text"
                    className="form-input"
                    value={node.config?.validation?.errorMessage || ''}
                    onChange={(e) => handleNestedConfigChange('validation', 'errorMessage', e.target.value)}
                    placeholder="⚠️ Please provide a valid response in the requested format."
                  />
                </div>
              </>
            )}

            {/* CONDITION Node Config */}
            {node.type === 'CONDITION' && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Evaluate Variable</label>
                  <input
                    type="text"
                    className="form-input"
                    value={node.config?.variable || ''}
                    onChange={(e) => handleConfigChange('variable', e.target.value)}
                    placeholder="e.g. enquiry_type, is_available"
                  />
                </div>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem', margin: 0 }}>
                      Branching Rules ({conditionRules.length})
                    </label>
                    <button
                      type="button"
                      onClick={handleAddConditionRule}
                      className="btn btn-outline"
                      style={{ padding: '4px 10px', fontSize: '0.75rem', gap: '4px' }}
                    >
                      <Plus size={13} /> Add Rule
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {conditionRules.map((rule, idx) => (
                      <div key={idx} style={{
                        padding: '10px',
                        border: '1px solid #E5E5E8',
                        borderRadius: '8px',
                        background: '#FAFAFB',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <select
                            value={rule.operator || 'EQUALS'}
                            onChange={(e) => handleUpdateConditionRule(idx, 'operator', e.target.value)}
                            className="form-input"
                            style={{ flex: 1, fontSize: '0.78rem', padding: '4px 6px' }}
                          >
                            <option value="EQUALS">EQUALS</option>
                            <option value="NOT_EQUALS">NOT EQUALS</option>
                            <option value="CONTAINS">CONTAINS</option>
                            <option value="GREATER_THAN">GREATER THAN</option>
                            <option value="LESS_THAN">LESS THAN</option>
                            <option value="EXISTS">EXISTS (NOT EMPTY)</option>
                          </select>
                          <input
                            type="text"
                            value={rule.value !== undefined ? String(rule.value) : ''}
                            onChange={(e) => handleUpdateConditionRule(idx, 'value', e.target.value)}
                            placeholder="Match Value"
                            className="form-input"
                            style={{ flex: 1, fontSize: '0.78rem', padding: '4px 6px' }}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveConditionRule(idx)}
                            style={{ border: 'none', background: 'transparent', color: '#DC2626', cursor: 'pointer', padding: '4px' }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.74rem', color: '#8E8E93' }}>Target Node:</span>
                          <select
                            value={rule.targetNodeId || ''}
                            onChange={(e) => handleUpdateConditionRule(idx, 'targetNodeId', e.target.value)}
                            className="form-input"
                            style={{ flex: 1, fontSize: '0.78rem', padding: '4px 6px' }}
                          >
                            <option value="">Select target...</option>
                            {nodes.filter(n => n.id !== node.id).map(n => (
                              <option key={n.id} value={n.id}>
                                {n.title || n.id} ({n.type})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Fallback Default Target Node</label>
                  <select
                    value={node.config?.defaultTargetNodeId || ''}
                    onChange={(e) => handleConfigChange('defaultTargetNodeId', e.target.value)}
                    className="form-input"
                  >
                    <option value="">Select fallback target...</option>
                    {nodes.filter(n => n.id !== node.id).map(n => (
                      <option key={n.id} value={n.id}>
                        {n.title || n.id} ({n.type})
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* BUSINESS_ACTION Node Config */}
            {node.type === 'BUSINESS_ACTION' && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Registered System Action</label>
                  <select
                    className="form-input"
                    value={node.config?.action || 'HOSPITALITY_CHECK_AVAILABILITY'}
                    onChange={(e) => handleConfigChange('action', e.target.value)}
                  >
                    {APPROVED_ACTIONS.map(act => (
                      <option key={act.id} value={act.id}>{act.label}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: '0.75rem', color: '#67676B', marginTop: '4px' }}>
                    {APPROVED_ACTIONS.find(a => a.id === (node.config?.action || 'HOSPITALITY_CHECK_AVAILABILITY'))?.desc}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Action Inputs (Variables)</label>
                  <div style={{ background: '#FAFAFB', padding: '10px', borderRadius: '8px', border: '1px solid #E5E5E8' }}>
                    <div style={{ fontSize: '0.74rem', color: '#67676B', marginBottom: '6px' }}>
                      Pre-wired inputs from session state:
                    </div>
                    {Object.entries(node.config?.inputs || {}).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.76rem' }}>
                        <span style={{ fontWeight: 600 }}>{k}:</span>
                        <span style={{ color: '#2F5219', fontFamily: 'monospace' }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Action Outputs (Variable Assignment)</label>
                  <div style={{ background: '#FAFAFB', padding: '10px', borderRadius: '8px', border: '1px solid #E5E5E8' }}>
                    {Object.entries(node.config?.outputs || {}).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.76rem' }}>
                        <span style={{ fontWeight: 600 }}>{k} ➔</span>
                        <span style={{ color: '#1E40AF', fontFamily: 'monospace' }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* CONFIRMATION Node Config */}
            {node.type === 'CONFIRMATION' && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Confirmation Prompt</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={node.config?.prompt || ''}
                    onChange={(e) => handleConfigChange('prompt', e.target.value)}
                    placeholder="Would you like to confirm your selection and proceed?"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Assign Result to Variable</label>
                  <input
                    type="text"
                    className="form-input"
                    value={node.config?.variable || 'confirmation_choice'}
                    onChange={(e) => handleConfigChange('variable', e.target.value)}
                    placeholder="e.g. booking_confirmation_choice, b2b_confirm_choice"
                  />
                </div>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem', margin: 0 }}>
                      Action Choices ({options.length}/3)
                    </label>
                    {options.length < 3 && (
                      <button
                        type="button"
                        onClick={handleAddOption}
                        className="btn btn-outline"
                        style={{ padding: '4px 10px', fontSize: '0.75rem', gap: '4px' }}
                      >
                        <Plus size={13} /> Add Choice
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {options.map((opt, idx) => (
                      <div key={opt.id || idx} style={{
                        padding: '10px',
                        border: '1px solid #E5E5E8',
                        borderRadius: '8px',
                        background: '#FAFAFB',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input
                            type="text"
                            value={opt.title || ''}
                            onChange={(e) => handleUpdateOption(idx, 'title', e.target.value)}
                            placeholder="Title (Max 20 chars)"
                            className="form-input"
                            style={{ flex: 1, fontSize: '0.82rem', padding: '6px 8px' }}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(idx)}
                            style={{ border: 'none', background: 'transparent', color: '#DC2626', cursor: 'pointer', padding: '4px' }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={opt.value || ''}
                          onChange={(e) => handleUpdateOption(idx, 'value', e.target.value)}
                          placeholder="Value (e.g. CONFIRM, MODIFY, STAFF)"
                          className="form-input"
                          style={{ fontSize: '0.76rem', padding: '4px 8px', color: '#67676B' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* PAYMENT Node Config */}
            {node.type === 'PAYMENT' && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Dynamic Amount Variable</label>
                  <input
                    type="text"
                    className="form-input"
                    value={node.config?.amountVariable || 'quote_total'}
                    onChange={(e) => handleConfigChange('amountVariable', e.target.value)}
                    placeholder="e.g. quote_total, deposit_amount"
                  />
                  <div style={{ fontSize: '0.74rem', color: '#8E8E93', marginTop: '4px' }}>
                    Resolves amount from session variable.
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Fallback Fixed Amount (₹)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={node.config?.amount || 5000}
                    onChange={(e) => handleConfigChange('amount', Number(e.target.value) || 0)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Payment Gateway Provider</label>
                  <select
                    className="form-input"
                    value={node.config?.paymentGateway || 'RAZORPAY'}
                    onChange={(e) => handleConfigChange('paymentGateway', e.target.value)}
                  >
                    <option value="RAZORPAY">Razorpay UPI & Cards</option>
                    <option value="SURVYA_PAY">Survya Payment Gateway</option>
                    <option value="MOCK_SANDBOX">Test Mock Sandbox (Zero Fees)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Payment Description</label>
                  <input
                    type="text"
                    className="form-input"
                    value={node.config?.description || 'Booking Deposit'}
                    onChange={(e) => handleConfigChange('description', e.target.value)}
                    placeholder="e.g. Advance Stay Deposit for {{matched_room_name}}"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Payment Prompt Message (Optional)</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={node.config?.prompt || ''}
                    onChange={(e) => handleConfigChange('prompt', e.target.value)}
                    placeholder="💳 Complete deposit: {{payment_link}} (Ref: {{payment_id}})"
                  />
                </div>
              </>
            )}

            {/* QUOTATION Node Config */}
            {node.type === 'QUOTATION' && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Calculation Action</label>
                  <select
                    className="form-input"
                    value={node.config?.action || 'HOSPITALITY_CALCULATE_QUOTE'}
                    onChange={(e) => handleConfigChange('action', e.target.value)}
                  >
                    {APPROVED_ACTIONS.filter(a => String(a.id || '').includes('CALCULATE')).map(act => (
                      <option key={act.id} value={act.id}>{act.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Quotation Breakdown Template</label>
                  <textarea
                    className="form-input"
                    rows={5}
                    value={node.config?.text || ''}
                    onChange={(e) => handleConfigChange('text', e.target.value)}
                    placeholder="✨ *Estimated Quotation:*&#10;&#10;Charges: ₹{{quote_subtotal}}&#10;Taxes: ₹{{tax_total}}&#10;*Total: ₹{{quote_total}}*"
                  />
                </div>
              </>
            )}

            {/* API_INTEGRATION Node Config */}
            {node.type === 'API_INTEGRATION' && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>HTTP Method & Endpoint</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      className="form-input"
                      style={{ width: '100px' }}
                      value={node.config?.method || 'POST'}
                      onChange={(e) => handleConfigChange('method', e.target.value)}
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                    </select>
                    <input
                      type="text"
                      className="form-input"
                      style={{ flex: 1 }}
                      value={node.config?.url || ''}
                      onChange={(e) => handleConfigChange('url', e.target.value)}
                      placeholder="https://api.crm.com/v1/leads"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Output Field Mappings (JSON ➔ Variables)</label>
                  <div style={{ background: '#FAFAFB', padding: '10px', borderRadius: '8px', border: '1px solid #E5E5E8' }}>
                    <div style={{ fontSize: '0.74rem', color: '#67676B', marginBottom: '6px' }}>
                      Maps response keys to flow context variables:
                    </div>
                    {Object.entries(node.config?.outputMappings || { status: 'api_status' }).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.76rem' }}>
                        <span style={{ fontWeight: 600 }}>{k} ➔</span>
                        <span style={{ color: '#1E40AF', fontFamily: 'monospace' }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* HANDOFF Node Config */}
            {node.type === 'HANDOFF' && (
              <>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Destination Team</label>
                  <select
                    className="form-input"
                    value={node.config?.team || 'FRONT_DESK'}
                    onChange={(e) => handleConfigChange('team', e.target.value)}
                  >
                    <option value="FRONT_DESK">Front Desk Concierge</option>
                    <option value="RESERVATIONS">Reservations & Sales Desk</option>
                    <option value="SUPPORT">Guest Experience / Duty Manager</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Assigned Staff Title</label>
                  <input
                    type="text"
                    className="form-input"
                    value={node.config?.assignedTo || ''}
                    onChange={(e) => handleConfigChange('assignedTo', e.target.value)}
                    placeholder="Front Desk Manager"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Customer Handoff Notice</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={node.config?.handoffMessage || ''}
                    onChange={(e) => handleConfigChange('handoffMessage', e.target.value)}
                    placeholder="🔔 You are now connected with our Front Desk team..."
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Pause Bot Automation (Minutes)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={node.config?.pauseAutomationMinutes || 180}
                    onChange={(e) => handleConfigChange('pauseAutomationMinutes', parseInt(e.target.value, 10) || 60)}
                  />
                  <div style={{ fontSize: '0.75rem', color: '#8E8E93', marginTop: '4px' }}>
                    Bot will remain silent for this contact until staff completes conversation or time elapses.
                  </div>
                </div>
              </>
            )}

            {/* END Node Config */}
            {node.type === 'END' && (
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>Farewell Message (Optional)</label>
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

        {activeTab === 'variables' && (
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '10px' }}>
              Available Session Variables
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Object.entries(variables).map(([k, v]) => (
                <div key={k} style={{
                  padding: '8px 10px',
                  background: '#F2F2F7',
                  borderRadius: '6px',
                  fontSize: '0.78rem'
                }}>
                  <div style={{ fontWeight: 700, fontFamily: 'monospace', color: '#2F5219' }}>
                    {`{{${k}}}`}
                  </div>
                  <div style={{ color: '#67676B', fontSize: '0.72rem', marginTop: '2px' }}>
                    Type: {v.type || 'STRING'} • {v.label || k}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'json' && (
          <div>
            <pre style={{
              background: '#1C1C1E',
              color: '#34D399',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '0.75rem',
              overflowX: 'auto',
              maxHeight: '400px'
            }}>
              {JSON.stringify(node, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
