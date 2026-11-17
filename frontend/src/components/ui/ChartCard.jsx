import React, { useState } from 'react';
import { Card, CardHeader, CardBody, EmptyState } from './Primitives';
import { BarChart3 } from 'lucide-react';

const SARVYA_PASTELS = ['#B0DBF6', '#C3D1AC', '#EFB0F6', '#FDB1AF', '#8E7B7A'];

/**
 * Clean pastel grouped/stacked bar visualization with interactive tooltips and legend.
 */
export function PastelBarChart({
  title,
  subtitle,
  data = [],
  series = [{ key: 'value', label: 'Count', color: '#B0DBF6' }],
  labelKey = 'label',
  height = 220,
  actions,
  loading = false,
  emptyTitle = 'No analytical data yet',
  emptyDescription = 'Metrics will populate once campaigns or guest enquiries are recorded.'
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const maxVal = Math.max(
    1,
    ...data.map((d) => series.reduce((sum, s) => sum + (Number(d[s.key]) || 0), 0))
  );

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} actions={actions} />
      <CardBody>
        {loading ? (
          <div className="sarvya-skeleton" style={{ height: `${height}px`, width: '100%' }} />
        ) : data.length === 0 ? (
          <EmptyState icon={BarChart3} title={emptyTitle} description={emptyDescription} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Meaningful Category Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              {series.map((s, idx) => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '3px',
                    background: s.color || SARVYA_PASTELS[idx % SARVYA_PASTELS.length]
                  }} />
                  <span>{s.label}</span>
                </div>
              ))}
            </div>

            {/* Responsive Chart Area */}
            <div style={{
              position: 'relative',
              height: `${height}px`,
              display: 'grid',
              gridTemplateColumns: `repeat(${data.length}, minmax(32px, 1fr))`,
              gap: '10px',
              alignItems: 'end',
              paddingTop: '24px',
              paddingBottom: '26px',
              borderBottom: '1px solid var(--border-color)'
            }}>
              {/* Subtle Horizontal Grid Lines */}
              {[0.25, 0.5, 0.75, 1].map((step) => (
                <div
                  key={step}
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    insetInline: 0,
                    bottom: `${26 + step * (height - 50)}px`,
                    borderTop: '1px dashed var(--border-subtle)',
                    pointerEvents: 'none'
                  }}
                />
              ))}

              {data.map((row, idx) => {
                const total = series.reduce((sum, s) => sum + (Number(row[s.key]) || 0), 0);
                const chartInnerHeight = height - 50;
                const isHovered = hoveredIdx === idx;

                return (
                  <div
                    key={`${row.id != null ? row.id : (row[labelKey] || 'bar')}-${idx}`}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    style={{
                      position: 'relative',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      cursor: 'default'
                    }}
                  >
                    {/* Hover Tooltip */}
                    {isHovered && (
                      <div style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 4px)',
                        zIndex: 10,
                        background: '#171719',
                        color: '#FFFFFF',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        whiteSpace: 'nowrap',
                        boxShadow: 'var(--shadow-md)',
                        pointerEvents: 'none'
                      }}>
                        <div style={{ fontWeight: 600, marginBottom: '2px' }}>{row[labelKey]}</div>
                        {series.map((s) => (
                          <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', opacity: 0.9 }}>
                            <span>{s.label}:</span>
                            <span style={{ fontWeight: 600 }}>{Number(row[s.key] || 0).toLocaleString('en-IN')}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Stacked Bar Column */}
                    <div style={{
                      width: 'min(34px, 72%)',
                      display: 'flex',
                      flexDirection: 'column-reverse',
                      borderRadius: '5px 5px 0 0',
                      overflow: 'hidden',
                      opacity: hoveredIdx !== null && !isHovered ? 0.72 : 1,
                      transition: 'opacity 140ms ease'
                    }}>
                      {series.map((s, sIdx) => {
                        const val = Number(row[s.key]) || 0;
                        const px = total > 0 ? Math.max(val > 0 ? 4 : 0, Math.round((val / maxVal) * chartInnerHeight)) : 0;
                        return (
                          <div
                            key={s.key}
                            style={{
                              height: `${px}px`,
                              background: s.color || SARVYA_PASTELS[sIdx % SARVYA_PASTELS.length],
                              width: '100%'
                            }}
                          />
                        );
                      })}
                    </div>

                    {/* X-Axis Label */}
                    <div style={{
                      position: 'absolute',
                      bottom: '-22px',
                      fontSize: '11px',
                      color: isHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: isHovered ? 600 : 400,
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {row[labelKey]}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Clean proportional pastel breakdown bar + legend for distribution metrics.
 */
export function PastelBreakdownCard({ title, subtitle, items = [], actions }) {
  const total = items.reduce((sum, i) => sum + (Number(i.value) || 0), 0);

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} actions={actions} />
      <CardBody>
        {total === 0 ? (
          <EmptyState icon={BarChart3} title="No distribution data" description="Data will appear once activity is logged." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Segmented Bar */}
            <div style={{
              height: '12px',
              borderRadius: '6px',
              background: 'var(--bg-muted)',
              overflow: 'hidden',
              display: 'flex'
            }}>
              {items.map((item, idx) => {
                const pct = (item.value / total) * 100;
                if (pct <= 0) return null;
                return (
                  <div
                    key={`segment-${item.id != null ? item.id : (item.label || 'item')}-${idx}`}
                    title={`${item.label}: ${item.value} (${pct.toFixed(1)}%)`}
                    style={{
                      width: `${pct}%`,
                      background: item.color || SARVYA_PASTELS[idx % SARVYA_PASTELS.length],
                      borderInlineEnd: '1px solid #FFFFFF'
                    }}
                  />
                );
              })}
            </div>

            {/* Category Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {items.map((item, idx) => {
                const pct = ((item.value / total) * 100).toFixed(1);
                return (
                  <div
                    key={`row-${item.id != null ? item.id : (item.label || 'item')}-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '13px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '3px',
                        background: item.color || SARVYA_PASTELS[idx % SARVYA_PASTELS.length]
                      }} />
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {Number(item.value).toLocaleString('en-IN')}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', width: '46px', textAlign: 'end' }}>
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

