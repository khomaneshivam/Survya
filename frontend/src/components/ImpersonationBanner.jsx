import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ArrowLeftCircle, ShieldAlert } from 'lucide-react';
import { Button } from './ui';

export default function ImpersonationBanner() {
  const { isImpersonating, user, revertImpersonation } = useAuth();

  if (!isImpersonating) return null;

  return (
    <div
      role="status"
      style={{
        background: '#171719',
        color: '#FFFFFF',
        padding: '8px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        fontSize: '12.5px',
        borderBottom: '1px solid #2C2C30',
        position: 'sticky',
        top: 0,
        zIndex: 60
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ShieldAlert size={15} color="#FDB1AF" />
        <span>
          <strong>Workspace Inspection Active:</strong> Viewing SARVYA as{' '}
          <span style={{ fontWeight: 600, textDecoration: 'underline' }}>{user?.name}</span> ({user?.email})
        </span>
      </div>

      <Button
        size="sm"
        variant="secondary"
        onClick={revertImpersonation}
        style={{ background: '#FFFFFF', color: '#171719' }}
      >
        <ArrowLeftCircle size={14} />
        Exit Inspection
      </Button>
    </div>
  );
}
