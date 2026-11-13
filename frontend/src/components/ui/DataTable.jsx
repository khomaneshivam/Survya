import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';

/**
 * Accessible, sortable, paginated responsive data table following SARVYA rules.
 */
export default function DataTable({
  columns,
  data = [],
  rowKey = (row, idx) => row.id ?? idx,
  onRowClick,
  selectedKey,
  loading = false,
  emptyTitle = 'No matching records',
  emptyDescription = 'Adjust filters or create a new record to get started.',
  emptyAction,
  pageSize = 10,
  ariaLabel = 'Data table',
  responsive = true
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    const getValue = col?.sortValue || ((row) => row[sortKey]);

    return [...data].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [data, columns, sortKey, sortDir]);

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
      <div className="sarvya-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="sarvya-skeleton" style={{ height: '38px', width: '100%' }} />
          ))}
        </div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="sarvya-card">
        <div className="sarvya-empty-state">
          <div className="sarvya-empty-icon">
            <Inbox size={20} />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {emptyTitle}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', maxWidth: '380px' }}>
            {emptyDescription}
          </div>
          {emptyAction}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div className="table-wrapper" tabIndex={0} role="region" aria-label={ariaLabel}>
        <table className={`sarvya-table ${responsive ? 'sarvya-table-responsive' : ''}`}>
          <thead>
            <tr>
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={{ textAlign: col.align || 'start', width: col.width }}
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
                          gap: '5px',
                          cursor: 'pointer',
                          color: isSorted ? 'var(--sarvya-blue)' : 'inherit',
                          fontWeight: 'inherit',
                          textTransform: 'inherit',
                          letterSpacing: 'inherit'
                        }}
                      >
                        <span>{col.label}</span>
                        {isSorted ? (
                          sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                        ) : (
                          <ArrowUpDown size={12} style={{ opacity: 0.45 }} />
                        )}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, idx) => {
              const key = typeof rowKey === 'function' ? rowKey(row, idx) : row[rowKey];
              const isSelected = selectedKey !== undefined && key === selectedKey;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={isSelected ? 'is-selected' : ''}
                  style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      data-label={col.label}
                      style={{ textAlign: col.align || 'start' }}
                    >
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageSize > 0 && sortedData.length > pageSize && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          paddingInline: '4px',
          fontSize: '12.5px',
          color: 'var(--text-secondary)'
        }}>
          <span>
            Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sortedData.length)} of {sortedData.length}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="sarvya-btn sarvya-btn-secondary sarvya-btn-sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} />
              Prev
            </button>
            <span style={{ paddingInline: '6px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              className="sarvya-btn sarvya-btn-secondary sarvya-btn-sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

