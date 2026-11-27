import React, { useState, useEffect, useRef } from 'react';
import { Send, Image as ImageIcon, Sparkles, User, Bot, Loader2 } from 'lucide-react';

export default function LiveChatScreen({
  experience = {},
  sessionToken,
  slug,
  onAction
}) {
  const primaryColor = experience.theme?.primaryColor || '#2F5219';

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const messagesEndRef = useRef(null);

  // 1. Fetch chat history
  useEffect(() => {
    async function fetchMessages() {
      if (!sessionToken || !slug) return;
      try {
        const res = await fetch(`/api/v1/public/x/${slug}/messages?sessionToken=${sessionToken}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setMessages(data.data);
        }
      } catch (err) {
        console.warn('[LiveChatScreen] History fetch warning:', err.message);
      } finally {
        setLoadingHistory(false);
      }
    }
    fetchMessages();
  }, [slug, sessionToken]);

  // 2. Real-time SSE Stream listener
  useEffect(() => {
    if (!sessionToken || !slug) return;

    let eventSource = null;
    try {
      eventSource = new EventSource(`/api/v1/public/x/${slug}/stream?sessionToken=${sessionToken}`);
      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'chat_message' && parsed.data) {
            setMessages((prev) => {
              // Avoid duplicates
              if (prev.some((m) => m.id === parsed.data.id || (m.wa_message_id && m.wa_message_id === parsed.data.wa_message_id))) {
                return prev;
              }
              return [...prev, parsed.data];
            });
          }
        } catch (_) {}
      };
    } catch (_) {}

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [slug, sessionToken]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || sending) return;

    setSending(true);
    setInputText('');

    // Optimistic message append
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      message_body: text,
      source: 'INAPP_CHAT',
      received_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await fetch(`/api/v1/public/x/${slug}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken,
          message: text
        })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? data.data : m))
        );
      }
    } catch (err) {
      console.error('[LiveChatScreen] Send error:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: primaryColor, fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase' }}>
          <Sparkles size={13} />
          <span>Live Digital Concierge</span>
        </div>
        <h2 style={{ margin: '2px 0 0 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
          Chat with {experience.name || 'Concierge'}
        </h2>
        <span style={{ fontSize: '12px', color: '#64748b' }}>
          Typical reply time: within 2 minutes
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 2px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          minHeight: '260px'
        }}
      >
        {/* Welcome Greeting from Resort */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: primaryColor,
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <Bot size={16} />
          </div>
          <div
            style={{
              maxWidth: '82%',
              padding: '10px 14px',
              borderRadius: '14px',
              borderTopLeftRadius: '4px',
              backgroundColor: '#f1f5f9',
              color: '#1e293b',
              fontSize: '13px',
              lineHeight: 1.45
            }}
          >
            Namaste! I am your personal digital concierge for {experience.name}. How can we make your visit extraordinary? Feel free to ask about custom rates, villa tours, or local seaside recommendations!
          </div>
        </div>

        {loadingHistory && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px' }}>
            <Loader2 size={18} className="animate-spin text-slate-400" />
          </div>
        )}

        {/* Message Thread */}
        {messages.map((msg) => {
          const isVisitor = msg.source === 'INAPP_CHAT' || !msg.reply_text;
          const body = msg.message_body || msg.reply_text || '';

          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: isVisitor ? 'flex-end' : 'flex-start',
                gap: '8px',
                alignItems: 'flex-end'
              }}
            >
              {!isVisitor && (
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <User size={14} />
                </div>
              )}

              <div
                style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: '14px',
                  borderBottomRightRadius: isVisitor ? '4px' : '14px',
                  borderBottomLeftRadius: isVisitor ? '14px' : '4px',
                  backgroundColor: isVisitor ? primaryColor : '#f1f5f9',
                  color: isVisitor ? '#ffffff' : '#1e293b',
                  fontSize: '13.5px',
                  lineHeight: 1.45,
                  wordBreak: 'break-word',
                  boxShadow: isVisitor ? `0 2px 8px ${primaryColor}30` : 'none'
                }}
              >
                {body}

                {msg.media_url && (
                  <div style={{ marginTop: '8px', borderRadius: '8px', overflow: 'hidden' }}>
                    <img src={msg.media_url} alt="Attachment" style={{ width: '100%', maxHeight: '180px', objectFit: 'cover' }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form
        onSubmit={handleSendMessage}
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          borderTop: '1px solid #e2e8f0',
          paddingTop: '10px'
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type your message..."
          style={{
            flex: 1,
            height: '42px',
            padding: '0 14px',
            borderRadius: '20px',
            border: '1px solid #cbd5e1',
            fontSize: '13.5px',
            outline: 'none',
            backgroundColor: '#ffffff'
          }}
        />

        <button
          type="submit"
          disabled={!inputText.trim() || sending}
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: inputText.trim() ? primaryColor : '#cbd5e1',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: inputText.trim() && !sending ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.15s ease'
          }}
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );
}

