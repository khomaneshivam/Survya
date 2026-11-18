import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  MessageSquare,
  HelpCircle,
  Layers,
  FileSpreadsheet,
  Zap,
  PhoneCall,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Copy,
  Sliders,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Send,
  Eye,
  Settings
} from 'lucide-react';

const NODE_DEFINITIONS = [
  { type: 'START', label: 'Start Entry', icon: Play, color: '#16A34A', bg: '#DCFCE7' },
  { type: 'MESSAGE', label: 'Message', icon: MessageSquare, color: '#2563EB', bg: '#DBEAFE' },
  { type: 'BUTTON_MENU', label: 'Button Menu', icon: Layers, color: '#7C3AED', bg: '#EDE9FE' },
  { type: 'INPUT_COLLECTION', label: 'Input Field', icon: FileSpreadsheet, color: '#D97706', bg: '#FEF3C7' },
  { type: 'CONDITION', label: 'Branch / Rule', icon: Sliders, color: '#EA580C', bg: '#FFEDD5' },
  { type: 'BUSINESS_ACTION', label: 'System Action', icon: Zap, color: '#059669', bg: '#D1FAE5' },
  { type: 'HANDOFF', label: 'Staff Handoff', icon: PhoneCall, color: '#4F46E5', bg: '#EEF2FF' },
  { type: 'DELAY', label: 'Simulate Wait', icon: Clock, color: '#64748B', bg: '#F1F5F9' },
  { type: 'END', label: 'End Journey', icon: CheckCircle2, color: '#475569', bg: '#E2E8F0' }
];

