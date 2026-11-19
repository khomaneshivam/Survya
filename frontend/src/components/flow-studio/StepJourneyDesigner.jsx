import React, { useState, useMemo } from 'react';
import {
  MessageSquare,
  HelpCircle,
  Menu,
  GitBranch,
  Sliders,
  DollarSign,
  CheckCircle2,
  PhoneCall,
  CheckSquare,
  Plus,
  Trash2,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Edit3,
  Sparkles,
  Layers,
  Play,
  AlertCircle,
  Tag,
  Clock,
  Shield,
  Eye,
  Settings,
  X
} from 'lucide-react';

const STEP_TYPES = [
  { type: 'MESSAGE', label: 'Send Message / Greeting', icon: MessageSquare, color: '#2563EB', bg: '#EFF6FF', desc: 'Display a greeting, notice, or text update to the customer' },
  { type: 'INPUT_COLLECTION', label: 'Ask Question & Validate Input', icon: HelpCircle, color: '#059669', bg: '#ECFDF5', desc: 'Prompt customer for info (Dates, Guests, Number, Name, Email) with auto-validation' },
  { type: 'BUTTON_MENU', label: 'Interactive Button / List Menu', icon: Menu, color: '#7C3AED', bg: '#F5F3FF', desc: 'Present interactive choices, categories, or options (rendered as WhatsApp Buttons/List)' },
  { type: 'CONDITION', label: 'Branch on Condition / Choice', icon: GitBranch, color: '#D97706', bg: '#FFFBEB', desc: 'Route customer to different steps based on variables, choices, or amounts' },
  { type: 'BUSINESS_ACTION', label: 'Execute Business Action', icon: Sliders, color: '#4F46E5', bg: '#EEF2FF', desc: 'Run server business logic: availability check, CRM lead creation, or FAQ lookup' },
  { type: 'QUOTATION', label: 'Dynamic Price Quotation Card', icon: DollarSign, color: '#0D9488', bg: '#F0FDFA', desc: 'Calculate and output itemized pricing, stay duration, taxes, and totals' },
  { type: 'CONFIRMATION', label: 'Customer Confirmation Choice', icon: CheckSquare, color: '#EA580C', bg: '#FFF7ED', desc: 'Prompt customer to Confirm, Modify, or Cancel their details' },
  { type: 'HANDOFF', label: 'Staff / Front Desk Handoff', icon: PhoneCall, color: '#E11D48', bg: '#FFF1F2', desc: 'Pause automation and transfer conversation to on-duty reservations staff' },
  { type: 'END', label: 'Complete Conversation Flow', icon: CheckCircle2, color: '#64748B', bg: '#F8FAFC', desc: 'Gracefully conclude conversation with farewell message' }
];

const VALIDATION_PRESETS = [
  { id: 'DATE', label: '📅 Date (Today or future YYYY-MM-DD, e.g. "tomorrow", "2026-12-01")', defaultError: '⚠️ Please enter a valid date in YYYY-MM-DD format (or say "tomorrow").' },
  { id: 'GUEST_PARSER', label: '👥 Guest Count Parser (e.g. "2 adults 1 child", "family of 4", "3")', defaultError: '⚠️ Please specify the number of guests (e.g. 2 adults, 1 child).' },
  { id: 'NUMBER', label: '🔢 Numeric Value / Quantity (e.g. 1 to 50)', defaultError: '⚠️ Please enter a valid number.' },
  { id: 'TEXT', label: '📝 Freeform Text (with minimum character length)', defaultError: '⚠️ Please provide a detailed response (at least 3 characters).' },
  { id: 'EMAIL', label: '✉️ Email Address (e.g. guest@example.com)', defaultError: '⚠️ Please enter a valid email address.' },
  { id: 'PHONE', label: '📱 Phone Number (10 to 15 digits)', defaultError: '⚠️ Please enter a valid phone number.' }
];

