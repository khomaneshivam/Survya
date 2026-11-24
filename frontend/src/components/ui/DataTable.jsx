import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * High-density, accessible, sortable, paginated responsive data table following SARVYA & Stripe/Linear rules.
 */
export default function DataTable({
  columns,
  data,
  rows,
  rowKey,
  keyField,
  onRowClick,
  selectedKey,
  loading = false,
  emptyTitle = 'No matching records',
  emptyDescription = '',
  emptyAction,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 25, 50],
  density = 'compact', // 'compact' | 'comfortable'
  stickyHeader = true,
  toolbar = null,
  ariaLabel = 'Data table',
  responsive = true,
  containerStyle = {}
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Support both `data` and `rows` props seamlessly
  const resolvedData = useMemo(() => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(rows)) return rows;
    return [];
  }, [data, rows]);

  // Support function rowKey, string rowKey, or keyField prop
  const getRowKey = useMemo(() => {
    if (typeof rowKey === 'function') return rowKey;
    if (typeof rowKey === 'string') return (row, idx) => row[rowKey] ?? idx;
    if (keyField) return (row, idx) => row[keyField] ?? idx;
    return (row, idx) => row.id ?? row.key ?? idx;
  }, [rowKey, keyField]);

  const sortedData = useMemo(() => {
    if (!sortKey) return resolvedData;
    const col = columns.find((c) => c.key === sortKey);
    const getValue = col?.sortValue || ((row) => row[sortKey]);
    const factor = sortDir === 'asc' ? 1 : -1;

    return [...resolvedData].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;

      if (typeof av === 'number' && typeof bv === 'number') {
        return factor * (av - bv);
      }
      return factor * collator.compare(String(av), String(bv));
    });
  }, [resolvedData, columns, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = pageSize > 0
    ? sortedData.slice((safePage - 1) * pageSize, safePage * pageSize)
    : sortedData;

  function toggleSort(col) {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir('asc');
    }
    setPage(1);
  }

  if (loading) {
    return (
      <div className="sarvya-card" style={{ padding: '16px', ...containerStyle }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="sarvya-skeleton" style={{ height: density === 'compact' ? '32px' : '38px', width: '100%' }} />
          ))}
        </div>
      </div>
    );
  }

  if (!resolvedData.length) {
    return (
      <div className="sarvya-card" style={{ padding: '24px 16px', textAlign: 'center', ...containerStyle }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <Inbox size={16} />
          <span>{emptyTitle}</span>
        </div>
        {emptyDescription && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {emptyDescription}
          </div>
        )}
        {emptyAction && <div style={{ marginTop: '12px' }}>{emptyAction}</div>}
      </div>
    );
  }

  const tableDensityClass = density === 'compact' ? 'sarvya-table-compact' : '';

  return (
    <div className="sarvya-table-container" style={{ display: 'flex', flexDirection: 'column', ...containerStyle }}>
      {toolbar && (
        <div className="sarvya-table-toolbar" style={{
          padding: '8px 12px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderBottom: 'none',
          borderTopLeftRadius: 'var(--radius-lg)',
          borderTopRightRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          flexWrap: 'wrap'
        }}>
          {toolbar}
        </div>
      )}

      <div
        className="table-wrapper"
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
        style={{
          ...(toolbar ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 } : {}),
          overflowX: 'auto',
          maxHeight: stickyHeader ? 'min(640px, 75vh)' : undefined
        }}
      >
        <table className={`sarvya-table ${tableDensityClass} ${responsive ? 'sarvya-table-responsive' : ''}`}>
          <thead style={stickyHeader ? { position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', backdropFilter: 'blur(8px)' } : undefined}>
            <tr>
              {columns.map((col, colIdx) => {
                const isSorted = sortKey === col.key;
                const columnLabel = col.label || col.header || '';
                const isNumeric = col.numeric || col.align === 'right' || col.align === 'end';
                const textAlign = col.align || (isNumeric ? 'right' : 'start');

                return (
                  <th
                    key={col.key || col.accessor || col.header || col.label || `col_${colIdx}`}
                    scope="col"
                    aria-sort={col.sortable ? (isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined) : undefined}
                    style={{ textAlign, width: col.width }}
                    className={isNumeric ? 'tabular-nums' : ''}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'pointer',
                          color: isSorted ? 'var(--sarvya-blue)' : 'inherit',
                          fontWeight: 'inherit',
                          fontSize: 'inherit',
                          textTransform: 'inherit',
                          letterSpacing: 'inherit',
                          width: textAlign === 'right' ? '100%' : 'auto',
                          justifyContent: textAlign === 'right' ? 'flex-end' : 'flex-start'
                        }}
                      >
                        <span>{columnLabel}</span>
                        {isSorted ? (
                          sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                        ) : (
                          <ArrowUpDown size={12} style={{ opacity: 0.4 }} />
                        )}
                      </button>
                    ) : (
                      columnLabel
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, idx) => {
              const key = getRowKey(row, idx);
              const isSelected = selectedKey !== undefined && key === selectedKey;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={isSelected ? 'is-selected' : ''}
                  style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                >
                  {columns.map((col, colIdx) => {
                    const isNumeric = col.numeric || col.align === 'right' || col.align === 'end';
                    const textAlign = col.align || (isNumeric ? 'right' : 'start');
                    const fieldKey = col.accessor || col.key;
                    const hasField = Boolean(fieldKey && typeof fieldKey === 'string' && row && fieldKey in row);
                    const cellValue = typeof fieldKey === 'function'
                      ? fieldKey(row)
                      : (hasField ? row[fieldKey] : undefined);

                    let rendered;
                    if (col.render) {
                      // Pass (cellValue, row) when fieldKey is on row; if field is absent (e.g. Actions), pass (row, row).
                      // If render function only takes 1 argument (render.length === 1) and firstArg is null/undefined or not an object,
                      // fall back to row so single-argument (row) => ... callbacks never crash on null properties!
                      const firstArg = hasField ? cellValue : row;
                      const safeFirstArg = (col.render.length === 1 && (firstArg === null || firstArg === undefined) && row)
                        ? row
                        : firstArg;
                      rendered = col.render(safeFirstArg, row);
                    } else {
                      rendered = cellValue !== undefined && cellValue !== null ? cellValue : '—';
                    }

                    return (
                      <td
                        key={col.key || col.accessor || col.header || col.label || `cell_${colIdx}`}
                        data-label={col.label || col.header || ''}
                        style={{ textAlign, width: col.width }}
                        className={`${isNumeric ? 'tabular-nums ' : ''}${col.className || ''}`.trim()}
                      >
                        {rendered}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Compact Pagination Bar */}
      {pageSize > 0 && sortedData.length > pageSize && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '8px 12px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderTop: 'none',
          borderBottomLeftRadius: 'var(--radius-lg)',
          borderBottomRightRadius: 'var(--radius-lg)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>
              Showing <strong className="tabular-nums">{(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sortedData.length)}</strong> of <strong className="tabular-nums">{sortedData.length}</strong>
            </span>
            {Array.isArray(pageSizeOptions) && pageSizeOptions.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Page size:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  aria-label="Rows per page"
                  style={{
                    fontSize: '11.5px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                >
                  {pageSizeOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="sarvya-btn sarvya-btn-secondary sarvya-btn-sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
              style={{ padding: '3px 8px', fontSize: '11.5px' }}
            >
              <ChevronLeft size={13} />
              Prev
            </button>
            <span style={{ paddingInline: '4px', fontWeight: 600, color: 'var(--text-primary)' }} className="tabular-nums">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              className="sarvya-btn sarvya-btn-secondary sarvya-btn-sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
              style={{ padding: '3px 8px', fontSize: '11.5px' }}
            >
              Next
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