export default function FlowCanvas({
  nodes = [],
  transitions = [],
  selectedNodeId,
  onSelectNode,
  onUpdateNodes,
  onUpdateTransitions
}) {
  const [scale, setScale] = useState(1);
  const [draggedNode, setDraggedNode] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);

  // Dragging node on canvas
  const handleMouseDownNode = (e, node) => {
    e.stopPropagation();
    onSelectNode(node.id);
    const pos = node.position || { x: 100, y: 100 };
    setDraggedNode(node.id);
    setDragOffset({
      x: e.clientX - pos.x * scale,
      y: e.clientY - pos.y * scale
    });
  };

  const handleMouseMoveCanvas = (e) => {
    if (!draggedNode) return;
    const newX = Math.round((e.clientX - dragOffset.x) / scale);
    const newY = Math.round((e.clientY - dragOffset.y) / scale);

    const updatedNodes = nodes.map(n => {
      if (n.id === draggedNode) {
        return {
          ...n,
          position: { x: Math.max(20, newX), y: Math.max(20, newY) }
        };
      }
      return n;
    });

    onUpdateNodes(updatedNodes);
  };

  const handleMouseUpCanvas = () => {
    setDraggedNode(null);
  };

  const handleAddNodeFromPalette = (type) => {
    const def = NODE_DEFINITIONS.find(d => d.type === type);
    const newId = `node_${type.toLowerCase()}_${Date.now().toString(36)}`;
    const yOffset = nodes.length > 0 ? Math.max(...nodes.map(n => n.position?.y || 100)) + 120 : 100;

    let defaultConfig = {};
    if (type === 'MESSAGE') defaultConfig = { text: 'Hello! How can we assist you?' };
    if (type === 'BUTTON_MENU') {
      defaultConfig = {
        prompt: 'Please select an option:',
        options: [
          { id: `opt_${Date.now()}_1`, title: 'Option 1', value: 'OPT_1' },
          { id: `opt_${Date.now()}_2`, title: 'Option 2', value: 'OPT_2' }
        ]
      };
    }
    if (type === 'INPUT_COLLECTION') {
      defaultConfig = {
        prompt: 'Please enter information:',
        variable: 'custom_field',
        validation: { type: 'TEXT' }
      };
    }
    if (type === 'CONDITION') {
      defaultConfig = {
        variable: 'enquiry_type',
        rules: [{ operator: 'EQUALS', value: 'BOOKING', targetNodeId: '' }]
      };
    }
    if (type === 'BUSINESS_ACTION') {
      defaultConfig = {
        action: 'HOSPITALITY_CHECK_AVAILABILITY',
        inputs: {},
        outputs: {}
      };
    }
    if (type === 'HANDOFF') {
      defaultConfig = {
        team: 'FRONT_DESK',
        assignedTo: 'Duty Manager',
        handoffMessage: 'Connecting you with front desk...'
      };
    }
    if (type === 'END') {
      defaultConfig = { farewellMessage: 'Thank you for contacting us!' };
    }

    const newNode = {
      id: newId,
      type,
      title: def?.label || type,
      config: defaultConfig,
      position: { x: 300, y: yOffset }
    };

    const nextNodes = [...nodes, newNode];

    // Auto-connect to previous node if last was not terminal
    let nextTransitions = [...transitions];
    if (nodes.length > 0) {
      const prevNode = nodes[nodes.length - 1];
      if (prevNode.type !== 'END' && prevNode.type !== 'HANDOFF') {
        nextTransitions.push({
          id: `t_${prevNode.id}_${newId}`,
          source: prevNode.id,
          target: newId
        });
      }
    }

    onUpdateNodes(nextNodes);
    onUpdateTransitions(nextTransitions);
    onSelectNode(newId);
  };

  const handleDeleteNode = (e, nodeId) => {
    e.stopPropagation();
    if (!window.confirm('Delete this step from journey?')) return;
    const nextNodes = nodes.filter(n => n.id !== nodeId);
    const nextTransitions = transitions.filter(t => t.source !== nodeId && t.target !== nodeId);
    onUpdateNodes(nextNodes);
    onUpdateTransitions(nextTransitions);
    if (selectedNodeId === nodeId) {
      onSelectNode(nextNodes[0]?.id || null);
    }
  };

  const handleCloneNode = (e, node) => {
    e.stopPropagation();
    const clonedId = `node_${node.type.toLowerCase()}_${Date.now().toString(36)}`;
    const cloned = {
      ...node,
      id: clonedId,
      title: `${node.title || node.type} (Copy)`,
      position: {
        x: (node.position?.x || 200) + 40,
        y: (node.position?.y || 200) + 40
      }
    };
    onUpdateNodes([...nodes, cloned]);
    onSelectNode(clonedId);
  };

  // Build SVG path lines
  const nodeMap = new Map();
  nodes.forEach(n => nodeMap.set(n.id, n));

  const renderTransitions = () => {
    return transitions.map((t, idx) => {
      const srcNode = nodeMap.get(t.source);
      const tgtNode = nodeMap.get(t.target);
      if (!srcNode || !tgtNode) return null;

      const srcPos = srcNode.position || { x: 300, y: 100 };
      const tgtPos = tgtNode.position || { x: 300, y: 250 };

      // Calculate connection ports
      const startX = srcPos.x + 130;
      const startY = srcPos.y + 70; // Bottom center of node card
      const endX = tgtPos.x + 130;
      const endY = tgtPos.y; // Top center of target node card

      const deltaY = endY - startY;
      const controlY1 = startY + Math.max(30, deltaY * 0.4);
      const controlY2 = endY - Math.max(30, deltaY * 0.4);

      const pathData = `M ${startX} ${startY} C ${startX} ${controlY1}, ${endX} ${controlY2}, ${endX} ${endY}`;

      return (
        <g key={t.id || idx}>
          <path
            d={pathData}
            fill="none"
            stroke="#94A3B8"
            strokeWidth="2.5"
            strokeDasharray={t.isConditional ? "4 4" : "none"}
            markerEnd="url(#arrowhead)"
          />
        </g>
      );
    });
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {/* Top Node Palette Bar */}
      <div style={{
        padding: '10px 16px',
        background: '#FFFFFF',
        borderBottom: '1px solid #E5E5E8',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflowX: 'auto',
        zIndex: 10,
        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
      }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#67676B', whiteSpace: 'nowrap' }}>
          Add Step:
        </span>
        {NODE_DEFINITIONS.map(def => {
          const Icon = def.icon;
          return (
            <button
              key={def.type}
              type="button"
              onClick={() => handleAddNodeFromPalette(def.type)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #E5E5E8',
                background: '#FAFAFB',
                cursor: 'pointer',
                fontSize: '0.76rem',
                fontWeight: 600,
                color: '#1C1C1E',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = def.color; e.currentTarget.style.background = def.bg; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E5E5E8'; e.currentTarget.style.background = '#FAFAFB'; }}
            >
              <div style={{
                width: '18px',
                height: '18px',
                borderRadius: '4px',
                background: def.bg,
                color: def.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Icon size={12} />
              </div>
              <span>{def.label}</span>
            </button>
          );
        })}

        {/* Zoom Controls */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
            className="btn btn-outline"
            style={{ padding: '5px 8px' }}
            title="Zoom Out"
          >
            <ZoomOut size={13} />
          </button>
          <span style={{ fontSize: '0.72rem', color: '#8E8E93', minWidth: '36px', textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale(s => Math.min(1.5, s + 0.1))}
            className="btn btn-outline"
            style={{ padding: '5px 8px' }}
            title="Zoom In"
          >
            <ZoomIn size={13} />
          </button>
          <button
            type="button"
            onClick={() => setScale(1)}
            className="btn btn-outline"
            style={{ padding: '5px 8px' }}
            title="Reset Zoom"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div
        ref={canvasRef}
        onMouseMove={handleMouseMoveCanvas}
        onMouseUp={handleMouseUpCanvas}
        style={{
          flex: 1,
          background: '#F8FAFC',
          backgroundImage: 'radial-gradient(#CBD5E1 1.5px, transparent 1.5px)',
          backgroundSize: `${24 * scale}px ${24 * scale}px`,
          position: 'relative',
          overflow: 'auto',
          cursor: draggedNode ? 'grabbing' : 'default'
        }}
      >
        {/* SVG Path Layer */}
        <svg style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '3000px',
          height: '4000px',
          pointerEvents: 'none',
          transform: `scale(${scale})`,
          transformOrigin: '0 0'
        }}>
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#94A3B8" />
            </marker>
          </defs>
          {renderTransitions()}
        </svg>

        {/* Nodes Layer */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '3000px',
          height: '4000px',
          transform: `scale(${scale})`,
          transformOrigin: '0 0'
        }}>
          {nodes.map(node => {
            const def = NODE_DEFINITIONS.find(d => d.type === node.type) || NODE_DEFINITIONS[1];
            const Icon = def.icon;
            const isSelected = selectedNodeId === node.id;
            const pos = node.position || { x: 300, y: 100 };

            return (
              <div
                key={node.id}
                onMouseDown={(e) => handleMouseDownNode(e, node)}
                onClick={(e) => { e.stopPropagation(); onSelectNode(node.id); }}
                style={{
                  position: 'absolute',
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                  width: '260px',
                  background: '#FFFFFF',
                  borderRadius: '12px',
                  border: isSelected ? `2px solid ${def.color}` : '1px solid #E2E8F0',
                  boxShadow: isSelected ? `0 8px 24px rgba(0,0,0,0.12), 0 0 0 3px ${def.bg}` : '0 4px 10px rgba(0,0,0,0.04)',
                  cursor: 'grab',
                  userSelect: 'none',
                  transition: draggedNode === node.id ? 'none' : 'box-shadow 0.15s ease',
                  zIndex: isSelected ? 5 : 2
                }}
              >
                {/* Top Input Connection Port */}
                {node.type !== 'START' && (
                  <div style={{
                    position: 'absolute',
                    top: '-6px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: '#FFFFFF',
                    border: '2px solid #94A3B8',
                    zIndex: 6
                  }} />
                )}

                {/* Node Header */}
                <div style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid #F1F5F9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: isSelected ? def.bg : '#FAFAFB',
                  borderRadius: '10px 10px 0 0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '5px',
                      background: def.bg,
                      color: def.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Icon size={13} />
                    </div>
                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: def.color, letterSpacing: '0.04em' }}>
                      {def.label.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={(e) => handleCloneNode(e, node)}
                      title="Clone Step"
                      style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', padding: '2px' }}
                    >
                      <Copy size={12} />
                    </button>
                    {node.type !== 'START' && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteNode(e, node.id)}
                        title="Delete Step"
                        style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer', padding: '2px' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Node Body Card */}
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1E293B', marginBottom: '4px' }}>
                    {node.title || def.label}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', lineHeight: '1.4' }}>
                    {node.type === 'MESSAGE' && (node.config?.text ? `${node.config.text.slice(0, 50)}...` : 'Message prompt')}
                    {node.type === 'BUTTON_MENU' && `${(node.config?.options || []).length} interactive buttons`}
                    {node.type === 'INPUT_COLLECTION' && `Collects variable: {{${node.config?.variable || 'input'}}}`}
                    {node.type === 'CONDITION' && `Branch rules on: {{${node.config?.variable || 'var'}}}`}
                    {node.type === 'BUSINESS_ACTION' && `Action: ${node.config?.action || 'Availability'}`}
                    {node.type === 'HANDOFF' && `Handoff to: ${node.config?.team || 'Front Desk'}`}
                    {node.type === 'END' && (node.config?.farewellMessage || 'Journey Complete')}
                    {node.type === 'START' && 'Inbound message trigger'}
                  </div>
                </div>

                {/* Bottom Output Connection Port */}
                {node.type !== 'END' && (
                  <div style={{
                    position: 'absolute',
                    bottom: '-6px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: def.color,
                    border: '2px solid #FFFFFF',
                    zIndex: 6
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
