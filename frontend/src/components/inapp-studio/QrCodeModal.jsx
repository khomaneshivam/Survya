import React, { useState } from 'react';
import { Modal, Button } from '../ui';
import { Copy, Download, Check, ExternalLink } from 'lucide-react';

export default function QrCodeModal({ isOpen, onClose, qrData }) {
  const [copied, setCopied] = useState(false);

  if (!qrData) return null;

  const handleCopy = () => {
    if (qrData.share_url) {
      navigator.clipboard.writeText(qrData.share_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDownloadSvg = () => {
    if (!qrData.qr_svg) return;
    const blob = new Blob([qrData.qr_svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${qrData.slug || 'experience'}-qr.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="In-App Experience Share & QR"
      subtitle={qrData.name || 'Scan or share direct link to launch experience.'}
      size="sm"
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '12px 0' }}>
        {/* Render SVG cleanly */}
        <div
          style={{
            width: '260px',
            height: '260px',
            padding: '12px',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            border: '1px solid var(--border-color)',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          dangerouslySetInnerHTML={{ __html: qrData.qr_svg || '' }}
        />

        <div style={{
          width: '100%',
          backgroundColor: 'var(--bg-secondary, #f8fafc)',
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '13px',
          fontFamily: 'monospace',
          color: 'var(--text-secondary)',
          wordBreak: 'break-all',
          marginBottom: '16px',
          border: '1px solid var(--border-color)'
        }}>
          {qrData.share_url}
        </div>

        <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'center' }}>
          <Button variant="secondary" onClick={handleCopy}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied Link!' : 'Copy URL'}
          </Button>

          <Button variant="secondary" onClick={handleDownloadSvg}>
            <Download size={16} />
            Download SVG
          </Button>

          <a
            href={qrData.share_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}
          >
            <Button variant="primary">
              <ExternalLink size={16} />
              Open Preview
            </Button>
          </a>
        </div>
      </div>
    </Modal>
  );
}