const REGISTERED_ACTIONS = [
  { id: 'HOSPITALITY_CHECK_AVAILABILITY', label: '🏨 Check Room Inventory Availability', desc: 'Validates sellable room counts in real-time' },
  { id: 'HOSPITALITY_CALCULATE_QUOTE', label: '💵 Calculate Stay Quotation & Taxes', desc: 'Computes dynamic rates, extra guests, and GST' },
  { id: 'HOSPITALITY_CREATE_ENQUIRY', label: '📋 Create CRM Booking Enquiry', desc: 'Saves lead/enquiry and alerts front desk' },
  { id: 'HOSPITALITY_LOOKUP_FAQ', label: '📖 Lookup Concierge Property FAQ', desc: 'Retrieves answers on timings, dining, pool, policies' },
  { id: 'ASSIGN_STAFF', label: '👤 Assign Staff Member', desc: 'Assigns reservations officer' },
  { id: 'B2B_CALCULATE_SALES_QUOTE', label: '💼 Calculate B2B Software Quote', desc: 'Computes enterprise tier price by seats' },
  { id: 'B2B_CREATE_SALES_DEAL', label: '🚀 Create CRM Sales Deal', desc: 'Registers prospect in sales CRM' },
  { id: 'GENERATE_PAYMENT_LINK', label: '💳 Generate Secure Payment Link', desc: 'Generates deposit checkout link' }
];

