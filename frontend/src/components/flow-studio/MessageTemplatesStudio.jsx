import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  Search,
  Copy,
  Check,
  Tag,
  Save,
  X,
  RotateCcw
} from 'lucide-react';

export default function MessageTemplatesStudio({ token }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copiedVar, setCopiedVar] = useState(null);

  const fetchTemplates = () => {
    setLoading(true);
    fetch('/api/flows/message-templates', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTemplates(data.templates || []);
        }
      })
      .catch(err => console.error('Failed to load message templates:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTemplates();
  }, [token]);

  const handleCopyVar = (v) => {
    navigator.clipboard.writeText(`{{${v}}}`);
    setCopiedVar(v);
    setTimeout(() => setCopiedVar(null), 1500);
  };

  const handleSave = async () => {
    if (!editingTemplate.code || !editingTemplate.title || !editingTemplate.content) {
      alert('Code, Title, and Content are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/flows/message-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editingTemplate)
      });
      const data = await res.json();
      if (data.success) {
        setEditingTemplate(null);
        fetchTemplates();
      } else {
        alert(data.error || 'Failed to save template');
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this message template?')) return;
    try {
      const res = await fetch(`/api/flows/message-templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        fetchTemplates();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = templates.filter(t => {
    const matchCategory = selectedCategory === 'ALL' || t.category === selectedCategory;
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.code.toLowerCase().includes(search.toLowerCase()) || t.content.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Action Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{
            position: 'relative',
            width: '260px'
          }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#8E8E93' }} />
            <input
              type="text"
              className="form-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              style={{ paddingLeft: '32px', fontSize: '0.82rem' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {['ALL', 'WELCOME', 'QUOTE', 'ENQUIRY', 'HANDOFF', 'PROMOTION'].map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.76rem',
                  fontWeight: selectedCategory === cat ? 700 : 500,
                  border: selectedCategory === cat ? '1px solid #2F5219' : '1px solid #E5E5E8',
                  background: selectedCategory === cat ? '#E8F5E9' : '#FFFFFF',
                  color: selectedCategory === cat ? '#2F5219' : '#48484A',
                  cursor: 'pointer'
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setEditingTemplate({
            code: `TPL_${Date.now().toString(36).toUpperCase()}`,
            title: '',
            category: 'CONVERSATION',
            content: '',
            variables: ['property.name', 'guest_name'],
            buttons: []
          })}
          className="btn btn-primary"
          style={{
            background: '#2F5219',
            borderColor: '#2F5219',
            fontSize: '0.82rem',
            padding: '7px 14px',
            gap: '6px'
          }}
        >
          <Plus size={15} />
          <span>New Message Template</span>
        </button>
      </div>

      {/* Grid of Templates */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#8E8E93' }}>
          <RotateCcw size={22} className="spin" style={{ margin: '0 auto 8px' }} />
          <div>Loading message templates...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          background: '#FAFAFB',
          borderRadius: '12px',
          border: '1px dashed #D1D1D6'
        }}>
          <MessageSquare size={32} style={{ color: '#8E8E93', margin: '0 auto 10px' }} />
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1C1C1E' }}>No message templates found</div>
          <div style={{ fontSize: '0.78rem', color: '#67676B', marginTop: '4px' }}>
            Create reusable messages with dynamic variable slots to use across all conversation nodes.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '16px'
        }}>
          {filtered.map(tpl => (
            <div
              key={tpl.id}
              style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E5E5E8',
                padding: '16px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: '#F2F2F7',
                    color: '#2F5219'
                  }}>
                    {tpl.category}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#8E8E93', fontFamily: 'monospace' }}>
                    {tpl.code}
                  </span>
                </div>
                <h4 style={{ fontSize: '0.92rem', fontWeight: 700, margin: '0 0 8px 0', color: '#1C1C1E' }}>
                  {tpl.title}
                </h4>
                <div style={{
                  fontSize: '0.8rem',
                  color: '#48484A',
                  background: '#F9F9FB',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #EFEFEF',
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.45',
                  maxHeight: '120px',
                  overflowY: 'auto'
                }}>
                  {tpl.content}
                </div>

                {/* Variables Chips */}
                {tpl.variables?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                    {tpl.variables.map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleCopyVar(v)}
                        title="Click to copy variable syntax"
                        style={{
                          fontSize: '0.7rem',
                          background: '#EAEAEF',
                          color: '#2F5219',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {copiedVar === v ? <Check size={11} color="#2F5219" /> : <Copy size={11} />}
                        <span>{`{{${v}}}`}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{
                marginTop: '14px',
                paddingTop: '10px',
                borderTop: '1px solid #F2F2F7',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px'
              }}>
                <button
                  type="button"
                  onClick={() => setEditingTemplate(tpl)}
                  className="btn btn-outline"
                  style={{ padding: '4px 10px', fontSize: '0.75rem', gap: '4px' }}
                >
                  <Edit2 size={13} /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(tpl.id)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#DC2626',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    fontSize: '0.75rem'
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit/Create Modal */}
      {editingTemplate && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            width: '560px',
            maxWidth: '100%',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
                {editingTemplate.id ? 'Edit Message Template' : 'New Message Template'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#8E8E93' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Unique Code</label>
                <input
                  type="text"
                  className="form-input"
                  value={editingTemplate.code || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. WELCOME_VILLA"
                  disabled={Boolean(editingTemplate.id)}
                />
              </div>
              <div>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Category</label>
                <select
                  className="form-input"
                  value={editingTemplate.category || 'CONVERSATION'}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, category: e.target.value })}
                >
                  <option value="WELCOME">WELCOME</option>
                  <option value="QUOTE">QUOTE</option>
                  <option value="ENQUIRY">ENQUIRY</option>
                  <option value="HANDOFF">HANDOFF</option>
                  <option value="PROMOTION">PROMOTION</option>
                  <option value="CONVERSATION">CONVERSATION</option>
                </select>
              </div>
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Template Title</label>
              <input
                type="text"
                className="form-input"
                value={editingTemplate.title || ''}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, title: e.target.value })}
                placeholder="e.g. Beach Resort Welcome Greeting"
              />
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Message Body</label>
              <textarea
                className="form-input"
                rows={5}
                value={editingTemplate.content || ''}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, content: e.target.value })}
                placeholder="Use {{variables}} for dynamic interpolation..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="btn btn-outline"
                style={{ padding: '8px 16px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn btn-primary"
                style={{
                  padding: '8px 18px',
                  background: '#2F5219',
                  borderColor: '#2F5219',
                  fontWeight: 600,
                  gap: '6px'
                }}
              >
                {saving ? <RotateCcw size={15} className="spin" /> : <Save size={15} />}
                <span>Save Template</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
