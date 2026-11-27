import React, { useState, useMemo } from 'react';
import { Search, SlidersHorizontal, Image as ImageIcon, ChevronRight, X } from 'lucide-react';

export default function CatalogExplorerScreen({
  experience = {},
  catalogItems = [],
  catalogMeta = {},
  onSelectItem,
  onAction
}) {
  const primaryColor = experience.theme?.primaryColor || '#2F5219';

  // Base price bounds from meta or items
  const boundMin = catalogMeta.minPrice !== undefined ? Math.floor(catalogMeta.minPrice) : 0;
  const boundMax = catalogMeta.maxPrice !== undefined ? Math.ceil(catalogMeta.maxPrice) : 50000;

  // Filter state
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [priceMin, setPriceMin] = useState(boundMin);
  const [priceMax, setPriceMax] = useState(boundMax);
  const [showPriceFilter, setShowPriceFilter] = useState(false);

  // Categories
  const categories = useMemo(() => {
    const list = catalogMeta.categories || [];
    return [{ id: 'ALL', name: 'All Items' }, ...list];
  }, [catalogMeta.categories]);

  // Client-side instant filtering
  const filteredItems = useMemo(() => {
    return catalogItems.filter(item => {
      // Category filter
      if (selectedCategory !== 'ALL') {
        const itemCatId = String(item.categoryId || '');
        const itemCatName = String(item.categoryName || '').toLowerCase();
        if (itemCatId !== selectedCategory && !itemCatName.includes(selectedCategory.toLowerCase())) {
          return false;
        }
      }

      // Price range filter
      const p = Number(item.price || item.basePrice || 0);
      if (p < priceMin || p > priceMax) {
        return false;
      }

      // Search filter
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const title = String(item.title || item.name || '').toLowerCase();
        const desc = String(item.shortDescription || item.description || '').toLowerCase();
        const sku = String(item.sku || '').toLowerCase();
        if (!title.includes(q) && !desc.includes(q) && !sku.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [catalogItems, selectedCategory, priceMin, priceMax, search]);

  const handleMinChange = (e) => {
    const val = Number(e.target.value);
    setPriceMin(Math.min(val, priceMax));
  };

  const handleMaxChange = (e) => {
    const val = Number(e.target.value);
    setPriceMax(Math.max(val, priceMin));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Search & Filter Bar */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div
          style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items, rooms, or features..."
            style={{
              width: '100%',
              height: '40px',
              paddingLeft: '36px',
              paddingRight: search ? '36px' : '12px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              fontSize: '13.5px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: '10px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '4px',
                color: '#94a3b8'
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowPriceFilter(!showPriceFilter)}
          style={{
            height: '40px',
            padding: '0 12px',
            borderRadius: '10px',
            border: `1px solid ${showPriceFilter || priceMin > boundMin || priceMax < boundMax ? primaryColor : '#e2e8f0'}`,
            backgroundColor: showPriceFilter || priceMin > boundMin || priceMax < boundMax ? `${primaryColor}14` : '#ffffff',
            color: showPriceFilter || priceMin > boundMin || priceMax < boundMax ? primaryColor : '#475569',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0
          }}
        >
          <SlidersHorizontal size={15} />
          <span>Filter</span>
        </button>
      </div>

      {/* Dual-Thumb Price Range Slider Section */}
      {showPriceFilter && (
        <div
          style={{
            padding: '14px',
            borderRadius: '12px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
              Price Range Filter
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: primaryColor }}>
              ₹{priceMin.toLocaleString('en-IN')} – ₹{priceMax.toLocaleString('en-IN')}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Min: ₹{priceMin.toLocaleString('en-IN')}</label>
              <input
                type="range"
                min={boundMin}
                max={boundMax}
                step={boundMax > 10000 ? 500 : 50}
                value={priceMin}
                onChange={handleMinChange}
                style={{ width: '100%', accentColor: primaryColor }}
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: '#64748b' }}>Max: ₹{priceMax.toLocaleString('en-IN')}</label>
              <input
                type="range"
                min={boundMin}
                max={boundMax}
                step={boundMax > 10000 ? 500 : 50}
                value={priceMax}
                onChange={handleMaxChange}
                style={{ width: '100%', accentColor: primaryColor }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                setPriceMin(boundMin);
                setPriceMax(boundMax);
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748b',
                fontSize: '12px',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Reset Price
            </button>
          </div>
        </div>
      )}

      {/* Category Pills */}
      {categories.length > 1 && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '4px',
            scrollbarWidth: 'none'
          }}
        >
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: isSelected ? `1px solid ${primaryColor}` : '1px solid #e2e8f0',
                  backgroundColor: isSelected ? primaryColor : '#ffffff',
                  color: isSelected ? '#ffffff' : '#475569',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s ease'
                }}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Results Count Header */}
      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
        Showing {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
      </div>

      {/* Items Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {filteredItems.length === 0 ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              backgroundColor: '#f8fafc',
              borderRadius: '12px',
              border: '1px dashed #cbd5e1'
            }}
          >
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#334155' }}>
              No items match your filter criteria
            </p>
            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
              Try adjusting the price range slider or clearing the search keyword.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const images = item.images || [];
            const primaryImg = item.primaryImageUrl || images[0]?.url || null;
            const price = Number(item.price || item.basePrice || 0);
            const gstRate = item.taxRate || 18;
            const isSoldOut = item.isSoldOutToday === 1;

            return (
              <div
                key={item.id}
                onClick={() => !isSoldOut && onSelectItem && onSelectItem(item)}
                style={{
                  borderRadius: '14px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  overflow: 'hidden',
                  cursor: isSoldOut ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  opacity: isSoldOut ? 0.65 : 1
                }}
              >
                {/* Image Container with Multi-image badge */}
                <div style={{ width: '100%', height: '170px', position: 'relative', backgroundColor: '#f1f5f9' }}>
                  {primaryImg ? (
                    <img
                      src={primaryImg}
                      alt={item.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                      <ImageIcon size={32} />
                    </div>
                  )}

                  {images.length > 1 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        backgroundColor: 'rgba(0,0,0,0.65)',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '12px',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <ImageIcon size={12} />
                      <span>{images.length} photos</span>
                    </div>
                  )}

                  {isSoldOut && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        fontSize: '14px',
                        fontWeight: 700,
                        letterSpacing: '0.05em'
                      }}
                    >
                      SOLD OUT FOR TODAY
                    </div>
                  )}
                </div>

                {/* Details Container */}
                <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                      {item.title}
                    </h3>
                    <ChevronRight size={18} color="#94a3b8" style={{ flexShrink: 0, marginTop: '2px' }} />
                  </div>

                  {item.description && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: '12.5px',
                        color: '#64748b',
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {item.description}
                    </p>
                  )}

                  {/* Bed & Spec chips if room */}
                  {item.bedType && (
                    <div style={{ fontSize: '11.5px', color: '#475569', fontWeight: 500 }}>
                      🛏️ {item.bedType} {item.roomSize ? `• ${item.roomSize} ${item.sizeUnit || 'sq.ft'}` : ''}
                    </div>
                  )}

                  {/* Price Bar */}
                  <div
                    style={{
                      marginTop: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid #f1f5f9',
                      paddingTop: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                      <span style={{ fontSize: '16px', fontWeight: 800, color: primaryColor }}>
                        ₹{price.toLocaleString('en-IN')}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        {item.categoryName === 'Rooms & Villas' ? '/ night' : ''}
                      </span>
                    </div>

                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#059669',
                        backgroundColor: '#ecfdf5',
                        padding: '2px 6px',
                        borderRadius: '6px'
                      }}
                    >
                      + {gstRate}% GST
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

