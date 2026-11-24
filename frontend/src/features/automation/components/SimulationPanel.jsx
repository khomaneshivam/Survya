import React, { useState, useRef, useEffect } from 'react';
import { automationApi } from '../api/automationApi';
import { 
  Send, 
  RotateCcw, 
  ShieldCheck, 
  Bot, 
  User, 
  CheckCheck, 
  Sparkles,
  Smartphone,
  ChevronRight
} from 'lucide-react';

export function SimulationPanel({ 
  flowId, 
  template,
  templateKey: propTemplateKey, 
  configValues = {}, 
  onResetContext,
  onTestInteraction 
}) {
  const templateKey = propTemplateKey || template?.template_key || template?.id;
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'bot',
      text: '👋 Sandbox Preview ready. Type a message or trigger keyword to simulate conversation.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionContext, setSessionContext] = useState(configValues);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async (messageText) => {
    const textToSend = (messageText || input).trim();
    if (!textToSend || loading) return;

    const userMsg = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // STRICT SAFETY CONSTRAINT: Pass isSimulation: true and test sandbox phone
      const payload = {
        flowId,
        templateKey,
        userMessage: textToSend,
        senderPhone: '+919999900000',
        variableContext: {
          ...sessionContext,
          config: configValues
        },
        isSimulation: true
      };

      const res = await automationApi.simulateTurn(payload);

      if (res && res.success) {
        // Collect reply messages
        const botReplies = res.replies || res.outboundMessages || [];
        if (botReplies.length > 0) {
          const newReplies = botReplies.map((r, idx) => ({
            id: `bot_${Date.now()}_${idx}`,
            sender: 'bot',
            text: typeof r === 'string' ? r : (r.text || r.body || JSON.stringify(r)),
            buttons: r.buttons || r.quick_replies || null,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }));
          setMessages((prev) => [...prev, ...newReplies]);
        } else if (res.message) {
          setMessages((prev) => [
            ...prev,
            {
              id: `bot_${Date.now()}`,
              sender: 'bot',
              text: res.message,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `bot_${Date.now()}`,
              sender: 'bot',
              text: '✓ Flow executed node step. (No outward message dispatched in this turn)',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
        }

        if (res.updatedContext) {
          setSessionContext(res.updatedContext);
        }
        if (onTestInteraction) {
          onTestInteraction();
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            sender: 'system',
            text: `⚠️ Simulation Notice: ${res?.error || 'No matching flow trigger or handler found for this input.'}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'system',
          text: `⚠️ Error in simulation turn: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([
      {
        id: 'reset',
        sender: 'bot',
        text: '🔄 Session reset. Sandbox context refreshed with latest configuration values.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setSessionContext(configValues);
    if (onResetContext) onResetContext();
  };

  const businessName = configValues.business_name || configValues.property_name || 'SARVYA Assistant';

  return (
    <div className="flex flex-col h-[520px] max-w-sm w-full mx-auto bg-slate-900 rounded-3xl p-2.5 shadow-2xl border-4 border-slate-800">
      {/* Smartphone Top Notch & WhatsApp Header */}
      <div className="bg-[#075E54] text-white px-3.5 py-3 rounded-t-2xl flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/20 border border-white/30 flex items-center justify-center font-bold text-xs text-white">
            {businessName.charAt(0)}
          </div>
          <div className="leading-tight">
            <h4 className="font-semibold text-xs truncate max-w-[150px]">{businessName}</h4>
            <span className="text-[10px] text-emerald-200 flex items-center gap-1 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Sandbox Verified
            </span>
          </div>
        </div>

        <button
          onClick={handleReset}
          title="Reset Simulation"
          className="p-1.5 hover:bg-white/10 rounded-full text-emerald-100 hover:text-white transition-colors"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* WhatsApp Chat Bubbles Container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-[#EFEAE2] text-[12px]"
        style={{
          backgroundImage: 'radial-gradient(#d1d5db 0.75px, transparent 0.75px)',
          backgroundSize: '12px 12px'
        }}
      >
        <div className="text-center my-1">
          <span className="bg-amber-100 text-amber-900 border border-amber-200 text-[10px] px-2.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1">
            <ShieldCheck size={11} className="text-amber-700" />
            Zero Live Message Dispatch Policy • In-Memory Sandbox
          </span>
        </div>

        {messages.map((m) => {
          if (m.sender === 'system') {
            return (
              <div key={m.id} className="text-center my-1">
                <span className="bg-white/90 text-slate-600 border border-slate-200 text-[10px] px-2 py-0.5 rounded shadow-sm inline-block max-w-[90%]">
                  {m.text}
                </span>
              </div>
            );
          }

          const isUser = m.sender === 'user';

          return (
            <div
              key={m.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-2.5 py-1.5 shadow-sm relative ${
                  isUser
                    ? 'bg-[#E7FFDB] text-slate-800 rounded-tr-none'
                    : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed text-[12px]">{m.text}</p>
                <div className="flex items-center justify-end gap-1 mt-1 text-[9px] text-slate-400">
                  <span>{m.timestamp}</span>
                  {isUser && <CheckCheck size={12} className="text-blue-500" />}
                </div>
              </div>

              {/* Interactive buttons */}
              {m.buttons && m.buttons.length > 0 && (
                <div className="mt-1 flex flex-col gap-1 w-[85%]">
                  {m.buttons.map((btn, bIdx) => (
                    <button
                      key={bIdx}
                      disabled={loading}
                      onClick={() => handleSend(btn.title || btn.text || btn)}
                      className="text-left text-xs bg-white/95 hover:bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-md font-medium shadow-sm transition-colors flex items-center justify-between"
                    >
                      <span>{btn.title || btn.text || btn}</span>
                      <ChevronRight size={13} className="text-emerald-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center gap-1.5 text-slate-400 text-xs bg-white px-3 py-1.5 rounded-lg w-fit shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"></span>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]"></span>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]"></span>
            <span className="text-[11px] font-sans ml-1 text-slate-500">Processing turn...</span>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="bg-slate-100 p-2 rounded-b-2xl flex items-center gap-1.5 border-t border-slate-200">
        <input
          type="text"
          value={input}
          disabled={loading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          placeholder="Test reply (e.g. Hi, 1, Book)..."
          className="flex-1 bg-white border border-slate-300 text-xs px-3 py-1.5 rounded-full focus:outline-none focus:border-[#075E54] text-slate-800"
        />
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || loading}
          className="w-8 h-8 rounded-full bg-[#075E54] hover:bg-[#128C7E] disabled:opacity-50 text-white flex items-center justify-center transition-colors flex-shrink-0"
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}

