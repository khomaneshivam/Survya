import React, { useState, useEffect, useRef } from 'react';
import {
  Smartphone,
  ShieldCheck,
  Send,
  RotateCcw,
  Sparkles,
  Zap,
  Tag,
  CheckCircle2,
  Info,
  Clock,
  ChevronDown,
  Layers
} from 'lucide-react';

export default function FlowSimulatorPanel({
  flow,
  currentNodes = [],
  currentTransitions = [],
  token,
  onActiveNodeChange
}) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [simulationState, setSimulationState] = useState(null);
  const [executionTrace, setExecutionTrace] = useState([]);
  const [pendingDelay, setPendingDelay] = useState(null);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'variables' | 'trace'

  const chatEndRef = useRef(null);
  const onActiveNodeChangeRef = useRef(onActiveNodeChange);
  onActiveNodeChangeRef.current = onActiveNodeChange;
  const simulationStartedRef = useRef(false);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clear highlight strictly on component unmount
  useEffect(() => {
    return () => {
      onActiveNodeChangeRef.current?.(null);
    };
  }, []);

  // Initial trigger
  const startSimulation = async () => {
    setSimulating(true);
    setMessages([]);
    setExecutionTrace([]);
    setSimulationState(null);
    setPendingDelay(null);
    onActiveNodeChange?.(null);

    try {
      const res = await fetch('/api/flows/conversation-flows/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          senderPhone: '919876543210',
          userInput: 'Hi',
          flowOverride: {
            nodes: currentNodes,
            transitions: currentTransitions
          },
          simulationState: null
        })
      });

      const data = await res.json();
      if (data.success && data.result) {
        const botReply = data.result.replyText;
        const interactive = data.result.replyInteractive;

        setPendingDelay(data.result.pendingDelay || null);

        setMessages([
          { sender: 'user', text: 'Hi', timestamp: 'Just now' },
          {
            sender: 'bot',
            text: botReply,
            interactive,
            timestamp: 'Just now'
          }
        ]);

        setSimulationState({
          currentNodeId: data.result.currentNodeId,
          collectedData: data.result.collectedData,
          nodes: currentNodes,
          transitions: currentTransitions
        });

        if (data.result.currentNodeId) {
          onActiveNodeChange?.(data.result.currentNodeId);
        }

        setExecutionTrace(data.result.executionLogs || []);
      }
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setSimulating(false);
    }
  };

  useEffect(() => {
    if (currentNodes.length > 0 && messages.length === 0 && !simulationStartedRef.current) {
      simulationStartedRef.current = true;
      startSimulation();
    }
  }, [currentNodes]);

  const sendSimulatedReply = async (text, payload = null) => {
    if (!text && !payload) return;
    const userMsg = text || payload?.title || 'Selected option';

    setMessages(prev => [
      ...prev,
      { sender: 'user', text: userMsg, timestamp: 'Just now' }
    ]);
    setInputText('');
    setSimulating(true);

    try {
      const res = await fetch('/api/flows/conversation-flows/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          senderPhone: '919876543210',
          userInput: userMsg,
          userPayload: payload,
          flowOverride: {
            nodes: currentNodes,
            transitions: currentTransitions
          },
          simulationState
        })
      });

      const data = await res.json();
      if (data.success && data.result) {
        const botReply = data.result.replyText;
        const interactive = data.result.replyInteractive;

        setPendingDelay(data.result.pendingDelay || null);

        if (botReply) {
          setMessages(prev => [
            ...prev,
            {
              sender: 'bot',
              text: botReply,
              interactive,
              timestamp: 'Just now'
            }
          ]);
        }

        setSimulationState({
          currentNodeId: data.result.currentNodeId,
          collectedData: data.result.collectedData,
          nodes: currentNodes,
          transitions: currentTransitions
        });

        if (data.result.currentNodeId) {
          onActiveNodeChange?.(data.result.currentNodeId);
        }

        setExecutionTrace(prev => [
          ...prev,
          `--- Turn: "${userMsg}" ---`,
          ...(data.result.executionLogs || [])
        ]);
      }
    } catch (err) {
      console.error('Simulation turn error:', err);
    } finally {
      setSimulating(false);
    }
  };

  const fastForwardDelay = async () => {
    if (!pendingDelay) return;
    setSimulating(true);

    try {
      const res = await fetch('/api/flows/conversation-flows/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          senderPhone: '919876543210',
          fastForward: true,
          flowOverride: {
            nodes: currentNodes,
            transitions: currentTransitions
          },
          simulationState
        })
      });

      const data = await res.json();
      if (data.success && data.result) {
        const botReply = data.result.replyText;
        const interactive = data.result.replyInteractive;

        setPendingDelay(data.result.pendingDelay || null);

        if (botReply) {
          setMessages(prev => [
            ...prev,
            {
              sender: 'bot',
              text: botReply,
              interactive,
              timestamp: 'Just now (Fast-Forwarded)'
            }
          ]);
        }

        setSimulationState({
          currentNodeId: data.result.currentNodeId,
          collectedData: data.result.collectedData,
          nodes: currentNodes,
          transitions: currentTransitions
        });

        if (data.result.currentNodeId) {
          onActiveNodeChange?.(data.result.currentNodeId);
        }

        setExecutionTrace(prev => [
          ...prev,
          `⏩ Fast-Forwarded Delay (${pendingDelay.amount} ${pendingDelay.unit?.toLowerCase()})`,
          ...(data.result.executionLogs || [])
        ]);
      }
    } catch (err) {
      console.error('Fast-forward error:', err);
    } finally {
      setSimulating(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendSimulatedReply(inputText);
    }
  };

  return (
    <div style={{
      width: '380px',
      background: '#FFFFFF',
      borderLeft: '1px solid #E5E5E8',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxShadow: '-2px 0 12px rgba(0,0,0,0.04)'
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid #E5E5E8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#FAFAFB'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: '#E8F5E9',
            color: '#2F5219',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Smartphone size={16} />
          </div>
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1C1C1E' }}>
              Interactive Simulator
            </div>
            <div style={{ fontSize: '0.72rem', color: '#2F5219', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShieldCheck size={12} /> Mock Sandbox (Zero API Cost)
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={startSimulation}
          disabled={simulating}
          className="btn btn-outline"
          title="Restart Simulation"
          style={{ padding: '5px 8px', fontSize: '0.75rem', gap: '4px' }}
        >
          <RotateCcw size={13} className={simulating ? 'spin' : ''} />
          <span>Reset</span>
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #E5E5E8',
        background: '#FFFFFF',
        padding: '0 12px'
      }}>
        {[
          { id: 'chat', label: 'Chat Preview' },
          { id: 'variables', label: `Variables (${Object.keys(simulationState?.collectedData || {}).length})` },
          { id: 'trace', label: 'Trace Logs' }
        ].map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '9px 12px',
              fontSize: '0.78rem',
              fontWeight: activeTab === t.id ? 700 : 500,
              color: activeTab === t.id ? '#2F5219' : '#67676B',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === t.id ? '2px solid #2F5219' : '2px solid transparent',
              cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body Area */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'chat' && (
          <div style={{
            flex: 1,
            background: '#ECE5DD',
            backgroundImage: 'radial-gradient(#D4C5B9 1px, transparent 1px)',
            backgroundSize: '16px 16px',
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            {/* Encryption & Safety Banner */}
            <div style={{
              background: 'rgba(255,255,255,0.85)',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.7rem',
              color: '#54656F',
              textAlign: 'center',
              lineHeight: '1.3'
            }}>
              🔒 Mock Sandbox Mode. Verified in-memory execution. No outbound Meta API calls triggered.
            </div>

            {/* Chat Bubbles */}
            {messages.map((m, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%'
                }}
              >
                <div style={{
                  background: m.sender === 'user' ? '#D9FDD3' : '#FFFFFF',
                  padding: '8px 12px',
                  borderRadius: m.sender === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  fontSize: '0.82rem',
                  lineHeight: '1.4',
                  color: '#111B21',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {/* Photo / Media Attachment preview in WhatsApp bubble */}
                  {(m.interactive?.mediaUrl || m.mediaUrl) && (
                    <div style={{ marginBottom: '8px', borderRadius: '6px', overflow: 'hidden' }}>
                      <img
                        src={m.interactive?.mediaUrl || m.mediaUrl}
                        alt="Message attachment"
                        style={{ width: '100%', maxHeight: '160px', objectFit: 'cover', display: 'block' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </div>
                  )}

                  {m.text}

                  {/* Interactive Buttons */}
                  {m.interactive?.options && (
                    <div style={{
                      marginTop: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      {m.interactive.options.map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => sendSimulatedReply(opt.title, opt)}
                          disabled={simulating}
                          style={{
                            background: '#FFFFFF',
                            border: '1px solid #2F5219',
                            color: '#2F5219',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          {opt.title}
                        </button>
                      ))}
                    </div>
                  )}

                  <div style={{
                    fontSize: '0.66rem',
                    color: '#667781',
                    textAlign: 'right',
                    marginTop: '4px'
                  }}>
                    {m.timestamp}
                  </div>
                </div>
              </div>
            ))}
            {/* Pending Delay Fast-Forward Pill */}
            {pendingDelay && (
              <div style={{
                background: '#FEF3C7',
                border: '1px solid #F59E0B',
                borderRadius: '10px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                boxShadow: '0 2px 6px rgba(245,158,11,0.15)',
                margin: '6px 0'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={16} color="#B45309" />
                  <div>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#92400E' }}>
                      Timer Paused ({pendingDelay.amount} {pendingDelay.unit?.toLowerCase()})
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#B45309' }}>
                      Simulated delay active
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fastForwardDelay}
                  disabled={simulating}
                  style={{
                    background: '#D97706',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap'
                  }}
                  title="Fast-forward delay to next step"
                >
                  Fast-Forward ⏩
                </button>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        )}

        {activeTab === 'variables' && (
          <div style={{ padding: '16px', overflowY: 'auto' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '10px', color: '#1C1C1E' }}>
              Live Session Variables
            </div>
            {Object.keys(simulationState?.collectedData || {}).length === 0 ? (
              <div style={{ color: '#8E8E93', fontSize: '0.78rem' }}>
                No variables captured yet. Proceed through conversation steps.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(simulationState?.collectedData || {}).map(([k, v]) => (
                  <div key={k} style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: '#F9F9FB',
                    border: '1px solid #E5E5E8'
                  }}>
                    <div style={{ fontSize: '0.72rem', color: '#8E8E93', fontFamily: 'monospace' }}>
                      {k}
                    </div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#2F5219', marginTop: '2px' }}>
                      {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'trace' && (
          <div style={{ padding: '12px', overflowY: 'auto', background: '#1C1C1E', flex: 1 }}>
            <div style={{ color: '#34D399', fontSize: '0.74rem', fontFamily: 'monospace', lineHeight: '1.5' }}>
              {executionTrace.map((log, i) => (
                <div key={i} style={{ marginBottom: '4px' }}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input Bar */}
      {activeTab === 'chat' && (
        <div style={{
          padding: '10px 14px',
          background: '#F0F2F5',
          borderTop: '1px solid #E5E5E8',
          display: 'flex',
          gap: '8px',
          alignItems: 'center'
        }}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={simulating}
            placeholder="Reply as customer..."
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '20px',
              border: '1px solid #E5E5E8',
              background: '#FFFFFF',
              fontSize: '0.82rem',
              outline: 'none'
            }}
          />
          <button
            type="button"
            onClick={() => sendSimulatedReply(inputText)}
            disabled={simulating || !inputText.trim()}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              background: '#2F5219',
              color: '#FFFFFF',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: inputText.trim() ? 'pointer' : 'default',
              opacity: inputText.trim() ? 1 : 0.5
            }}
          >
            <Send size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
