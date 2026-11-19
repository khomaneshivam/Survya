import React, { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import { X } from 'lucide-react';

export default function CustomFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  selected,
  data
}) {
  const [isHovered, setIsHovered] = useState(false);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8
  });

  const handleDelete = (e) => {
    e.stopPropagation();
    if (data?.onDeleteEdge) {
      data.onDeleteEdge(id);
    }
  };

  const isTrue = label === 'True' || data?.condition === true || data?.sourceHandle === 'true';
  const isFalse = label === 'False' || data?.condition === false || data?.sourceHandle === 'false';

  let pillBg = '#FFFFFF';
  let pillBorder = '#CBD5E1';
  let pillColor = '#475569';

  if (isTrue) {
    pillBg = '#F0FDF4';
    pillBorder = '#86EFAC';
    pillColor = '#166534';
  } else if (isFalse) {
    pillBg = '#FFF1F2';
    pillBorder = '#FECDD3';
    pillColor = '#9F1239';
  }

  const strokeColor = selected ? '#2F5219' : isTrue ? '#16A34A' : isFalse ? '#E11D48' : '#94A3B8';
  const strokeWidth = selected ? 2.5 : 2;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: isFalse ? '4 4' : 'none',
          transition: 'stroke 0.15s ease'
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            zIndex: 10
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {label && (
            <div
              style={{
                fontSize: '0.70rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '12px',
                background: pillBg,
                border: `1px solid ${pillBorder}`,
                color: pillColor,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                whiteSpace: 'nowrap',
                userSelect: 'none'
              }}
            >
              {label}
            </div>
          )}

          {(isHovered || selected) && (
            <button
              type="button"
              onClick={handleDelete}
              title="Delete connection"
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: '#FFFFFF',
                border: '1px solid #EF4444',
                color: '#EF4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
                boxShadow: '0 2px 4px rgba(239,68,68,0.2)'
              }}
            >
              <X size={10} />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
