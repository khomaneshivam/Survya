import React from 'react';
import { Badge, Button } from '../../../components/ui/Primitives';
import { 
  Bot, 
  ArrowRight, 
  CheckCircle2, 
  Layers, 
  Building2, 
  Sparkles, 
  Clock, 
  ShieldCheck, 
  SlidersHorizontal 
} from 'lucide-react';

export function TemplateCard({ template, onSelect, onInspect }) {
  const {
    id,
    template_key,
    title,
    name,
    description,
    industry,
    category,
    current_version,
    active_version_number,
    capabilities_json,
    badge
  } = template;

  const displayTitle = title || name || template_key || 'Untitled Template';
  const displayVersion = current_version || active_version_number || '1.0.0';

  const capabilities = Array.isArray(capabilities_json)
    ? capabilities_json
    : (typeof capabilities_json === 'string'
        ? (() => { try { return JSON.parse(capabilities_json); } catch { return []; } })()
        : [
            'Automated conversation routing & multi-turn memory',
            'Catalog & dynamic pricing lookup integration',
            'WhatsApp-native interactive menus & buttons'
          ]);

  const industryTone = {
    HOSPITALITY: 'blue',
    B2B_SAAS: 'purple',
    B2B: 'purple',
    ECOMMERCE: 'green',
    HEALTHCARE: 'coral',
    SERVICES: 'taupe'
  }[industry] || 'blue';

  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #E5E5E8',
      borderRadius: '12px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      transition: 'all 160ms ease',
      boxSizing: 'border-box'
    }}>
      <div>
        {/* Top Badges */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <Badge tone={industryTone} dot>
              {industry || 'GENERAL'}
            </Badge>
            <span style={{
              fontSize: '11px',
              fontWeight: 500,
              color: '#67676B',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: '#EEEEF0',
              padding: '2px 6px',
              borderRadius: '4px'
            }}>
              {category || 'Standard'}
            </span>
            {badge && (
              <span style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#7D4E1D',
                background: '#FBF4EB',
                border: '1px solid #E8CFAF',
                padding: '1px 6px',
                borderRadius: '4px',
                textTransform: 'uppercase'
              }}>
                {badge}
              </span>
            )}
          </div>
          <span style={{
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#67676B',
            background: '#F5F5F6',
            border: '1px solid #E5E5E8',
            padding: '2px 6px',
            borderRadius: '4px'
          }}>
            v{displayVersion}
          </span>
        </div>

        {/* Title & Description */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: '#EDF4E6',
            border: '1px solid #C3D1AC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#2F5219',
            flexShrink: 0
          }}>
            <Bot size={20} />
          </div>
          <div>
            <h3 style={{
              fontWeight: 600,
              color: '#171719',
              fontSize: '15px',
              lineHeight: 1.3,
              margin: 0
            }}>
              {displayTitle}
            </h3>
            <p style={{
              fontSize: '12px',
              color: '#67676B',
              margin: '4px 0 0 0',
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}>
              {description}
            </p>
          </div>
        </div>

        {/* Feature Highlights */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          margin: '14px 0',
          borderTop: '1px solid #F0F0F2',
          paddingTop: '12px'
        }}>
          {capabilities.slice(0, 3).map((cap, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#3A3A3E' }}>
              <CheckCircle2 size={13} color="#4C7A2B" style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cap}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action Footer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        borderTop: '1px solid #F0F0F2',
        paddingTop: '14px'
      }}>
        <button
          type="button"
          onClick={() => onInspect && onInspect(template)}
          style={{
            flex: 1,
            padding: '7px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#3A3A3E',
            background: '#F5F5F6',
            border: '1px solid #D4D4D9',
            cursor: 'pointer'
          }}
        >
          <span>Preview Details</span>
        </button>

        <button
          type="button"
          onClick={() => onSelect && onSelect(template)}
          style={{
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '7px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#FFFFFF',
            background: '#2F5219',
            border: '1px solid #2F5219',
            cursor: 'pointer'
          }}
        >
          <span>Use Template</span>
          <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
