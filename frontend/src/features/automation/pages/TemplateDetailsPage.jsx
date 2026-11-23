import React from 'react';
import { 
  ArrowLeft, 
  CheckCircle2, 
  Sparkles, 
  Layers, 
  Sliders, 
  ShieldCheck, 
  Bot, 
  Phone, 
  Clock, 
  Building2,
  ArrowRight
} from 'lucide-react';
import { Button, Badge } from '../../../components/ui/Primitives';

export function TemplateDetailsPage({ template, onStartSetup, onBack }) {
  if (!template) {
    return (
      <div className="p-6 text-center text-xs text-slate-500">
        Template not found.
      </div>
    );
  }

  const {
    template_key,
    title,
    name,
    description,
    industry,
    category,
    current_version,
    active_version_number,
    capabilities_json,
    config_schema_json,
    required_bindings_json
  } = template;

  const displayTitle = title || name || template_key || 'Untitled Template';
  const displayVersion = current_version || active_version_number || '1.0.0';

  const configSchema = typeof config_schema_json === 'string'
    ? (() => { try { return JSON.parse(config_schema_json); } catch { return {}; } })()
    : (config_schema_json || {});

  const requiredBindings = typeof required_bindings_json === 'string'
    ? (() => { try { return JSON.parse(required_bindings_json); } catch { return []; } })()
    : (required_bindings_json || []);

  const capabilities = Array.isArray(capabilities_json)
    ? capabilities_json
    : (typeof capabilities_json === 'string'
        ? (() => { try { return JSON.parse(capabilities_json); } catch { return []; } })()
        : [
            'Automated conversation routing & multi-turn memory',
            'Catalog and pricing lookup integration',
            'Interactive WhatsApp quick buttons & interactive lists'
          ]);

  const schemaProps = configSchema.properties || configSchema;
  const configFieldsCount = Object.keys(schemaProps).filter(k => !['type', 'required', 'properties', 'title', 'description'].includes(k) || schemaProps[k]?.type).length;

  return (
    <div style={{ padding: '24px 24px 48px', maxWidth: '1080px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Back button */}
      <div>
        <button
          type="button"
          onClick={onBack}
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#67676B',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: 0
          }}
        >
          <ArrowLeft size={13} />
          <span>Back to Template Library</span>
        </button>
      </div>

      {/* Main Hero Card */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E5E5E8',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '12px',
              background: '#EDF4E6',
              border: '1px solid #C3D1AC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2F5219',
              flexShrink: 0
            }}>
              <Bot size={28} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                <Badge tone="blue" dot>
                  {industry || 'GENERAL'}
                </Badge>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#67676B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  background: '#EEEEF0',
                  padding: '2px 8px',
                  borderRadius: '4px'
                }}>
                  {category || 'Standard'}
                </span>
                <span style={{
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: '#67676B',
                  background: '#F5F5F6',
                  border: '1px solid #E5E5E8',
                  padding: '2px 8px',
                  borderRadius: '4px'
                }}>
                  v{displayVersion}
                </span>
              </div>
              <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#171719', letterSpacing: '-0.015em', margin: '0 0 6px 0' }}>
                {displayTitle}
              </h1>
              <p style={{ fontSize: '12.5px', color: '#67676B', margin: 0, maxWidth: '640px', lineHeight: 1.5 }}>
                {description}
              </p>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => onStartSetup && onStartSetup(template)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 20px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#FFFFFF',
                background: '#2F5219',
                border: '1px solid #2F5219',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(47,82,25,0.2)'
              }}
            >
              <span>Use This Template</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
          marginTop: '20px',
          paddingTop: '20px',
          borderTop: '1px solid #F0F0F2'
        }}>
          <div>
            <span style={{ color: '#96969C', display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
              Configurable Fields
            </span>
            <span style={{ fontWeight: 700, color: '#171719', fontSize: '14px', marginTop: '2px', display: 'block' }}>
              {configFieldsCount} Dynamic Fields
            </span>
          </div>
          <div>
            <span style={{ color: '#96969C', display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
              Required Connections
            </span>
            <span style={{ fontWeight: 700, color: '#171719', fontSize: '14px', marginTop: '2px', display: 'block' }}>
              {requiredBindings.length} Resource Bindings
            </span>
          </div>
          <div>
            <span style={{ color: '#96969C', display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
              Deployment Time
            </span>
            <span style={{ fontWeight: 700, color: '#171719', fontSize: '14px', marginTop: '2px', display: 'block' }}>
              ~3 Minutes
            </span>
          </div>
          <div>
            <span style={{ color: '#96969C', display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
              Safety Level
            </span>
            <span style={{ fontWeight: 700, color: '#2F5219', fontSize: '14px', marginTop: '2px', display: 'block' }}>
              Sandbox Verified
            </span>
          </div>
        </div>
      </div>

      {/* Two Column Details */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '20px'
      }}>
        {/* Left: Included Capabilities */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E5E5E8',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <h3 style={{
            fontSize: '12px',
            fontWeight: 700,
            color: '#171719',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            margin: '0 0 14px 0'
          }}>
            <Sparkles size={14} color="#2F5219" />
            <span>Built-in Workflow Capabilities</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {capabilities.map((cap, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12.5px', color: '#3A3A3E' }}>
                <CheckCircle2 size={14} color="#4C7A2B" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span style={{ lineHeight: 1.4 }}>{cap}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Required Bindings & Resources */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E5E5E8',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <h3 style={{
            fontSize: '12px',
            fontWeight: 700,
            color: '#171719',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            margin: '0 0 14px 0'
          }}>
            <Layers size={14} color="#2876B8" />
            <span>Required Workspace Resources</span>
          </h3>
          {requiredBindings.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#67676B', margin: 0 }}>
              This blueprint runs standalone without external master catalog dependencies.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {requiredBindings.map((b, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: '#F5F5F6',
                  border: '1px solid #E5E5E8',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}>
                  <span style={{ fontWeight: 600, color: '#171719' }}>{b.label || b.key}</span>
                  <span style={{
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    textTransform: 'uppercase',
                    background: '#FFFFFF',
                    border: '1px solid #E5E5E8',
                    color: '#67676B',
                    padding: '2px 8px',
                    borderRadius: '4px'
                  }}>
                    {b.type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
