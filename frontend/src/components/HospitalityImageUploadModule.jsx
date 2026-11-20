import React, { useState, useEffect, useCallback } from 'react';
import {
  Image,
  Upload,
  Plus,
  Trash2,
  Star,
  Copy,
  Check,
  Eye,
  RefreshCw,
  Building2,
  BedDouble,
  ExternalLink,
  Sparkles,
  Camera,
  X
} from 'lucide-react';

export default function HospitalityImageUploadModule({
  token,
  propertyId = 1,
  onImageSelected = null, // Optional callback if opened as a picker
  compact = false
}) {
  const [scope, setScope] = useState('rooms'); // 'rooms' | 'property'
  const [roomCategories, setRoomCategories] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [roomImages, setRoomImages] = useState([]);
  const [propertyGallery, setPropertyGallery] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [previewLightbox, setPreviewLightbox] = useState(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [filePreview, setFilePreview] = useState('');
  const [uploadUrl, setUploadUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [altText, setAltText] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [propertyCategory, setPropertyCategory] = useState('Resort & Amenities');

  const getHeaders = useCallback(() => {
    const t = token || localStorage.getItem('token') || '';
    return {
      Authorization: t ? `Bearer ${t}` : '',
      'Content-Type': 'application/json'
    };
  }, [token]);

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  // Fetch Room Categories
  const fetchRoomCategories = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/hospitality/properties/${propertyId}/room-categories`, {
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.room_categories)) {
        setRoomCategories(data.room_categories);
        if (data.room_categories.length > 0 && !selectedRoomId) {
          setSelectedRoomId(data.room_categories[0].id);
        }
      }
    } catch (e) {
      console.warn('[HospitalityImageUpload] Error loading room categories:', e.message);
    }
  }, [propertyId, selectedRoomId, getHeaders]);

  // Fetch Room Images
  const fetchRoomImages = useCallback(async (roomId) => {
    if (!roomId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/hospitality/properties/${propertyId}/room-categories/${roomId}/images`, {
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setRoomImages(data.images || []);
      }
    } catch (e) {
      console.warn('[HospitalityImageUpload] Error loading room images:', e.message);
    } finally {
      setLoading(false);
    }
  }, [propertyId, getHeaders]);

  // Fetch Property Gallery
  const fetchPropertyGallery = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/hospitality/properties/${propertyId}/gallery`, {
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setPropertyGallery(data.property_gallery || data.photos || []);
      }
    } catch (e) {
      console.warn('[HospitalityImageUpload] Error loading property gallery:', e.message);
    } finally {
      setLoading(false);
    }
  }, [propertyId, getHeaders]);

  useEffect(() => {
    fetchRoomCategories();
    fetchPropertyGallery();
  }, [fetchRoomCategories, fetchPropertyGallery]);

  useEffect(() => {
    if (selectedRoomId) {
      fetchRoomImages(selectedRoomId);
    }
  }, [selectedRoomId, fetchRoomImages]);

  // Handle File Input Selection & Thumbnail Preview
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setFilePreview(URL.createObjectURL(file));
      if (!caption) {
        // Auto-fill friendly caption from filename
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setCaption(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
      }
    }
  };

  // Upload Photo Action
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile && !uploadUrl.trim()) {
      showToast('Please select an image file or provide an image URL.', 'error');
      return;
    }

    setUploading(true);
    try {
      const t = token || localStorage.getItem('token') || '';
      let res;

      if (scope === 'rooms') {
        if (!selectedRoomId) throw new Error('Please select a room category.');

        if (uploadFile) {
          const formData = new FormData();
          formData.append('image', uploadFile);
          formData.append('caption', caption || '');
          formData.append('alt_text', altText || '');
          formData.append('is_primary', isPrimary ? 'true' : 'false');

          res = await fetch(`/api/v1/hospitality/properties/${propertyId}/room-categories/${selectedRoomId}/images`, {
            method: 'POST',
            headers: { Authorization: t ? `Bearer ${t}` : '' },
            body: formData
          });
        } else {
          res = await fetch(`/api/v1/hospitality/properties/${propertyId}/room-categories/${selectedRoomId}/images`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
              image_url: uploadUrl.trim(),
              caption,
              alt_text: altText,
              is_primary: isPrimary
            })
          });
        }
      } else {
        // Property Gallery Upload
        if (uploadFile) {
          const formData = new FormData();
          formData.append('image', uploadFile);
          formData.append('caption', caption || '');
          formData.append('category', propertyCategory || 'Resort & Amenities');
          formData.append('alt_text', altText || '');
          formData.append('is_primary', isPrimary ? 'true' : 'false');

          res = await fetch(`/api/v1/hospitality/properties/${propertyId}/gallery`, {
            method: 'POST',
            headers: { Authorization: t ? `Bearer ${t}` : '' },
            body: formData
          });
        } else {
          res = await fetch(`/api/v1/hospitality/properties/${propertyId}/gallery`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
              image_url: uploadUrl.trim(),
              caption,
              category: propertyCategory,
              alt_text: altText,
              is_primary: isPrimary
            })
          });
        }
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Image upload failed');
      }

      showToast('Photo uploaded and added to hospitality assets successfully!');
      setShowUploadModal(false);
      setUploadFile(null);
      setFilePreview('');
      setUploadUrl('');
      setCaption('');
      setAltText('');
      setIsPrimary(false);

      if (scope === 'rooms') {
        fetchRoomImages(selectedRoomId);
        fetchRoomCategories();
      } else {
        fetchPropertyGallery();
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  // Set Primary Image
  const handleSetPrimary = async (imgId) => {
    try {
      if (scope === 'rooms') {
        const res = await fetch(`/api/v1/hospitality/properties/${propertyId}/room-categories/${selectedRoomId}/images/${imgId}/primary`, {
          method: 'PUT',
          headers: getHeaders()
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Failed to set primary image');
        showToast('Primary room cover photo updated.');
        fetchRoomImages(selectedRoomId);
        fetchRoomCategories();
      } else {
        const res = await fetch(`/api/v1/hospitality/properties/${propertyId}/gallery/${imgId}/primary`, {
          method: 'PUT',
          headers: getHeaders()
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Failed to set primary cover photo');
        showToast('Primary resort cover photo updated.');
        fetchPropertyGallery();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Delete Image
  const handleDeleteImage = async (imgId) => {
    if (!window.confirm('Are you sure you want to delete this photo from hospitality assets?')) return;
    try {
      if (scope === 'rooms') {
        const res = await fetch(`/api/v1/hospitality/properties/${propertyId}/room-categories/${selectedRoomId}/images/${imgId}`, {
          method: 'DELETE',
          headers: getHeaders()
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delete photo');
        showToast('Photo removed from room gallery.');
        fetchRoomImages(selectedRoomId);
      } else {
        const res = await fetch(`/api/v1/hospitality/properties/${propertyId}/gallery/${imgId}`, {
          method: 'DELETE',
          headers: getHeaders()
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delete photo');
        showToast('Photo removed from property gallery.');
        fetchPropertyGallery();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Copy Image URL to Clipboard
  const handleCopyUrl = (url, id) => {
    if (!url) return;
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedId(id);
      showToast('Image URL copied to clipboard! Ready to paste into flow steps or messages.');
      setTimeout(() => setCopiedId(null), 2500);
    });
  };

  const currentRoom = roomCategories.find(r => r.id === Number(selectedRoomId));
  const activePhotos = scope === 'rooms' ? roomImages : propertyGallery.filter(p => categoryFilter === 'ALL' || p.category === categoryFilter);

  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: '12px',
      border: '1px solid #E5E5E8',
      padding: compact ? '16px' : '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
    }}>
      {/* Toast Notification */}
      {notification && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          padding: '10px 18px',
          borderRadius: '8px',
          background: notification.type === 'error' ? '#EF4444' : '#166534',
          color: '#FFFFFF',
          fontSize: '0.86rem',
          fontWeight: 600,
          zIndex: 99999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>{notification.message}</span>
        </div>
      )}

      {/* Module Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        borderBottom: '1px solid #F1F5F9',
        paddingBottom: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: '#DCFCE7',
              color: '#15803D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Camera size={18} />
            </div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#171719' }}>
              Hospitality Photo &amp; Room Gallery Hub
            </h2>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#67676B', margin: '4px 0 0 0' }}>
            Upload high-resolution room photos and property scenes. Used by your WhatsApp concierge, booking flows, and chat links.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => {
              if (scope === 'rooms') fetchRoomImages(selectedRoomId);
              else fetchPropertyGallery();
            }}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #E2E8F0',
              background: '#F8FAFC',
              color: '#475569',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setUploadFile(null);
              setFilePreview('');
              setUploadUrl('');
              setCaption('');
              setAltText('');
              setIsPrimary(false);
              setShowUploadModal(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: '#2F5219',
              color: '#FFFFFF',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(47,82,25,0.25)'
            }}
          >
            <Upload size={14} />
            <span>Upload New Photo</span>
          </button>
        </div>
      </div>

      {/* Scope Selector: Room Categories vs Property Grounds */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{
          display: 'flex',
          gap: '6px',
          background: '#F1F5F9',
          padding: '4px',
          borderRadius: '8px',
          border: '1px solid #E2E8F0'
        }}>
          <button
            type="button"
            onClick={() => setScope('rooms')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '6px',
              border: scope === 'rooms' ? '1px solid #86EFAC' : '1px solid transparent',
              background: scope === 'rooms' ? '#FFFFFF' : 'transparent',
              color: scope === 'rooms' ? '#166534' : '#64748B',
              fontSize: '0.82rem',
              fontWeight: scope === 'rooms' ? 700 : 500,
              cursor: 'pointer',
              boxShadow: scope === 'rooms' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            <BedDouble size={14} />
            <span>Room Type Photos ({roomCategories.length} Types)</span>
          </button>

          <button
            type="button"
            onClick={() => setScope('property')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '6px',
              border: scope === 'property' ? '1px solid #86EFAC' : '1px solid transparent',
              background: scope === 'property' ? '#FFFFFF' : 'transparent',
              color: scope === 'property' ? '#166534' : '#64748B',
              fontSize: '0.82rem',
              fontWeight: scope === 'property' ? 700 : 500,
              cursor: 'pointer',
              boxShadow: scope === 'property' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            <Building2 size={14} />
            <span>Resort Grounds &amp; Amenities ({propertyGallery.length} Photos)</span>
          </button>
        </div>

        {/* Room Category Picker or Property Category Filter */}
        {scope === 'rooms' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#64748B' }}>Select Room:</span>
            <select
              value={selectedRoomId || ''}
              onChange={e => setSelectedRoomId(Number(e.target.value))}
              style={{
                padding: '6px 12px',
                fontSize: '0.84rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#1E293B',
                cursor: 'pointer'
              }}
            >
              {roomCategories.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} (₹{r.base_rate}/night)
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {['ALL', 'Beachfront & Exterior', 'Pool & Recreation', 'Dining & Restaurant', 'Gardens & Campus', 'Resort & Amenities'].map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: categoryFilter === cat ? '1px solid #86EFAC' : '1px solid #E2E8F0',
                  background: categoryFilter === cat ? '#DCFCE7' : '#F8FAFC',
                  color: categoryFilter === cat ? '#166534' : '#475569',
                  fontSize: '0.75rem',
                  fontWeight: categoryFilter === cat ? 700 : 500,
                  cursor: 'pointer'
                }}
              >
                {cat === 'ALL' ? `All (${propertyGallery.length})` : cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Room Header Card (if in room mode) */}
      {scope === 'rooms' && currentRoom && (
        <div style={{
          background: '#F8FAF5',
          border: '1px solid #D9E4CC',
          borderRadius: '8px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#2F5219' }}>
              {currentRoom.name}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#67676B', marginTop: '2px' }}>
              Base Tariff: ₹{currentRoom.base_rate}/night • Max Capacity: {currentRoom.base_capacity || 2} Guests • Total Photos: {roomImages.length}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {currentRoom.primary_image_url ? (
              <span style={{ fontSize: '0.76rem', color: '#15803D', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Star size={12} fill="#15803D" /> Primary Cover Assigned
              </span>
            ) : (
              <span style={{ fontSize: '0.76rem', color: '#B45309', fontWeight: 600 }}>
                ⚠️ No Primary Cover Assigned
              </span>
            )}
          </div>
        </div>
      )}

      {/* Photos Grid */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px auto' }} />
          <div>Loading photographs...</div>
        </div>
      ) : activePhotos.length === 0 ? (
        <div style={{
          padding: '48px 24px',
          textAlign: 'center',
          background: '#F8FAFC',
          borderRadius: '10px',
          border: '1px dashed #CBD5E1'
        }}>
          <Camera size={36} color="#94A3B8" style={{ margin: '0 auto 12px auto' }} />
          <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#334155', margin: '0 0 6px 0' }}>
            {scope === 'rooms' ? 'No photos uploaded for this room category' : 'No photos found in this category'}
          </h4>
          <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '0 0 16px 0', maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
            Upload JPEG, PNG or WebP images. They will be displayed in WhatsApp quote replies and customer chat links.
          </p>
          <button
            type="button"
            onClick={() => {
              setUploadFile(null);
              setFilePreview('');
              setUploadUrl('');
              setCaption('');
              setAltText('');
              setIsPrimary(true);
              setShowUploadModal(true);
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: '#2F5219',
              color: '#FFFFFF',
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Upload First Photo
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '18px'
        }}>
          {activePhotos.map((photo, idx) => {
            const isPrim = Boolean(photo.is_primary);
            const photoUrl = photo.image_url;
            return (
              <div
                key={photo.id || idx}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '10px',
                  border: isPrim ? '2px solid #16A34A' : '1px solid #E2E8F0',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: isPrim ? '0 4px 12px rgba(22, 163, 74, 0.12)' : '0 1px 3px rgba(0,0,0,0.05)',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Photo Image Container */}
                <div style={{ height: '170px', position: 'relative', background: '#F1F5F9', overflow: 'hidden' }}>
                  <img
                    src={photoUrl}
                    alt={photo.caption || 'Hospitality photo'}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80';
                    }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />

                  {/* Primary Badge */}
                  {isPrim && (
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      background: '#16A34A',
                      color: '#FFFFFF',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}>
                      <Star size={11} fill="#FFFFFF" />
                      <span>Primary Cover</span>
                    </div>
                  )}

                  {/* Quick Preview Lightbox Icon */}
                  <button
                    type="button"
                    onClick={() => setPreviewLightbox(photoUrl)}
                    title="Expand Full Photo"
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,0.5)',
                      color: '#FFFFFF',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <Eye size={14} />
                  </button>
                </div>

                {/* Photo Details & Actions */}
                <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#1E293B', marginBottom: '4px' }}>
                      {photo.caption || (scope === 'rooms' ? `${currentRoom?.name} View` : 'Resort Photo')}
                    </div>
                    {photo.category && (
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: '#F1F5F9',
                        color: '#475569'
                      }}>
                        {photo.category}
                      </span>
                    )}
                  </div>

                  <div style={{
                    paddingTop: '10px',
                    borderTop: '1px solid #F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px'
                  }}>
                    <button
                      type="button"
                      onClick={() => handleCopyUrl(photoUrl, photo.id)}
                      title="Copy direct image URL to clipboard"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '5px 8px',
                        borderRadius: '4px',
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: copiedId === photo.id ? '#15803D' : '#334155',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {copiedId === photo.id ? <Check size={12} color="#15803D" /> : <Copy size={12} />}
                      <span>{copiedId === photo.id ? 'Copied!' : 'Copy URL'}</span>
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {!isPrim && (
                        <button
                          type="button"
                          onClick={() => handleSetPrimary(photo.id)}
                          title="Set as primary cover photo"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '5px 8px',
                            borderRadius: '4px',
                            border: '1px solid #CBD5E1',
                            background: '#FFFFFF',
                            color: '#0F766E',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          <Star size={12} />
                          <span>Set Primary</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteImage(photo.id)}
                        title="Delete photo"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '5px 8px',
                          borderRadius: '4px',
                          border: '1px solid #FEE2E2',
                          background: '#FEF2F2',
                          color: '#DC2626',
                          fontSize: '0.76rem',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {onImageSelected && (
                    <button
                      type="button"
                      onClick={() => onImageSelected(photoUrl)}
                      style={{
                        width: '100%',
                        padding: '6px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#15803D',
                        color: '#FFFFFF',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Select This Photo
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: UPLOAD NEW HOSPITALITY PHOTO */}
      {/* ------------------------------------------------------------- */}
      {showUploadModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '520px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Camera size={20} color="#15803D" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: '#171719' }}>
                  {scope === 'rooms' ? `Upload Room Photo: ${currentRoom?.name || ''}` : 'Add Property & Resort Photo'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Scope specific category picker */}
              {scope === 'rooms' ? (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Target Room Category *
                  </label>
                  <select
                    value={selectedRoomId || ''}
                    onChange={e => setSelectedRoomId(Number(e.target.value))}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.86rem' }}
                  >
                    {roomCategories.map(r => (
                      <option key={r.id} value={r.id}>{r.name} (₹{r.base_rate}/night)</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    Gallery Category *
                  </label>
                  <select
                    value={propertyCategory}
                    onChange={e => setPropertyCategory(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.86rem' }}
                  >
                    <option value="Beachfront & Exterior">Beachfront & Exterior</option>
                    <option value="Pool & Recreation">Pool & Recreation</option>
                    <option value="Dining & Restaurant">Dining & Restaurant</option>
                    <option value="Gardens & Campus">Gardens & Campus</option>
                    <option value="Resort & Amenities">Resort & Amenities</option>
                    <option value="Spa & Wellness">Spa & Wellness</option>
                    <option value="Lobby & Reception">Lobby & Reception</option>
                  </select>
                </div>
              )}

              {/* Drag & Drop File Zone */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Select Image File (JPEG, PNG, WebP)
                </label>
                <div style={{
                  border: '2px dashed #CBD5E1',
                  borderRadius: '8px',
                  padding: '16px',
                  textAlign: 'center',
                  background: '#F8FAFC',
                  cursor: 'pointer',
                  position: 'relative'
                }}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      opacity: 0,
                      cursor: 'pointer'
                    }}
                  />
                  {filePreview ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <img
                        src={filePreview}
                        alt="Preview"
                        style={{ height: '110px', borderRadius: '6px', objectFit: 'cover' }}
                      />
                      <span style={{ fontSize: '0.76rem', color: '#15803D', fontWeight: 600 }}>
                        {uploadFile?.name} ({(uploadFile.size / 1024).toFixed(0)} KB) — Click to Change
                      </span>
                    </div>
                  ) : (
                    <div>
                      <Upload size={24} color="#64748B" style={{ margin: '0 auto 6px auto' }} />
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#334155' }}>
                        Click or drag &amp; drop to upload photo
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: '2px' }}>
                        Supports JPG, PNG, WEBP up to 10MB
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Or URL input */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 8px 0' }}>
                  <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
                  <span style={{ fontSize: '0.74rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>OR Image URL</span>
                  <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
                </div>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={uploadUrl}
                  onChange={e => setUploadUrl(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.84rem' }}
                />
              </div>

              {/* Caption */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Photo Caption / Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder={scope === 'rooms' ? 'e.g. Master Bedroom with Private Sea Balcony' : 'e.g. Sunset Infinity Pool Deck'}
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.86rem' }}
                />
              </div>

              {/* Alt Text */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Alt Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Short visual description for guests and accessibility"
                  value={altText}
                  onChange={e => setAltText(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.86rem' }}
                />
              </div>

              {/* Set Primary Checkbox */}
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                background: '#F0FDF4',
                borderRadius: '6px',
                border: '1px solid #BBF7D0',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={e => setIsPrimary(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#16A34A', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#166534' }}>
                  {scope === 'rooms'
                    ? 'Set as Primary Cover Image for this room type'
                    : 'Set as Main Resort Cover Image'}
                </span>
              </label>

              {/* Form Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#475569',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#2F5219',
                    color: '#FFFFFF',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(47,82,25,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {uploading ? <RefreshCw size={14} className="spin" /> : <Upload size={14} />}
                  <span>{uploading ? 'Uploading...' : 'Save & Add Photo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: FULL PHOTO LIGHTBOX */}
      {/* ------------------------------------------------------------- */}
      {previewLightbox && (
        <div
          onClick={() => setPreviewLightbox(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '24px'
          }}
        >
          <div style={{ position: 'relative', maxWidth: '900px', maxHeight: '90vh' }}>
            <img
              src={previewLightbox}
              alt="Enlarged photo"
              style={{ width: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px' }}
            />
            <button
              type="button"
              onClick={() => setPreviewLightbox(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0px',
                background: 'transparent',
                border: 'none',
                color: '#FFFFFF',
                fontSize: '18px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
