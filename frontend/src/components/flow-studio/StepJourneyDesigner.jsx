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
  X,
  Smartphone,
  Bookmark,
  Copy,
  Check
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
  { id: 'PHONE', label: '📱 Phone Number (10 to 15 digits)', defaultError: '⚠️ Please enter a valid phone number.' },
  { id: 'REGEX', label: '🔣 Custom Regex Pattern (advanced pattern match)', defaultError: '⚠️ Input format is invalid. Please try again.' }
];

const REGISTERED_ACTIONS = [
  { id: 'HOSPITALITY_CHECK_AVAILABILITY', label: '🏨 Check Room Inventory Availability', desc: 'Validates sellable room counts in real-time from room_types & hotel_daily_inventory' },
  { id: 'HOSPITALITY_CALCULATE_QUOTE', label: '💵 Calculate Stay Quotation & Taxes', desc: 'Computes dynamic rates, extra guests, and GST authoritative quote' },
  { id: 'HOSPITALITY_CREATE_ENQUIRY', label: '📋 Create CRM Booking Enquiry', desc: 'Saves lead/enquiry, assigns reservations officer, and alerts front desk' },
  { id: 'HOSPITALITY_LOOKUP_FAQ', label: '📖 Lookup Concierge Property FAQ', desc: 'Retrieves answers on timings, dining, pool, parking, policies' },
  { id: 'ASSIGN_STAFF', label: '👤 Assign Staff Member', desc: 'Assigns on-duty reservations officer' },
  { id: 'B2B_CALCULATE_SALES_QUOTE', label: '💼 Calculate B2B Software Quote', desc: 'Computes enterprise tier price by seats and billing cycle' },
  { id: 'B2B_CREATE_SALES_DEAL', label: '🚀 Create CRM Sales Deal', desc: 'Registers prospect in sales CRM and alerts account executives' },
  { id: 'GENERATE_PAYMENT_LINK', label: '💳 Generate Secure Payment Link', desc: 'Generates deposit checkout link (safe simulation mode)' }
];

const VARIABLE_SUGGESTIONS = [
  'check_in_date',
  'check_out_date',
  'guests',
  'room_category',
  'customer_name',
  'guest_email',
  'phone_number',
  'special_requests',
  'enquiry_type',
  'budget_range'
];

const SAMPLE_DEMO_DATA = {
  customer_name: 'Sunil Kumar',
  name: 'Sunil Kumar',
  property_name: 'KonkanTrip Beach Resort & Spa',
  'property.name': 'KonkanTrip Beach Resort & Spa',
  business_name: 'KonkanTrip Beach Resort & Spa',
  'business.name': 'KonkanTrip Beach Resort & Spa',
  selected_room_name: 'Deluxe Sea View Villa',
  room_category: 'Deluxe Sea View Villa',
  check_in_date: '2026-11-20',
  check_out_date: '2026-11-22',
  nights: '2',
  guests: '2 Adults, 1 Child',
  party_size: '3',
  guest_email: 'sunil.kumar@example.com',
  phone_number: '+91 98765 43210',
  phone: '+91 87665 90634',
  quote_subtotal: '12,000',
  tax_total: '1,440',
  quote_total: '13,440'
};

/**
 * Format markdown and variables for WhatsApp preview
 */
