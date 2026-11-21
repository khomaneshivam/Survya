import React from 'react';
import { Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function HeroWelcomeScreen({
  screen = {},
  experience = {},
  onAction
}) {
  const primaryColor = experience.theme?.primaryColor || '#2F5219';
  const config = screen.config || {};

  const coverUrl = config.coverUrl || config.imageUrl || experience.theme?.bannerUrl || null;
  const highlights = Array.isArray(config.highlights) ? config.highlights : [
    'Instant Availability Check',
    'Best Rate Guarantee',
    'Personalized Concierge Assistance'
  ];

  const ctaText = config.ctaText || config.buttonText || 'Explore & Book 🏖️';
  const targetScreenKey = screen.navigationRules?.defaultNext || config.targetScreenKey || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '20px' }}>
      {/* Cover Image or Hero Banner */}
      {coverUrl ? (
        <div
          style={{
            width: '100%',
            height: '210px',
            borderRadius: '16px',
            overflow: 'hidden',
            position: 'relative',
            boxShadow: '0 4px 14px rgba(0,0,0,0.06)'
          }}
        >
          <img
            src={coverUrl}
            alt={screen.title || experience.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '60px',
              background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent)'
            }}
          />
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            padding: '32px 20px',
            borderRadius: '16px',
            background: `linear-gradient(135deg, ${primaryColor}14, ${primaryColor}08)`,
            border: `1px solid ${primaryColor}25`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: primaryColor,
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Sparkles size={28} />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', color: primaryColor, textTransform: 'uppercase' }}>
            {experience.domainType || 'WELCOME'}
          </span>
        </div>
      )}

      {/* Main Title & Subtitle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h1
          style={{
            fontSize: '22px',
            fontWeight: 800,
            lineHeight: 1.25,
            margin: 0,
            color: 'inherit'
          }}
        >
          {screen.title || `Welcome to ${experience.name}`}
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: '#64748b',
            lineHeight: 1.5,
            margin: 0
          }}
        >
          {screen.subtitle || 'Experience seamless browsing, real-time rates, and instant reservations directly from your browser.'}
        </p>
      </div>

      {/* Key Highlights */}
      {highlights.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            padding: '14px',
            borderRadius: '12px',
            backgroundColor: 'rgba(0,0,0,0.02)',
            border: '1px solid rgba(0,0,0,0.05)'
          }}
        >
          {highlights.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
              <CheckCircle2 size={16} color={primaryColor} style={{ flexShrink: 0 }} />
              <span style={{ fontWeight: 500, color: '#334155' }}>{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* CTA Section */}
      <div style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button
          type="button"
          onClick={() => onAction && onAction('NEXT', { targetScreenKey })}
          style={{
            width: '100%',
            height: '48px',
            borderRadius: '12px',
            border: 'none',
            backgroundColor: primaryColor,
            color: '#FFFFFF',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: `0 4px 14px ${primaryColor}40`,
            transition: 'transform 0.15s ease'
          }}
        >
          <span>{ctaText}</span>
          <ArrowRight size={18} />
        </button>

        {config.secondaryCtaText && (
          <button
            type="button"
            onClick={() => onAction && onAction('JUMP', { targetScreenKey: config.secondaryTargetScreenKey })}
            style={{
              width: '100%',
              height: '42px',
              borderRadius: '12px',
              border: '1px solid rgba(0,0,0,0.12)',
              backgroundColor: 'transparent',
              color: '#475569',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {config.secondaryCtaText}
          </button>
        )}
      </div>
    </div>
  );
}

