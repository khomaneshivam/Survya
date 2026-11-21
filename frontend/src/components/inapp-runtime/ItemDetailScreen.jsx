import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  Check,
  PhoneCall,
  MessageSquareDiff,
  ArrowRight,
  Sparkles
} from 'lucide-react';

export default function ItemDetailScreen({
  item = {},
  experience = {},
  onAction
}) {
  const primaryColor = experience.theme?.primaryColor || '#2F5219';
  const images = item.images && item.images.length > 0 ? item.images : (item.primaryImageUrl ? [{ url: item.primaryImageUrl }] : []);

  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState(item.variants?.[0]?.id || null);

  const price = Number(item.price || item.basePrice || 0);
  const taxRate = Number(item.taxRate || 18);
  const taxAmount = Math.round((price * taxRate) / 100);
  const grandTotal = price + taxAmount;

  const currentImg = images[activeImageIdx] || images[0] || {};

  const handlePrevImage = (e) => {
    e.stopPropagation();
    setActiveImageIdx((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNextImage = (e) => {
    e.stopPropagation();
    setActiveImageIdx((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  const handleProceed = () => {
    onAction && onAction('NEXT', {
      selectedItemId: item.id,
      selectedVariantId
    });
  };

  const handleDiscussRate = () => {
    onAction && onAction('JUMP', {
      targetScreenKey: 'rate_negotiation',
      selectedItemId: item.id
    });
  };

  const handleRequestCall = () => {
    onAction && onAction('JUMP', {
      targetScreenKey: 'call_request',
      selectedItemId: item.id
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '20px' }}>
      {/* Swipeable / Clickable Image Carousel Gallery */}
      <div
        style={{
          width: '100%',
          height: '240px',
          borderRadius: '16px',
          overflow: 'hidden',
          position: 'relative',
          backgroundColor: '#0f172a',
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)'
        }}
        onClick={() => setLightboxOpen(true)}
      >
        {currentImg.url ? (
          <img
            src={currentImg.url}
            alt={currentImg.caption || item.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
            No image available
          </div>
        )}

        {/* Carousel Arrows */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrevImage}
              aria-label="Previous image"
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'rgba(0,0,0,0.5)',
                color: '#ffffff',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                backdropFilter: 'blur(4px)'
              }}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onClick={handleNextImage}
              aria-label="Next image"
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'rgba(0,0,0,0.5)',
                color: '#ffffff',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                backdropFilter: 'blur(4px)'
              }}
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}

        {/* Zoom Lightbox Trigger */}
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            backgroundColor: 'rgba(0,0,0,0.55)',
            color: '#ffffff',
            padding: '4px 8px',
            borderRadius: '8px',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            fontWeight: 600
          }}
        >
          <Maximize2 size={12} />
          <span>Zoom</span>
        </div>

        {/* Slide Dots and Caption */}
        {images.length > 1 && (
          <div
            style={{
              position: 'absolute',
              bottom: '10px',
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            {images.map((_, idx) => (
              <div
                key={idx}
                style={{
                  width: idx === activeImageIdx ? '16px' : '6px',
                  height: '6px',
                  borderRadius: '3px',
                  backgroundColor: idx === activeImageIdx ? '#ffffff' : 'rgba(255,255,255,0.4)',
                  transition: 'all 0.2s ease'
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {lightboxOpen && (
        <div
          onClick={() => setLightboxOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '38px',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              cursor: 'pointer'
            }}
          >
            <X size={20} />
          </button>

          <img
            src={currentImg.url}
            alt={currentImg.caption || item.title}
            style={{
              maxWidth: '94vw',
              maxHeight: '80vh',
              objectFit: 'contain',
              borderRadius: '8px'
            }}
          />

          {currentImg.caption && (
            <p style={{ color: '#e2e8f0', fontSize: '13px', marginTop: '12px', textAlign: 'center' }}>
              {currentImg.caption}
            </p>
          )}
        </div>
      )}

      {/* Title & Core Meta */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: primaryColor,
              backgroundColor: `${primaryColor}14`,
              padding: '2px 8px',
              borderRadius: '6px'
            }}
          >
            {item.categoryName || 'Featured'}
          </span>
          {item.sku && (
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>SKU: {item.sku}</span>
          )}
        </div>

        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a', lineHeight: 1.3 }}>
          {item.title}
        </h1>
      </div>

      {/* Description */}
      {item.description && (
        <p style={{ margin: 0, fontSize: '13.5px', color: '#475569', lineHeight: 1.55 }}>
          {item.description}
        </p>
      )}

      {/* Hospitality Room Specs */}
      {(item.bedType || item.roomSize || item.maxAdults) && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '10px',
            padding: '14px',
            borderRadius: '12px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0'
          }}
        >
          {item.bedType && (
            <div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Bed Setup</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{item.bedType}</div>
            </div>
          )}
          {item.roomSize && (
            <div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Room Size</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{item.roomSize} {item.sizeUnit || 'sq.ft'}</div>
            </div>
          )}
          {item.maxAdults && (
            <div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Max Guests</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                {item.maxAdults} Adults {item.maxChildren ? `+ ${item.maxChildren} Child` : ''}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Amenities Badges */}
      {Array.isArray(item.amenities) && item.amenities.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#1e293b' }}>Amenities & Features</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {item.amenities.map((amenity, idx) => (
              <span
                key={idx}
                style={{
                  fontSize: '12px',
                  backgroundColor: '#f1f5f9',
                  color: '#334155',
                  padding: '4px 10px',
                  borderRadius: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Check size={12} color={primaryColor} />
                <span>{amenity}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Variants Selector */}
      {Array.isArray(item.variants) && item.variants.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#1e293b' }}>Select Option</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {item.variants.map((v) => {
              const isSelected = selectedVariantId === v.id;
              return (
                <div
                  key={v.id}
                  onClick={() => setSelectedVariantId(v.id)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: isSelected ? `2px solid ${primaryColor}` : '1px solid #e2e8f0',
                    backgroundColor: isSelected ? `${primaryColor}08` : '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                    {v.title}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: primaryColor }}>
                    ₹{Number(v.price || price).toLocaleString('en-IN')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live Price & Tax Summary */}
      <div
        style={{
          padding: '14px',
          borderRadius: '12px',
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748b' }}>
          <span>Base Price</span>
          <span>₹{price.toLocaleString('en-IN')}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748b' }}>
          <span>GST ({taxRate}%)</span>
          <span>+ ₹{taxAmount.toLocaleString('en-IN')}</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '15px',
            fontWeight: 800,
            color: '#0f172a',
            borderTop: '1px solid #e2e8f0',
            paddingTop: '8px',
            marginTop: '2px'
          }}
        >
          <span>Total Estimated</span>
          <span style={{ color: primaryColor }}>₹{grandTotal.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto' }}>
        <button
          type="button"
          onClick={handleProceed}
          style={{
            width: '100%',
            height: '48px',
            borderRadius: '12px',
            border: 'none',
            backgroundColor: primaryColor,
            color: '#ffffff',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: `0 4px 14px ${primaryColor}40`
          }}
        >
          <span>Select & Proceed</span>
          <ArrowRight size={18} />
        </button>

        {/* Secondary CTAs */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {experience.features?.enableRateDiscussion && (
            <button
              type="button"
              onClick={handleDiscussRate}
              style={{
                flex: 1,
                height: '42px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                color: '#334155',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <MessageSquareDiff size={15} color={primaryColor} />
              <span>Discuss Rate</span>
            </button>
          )}

          {experience.features?.enableCallbacks && (
            <button
              type="button"
              onClick={handleRequestCall}
              style={{
                flex: 1,
                height: '42px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                color: '#334155',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <PhoneCall size={15} color="#059669" />
              <span>Request Call</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

