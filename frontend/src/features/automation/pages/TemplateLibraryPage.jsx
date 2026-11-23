import React from 'react';
import { Search, Sparkles, Layers, SlidersHorizontal, ArrowLeft } from 'lucide-react';
import { TemplateCard } from '../components/TemplateCard';
import { useTemplates } from '../hooks/useTemplates';

export function TemplateLibraryPage({
  onSelectTemplate,
  onInspectTemplate,
  onBackToAutomations
}) {
  const {
    templates,
    loading,
    error,
    industry,
    setIndustry,
    category,
    setCategory,
    search,
    setSearch,
    industries,
    categories
  } = useTemplates();

  const industryLabels = {
    ALL: 'All Industries',
    HOSPITALITY: 'Hospitality & Resorts',
    B2B: 'B2B SaaS & Services',
    ECOMMERCE: 'E-Commerce & Retail',
    HEALTHCARE: 'Healthcare & Clinics',
    SERVICES: 'Professional Services'
  };

  return (
    <div style={{ padding: '24px 24px 48px', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', paddingBottom: '16px', borderBottom: '1px solid #E5E5E8', flexWrap: 'wrap' }}>
        <div>
          {onBackToAutomations && (
            <button
              type="button"
              onClick={onBackToAutomations}
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
                marginBottom: '8px',
                padding: 0
              }}
            >
              <ArrowLeft size={13} />
              <span>Back to My Automations</span>
            </button>
          )}
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#171719', letterSpacing: '-0.015em', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Universal Template Library</span>
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#2F5219',
              background: '#EDF4E6',
              border: '1px solid #C3D1AC',
              padding: '2px 8px',
              borderRadius: '999px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <Sparkles size={11} />
              Production Verified
            </span>
          </h2>
          <p style={{ fontSize: '12px', color: '#67676B', margin: '4px 0 0 0' }}>
            Pre-built, battle-tested conversational workflows. Install once, configure your branding, and go live in minutes.
          </p>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#96969C', pointerEvents: 'none' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates or capabilities..."
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              fontSize: '12px',
              background: '#FFFFFF',
              border: '1px solid #E5E5E8',
              borderRadius: '8px',
              color: '#171719',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>
      </div>

      {/* Industry Filter Pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        {industries.map((ind) => {
          const isActive = industry === ind;
          return (
            <button
              key={ind}
              type="button"
              onClick={() => setIndustry(ind)}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#FFFFFF' : '#67676B',
                background: isActive ? '#171719' : '#FFFFFF',
                border: isActive ? '1px solid #171719' : '1px solid #E5E5E8',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 120ms ease'
              }}
            >
              {industryLabels[ind] || ind}
            </button>
          );
        })}
      </div>

      {/* Grid of Templates */}
      {loading ? (
        <div style={{ padding: '64px 20px', textAlign: 'center', color: '#67676B', fontSize: '12px' }}>
          <div style={{ width: '24px', height: '24px', border: '2px solid #2876B8', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 8px', animation: 'spin 0.6s linear infinite' }} />
          <span>Loading catalog templates...</span>
        </div>
      ) : templates.length === 0 ? (
        <div style={{ padding: '56px 20px', textAlign: 'center', background: '#FFFFFF', border: '1px solid #E5E5E8', borderRadius: '12px', maxWidth: '440px', margin: '0 auto' }}>
          <Layers size={28} style={{ color: '#96969C', margin: '0 auto 8px' }} />
          <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#171719', margin: '0 0 4px 0' }}>No templates found</h4>
          <p style={{ fontSize: '12px', color: '#67676B', margin: 0 }}>
            Try clearing your search term or switching the industry filter.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '20px'
        }}>
          {templates.map((tpl) => (
            <TemplateCard
              key={tpl.id || tpl.template_key}
              template={tpl}
              onSelect={onSelectTemplate}
              onInspect={onInspectTemplate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

