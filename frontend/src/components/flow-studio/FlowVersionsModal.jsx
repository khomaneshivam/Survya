import React, { useState, useEffect } from 'react';
import {
  X,
  History,
  RotateCcw,
  CheckCircle2,
  Calendar,
  UserCheck,
  AlertCircle
} from 'lucide-react';

export default function FlowVersionsModal({
  isOpen,
  onClose,
  flow,
  token,
  onRollback
}) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  useEffect(() => {
    if (!isOpen || !flow?.id) return;
    setLoading(true);
    fetch(`/api/flows/conversation-flows/${flow.id}/versions`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setVersions(data.versions || []);
        }
      })
      .catch(err => console.error('Failed to load versions:', err))
      .finally(() => setLoading(false));
  }, [isOpen, flow?.id, token]);

  if (!isOpen) return null;

  const handleRollback = async (verNumber) => {
    if (!window.confirm(`Are you sure you want to rollback to Version ${verNumber}? Current draft will be replaced with this version's snapshot.`)) {
      return;
    }
    setRollingBack(true);
    try {
      await onRollback(verNumber);
      onClose();
    } finally {
      setRollingBack(false);
    }
  };

  return (
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
        width: '680px',
        maxWidth: '100%',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #E5E5E8',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#FAFAFB'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: '#F2F2F7',
              color: '#1C1C1E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <History size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: '#1C1C1E' }}>
                Version History: {flow?.name}
              </h3>
              <div style={{ fontSize: '0.78rem', color: '#67676B' }}>
                Immutable releases, audit trail & 1-click rollback
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#8E8E93', padding: '6px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8E8E93' }}>
              <RotateCcw size={24} className="spin" style={{ margin: '0 auto 10px' }} />
              <div>Loading version history...</div>
            </div>
          ) : versions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8E8E93' }}>
              No version snapshots recorded yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {versions.map(ver => {
                const isPublished = ver.status === 'PUBLISHED';
                return (
                  <div
                    key={ver.id}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '10px',
                      border: isPublished ? '1px solid #2F5219' : '1px solid #E5E5E8',
                      background: isPublished ? '#F9FDF7' : '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          color: '#1C1C1E'
                        }}>
                          Version {ver.version_number}
                        </span>
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: isPublished ? '#E8F5E9' : '#F2F2F7',
                          color: isPublished ? '#2F5219' : '#67676B'
                        }}>
                          {ver.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#48484A', marginBottom: '4px' }}>
                        {ver.changelog || 'Draft updates saved'}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '0.72rem', color: '#8E8E93' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Calendar size={12} /> {ver.published_at || ver.created_at}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <UserCheck size={12} /> {ver.published_by || 'Admin'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRollback(ver.version_number)}
                      disabled={rollingBack}
                      className="btn btn-outline"
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.78rem',
                        gap: '6px'
                      }}
                    >
                      <RotateCcw size={13} />
                      <span>Rollback</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