export default function StepJourneyDesigner({
  nodes = [],
  transitions = [],
  onUpdateNodes,
  onUpdateTransitions,
  onSelectNode,
  selectedNodeId,
  onOpenSimulator
}) {
  const [expandedStepId, setExpandedStepId] = useState(null);
  const [isAddStepModalOpen, setIsAddStepModalOpen] = useState(false);
  const [newStepType, setNewStepType] = useState('MESSAGE');
  const [newStepTitle, setNewStepTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Map transitions: source -> target
  const transitionMap = useMemo(() => {
    const map = {};
    transitions.forEach(t => {
      if (!map[t.source]) map[t.source] = [];
      map[t.source].push(t.target);
    });
    return map;
  }, [transitions]);

  // Node Map
  const nodeMap = useMemo(() => {
    const map = {};
    nodes.forEach(n => { map[n.id] = n; });
    return map;
  }, [nodes]);

  // Order nodes by conversational sequence starting from START node
  const orderedNodes = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];
    
    // Find START node
    const startNode = nodes.find(n => n.type === 'START') || nodes[0];
    const visited = new Set();
    const ordered = [];

    // Helper to traverse transitions
    const traverse = (nodeId) => {
      if (!nodeId || visited.has(nodeId)) return;
      visited.add(nodeId);
      const curr = nodeMap[nodeId];
      if (curr) {
        ordered.push(curr);
        const nextIds = transitionMap[nodeId] || [];
        nextIds.forEach(nextId => traverse(nextId));
      }
    };

    traverse(startNode.id);

    // Append any unvisited orphan nodes at the end
    nodes.forEach(n => {
      if (!visited.has(n.id)) {
        ordered.push(n);
        visited.add(n.id);
      }
    });

    return ordered;
  }, [nodes, transitionMap, nodeMap]);

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    if (!searchQuery) return orderedNodes;
    const q = searchQuery.toLowerCase();
    return orderedNodes.filter(n =>
      (n.title && n.title.toLowerCase().includes(q)) ||
      (n.type && n.type.toLowerCase().includes(q)) ||
      (n.config?.prompt && String(n.config.prompt).toLowerCase().includes(q)) ||
      (n.config?.text && String(n.config.text).toLowerCase().includes(q)) ||
      (n.config?.variable && String(n.config.variable).toLowerCase().includes(q))
    );
  }, [orderedNodes, searchQuery]);

  // Helper: update single node
  const handleUpdateNode = (updatedNode) => {
    onUpdateNodes(nodes.map(n => n.id === updatedNode.id ? updatedNode : n));
  };

  // Helper: update node config property
  const handleConfigChange = (nodeId, key, value) => {
    const target = nodeMap[nodeId];
    if (!target) return;
    const updated = {
      ...target,
      config: {
        ...(target.config || {}),
        [key]: value
      }
    };
    handleUpdateNode(updated);
  };

  // Helper: set next step transition
  const handleSetNextStep = (sourceNodeId, targetNodeId) => {
    // Remove existing transition from this source
    const remaining = transitions.filter(t => t.source !== sourceNodeId);
    if (targetNodeId && targetNodeId !== 'NONE') {
      const newTransition = {
        id: `t_${sourceNodeId}_${targetNodeId}_${Date.now()}`,
        source: sourceNodeId,
        target: targetNodeId
      };
      onUpdateTransitions([...remaining, newTransition]);
    } else {
      onUpdateTransitions(remaining);
    }
  };

  // Helper: add an interactive option to a menu node
  const handleAddOption = (nodeId) => {
    const target = nodeMap[nodeId];
    if (!target) return;
    const currentOptions = target.config?.options || [];
    const newOptionNumber = currentOptions.length + 1;
    const newOpt = {
      id: `opt_${Date.now()}_${newOptionNumber}`,
      title: `Option ${newOptionNumber}`,
      value: `OPTION_${newOptionNumber}`,
      targetNodeId: ''
    };
    const updated = {
      ...target,
      config: {
        ...(target.config || {}),
        options: [...currentOptions, newOpt]
      }
    };
    handleUpdateNode(updated);
  };

  // Helper: update option in menu node
  const handleUpdateOption = (nodeId, optIndex, field, value) => {
    const target = nodeMap[nodeId];
    if (!target) return;
    const currentOptions = [...(target.config?.options || [])];
    currentOptions[optIndex] = { ...currentOptions[optIndex], [field]: value };
    const updated = {
      ...target,
      config: {
        ...(target.config || {}),
        options: currentOptions
      }
    };
    handleUpdateNode(updated);

    // If targetNodeId changed, sync transition
    if (field === 'targetNodeId') {
      if (value) {
        const transExists = transitions.some(t => t.source === nodeId && t.target === value);
        if (!transExists) {
          onUpdateTransitions([
            ...transitions,
            { id: `t_${nodeId}_${value}_${Date.now()}`, source: nodeId, target: value }
          ]);
        }
      }
    }
  };

  // Helper: remove option from menu node
  const handleRemoveOption = (nodeId, optIndex) => {
    const target = nodeMap[nodeId];
    if (!target) return;
    const currentOptions = (target.config?.options || []).filter((_, i) => i !== optIndex);
    const updated = {
      ...target,
      config: {
        ...(target.config || {}),
        options: currentOptions
      }
    };
    handleUpdateNode(updated);
  };

  // Helper: delete a node
  const handleDeleteNode = (nodeId) => {
    if (nodeId === 'node_start') {
      alert("The Conversation Start step is mandatory and cannot be deleted.");
      return;
    }
    if (window.confirm("Are you sure you want to remove this step from the conversation?")) {
      onUpdateNodes(nodes.filter(n => n.id !== nodeId));
      onUpdateTransitions(transitions.filter(t => t.source !== nodeId && t.target !== nodeId));
      if (selectedNodeId === nodeId) onSelectNode(null);
      if (expandedStepId === nodeId) setExpandedStepId(null);
    }
  };

  // Helper: add new step
  const handleCreateStep = () => {
    const newId = `node_${newStepType.toLowerCase()}_${Date.now()}`;
    const meta = STEP_TYPES.find(t => t.type === newStepType) || STEP_TYPES[0];
    
    let defaultConfig = {};
    if (newStepType === 'MESSAGE') {
      defaultConfig = { text: 'Hello! Thank you for contacting us. How may we assist you today?' };
    } else if (newStepType === 'INPUT_COLLECTION') {
      defaultConfig = {
        prompt: 'Please enter your details:',
        variable: 'user_input_var',
        validation: { type: 'TEXT', minLength: 2, errorMessage: 'Please enter a valid response.' }
      };
    } else if (newStepType === 'BUTTON_MENU') {
      defaultConfig = {
        prompt: 'Please choose an option to get started:',
        variable: 'menu_choice',
        options: [
          { id: `opt_1_${Date.now()}`, title: 'Option 1 🏷️', value: 'CHOICE_1' },
          { id: `opt_2_${Date.now()}`, title: 'Option 2 💬', value: 'CHOICE_2' }
        ]
      };
    } else if (newStepType === 'BUSINESS_ACTION') {
      defaultConfig = {
        action: 'HOSPITALITY_CHECK_AVAILABILITY',
        inputs: { room_name: '{{selected_room_name}}', check_in: '{{check_in_date}}', check_out: '{{check_out_date}}' },
        outputs: { is_available: 'room_is_available', available_qty: 'available_units' }
      };
    } else if (newStepType === 'QUOTATION') {
      defaultConfig = {
        action: 'HOSPITALITY_CALCULATE_QUOTE',
        inputs: { room_type_id: '1', check_in: '{{check_in_date}}', check_out: '{{check_out_date}}', adults: '{{adults}}' },
        text: '✨ *Stay Quotation Summary*\n\nNights: {{nights}}\nBase Charges: ₹{{quote_subtotal}}\nTaxes (GST): ₹{{tax_total}}\n*Total Amount Payable: ₹{{quote_total}}*'
      };
    } else if (newStepType === 'CONFIRMATION') {
      defaultConfig = {
        prompt: 'Please confirm your booking details above:',
        variable: 'booking_confirmation',
        options: [
          { id: 'opt_confirm', title: 'Confirm & Proceed ✅', value: 'CONFIRM' },
          { id: 'opt_modify', title: 'Modify Details ✏️', value: 'MODIFY' },
          { id: 'opt_staff', title: 'Talk to Staff 💬', value: 'STAFF' }
        ]
      };
    } else if (newStepType === 'HANDOFF') {
      defaultConfig = {
        handoffMessage: '🔔 Connecting you with our Front Desk team. An agent will reply directly to this chat shortly.',
        alertStaff: true,
        pauseMinutes: 60
      };
    } else if (newStepType === 'END') {
      defaultConfig = {
        farewellMessage: '🙏 Thank you for chatting with us! Have a wonderful day.'
      };
    }

    const newNode = {
      id: newId,
      type: newStepType,
      title: newStepTitle.trim() || meta.label,
      config: defaultConfig,
      position: { x: 300, y: (orderedNodes.length + 1) * 120 }
    };

    // Auto-chain from the last node in the flow
    const lastNode = orderedNodes[orderedNodes.length - 1];
    const newTransitions = [...transitions];
    if (lastNode && lastNode.type !== 'END' && lastNode.type !== 'HANDOFF') {
      // Connect last node to this new node
      newTransitions.push({
        id: `t_${lastNode.id}_${newId}_${Date.now()}`,
        source: lastNode.id,
        target: newId
      });
    }

    onUpdateNodes([...nodes, newNode]);
    onUpdateTransitions(newTransitions);
    setExpandedStepId(newId);
    onSelectNode(newId);
    setIsAddStepModalOpen(false);
    setNewStepTitle('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Action Bar */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E5E5E8',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: '#F3F6EE',
            color: '#2F5219',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Layers size={22} />
          </div>
          <div>
            <h3 style={{ margin: '0 0 2px 0', fontSize: '1.05rem', fontWeight: 700, color: '#171719' }}>
              Step-by-Step Conversation Flow Designer
            </h3>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#67676B' }}>
              Configure your exact customer journey sequence: welcome greeting, questions, validation rules, interactive buttons &amp; automated replies.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search steps..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '8px 12px 8px 30px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                width: '180px',
                background: '#F8FAFC'
              }}
            />
            <span style={{ position: 'absolute', left: '10px', top: '9px', color: '#94A3B8' }}>🔍</span>
          </div>

          <button
            type="button"
            onClick={() => setIsAddStepModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#2F5219',
              color: '#FFFFFF',
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 5px rgba(47,82,25,0.2)'
            }}
          >
            <Plus size={16} />
            <span>Add Step</span>
          </button>

          {onOpenSimulator && (
            <button
              type="button"
              onClick={onOpenSimulator}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 14px',
                borderRadius: '8px',
                border: '1px solid #F59E0B',
                background: '#FFFBEB',
                color: '#B45309',
                fontSize: '0.84rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Play size={15} />
              <span>Test Simulator</span>
            </button>
          )}
        </div>
      </div>

      {/* Sequential Step Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredNodes.map((node, index) => {
          const typeMeta = STEP_TYPES.find(t => t.type === node.type) || { label: node.type, icon: MessageSquare, color: '#475569', bg: '#F1F5F9' };
          const Icon = typeMeta.icon;
          const isExpanded = expandedStepId === node.id;
          const isSelected = selectedNodeId === node.id;
          const nextTargets = transitionMap[node.id] || [];

          return (
            <div
              key={node.id}
              style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: isSelected ? `2px solid ${typeMeta.color}` : '1px solid #E5E5E8',
                boxShadow: isSelected ? `0 0 0 3px ${typeMeta.color}20` : '0 1px 3px rgba(0,0,0,0.04)',
                overflow: 'hidden',
                transition: 'all 0.15s ease'
              }}
            >
              {/* Card Header Bar */}
              <div style={{
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: isExpanded ? typeMeta.bg : '#FAFAFB',
                borderBottom: isExpanded ? '1px solid #E5E5E8' : 'none',
                cursor: 'pointer'
              }}
              onClick={() => {
                setExpandedStepId(isExpanded ? null : node.id);
                onSelectNode(node.id);
              }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: typeMeta.color,
                    color: '#FFFFFF'
                  }}>
                    STEP {index + 1}
                  </div>

                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#FFFFFF',
                    color: typeMeta.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${typeMeta.color}40`
                  }}>
                    <Icon size={18} />
                  </div>

                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#171719' }}>
                      {node.title || typeMeta.label}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#67676B' }}>
                      {typeMeta.label}
                      {node.config?.variable && (
                        <span style={{ marginLeft: '8px', fontFamily: 'monospace', color: '#2563EB', background: '#EFF6FF', padding: '1px 6px', borderRadius: '4px' }}>
                          ${node.config.variable}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={e => e.stopPropagation()}>
                  {node.type !== 'START' && (
                    <button
                      type="button"
                      title="Delete Step"
                      onClick={() => handleDeleteNode(node.id)}
                      style={{
                        padding: '6px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'transparent',
                        color: '#94A3B8',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                      onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setExpandedStepId(isExpanded ? null : node.id);
                      onSelectNode(node.id);
                    }}
                    style={{
                      padding: '6px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'transparent',
                      color: '#64748B',
                      cursor: 'pointer'
                    }}
                  >
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                </div>
              </div>

              {/* Collapsed Step Preview */}
              {!isExpanded && (
                <div style={{ padding: '12px 18px', fontSize: '0.84rem', color: '#334155' }}>
                  {node.type === 'START' && (
                    <div style={{ color: '#64748B', fontSize: '0.8rem' }}>
                      ⚡ <strong>Trigger:</strong> {node.config?.triggerType === 'INBOUND_ANY' ? 'Any Inbound Message' : 'Matching Trigger Keywords'} ({JSON.stringify(node.config?.triggerKeywords || ['hi', 'book'])})
                    </div>
                  )}

                  {(node.type === 'MESSAGE' || node.type === 'END') && (
                    <div style={{ whiteSpace: 'pre-wrap', color: '#1E293B', background: '#F8FAFC', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid #2563EB' }}>
                      {node.config?.text || node.config?.farewellMessage || 'No text defined'}
                    </div>
                  )}

                  {node.type === 'INPUT_COLLECTION' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontWeight: 600, color: '#1E293B' }}>{node.config?.prompt || 'Ask question'}</div>
                      <div style={{ display: 'flex', gap: '8px', fontSize: '0.76rem', flexWrap: 'wrap' }}>
                        <span style={{ color: '#059669', background: '#ECFDF5', padding: '2px 8px', borderRadius: '4px', border: '1px solid #A7F3D0' }}>
                          Validation: {node.config?.validation?.type || 'TEXT'}
                        </span>
                        <span style={{ color: '#2563EB', background: '#EFF6FF', padding: '2px 8px', borderRadius: '4px', border: '1px solid #BFDBFE' }}>
                          Stores in: ${node.config?.variable || 'unassigned'}
                        </span>
                      </div>
                    </div>
                  )}

                  {node.type === 'BUTTON_MENU' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontWeight: 600, color: '#1E293B' }}>{node.config?.prompt || 'Select an option:'}</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {(node.config?.options || []).map(opt => (
                          <span key={opt.id} style={{ fontSize: '0.76rem', color: '#7C3AED', background: '#F5F3FF', border: '1px solid #DDD6FE', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                            {opt.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {node.type === 'CONDITION' && (
                    <div style={{ fontSize: '0.78rem', color: '#D97706', background: '#FFFBEB', padding: '8px 12px', borderRadius: '6px', border: '1px solid #FDE68A' }}>
                      Branch on variable: <strong>${node.config?.variable}</strong> ({node.config?.rules?.length || 0} branching rules configured)
                    </div>
                  )}

                  {node.type === 'BUSINESS_ACTION' && (
                    <div style={{ fontSize: '0.78rem', color: '#4F46E5', background: '#EEF2FF', padding: '8px 12px', borderRadius: '6px', border: '1px solid #C7D2FE' }}>
                      ⚙️ <strong>Action:</strong> {node.config?.action || 'HOSPITALITY_CHECK_AVAILABILITY'}
                    </div>
                  )}

                  {node.type === 'QUOTATION' && (
                    <div style={{ fontSize: '0.78rem', color: '#0D9488', background: '#F0FDFA', padding: '8px 12px', borderRadius: '6px', border: '1px solid #99F6E4' }}>
                      💵 Dynamic Rate Breakdown Card with GST &amp; Total calculation
                    </div>
                  )}

                  {node.type === 'CONFIRMATION' && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {(node.config?.options || [{ title: 'Confirm' }, { title: 'Modify' }, { title: 'Staff' }]).map((o, idx) => (
                        <span key={idx} style={{ fontSize: '0.76rem', color: '#EA580C', background: '#FFF7ED', border: '1px solid #FFEDD5', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                          {o.title}
                        </span>
                      ))}
                    </div>
                  )}

                  {node.type === 'HANDOFF' && (
                    <div style={{ fontSize: '0.78rem', color: '#E11D48', background: '#FFF1F2', padding: '8px 12px', borderRadius: '6px', border: '1px solid #FECDD3' }}>
                      🔔 {node.config?.handoffMessage || 'Transferring to live reservations staff'}
                    </div>
                  )}

                  {/* Destination indicator */}
                  {nextTargets.length > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '0.76rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>➔ Next step:</span>
                      <strong style={{ color: '#0F172A' }}>
                        {nextTargets.map(tid => nodeMap[tid]?.title || tid).join(', ')}
                      </strong>
                    </div>
                  )}
                </div>
              )}

              {/* Expanded Inline Configuration Editor */}
              {isExpanded && (
                <div style={{ padding: '18px 20px', background: '#FFFFFF', borderTop: '1px solid #E5E5E8', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Step Title Input */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                      Step Title
                    </label>
                    <input
                      type="text"
                      value={node.title || ''}
                      onChange={(e) => handleUpdateNode({ ...node, title: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        fontSize: '0.86rem',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1'
                      }}
                    />
                  </div>

                  {/* START Node Config */}
                  {node.type === 'START' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                        Inbound Trigger Keywords (comma separated)
                      </label>
                      <input
                        type="text"
                        value={(node.config?.triggerKeywords || []).join(', ')}
                        onChange={(e) => {
                          const kws = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                          handleConfigChange(node.id, 'triggerKeywords', kws);
                        }}
                        placeholder="hi, hello, book, resort, room, rates"
                        style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                      />
                    </div>
                  )}

                  {/* MESSAGE Node Config */}
                  {(node.type === 'MESSAGE' || node.type === 'END') && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                        Message Template Text (supports variables like <code>&#123;&#123;property.name&#125;&#125;</code>, <code>&#123;&#123;customer_name&#125;&#125;</code>)
                      </label>
                      <textarea
                        rows={4}
                        value={node.config?.text || node.config?.farewellMessage || ''}
                        onChange={(e) => handleConfigChange(node.id, node.type === 'END' ? 'farewellMessage' : 'text', e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                      />
                    </div>
                  )}

                  {/* INPUT_COLLECTION Node Config */}
                  {node.type === 'INPUT_COLLECTION' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                          Question Prompt to Send
                        </label>
                        <input
                          type="text"
                          value={node.config?.prompt || ''}
                          onChange={(e) => handleConfigChange(node.id, 'prompt', e.target.value)}
                          placeholder="📅 Please enter your Check-in Date (YYYY-MM-DD):"
                          style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                            Store in Variable
                          </label>
                          <input
                            type="text"
                            value={node.config?.variable || ''}
                            onChange={(e) => handleConfigChange(node.id, 'variable', e.target.value)}
                            placeholder="e.g. check_in_date, guest_count, full_name"
                            style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontFamily: 'monospace' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                            Validation Type
                          </label>
                          <select
                            value={node.config?.validation?.type || 'TEXT'}
                            onChange={(e) => {
                              const valType = e.target.value;
                              const preset = VALIDATION_PRESETS.find(p => p.id === valType);
                              handleConfigChange(node.id, 'validation', {
                                ...(node.config?.validation || {}),
                                type: valType,
                                errorMessage: preset?.defaultError || 'Please enter a valid response.'
                              });
                            }}
                            style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF' }}
                          >
                            {VALIDATION_PRESETS.map(p => (
                              <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                          Validation Rejection / Retry Message
                        </label>
                        <input
                          type="text"
                          value={node.config?.validation?.errorMessage || ''}
                          onChange={(e) => {
                            handleConfigChange(node.id, 'validation', {
                              ...(node.config?.validation || {}),
                              errorMessage: e.target.value
                            });
                          }}
                          placeholder="⚠️ Invalid response. Please try again."
                          style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* BUTTON_MENU Node Config */}
                  {node.type === 'BUTTON_MENU' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                          Menu Question / Header Prompt
                        </label>
                        <input
                          type="text"
                          value={node.config?.prompt || ''}
                          onChange={(e) => handleConfigChange(node.id, 'prompt', e.target.value)}
                          placeholder="Please select an option to get started:"
                          style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                            Interactive Options &amp; Branch Destinations
                          </label>
                          <button
                            type="button"
                            onClick={() => handleAddOption(node.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: '1px solid #7C3AED',
                              background: '#F5F3FF',
                              color: '#7C3AED',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            <Plus size={14} /> Add Option
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {(node.config?.options || []).map((opt, oIdx) => (
                            <div
                              key={opt.id || oIdx}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '1.2fr 1fr 1.2fr auto',
                                gap: '8px',
                                background: '#F8FAFC',
                                padding: '8px 10px',
                                borderRadius: '8px',
                                border: '1px solid #E2E8F0',
                                alignItems: 'center'
                              }}
                            >
                              <input
                                type="text"
                                value={opt.title}
                                onChange={(e) => handleUpdateOption(node.id, oIdx, 'title', e.target.value)}
                                placeholder="Button Label (e.g. Book Stay 🛏️)"
                                style={{ padding: '6px 10px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                              />
                              <input
                                type="text"
                                value={opt.value}
                                onChange={(e) => handleUpdateOption(node.id, oIdx, 'value', e.target.value)}
                                placeholder="Value (e.g. BOOKING)"
                                style={{ padding: '6px 10px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid #CBD5E1', fontFamily: 'monospace' }}
                              />
                              <select
                                value={opt.targetNodeId || ''}
                                onChange={(e) => handleUpdateOption(node.id, oIdx, 'targetNodeId', e.target.value)}
                                style={{ padding: '6px 10px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#FFFFFF' }}
                              >
                                <option value="">Select target step...</option>
                                {nodes.filter(n => n.id !== node.id).map(targetNode => (
                                  <option key={targetNode.id} value={targetNode.id}>
                                    ➔ {targetNode.title}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                title="Remove Option"
                                onClick={() => handleRemoveOption(node.id, oIdx)}
                                style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}
                                onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                                onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* BUSINESS_ACTION Node Config */}
                  {node.type === 'BUSINESS_ACTION' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                          Select Server Action
                        </label>
                        <select
                          value={node.config?.action || 'HOSPITALITY_CHECK_AVAILABILITY'}
                          onChange={(e) => handleConfigChange(node.id, 'action', e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF' }}
                        >
                          {REGISTERED_ACTIONS.map(a => (
                            <option key={a.id} value={a.id}>{a.label}</option>
                          ))}
                        </select>
                        <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '4px' }}>
                          {REGISTERED_ACTIONS.find(a => a.id === (node.config?.action || 'HOSPITALITY_CHECK_AVAILABILITY'))?.desc}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Next Step Transition Selector */}
                  {node.type !== 'END' && node.type !== 'HANDOFF' && node.type !== 'BUTTON_MENU' && (
                    <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                        Next Step in Flow
                      </label>
                      <select
                        value={nextTargets[0] || 'NONE'}
                        onChange={(e) => handleSetNextStep(node.id, e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF' }}
                      >
                        <option value="NONE">None / Complete journey</option>
                        {nodes.filter(n => n.id !== node.id).map(targetNode => (
                          <option key={targetNode.id} value={targetNode.id}>
                            ➔ {targetNode.title} ({targetNode.type})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Step Modal */}
      {isAddStepModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            maxWidth: '680px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0F172A' }}>
                Add Conversation Step
              </h3>
              <button
                type="button"
                onClick={() => setIsAddStepModalOpen(false)}
                style={{ border: 'none', background: 'transparent', color: '#64748B', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Step Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ask Check-in Date, Select Room Category, Welcome Greeting"
                  value={newStepTitle}
                  onChange={(e) => setNewStepTitle(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', fontSize: '0.88rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                  Choose Step Type
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                  {STEP_TYPES.filter(t => t.type !== 'START').map(t => {
                    const Icon = t.icon;
                    const isSelected = newStepType === t.type;
                    return (
                      <div
                        key={t.type}
                        onClick={() => setNewStepType(t.type)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          border: isSelected ? `2px solid ${t.color}` : '1px solid #E2E8F0',
                          background: isSelected ? t.bg : '#FFFFFF',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          background: isSelected ? '#FFFFFF' : t.bg,
                          color: t.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <Icon size={18} />
                        </div>
                        <div>
                          <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0F172A' }}>{t.label}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px', lineHeight: 1.3 }}>{t.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              background: '#F8FAFC'
            }}>
              <button
                type="button"
                onClick={() => setIsAddStepModalOpen(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateStep}
                style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#2F5219', color: '#FFFFFF', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Add Step to Flow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