function renderWhatsAppFormattedText(rawText) {
  if (!rawText) return '';
  let text = String(rawText);

  // Variable substitution with sample demo data
  text = text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key) => {
    return SAMPLE_DEMO_DATA[key] || `[${key}]`;
  });

  // Preserve lines
  const lines = text.split('\n');
  return lines.map((line, lIdx) => {
    // Bold *word*
    let formatted = line.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    // Italic _word_
    formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
    // Strike ~word~
    formatted = formatted.replace(/~([^~]+)~/g, '<del>$1</del>');

    return (
      <span
        key={lIdx}
        dangerouslySetInnerHTML={{ __html: formatted || '&nbsp;' }}
        style={{ display: 'block', minHeight: '1.1em' }}
      />
    );
  });
}

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
  const [previewSteps, setPreviewSteps] = useState({}); // { [nodeId]: boolean }
  const [isAddStepModalOpen, setIsAddStepModalOpen] = useState(false);
  const [newStepType, setNewStepType] = useState('MESSAGE');
  const [newStepTitle, setNewStepTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Variables Drawer state
  const [showVariablesDrawer, setShowVariablesDrawer] = useState(false);
  const [copiedVar, setCopiedVar] = useState(null);

  // Save as Template Modal
  const [isSaveTemplateModalOpen, setIsSaveTemplateModalOpen] = useState(false);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [templateIndustry, setTemplateIndustry] = useState('HOSPITALITY');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSavedSuccess, setTemplateSavedSuccess] = useState(false);

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

    const startNode = nodes.find(n => n.type === 'START') || nodes[0];
    const visited = new Set();
    const ordered = [];

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

  // Extract all dynamic variables used/created across this entire flow
  const detectedVariables = useMemo(() => {
    const vars = new Set();
    nodes.forEach(n => {
      if (n.config?.variable) vars.add(n.config.variable);
      if (n.config?.prompt) {
        const matches = n.config.prompt.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g);
        for (const m of matches) vars.add(m[1]);
      }
      if (n.config?.text) {
        const matches = n.config.text.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g);
        for (const m of matches) vars.add(m[1]);
      }
      if (n.config?.handoffMessage) {
        const matches = n.config.handoffMessage.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g);
        for (const m of matches) vars.add(m[1]);
      }
      if (n.config?.outputs && typeof n.config.outputs === 'object') {
        Object.values(n.config.outputs).forEach(v => vars.add(v));
      }
    });
    return Array.from(vars).filter(Boolean);
  }, [nodes]);

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

  // Helper: move step Up or Down in sequential sequence
  const handleMoveStep = (nodeId, direction) => {
    const currentIndex = orderedNodes.findIndex(n => n.id === nodeId);
    if (currentIndex <= 0 && direction === 'UP') return; // Cannot move above START
    if (currentIndex <= 0) return; // START node stays fixed at index 0
    const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex <= 0 || targetIndex >= orderedNodes.length) return;

    const newOrdered = [...orderedNodes];
    const [movedNode] = newOrdered.splice(currentIndex, 1);
    newOrdered.splice(targetIndex, 0, movedNode);

    // Update canvas positions
    const updatedNodes = newOrdered.map((n, idx) => ({
      ...n,
      position: { x: n.position?.x || 300, y: (idx + 1) * 120 }
    }));

    // Update sequential transitions if these nodes were chained sequentially
    const updatedTransitions = [...transitions];
    const prevNode = newOrdered[targetIndex - 1];
    const currentMoved = newOrdered[targetIndex];
    const nextNode = newOrdered[targetIndex + 1];

    if (direction === 'DOWN') {
      // Swapped with the one below
      // Update prevNode -> currentMoved, currentMoved -> displacedNode
      const otherNode = newOrdered[currentIndex];
      // Stitch transitions smoothly
      const t1 = updatedTransitions.find(t => t.source === prevNode?.id);
      if (t1 && t1.target === otherNode.id) t1.target = currentMoved.id;
    }

    onUpdateNodes(updatedNodes);
  };

  // Helper: add an interactive option to a menu node
  const handleAddOption = (nodeId) => {
    const target = nodeMap[nodeId];
    if (!target) return;
    const currentOptions = target.config?.options || [];
    const newOptionNumber = currentOptions.length + 1;
    const newOpt = {
      id: `opt_${Date.now()}_${newOptionNumber}`,
      title: `Option ${newOptionNumber} 🏷️`,
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
      defaultConfig = { text: 'Hello {{customer_name}}! Welcome to *{{property.name}}*.\n\nHow may we assist you today?' };
    } else if (newStepType === 'INPUT_COLLECTION') {
      defaultConfig = {
        prompt: '📅 Please enter your details:',
        variable: 'user_input_var',
        validation: { type: 'TEXT', minLength: 2, errorMessage: 'Please enter a valid response.' }
      };
    } else if (newStepType === 'BUTTON_MENU') {
      defaultConfig = {
        prompt: 'Please select an option to get started:',
        variable: 'menu_choice',
        options: [
          { id: `opt_1_${Date.now()}`, title: 'Option 1 🏷️', value: 'CHOICE_1' },
          { id: `opt_2_${Date.now()}`, title: 'Option 2 💬', value: 'CHOICE_2' }
        ]
      };
    } else if (newStepType === 'CONDITION') {
      defaultConfig = {
        variable: 'menu_choice',
        rules: [
          { operator: 'EQUALS', value: 'CHOICE_1', targetNodeId: '' },
          { operator: 'EQUALS', value: 'CHOICE_2', targetNodeId: '' }
        ],
        defaultTargetNodeId: ''
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
        prompt: 'Please confirm your details above:',
        variable: 'confirmation_choice',
        options: [
          { id: 'opt_confirm', title: 'Confirm & Proceed ✅', value: 'CONFIRM' },
          { id: 'opt_modify', title: 'Modify Details ✏️', value: 'MODIFY' },
          { id: 'opt_staff', title: 'Talk to Staff 💬', value: 'STAFF' }
        ]
      };
    } else if (newStepType === 'HANDOFF') {
      defaultConfig = {
        handoffMessage: '🔔 Connecting you with our Front Desk concierge. An agent will message you directly on this chat shortly.',
        alertStaff: true,
        pauseMinutes: 60
      };
    } else if (newStepType === 'END') {
      defaultConfig = {
        farewellMessage: '🙏 Thank you for chatting with us! Have a wonderful day ahead.'
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

  // Helper: Save current flow as reusable template
  const handleSaveAsTemplate = async () => {
    if (!templateTitle.trim()) {
      alert("Please provide a title for the template.");
      return;
    }
    setSavingTemplate(true);
    try {
      const res = await fetch('/api/flows/conversation-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: templateTitle.trim(),
          description: templateDesc || 'Custom template saved from Studio Designer',
          industry: templateIndustry,
          category: 'CUSTOM',
          nodes,
          transitions
        })
      });
      const data = await res.json();
      if (data.success) {
        setTemplateSavedSuccess(true);
        setTimeout(() => {
          setTemplateSavedSuccess(false);
          setIsSaveTemplateModalOpen(false);
          setTemplateTitle('');
          setTemplateDesc('');
        }, 2000);
      } else {
        alert(data.error || 'Failed to save template');
      }
    } catch (err) {
      alert(err.message || 'Error saving template');
    } finally {
      setSavingTemplate(false);
    }
  };

  // Copy variable helper
  const handleCopyVar = (vName) => {
    navigator.clipboard.writeText(`{{${vName}}}`);
    setCopiedVar(vName);
    setTimeout(() => setCopiedVar(null), 2000);
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
            width: '42px',
            height: '42px',
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
              Design customer journeys visually: greetings, questions, strict validations, dynamic buttons &amp; business replies. Zero hardcoding.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Search bar */}
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
                width: '160px',
                background: '#F8FAFC'
              }}
            />
            <span style={{ position: 'absolute', left: '10px', top: '9px', color: '#94A3B8' }}>🔍</span>
          </div>

          {/* Variables Reference Pill */}
          <button
            type="button"
            onClick={() => setShowVariablesDrawer(!showVariablesDrawer)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              border: showVariablesDrawer ? '1px solid #2563EB' : '1px solid #CBD5E1',
              background: showVariablesDrawer ? '#EFF6FF' : '#FFFFFF',
              color: showVariablesDrawer ? '#2563EB' : '#475569',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Tag size={15} />
            <span>Variables ({detectedVariables.length})</span>
          </button>

          {/* Add Step Button */}
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

          {/* Save as Template Preset */}
          <button
            type="button"
            onClick={() => setIsSaveTemplateModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 13px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#334155',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="Save as reusable preset template"
          >
            <Bookmark size={15} />
            <span>Save as Template</span>
          </button>

          {/* Test Simulator Button */}
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

      {/* Variables Drawer / Bar */}
      {showVariablesDrawer && (
        <div style={{
          background: '#F8FAFC',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          padding: '12px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
              💡 Variables Available in this Flow (click to copy interpolation tag):
            </span>
            <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
              Use in prompts or messages as <code>&#123;&#123;variable_name&#125;&#125;</code>
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {detectedVariables.length === 0 ? (
              <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>No variables created yet. Add an "Ask Question" step to capture inputs.</span>
            ) : (
              detectedVariables.map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleCopyVar(v)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid #BFDBFE',
                    background: copiedVar === v ? '#DCFCE7' : '#EFF6FF',
                    color: copiedVar === v ? '#166534' : '#1D4ED8',
                    fontSize: '0.78rem',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {copiedVar === v ? <Check size={13} /> : <Copy size={13} />}
                  <span>{`{{${v}}}`}</span>
                  {copiedVar === v && <span style={{ fontSize: '0.7rem', color: '#166534' }}>Copied!</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Sequential Step Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {filteredNodes.map((node, index) => {
          const typeMeta = STEP_TYPES.find(t => t.type === node.type) || { label: node.type, icon: MessageSquare, color: '#475569', bg: '#F1F5F9' };
          const Icon = typeMeta.icon;
          const isExpanded = expandedStepId === node.id;
          const isSelected = selectedNodeId === node.id;
          const isPreviewOpen = Boolean(previewSteps[node.id]);
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
              <div
                style={{
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: isExpanded ? typeMeta.bg : '#FAFAFB',
                  borderBottom: isExpanded || isPreviewOpen ? '1px solid #E5E5E8' : 'none',
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
                  {/* Step Reorder: Move Up */}
                  {index > 1 && (
                    <button
                      type="button"
                      title="Move Step Up"
                      onClick={() => handleMoveStep(node.id, 'UP')}
                      style={{
                        padding: '6px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      <ArrowUp size={14} />
                    </button>
                  )}

                  {/* Step Reorder: Move Down */}
                  {index > 0 && index < orderedNodes.length - 1 && (
                    <button
                      type="button"
                      title="Move Step Down"
                      onClick={() => handleMoveStep(node.id, 'DOWN')}
                      style={{
                        padding: '6px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      <ArrowDown size={14} />
                    </button>
                  )}

                  {/* WhatsApp Live Preview Toggle */}
                  <button
                    type="button"
                    title="Toggle WhatsApp Message Preview"
                    onClick={() => setPreviewSteps(prev => ({ ...prev, [node.id]: !prev[node.id] }))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: isPreviewOpen ? '1px solid #10B981' : '1px solid #CBD5E1',
                      background: isPreviewOpen ? '#ECFDF5' : '#FFFFFF',
                      color: isPreviewOpen ? '#059669' : '#475569',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Smartphone size={14} />
                    <span>{isPreviewOpen ? 'Hide Preview' : 'WhatsApp Preview'}</span>
                  </button>

                  {/* Delete Step */}
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

                  {/* Expand / Collapse Chevron */}
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

              {/* WhatsApp Live Bubble Preview (when toggled) */}
              {isPreviewOpen && (
                <div style={{
                  padding: '16px 20px',
                  background: '#E5DDD5', // Authentic WhatsApp background
                  backgroundImage: 'radial-gradient(#CBD5E1 0.75px, transparent 0.75px)',
                  backgroundSize: '12px 12px',
                  borderBottom: '1px solid #CBD5E1',
                  display: 'flex',
                  justifyContent: 'flex-start'
                }}>
                  <div style={{
                    maxWidth: '440px',
                    width: '100%',
                    background: '#FFFFFF',
                    borderRadius: '8px 8px 8px 0px',
                    boxShadow: '0 1px 1px rgba(0,0,0,0.13)',
                    padding: '10px 14px 6px 14px',
                    position: 'relative',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                  }}>
                    {/* Message Text Content */}
                    <div style={{ fontSize: '0.88rem', color: '#111B21', lineHeight: '1.45', marginBottom: '8px' }}>
                      {node.type === 'START' && (
                        <div>
                          ⚡ <strong>Inbound Trigger Listener:</strong> Listens for incoming WhatsApp messages matching configured keywords.
                        </div>
                      )}

                      {node.type === 'MESSAGE' && renderWhatsAppFormattedText(node.config?.text || 'Hello! Welcome to our resort.')}

                      {node.type === 'INPUT_COLLECTION' && (
                        <div>
                          {renderWhatsAppFormattedText(node.config?.prompt || 'Please enter details:')}
                          <div style={{
                            marginTop: '8px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            background: '#F0F2F5',
                            fontSize: '0.74rem',
                            color: '#54656F',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            <span>💬 Customer reply will be validated as: <strong>{node.config?.validation?.type || 'TEXT'}</strong></span>
                          </div>
                        </div>
                      )}

                      {node.type === 'BUTTON_MENU' && (
                        <div>
                          {renderWhatsAppFormattedText(node.config?.prompt || 'Please select an option:')}
                        </div>
                      )}

                      {node.type === 'CONDITION' && (
                        <div>
                          🔀 <em>Evaluates variable <strong>${node.config?.variable}</strong> and routes customer automatically.</em>
                        </div>
                      )}

                      {node.type === 'BUSINESS_ACTION' && (
                        <div>
                          ⚙️ <em>Executes backend operation: <strong>{node.config?.action}</strong></em>
                        </div>
                      )}

                      {node.type === 'QUOTATION' && (
                        <div>
                          {renderWhatsAppFormattedText(node.config?.text || '✨ *Stay Quotation Summary*\n\nNights: 2\nTotal Amount: ₹13,440')}
                        </div>
                      )}

                      {node.type === 'CONFIRMATION' && (
                        <div>
                          {renderWhatsAppFormattedText(node.config?.prompt || 'Please confirm your details:')}
                        </div>
                      )}

                      {node.type === 'HANDOFF' && (
                        <div>
                          {renderWhatsAppFormattedText(node.config?.handoffMessage || '🔔 Connecting you with our front desk...')}
                        </div>
                      )}

                      {node.type === 'END' && (
                        <div>
                          {renderWhatsAppFormattedText(node.config?.farewellMessage || '🙏 Thank you for chatting with us!')}
                        </div>
                      )}
                    </div>

                    {/* WhatsApp Interactive Buttons (Rendered if BUTTON_MENU or CONFIRMATION) */}
                    {(node.type === 'BUTTON_MENU' || node.type === 'CONFIRMATION') && (
                      <div style={{ borderTop: '1px solid #E9EDEF', margin: '8px -14px 4px -14px', paddingTop: '4px' }}>
                        {(node.config?.options || []).length <= 3 ? (
                          // 1 to 3 Quick Reply Buttons
                          (node.config?.options || []).map((opt, oIdx) => (
                            <div
                              key={opt.id || oIdx}
                              style={{
                                padding: '9px 12px',
                                textAlign: 'center',
                                color: '#00A884',
                                fontWeight: 600,
                                fontSize: '0.86rem',
                                borderBottom: oIdx < (node.config?.options || []).length - 1 ? '1px solid #E9EDEF' : 'none',
                                cursor: 'default'
                              }}
                            >
                              {opt.title}
                            </div>
                          ))
                        ) : (
                          // 4+ List Menu Button
                          <div style={{
                            padding: '10px 12px',
                            textAlign: 'center',
                            color: '#00A884',
                            fontWeight: 600,
                            fontSize: '0.86rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                          }}>
                            <Menu size={16} />
                            <span>☰ Select an Option ({(node.config?.options || []).length} choices)</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* WhatsApp Message Metadata Footer (Timestamp + Double Tick) */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '4px',
                      fontSize: '0.68rem',
                      color: '#667781',
                      marginTop: '2px'
                    }}>
                      <span>10:15 AM</span>
                      <span style={{ color: '#53BDEB' }}>✓✓</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Collapsed Step Summary */}
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
                      Branch on variable: <strong>${node.config?.variable}</strong> ({(node.config?.rules || []).length} branching rules configured)
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                          Inbound Trigger Mode
                        </label>
                        <div style={{ display: 'flex', gap: '16px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name={`trigger_${node.id}`}
                              checked={node.config?.triggerType === 'INBOUND_ANY'}
                              onChange={() => handleConfigChange(node.id, 'triggerType', 'INBOUND_ANY')}
                            />
                            <span>Any Inbound Customer Message (Catch-all)</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name={`trigger_${node.id}`}
                              checked={node.config?.triggerType !== 'INBOUND_ANY'}
                              onChange={() => handleConfigChange(node.id, 'triggerType', 'KEYWORD_MATCH')}
                            />
                            <span>Matching Trigger Keywords</span>
                          </label>
                        </div>
                      </div>

                      {node.config?.triggerType !== 'INBOUND_ANY' && (
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                            Trigger Keywords (comma separated)
                          </label>
                          <input
                            type="text"
                            value={(node.config?.triggerKeywords || []).join(', ')}
                            onChange={(e) => {
                              const kws = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                              handleConfigChange(node.id, 'triggerKeywords', kws);
                            }}
                            placeholder="resort, book, room, stay, hi, hello, rates"
                            style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* MESSAGE Node Config */}
                  {(node.type === 'MESSAGE' || node.type === 'END') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                          Message Template Text
                        </label>
                        <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                          Markdown supported (*bold*, _italic_)
                        </span>
                      </div>

                      {/* Variable Insertion Pills */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Insert:</span>
                        {['customer_name', 'property.name', 'check_in_date', 'check_out_date', 'quote_total'].map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => {
                              const curr = node.config?.text || node.config?.farewellMessage || '';
                              handleConfigChange(node.id, node.type === 'END' ? 'farewellMessage' : 'text', `${curr} {{${v}}}`);
                            }}
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              border: '1px solid #E2E8F0',
                              background: '#F8FAFC',
                              color: '#3B82F6',
                              fontSize: '0.72rem',
                              fontFamily: 'monospace',
                              cursor: 'pointer'
                            }}
                          >
                            + {`{{${v}}}`}
                          </button>
                        ))}
                      </div>

                      <textarea
                        rows={4}
                        value={node.config?.text || node.config?.farewellMessage || ''}
                        onChange={(e) => handleConfigChange(node.id, node.type === 'END' ? 'farewellMessage' : 'text', e.target.value)}
                        placeholder="Type your message here..."
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
                            placeholder="e.g. check_in_date, guest_count"
                            style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontFamily: 'monospace' }}
                          />
                          {/* Quick suggestions */}
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                            {VARIABLE_SUGGESTIONS.slice(0, 5).map(s => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => handleConfigChange(node.id, 'variable', s)}
                                style={{
                                  border: 'none',
                                  background: '#EFF6FF',
                                  color: '#2563EB',
                                  fontSize: '0.7rem',
                                  borderRadius: '4px',
                                  padding: '1px 6px',
                                  cursor: 'pointer'
                                }}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
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

                      {/* Validation Sub-settings */}
                      {node.config?.validation?.type === 'NUMBER' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.76rem', color: '#64748B' }}>Minimum Value</label>
                            <input
                              type="number"
                              value={node.config?.validation?.min ?? 1}
                              onChange={(e) => handleConfigChange(node.id, 'validation', { ...(node.config?.validation || {}), min: Number(e.target.value) })}
                              style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.76rem', color: '#64748B' }}>Maximum Value</label>
                            <input
                              type="number"
                              value={node.config?.validation?.max ?? 20}
                              onChange={(e) => handleConfigChange(node.id, 'validation', { ...(node.config?.validation || {}), max: Number(e.target.value) })}
                              style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                            />
                          </div>
                        </div>
                      )}

                      {node.config?.validation?.type === 'DATE' && (
                        <div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#475569', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={node.config?.validation?.allowRelativeKeywords !== false}
                              onChange={(e) => handleConfigChange(node.id, 'validation', { ...(node.config?.validation || {}), allowRelativeKeywords: e.target.checked })}
                            />
                            <span>Allow natural relative keywords (e.g. "tomorrow", "kal", "today")</span>
                          </label>
                        </div>
                      )}

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

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                          Store Selected Choice in Variable
                        </label>
                        <input
                          type="text"
                          value={node.config?.variable || 'menu_choice'}
                          onChange={(e) => handleConfigChange(node.id, 'variable', e.target.value)}
                          placeholder="e.g. selected_service, enquiry_type"
                          style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontFamily: 'monospace' }}
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <div>
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                              Interactive Options &amp; Branch Destinations
                            </label>
                            <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748B' }}>
                              💡 1 to 3 options render as Quick-Reply Buttons; 4 to 10 render as Interactive List Menu.
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddOption(node.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 12px',
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

                  {/* CONDITION Node Config */}
                  {node.type === 'CONDITION' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                          Variable to Evaluate
                        </label>
                        <input
                          type="text"
                          value={node.config?.variable || ''}
                          onChange={(e) => handleConfigChange(node.id, 'variable', e.target.value)}
                          placeholder="e.g. menu_choice, guests, quote_total"
                          style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontFamily: 'monospace' }}
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                            Condition Rules
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const currRules = node.config?.rules || [];
                              handleConfigChange(node.id, 'rules', [
                                ...currRules,
                                { operator: 'EQUALS', value: '', targetNodeId: '' }
                              ]);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: '1px solid #D97706',
                              background: '#FFFBEB',
                              color: '#D97706',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            <Plus size={14} /> Add Rule
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {(node.config?.rules || []).map((rule, rIdx) => (
                            <div
                              key={rIdx}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr 1.2fr auto',
                                gap: '8px',
                                background: '#FFFBEB',
                                padding: '8px 10px',
                                borderRadius: '8px',
                                border: '1px solid #FDE68A',
                                alignItems: 'center'
                              }}
                            >
                              <select
                                value={rule.operator || 'EQUALS'}
                                onChange={(e) => {
                                  const updated = [...(node.config?.rules || [])];
                                  updated[rIdx] = { ...updated[rIdx], operator: e.target.value };
                                  handleConfigChange(node.id, 'rules', updated);
                                }}
                                style={{ padding: '6px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#FFFFFF' }}
                              >
                                <option value="EQUALS">== EQUALS</option>
                                <option value="NOT_EQUALS">!= NOT EQUALS</option>
                                <option value="CONTAINS">CONTAINS</option>
                                <option value="GREATER_THAN">&gt; GREATER THAN</option>
                                <option value="LESS_THAN">&lt; LESS THAN</option>
                                <option value="EXISTS">EXISTS (Not Empty)</option>
                              </select>

                              <input
                                type="text"
                                value={rule.value || ''}
                                onChange={(e) => {
                                  const updated = [...(node.config?.rules || [])];
                                  updated[rIdx] = { ...updated[rIdx], value: e.target.value };
                                  handleConfigChange(node.id, 'rules', updated);
                                }}
                                placeholder="Match Value"
                                style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                              />

                              <select
                                value={rule.targetNodeId || ''}
                                onChange={(e) => {
                                  const updated = [...(node.config?.rules || [])];
                                  updated[rIdx] = { ...updated[rIdx], targetNodeId: e.target.value };
                                  handleConfigChange(node.id, 'rules', updated);
                                  // sync transition
                                  if (e.target.value) {
                                    const exists = transitions.some(t => t.source === node.id && t.target === e.target.value);
                                    if (!exists) {
                                      onUpdateTransitions([...transitions, { id: `t_${node.id}_${e.target.value}_${Date.now()}`, source: node.id, target: e.target.value }]);
                                    }
                                  }
                                }}
                                style={{ padding: '6px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#FFFFFF' }}
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
                                onClick={() => {
                                  const updated = (node.config?.rules || []).filter((_, i) => i !== rIdx);
                                  handleConfigChange(node.id, 'rules', updated);
                                }}
                                style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          ))}
                        </div>

                        <div style={{ marginTop: '10px' }}>
                          <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748B', marginBottom: '4px' }}>
                            Default Fallback Step (if no rules match):
                          </label>
                          <select
                            value={node.config?.defaultTargetNodeId || 'NONE'}
                            onChange={(e) => handleConfigChange(node.id, 'defaultTargetNodeId', e.target.value)}
                            style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#FFFFFF' }}
                          >
                            <option value="NONE">None / Complete flow</option>
                            {nodes.filter(n => n.id !== node.id).map(targetNode => (
                              <option key={targetNode.id} value={targetNode.id}>
                                ➔ {targetNode.title}
                              </option>
                            ))}
                          </select>
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

                  {/* QUOTATION Node Config */}
                  {node.type === 'QUOTATION' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                          Itemized Quote Message Format
                        </label>
                        <textarea
                          rows={4}
                          value={node.config?.text || '✨ *Stay Quotation Summary*\n\nNights: {{nights}}\nBase Charges: ₹{{quote_subtotal}}\nTaxes (GST): ₹{{tax_total}}\n*Total Amount Payable: ₹{{quote_total}}*'}
                          onChange={(e) => handleConfigChange(node.id, 'text', e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* CONFIRMATION Node Config */}
                  {node.type === 'CONFIRMATION' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                          Confirmation Question Prompt
                        </label>
                        <input
                          type="text"
                          value={node.config?.prompt || 'Please confirm your details above:'}
                          onChange={(e) => handleConfigChange(node.id, 'prompt', e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* HANDOFF Node Config */}
                  {node.type === 'HANDOFF' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                          Staff Transfer Notice Message
                        </label>
                        <textarea
                          rows={3}
                          value={node.config?.handoffMessage || '🔔 Connecting you with our Front Desk team. An agent will message you directly on this chat shortly.'}
                          onChange={(e) => handleConfigChange(node.id, 'handoffMessage', e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.76rem', color: '#64748B' }}>Pause Bot Duration (mins)</label>
                          <input
                            type="number"
                            value={node.config?.pauseMinutes || 60}
                            onChange={(e) => handleConfigChange(node.id, 'pauseMinutes', Number(e.target.value))}
                            style={{ width: '120px', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                          />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#475569', cursor: 'pointer', marginTop: '16px' }}>
                          <input
                            type="checkbox"
                            checked={node.config?.alertStaff !== false}
                            onChange={(e) => handleConfigChange(node.id, 'alertStaff', e.target.checked)}
                          />
                          <span>Alert on-duty reservations staff via WebSocket</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Next Step Transition Selector */}
                  {node.type !== 'END' && node.type !== 'HANDOFF' && node.type !== 'BUTTON_MENU' && node.type !== 'CONDITION' && (
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

      {/* Save as Template Modal */}
      {isSaveTemplateModalOpen && (
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
            maxWidth: '520px',
            width: '100%',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>
                Save as Reusable Template
              </h3>
              <button
                type="button"
                onClick={() => setIsSaveTemplateModalOpen(false)}
                style={{ border: 'none', background: 'transparent', color: '#64748B', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {templateSavedSuccess && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#DCFCE7', color: '#166534', fontSize: '0.84rem', fontWeight: 600 }}>
                  ✓ Template saved successfully to library!
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Template Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Luxury Beachfront Resort Booking Journey"
                  value={templateTitle}
                  onChange={(e) => setTemplateTitle(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Industry / Category
                </label>
                <select
                  value={templateIndustry}
                  onChange={(e) => setTemplateIndustry(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF' }}
                >
                  <option value="HOSPITALITY">Hospitality &amp; Resorts</option>
                  <option value="SALES">B2B Sales &amp; Quotes</option>
                  <option value="CUSTOMER_SERVICE">Customer Support</option>
                  <option value="GENERAL">General Purpose</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe the customer journey and what this template achieves..."
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', fontSize: '0.86rem', borderRadius: '6px', border: '1px solid #CBD5E1' }}
                />
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
                onClick={() => setIsSaveTemplateModalOpen(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAsTemplate}
                disabled={savingTemplate}
                style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#2F5219', color: '#FFFFFF', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}
              >
                {savingTemplate ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
