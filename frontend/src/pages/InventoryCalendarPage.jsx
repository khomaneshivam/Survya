import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Button,
  Modal,
  Drawer,
  EmptyState,
  KpiCard
} from '../components/ui';
import {
  Building2,
  BedDouble,
  Image as ImageIcon,
  KeyRound,
  Sparkles,
  CalendarDays,
  Utensils,
  TrendingUp,
  Tag,
  FileText,
  HelpCircle,
  Calculator,
  Plus,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertCircle,
  Eye,
  Trash2,
  Upload,
  Lock,
  Unlock,
  Check,
  Star,
  ArrowUpDown,
  Copy,
  Clock,
  ShieldCheck,
  MapPin,
  Phone,
  Mail,
  Globe
} from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Overview & Status', icon: Sparkles },
  { id: 'property', label: 'Property Setup', icon: Building2 },
  { id: 'rooms', label: 'Room Categories', icon: BedDouble },
  { id: 'images', label: 'Photos & Gallery', icon: ImageIcon },
  { id: 'keys', label: 'Physical Keys', icon: KeyRound },
  { id: 'inventory', label: 'Inventory & Blocks', icon: CalendarDays },
  { id: 'rate_plans', label: 'Rate & Meal Plans', icon: Utensils },
  { id: 'seasonal', label: 'Seasonal Rates', icon: TrendingUp },
  { id: 'daily_rates', label: 'Daily Overrides', icon: Tag },
  { id: 'policies', label: 'Policies & Taxes', icon: FileText },
  { id: 'faqs', label: 'Guest FAQs', icon: HelpCircle },
  { id: 'simulator', label: 'Live Quote Simulator', icon: Calculator }
];

export default function InventoryCalendarPage() {
  const { token, user, isAdmin } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState('overview');

  // Multi-property & Active Property State
  const [properties, setProperties] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState(1);
  const [currentProperty, setCurrentProperty] = useState(null);
  const [setupOverview, setSetupOverview] = useState(null);

  // Domain Datasets
  const [roomCategories, setRoomCategories] = useState([]);
  const [roomImages, setRoomImages] = useState([]);
  const [selectedRoomForImages, setSelectedRoomForImages] = useState(null);
  const [physicalRooms, setPhysicalRooms] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [faqs, setFaqs] = useState([]);
  const [ratePlans, setRatePlans] = useState([]);
  const [seasonalRates, setSeasonalRates] = useState([]);
  const [dailyRates, setDailyRates] = useState([]);
  const [taxRules, setTaxRules] = useState([]);
  const [inventoryGrid, setInventoryGrid] = useState(null);
  const [inventoryBlocks, setInventoryBlocks] = useState([]);

  // Loading & Action States
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Inventory Grid Date Range (Default next 14 days)
  const [gridStartDate, setGridStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [gridEndDate, setGridEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 13);
    return d.toISOString().split('T')[0];
  });

  // Modals & Forms
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [roomForm, setRoomForm] = useState({
    name: '',
    room_code: '',
    description: '',
    room_size: 350,
    size_unit: 'sq_ft',
    bed_type: '1 King Bed',
    bed_count: 1,
    standard_occupancy: 2,
    max_occupancy: 3,
    extra_adult_capacity: 1,
    extra_child_capacity: 1,
    extra_adult_price: 1200,
    extra_child_price: 600,
    bathroom_count: 1,
    view_type: 'Sea View',
    smoking_policy: 'NON_SMOKING',
    accessibility_info: '',
    amenities: ['Wi-Fi', 'Air Conditioning', 'En-suite Bathroom', 'Balcony / Patio'],
    base_rate: 4500,
    status: 'ACTIVE'
  });

  const [showImageUploadModal, setShowImageUploadModal] = useState(false);
  const [imageUploadFile, setImageUploadFile] = useState(null);
  const [imageUploadUrl, setImageUploadUrl] = useState('');
  const [imageCaption, setImageCaption] = useState('');
  const [imageAltText, setImageAltText] = useState('');
  const [imageIsPrimary, setImageIsPrimary] = useState(false);

  // Property Photo Gallery States
  const [propertyGallery, setPropertyGallery] = useState([]);
  const [galleryScope, setGalleryScope] = useState('property'); // 'property' | 'rooms'
  const [imageCategory, setImageCategory] = useState('Resort & Amenities');
  const [galleryCategoryFilter, setGalleryCategoryFilter] = useState('ALL');
  const [showChatGalleryPreview, setShowChatGalleryPreview] = useState(false);

  const [showBulkInventoryModal, setShowBulkInventoryModal] = useState(false);
  const [bulkInvForm, setBulkInvForm] = useState({
    room_type_id: '',
    start_date: gridStartDate,
    end_date: gridEndDate,
    total_rooms: 5,
    blocked_qty: 0,
    out_of_service_qty: 0,
    is_closed: false,
    base_rate: 4500
  });

  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockForm, setBlockForm] = useState({
    room_type_id: '',
    start_date: gridStartDate,
    end_date: gridStartDate,
    blocked_qty: 1,
    reason: 'Maintenance & Deep Cleaning'
  });

  const [showRatePlanModal, setShowRatePlanModal] = useState(false);
  const [ratePlanForm, setRatePlanForm] = useState({
    name: '',
    code: '',
    meal_plan: 'CP',
    description: '',
    cancellation_policy: 'Free cancellation up to 48 hours prior to arrival',
    is_refundable: true,
    included_services: ['Breakfast', 'Wi-Fi', 'Pool Access']
  });

  const [showSeasonalModal, setShowSeasonalModal] = useState(false);
  const [seasonalForm, setSeasonalForm] = useState({
    season_name: '',
    room_type_id: '',
    rate_plan_id: '',
    start_date: '',
    end_date: '',
    price: 6000,
    extra_adult_price: 1500,
    extra_child_price: 750,
    priority: 2
  });

  const [showDailyRateModal, setShowDailyRateModal] = useState(false);
  const [dailyRateForm, setDailyRateForm] = useState({
    room_type_id: '',
    rate_date: '',
    price: 5500,
    extra_adult_price: 1200,
    extra_child_price: 600,
    reason: 'Weekend Surge'
  });

  const [showFaqModal, setShowFaqModal] = useState(false);
  const [faqForm, setFaqForm] = useState({
    category: 'General',
    question: '',
    answer: '',
    keywords: ''
  });

  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyForm, setKeyForm] = useState({
    room_number: '',
    room_type_id: '',
    floor_or_building: 'Floor 1',
    operational_status: 'OPERATIONAL',
    notes: ''
  });

  // Simulator Form State
  const [simForm, setSimForm] = useState({
    room_type_id: '',
    rate_plan_id: '',
    check_in: gridStartDate,
    check_out: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 2);
      return d.toISOString().split('T')[0];
    })(),
    adults: 2,
    children: 0,
    rooms: 1
  });
  const [simQuote, setSimQuote] = useState(null);
  const [simLoading, setSimLoading] = useState(false);

  // Authentication Headers
  const getHeaders = useCallback(() => {
    const t = token || localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      Authorization: t ? `Bearer ${t}` : ''
    };
  }, [token]);

  const showNotification = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 1. Initial Data Fetch
  const loadHospitalityData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch Properties List
      const propRes = await fetch('/api/v1/hospitality/properties', { headers: getHeaders() });
      const propData = await propRes.json();
      if (propData.success && propData.properties?.length > 0) {
        setProperties(propData.properties);
        const activeId = selectedPropertyId || propData.properties[0].id;
        setSelectedPropertyId(activeId);

        // Parallel fetch for active property
        const [
          propDetailRes,
          overviewRes,
          roomsRes,
          facRes,
          polRes,
          faqRes,
          plansRes,
          seasonRes,
          dailyRes,
          taxRes,
          gridRes,
          blocksRes,
          keysRes
        ] = await Promise.all([
          fetch(`/api/v1/hospitality/properties/${activeId}`, { headers: getHeaders() }),
          fetch(`/api/v1/hospitality/properties/${activeId}/overview`, { headers: getHeaders() }),
          fetch(`/api/v1/hospitality/properties/${activeId}/room-categories`, { headers: getHeaders() }),
          fetch(`/api/v1/hospitality/properties/${activeId}/facilities`, { headers: getHeaders() }),
          fetch(`/api/v1/hospitality/properties/${activeId}/policies`, { headers: getHeaders() }),
          fetch(`/api/v1/hospitality/properties/${activeId}/faqs`, { headers: getHeaders() }),
          fetch(`/api/v1/hospitality/properties/${activeId}/rate-plans`, { headers: getHeaders() }),
          fetch(`/api/v1/hospitality/properties/${activeId}/seasonal-rates`, { headers: getHeaders() }),
          fetch(`/api/v1/hospitality/properties/${activeId}/daily-rates`, { headers: getHeaders() }),
          fetch(`/api/v1/hospitality/properties/${activeId}/tax-rules`, { headers: getHeaders() }),
          fetch(`/api/v1/hospitality/properties/${activeId}/inventory/grid?start_date=${gridStartDate}&end_date=${gridEndDate}`, { headers: getHeaders() }),
          fetch(`/api/v1/hospitality/properties/${activeId}/inventory/blocks`, { headers: getHeaders() }),
          fetch(`/api/v1/hospitality/properties/${activeId}/physical-rooms`, { headers: getHeaders() })
        ]);

        const [pD, oD, rD, fD, polD, faqD, plD, sD, dD, tD, gD, bD, kD] = await Promise.all([
          propDetailRes.json(),
          overviewRes.json(),
          roomsRes.json(),
          facRes.json(),
          polRes.json(),
          faqRes.json(),
          plansRes.json(),
          seasonRes.json(),
          dailyRes.json(),
          taxRes.json(),
          gridRes.json(),
          blocksRes.json(),
          keysRes.json()
        ]);

        if (pD.success) setCurrentProperty(pD.property);
        if (oD.success) setSetupOverview(oD.overview);
        if (rD.success) {
          setRoomCategories(rD.categories || []);
          if (rD.categories?.length > 0) {
            const firstId = rD.categories[0].id;
            setSelectedRoomForImages(prev => (prev && rD.categories.some(c => c.id === prev) ? prev : firstId));
            setBulkInvForm(prev => ({ ...prev, room_type_id: prev.room_type_id || firstId }));
            setBlockForm(prev => ({ ...prev, room_type_id: prev.room_type_id || firstId }));
            setSeasonalForm(prev => ({ ...prev, room_type_id: prev.room_type_id || firstId }));
            setDailyRateForm(prev => ({ ...prev, room_type_id: prev.room_type_id || firstId }));
            setSimForm(prev => ({ ...prev, room_type_id: prev.room_type_id || firstId }));
            setKeyForm(prev => ({ ...prev, room_type_id: prev.room_type_id || firstId }));
            fetchRoomImages(selectedRoomForImages || firstId, activeId);
          }
        }
        if (fD.success) setFacilities(fD.facilities || []);
        if (polD.success) setPolicies(polD.policies || []);
        if (faqD.success) setFaqs(faqD.faqs || []);
        if (plD.success) {
          setRatePlans(plD.plans || []);
          if (plD.plans?.length > 0) {
            setSimForm(prev => ({ ...prev, rate_plan_id: plD.plans[0].id }));
          }
        }
        if (sD.success) setSeasonalRates(sD.rates || []);
        if (dD.success) setDailyRates(dD.rates || []);
        if (tD.success) setTaxRules(tD.taxRules || []);
        if (gD.success) setInventoryGrid(gD);
        if (bD.success) setInventoryBlocks(bD.blocks || []);
        if (kD.success) setPhysicalRooms(kD.rooms || []);
      }
    } catch (err) {
      console.warn('Hospitality data load error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPropertyId, gridStartDate, gridEndDate, getHeaders]);

  useEffect(() => {
    loadHospitalityData();
  }, [loadHospitalityData]);

  // Fetch Property Photo Gallery
  const fetchPropertyGallery = useCallback(async (propId) => {
    const activeProp = propId || selectedPropertyId || 1;
    try {
      const res = await fetch(`/api/v1/hospitality/properties/${activeProp}/gallery`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setPropertyGallery(data.property_gallery || []);
      }
    } catch (e) {
      console.warn('Error fetching property gallery:', e.message);
    }
  }, [selectedPropertyId, getHeaders]);

  // Fetch Room Images for selected category
  const fetchRoomImages = useCallback(async (roomId, propId) => {
    const activeProp = propId || selectedPropertyId || 1;
    if (!roomId) return;
    try {
      const res = await fetch(`/api/v1/hospitality/properties/${activeProp}/room-categories/${roomId}/images`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setRoomImages(data.images || []);
      }
    } catch (e) {
      console.warn('Error fetching room images:', e.message);
    }
  }, [selectedPropertyId, getHeaders]);

  const handleSelectRoomForImages = (roomId) => {
    setSelectedRoomForImages(roomId);
    fetchRoomImages(roomId, selectedPropertyId);
  };

  useEffect(() => {
    if (activeSubTab === 'images') {
      fetchPropertyGallery(selectedPropertyId);
      const targetRoomId = selectedRoomForImages || (roomCategories.length > 0 ? roomCategories[0].id : null);
      if (targetRoomId) {
        if (!selectedRoomForImages) {
          setSelectedRoomForImages(targetRoomId);
        }
        fetchRoomImages(targetRoomId, selectedPropertyId);
      }
    }
  }, [activeSubTab, selectedRoomForImages, selectedPropertyId, roomCategories, fetchRoomImages, fetchPropertyGallery]);

  // -------------------------------------------------------------------------
  // PUBLICATION LIFECYCLE
  // -------------------------------------------------------------------------
  const handleTogglePublication = async (action) => {
    setSaving(true);
    try {
      const endpoint = action === 'publish'
        ? `/api/v1/hospitality/properties/${selectedPropertyId}/publish`
        : `/api/v1/hospitality/properties/${selectedPropertyId}/unpublish`;

      const res = await fetch(endpoint, { method: 'POST', headers: getHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Operation failed');

      showNotification(`Property configuration successfully ${action === 'publish' ? 'PUBLISHED to customer chat!' : 'UNPUBLISHED (Draft mode).'}`);
      loadHospitalityData();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // PROPERTY SETUP SAVE
  // -------------------------------------------------------------------------
  const handleSavePropertyDetails = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/hospitality/properties/${selectedPropertyId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(currentProperty)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to save property');

      showNotification('Property information saved successfully.');
      loadHospitalityData();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // ROOM CATEGORY CRUD
  // -------------------------------------------------------------------------
  const handleSaveRoomCategory = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const isEdit = Boolean(editingRoom);
      const url = isEdit
        ? `/api/v1/hospitality/properties/${selectedPropertyId}/room-categories/${editingRoom.id}`
        : `/api/v1/hospitality/properties/${selectedPropertyId}/room-categories`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(roomForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to save category');

      showNotification(`Room category ${isEdit ? 'updated' : 'created'} successfully.`);
      setShowRoomModal(false);
      setEditingRoom(null);
      loadHospitalityData();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEditRoom = (cat) => {
    setEditingRoom(cat);
    setRoomForm({
      name: cat.name || '',
      room_code: cat.room_code || '',
      description: cat.description || '',
      room_size: cat.room_size || 350,
      size_unit: cat.size_unit || 'sq_ft',
      bed_type: cat.bed_type || '1 King Bed',
      bed_count: cat.bed_count || 1,
      standard_occupancy: cat.standard_occupancy || 2,
      max_occupancy: cat.max_occupancy || 3,
      extra_adult_capacity: cat.extra_adult_capacity || 1,
      extra_child_capacity: cat.extra_child_capacity || 1,
      extra_adult_price: cat.extra_adult_price || 1200,
      extra_child_price: cat.extra_child_price || 600,
      bathroom_count: cat.bathroom_count || 1,
      view_type: cat.view_type || 'Sea View',
      smoking_policy: cat.smoking_policy || 'NON_SMOKING',
      accessibility_info: cat.accessibility_info || '',
      amenities: Array.isArray(cat.amenities) ? cat.amenities : ['Wi-Fi', 'Air Conditioning'],
      base_rate: cat.base_rate || 4500,
      status: cat.status || 'ACTIVE'
    });
    setShowRoomModal(true);
  };

  const handleArchiveRoom = async (roomId) => {
    if (!confirm('Are you sure you want to archive this room category?')) return;
    try {
      const res = await fetch(`/api/v1/hospitality/properties/${selectedPropertyId}/room-categories/${roomId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to archive');
      showNotification('Room category archived.');
      loadHospitalityData();
    } catch (e) {
      showNotification(e.message, 'error');
    }
  };

  // -------------------------------------------------------------------------
  // ROOM PHOTOGRAPHS UPLOAD & MANAGEMENT
  // -------------------------------------------------------------------------
  const handleUploadImage = async (e) => {
    e.preventDefault();
    const activeRoomId = selectedRoomForImages || (roomCategories.length > 0 ? roomCategories[0].id : null);
    const activePropId = selectedPropertyId || (properties.length > 0 ? properties[0].id : 1);
    if (!activeRoomId) {
      showNotification('Please choose a room category first.', 'error');
      return;
    }
    setSaving(true);
    try {
      let res;
      if (imageUploadFile) {
        const formData = new FormData();
        formData.append('image', imageUploadFile);
        formData.append('caption', imageCaption || '');
        formData.append('alt_text', imageAltText || '');
        formData.append('is_primary', imageIsPrimary ? 'true' : 'false');

        const tokenVal = token || localStorage.getItem('token');
        res = await fetch(`/api/v1/hospitality/properties/${activePropId}/room-categories/${activeRoomId}/images`, {
          method: 'POST',
          headers: { Authorization: tokenVal ? `Bearer ${tokenVal}` : '' },
          body: formData
        });
      } else if (imageUploadUrl && imageUploadUrl.trim()) {
        res = await fetch(`/api/v1/hospitality/properties/${activePropId}/room-categories/${activeRoomId}/images`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            image_url: imageUploadUrl.trim(),
            caption: imageCaption || '',
            alt_text: imageAltText || '',
            is_primary: imageIsPrimary
          })
        });
      } else {
        throw new Error('Please select an image file or enter an image URL.');
      }

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Image upload failed');

      showNotification('Photo uploaded successfully.');
      setShowImageUploadModal(false);
      setImageUploadFile(null);
      setImageUploadUrl('');
      setImageCaption('');
      setImageAltText('');
      setImageIsPrimary(false);
      fetchRoomImages(activeRoomId, activePropId);
      loadHospitalityData();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSetPrimaryImage = async (imgId) => {
    try {
      const activeRoomId = selectedRoomForImages || (roomCategories.length > 0 ? roomCategories[0].id : null);
      const activePropId = selectedPropertyId || (properties.length > 0 ? properties[0].id : 1);
      if (!activeRoomId) return;

      const res = await fetch(`/api/v1/hospitality/properties/${activePropId}/room-categories/${activeRoomId}/images/${imgId}/primary`, {
        method: 'PUT',
        headers: getHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to set primary image');
      showNotification('Primary image set.');
      fetchRoomImages(activeRoomId, activePropId);
      loadHospitalityData();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  const handleDeleteImage = async (imgId) => {
    if (!confirm('Are you sure you want to delete this photo?')) return;
    try {
      const activeRoomId = selectedRoomForImages || (roomCategories.length > 0 ? roomCategories[0].id : null);
      const activePropId = selectedPropertyId || (properties.length > 0 ? properties[0].id : 1);
      if (!activeRoomId) return;

      const res = await fetch(`/api/v1/hospitality/properties/${activePropId}/room-categories/${activeRoomId}/images/${imgId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delete photo');
      showNotification('Photo deleted.');
      fetchRoomImages(activeRoomId, activePropId);
      loadHospitalityData();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // Property Photo Gallery Handlers
  const handleUploadPropertyImage = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const activePropId = selectedPropertyId || (properties.length > 0 ? properties[0].id : 1);
      let res;
      if (imageUploadFile) {
        const formData = new FormData();
        formData.append('image', imageUploadFile);
        formData.append('caption', imageCaption || '');
        formData.append('category', imageCategory || 'Resort & Amenities');
        formData.append('alt_text', imageAltText || '');
        formData.append('is_primary', imageIsPrimary ? 'true' : 'false');

        const tokenVal = token || localStorage.getItem('token');
        res = await fetch(`/api/v1/hospitality/properties/${activePropId}/gallery`, {
          method: 'POST',
          headers: { Authorization: tokenVal ? `Bearer ${tokenVal}` : '' },
          body: formData
        });
      } else if (imageUploadUrl && imageUploadUrl.trim()) {
        res = await fetch(`/api/v1/hospitality/properties/${activePropId}/gallery`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            image_url: imageUploadUrl.trim(),
            caption: imageCaption || '',
            category: imageCategory || 'Resort & Amenities',
            alt_text: imageAltText || '',
            is_primary: imageIsPrimary
          })
        });
      } else {
        throw new Error('Please select an image file or enter an image URL.');
      }

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Property photo upload failed');

      showNotification('Property photo added to gallery successfully.');
      setShowImageUploadModal(false);
      setImageUploadFile(null);
      setImageUploadUrl('');
      setImageCaption('');
      setImageAltText('');
      setImageIsPrimary(false);
      fetchPropertyGallery(activePropId);
      loadHospitalityData();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSetPrimaryPropertyCover = async (imgId) => {
    try {
      const activePropId = selectedPropertyId || (properties.length > 0 ? properties[0].id : 1);
      const res = await fetch(`/api/v1/hospitality/properties/${activePropId}/gallery/${imgId}/primary`, {
        method: 'PUT',
        headers: getHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update primary cover photo');
      showNotification('Primary property cover photo updated.');
      fetchPropertyGallery(activePropId);
      loadHospitalityData();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  const handleDeletePropertyImage = async (imgId) => {
    if (!confirm('Are you sure you want to remove this photograph from property gallery?')) return;
    try {
      const activePropId = selectedPropertyId || (properties.length > 0 ? properties[0].id : 1);
      const res = await fetch(`/api/v1/hospitality/properties/${activePropId}/gallery/${imgId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delete photo');
      showNotification('Photo removed from property gallery.');
      fetchPropertyGallery(activePropId);
      loadHospitalityData();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // -------------------------------------------------------------------------
  // PHYSICAL ROOM UNITS (KEYS)
  // -------------------------------------------------------------------------
  const handleCreatePhysicalRoom = async (e) => {
    e.preventDefault();
    if (!keyForm.room_number) return;
    setSaving(true);
    try {
      const categoryId = Number(keyForm.room_type_id) || (roomCategories[0]?.id || 1);
      const res = await fetch(`/api/v1/hospitality/properties/${selectedPropertyId}/physical-rooms`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          room_type_id: categoryId,
          room_number: keyForm.room_number,
          floor_or_building: keyForm.floor_or_building || 'Floor 1',
          operational_status: keyForm.operational_status || 'OPERATIONAL',
          notes: keyForm.notes || ''
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to add room key');

      showNotification(`Room Unit ${keyForm.room_number} added successfully.`);
      setShowKeyModal(false);
      setKeyForm({
        room_number: '',
        room_type_id: roomCategories[0]?.id || '',
        floor_or_building: 'Floor 1',
        operational_status: 'OPERATIONAL',
        notes: ''
      });
      loadHospitalityData();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePhysicalRoom = async (roomId, roomNumber) => {
    if (!confirm(`Are you sure you want to delete Room Unit ${roomNumber}?`)) return;
    try {
      const res = await fetch(`/api/v1/hospitality/properties/${selectedPropertyId}/physical-rooms/${roomId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delete room');
      showNotification(`Room ${roomNumber} deleted.`);
      loadHospitalityData();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // -------------------------------------------------------------------------
  // INVENTORY GRID & BULK CONTROLS
  // -------------------------------------------------------------------------
  const handleBulkUpdateInventory = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/hospitality/properties/${selectedPropertyId}/inventory/bulk-update`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          room_type_id: bulkInvForm.room_type_id,
          start_date: bulkInvForm.start_date,
          end_date: bulkInvForm.end_date,
          updates: {
            total_rooms: Number(bulkInvForm.total_rooms),
            blocked_qty: Number(bulkInvForm.blocked_qty),
            out_of_service_qty: Number(bulkInvForm.out_of_service_qty),
            is_closed: bulkInvForm.is_closed,
            base_rate: Number(bulkInvForm.base_rate)
          }
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Bulk inventory update failed');

      showNotification(`Inventory updated across ${data.days_updated} days.`);
      setShowBulkInventoryModal(false);
      loadHospitalityData();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBlock = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/hospitality/properties/${selectedPropertyId}/inventory/blocks`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(blockForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to place inventory block');

      showNotification('Inventory block placed.');
      setShowBlockModal(false);
      loadHospitalityData();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReleaseBlock = async (blockId) => {
    try {
      const res = await fetch(`/api/v1/hospitality/properties/${selectedPropertyId}/inventory/blocks/${blockId}/release`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to release block');

      showNotification('Inventory block released to sellable inventory.');
      loadHospitalityData();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // -------------------------------------------------------------------------
  // RATE PLANS & SEASONAL RATES
  // -------------------------------------------------------------------------
  const handleSaveRatePlan = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/hospitality/properties/${selectedPropertyId}/rate-plans`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(ratePlanForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to save rate plan');

      showNotification('Rate plan created successfully.');
      setShowRatePlanModal(false);
      loadHospitalityData();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSeasonalRate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/hospitality/properties/${selectedPropertyId}/seasonal-rates`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(seasonalForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to save seasonal rate');

      showNotification('Seasonal rate rule active.');
      setShowSeasonalModal(false);
      loadHospitalityData();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDailyRate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/hospitality/properties/${selectedPropertyId}/daily-rates`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(dailyRateForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to save daily override');

      showNotification('Daily pricing override saved.');
      setShowDailyRateModal(false);
      loadHospitalityData();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // SIMULATOR QUOTE GENERATOR
  // -------------------------------------------------------------------------
  const handleRunSimulation = async (e) => {
    e?.preventDefault();
    setSimLoading(true);
    try {
      const res = await fetch(`/api/v1/hospitality/properties/${selectedPropertyId}/quote`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(simForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Quote calculation failed');
      setSimQuote(data.quote);
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setSimLoading(false);
    }
  };

  const handleCopyQuoteForWhatsApp = () => {
    if (!simQuote) return;
    let text = `🧾 *Estimated Price Quote*\n_Ref: ${simQuote.quote_id}_\n\n`;
    text += `🏨 *Property*: ${simQuote.property.name}\n`;
    text += `🛏️ *Room*: ${simQuote.room_category.name} (${simQuote.reservation_specs.rooms} room(s))\n`;
    text += `🍽️ *Plan*: ${simQuote.rate_plan.name} (${simQuote.rate_plan.code})\n`;
    text += `📅 *Dates*: ${simQuote.reservation_specs.check_in} to ${simQuote.reservation_specs.check_out} (${simQuote.reservation_specs.nights} night(s))\n`;
    text += `👥 *Guests*: ${simQuote.reservation_specs.adults} Adults${simQuote.reservation_specs.children ? `, ${simQuote.reservation_specs.children} Children` : ''}\n\n`;
    text += `💵 *Price Breakdown*:\n`;
    text += `• Room Charges: ₹${simQuote.pricing_summary.base_room_charges.toLocaleString('en-IN')}\n`;
    if (simQuote.pricing_summary.extra_guest_charges > 0) {
      text += `• Extra Guests: ₹${simQuote.pricing_summary.extra_guest_charges.toLocaleString('en-IN')}\n`;
    }
    text += `• Subtotal: ₹${simQuote.pricing_summary.subtotal_before_tax.toLocaleString('en-IN')}\n`;
    text += `• ${simQuote.pricing_summary.taxes.tax_name}: ₹${simQuote.pricing_summary.taxes.total_tax.toLocaleString('en-IN')}\n`;
    text += `💰 *Estimated Total*: *₹${simQuote.pricing_summary.estimated_grand_total.toLocaleString('en-IN')}*\n\n`;
    text += `📌 *Notice*: _${simQuote.disclaimer}_\n`;

    navigator.clipboard.writeText(text);
    showNotification('WhatsApp quotation text copied to clipboard!');
  };

  return (
    <div className="page-content" style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '1.5rem',
          right: '1.5rem',
          zIndex: 9999,
          backgroundColor: toast.type === 'error' ? '#ef4444' : 'var(--sarvya-blue)',
          color: '#ffffff',
          padding: '0.75rem 1.25rem',
          borderRadius: '0.5rem',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontWeight: 500,
          fontSize: '0.875rem'
        }}>
          {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Page Header with Multi-Property Selector and Status Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Hospitality Inventory & Rate Management
            </h1>
            {currentProperty?.publication_status === 'PUBLISHED' ? (
              <Badge variant="success" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Check size={12} /> Published (Chat Live)
              </Badge>
            ) : (
              <Badge variant="warning" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Clock size={12} /> Draft (Internal Only)
              </Badge>
            )}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
            Authoritative source of truth for rooms, photo galleries, facilities, sellable inventory, pricing rules, and chat responses.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Property Dropdown Selector */}
          {properties.length > 1 && (
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(Number(e.target.value))}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '0.875rem'
              }}
            >
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.property_type})</option>
              ))}
            </select>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={loadHospitalityData}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>

          {currentProperty?.publication_status === 'PUBLISHED' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTogglePublication('unpublish')}
              disabled={saving}
            >
              Unpublish to Draft
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleTogglePublication('publish')}
              disabled={saving}
              style={{ backgroundColor: 'var(--sarvya-blue)', borderColor: 'var(--sarvya-blue)' }}
            >
              <CheckCircle2 size={14} />
              Publish Configuration
            </Button>
          )}
        </div>
      </div>

      {/* Navigation Pills Bar */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        overflowX: 'auto',
        paddingBottom: '0.5rem',
        marginBottom: '1.5rem',
        borderBottom: '1px solid var(--border-color)'
      }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.875rem',
                borderRadius: '0.5rem',
                fontSize: '0.85rem',
                fontWeight: isActive ? 600 : 500,
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                backgroundColor: isActive ? 'var(--brand-primary, var(--sarvya-blue))' : 'transparent',
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* TAB 1: OVERVIEW & SETUP STATUS */}
      {/* ----------------------------------------------------------------- */}
      {activeSubTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Top KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <KpiCard
              label="Completeness Readiness"
              value={`${setupOverview?.completeness_score || 0}%`}
              meta={setupOverview?.ready_for_publication ? 'Ready for Customer Chat' : 'Setup incomplete'}
              icon={ShieldCheck}
              accentTone="green"
            />
            <KpiCard
              label="Room Categories"
              value={roomCategories.length}
              meta="Configured room types"
              icon={BedDouble}
              accentTone="blue"
            />
            <KpiCard
              label="Rate Plans"
              value={ratePlans.length}
              meta="Meal & cancellation plans"
              icon={Utensils}
              accentTone="taupe"
            />
            <KpiCard
              label="Resort Facilities"
              value={facilities.length}
              meta="Published amenities"
              icon={Sparkles}
              accentTone="purple"
            />
          </div>

          {/* Setup Checklist and Publishing Summary */}
          <Card>
            <CardHeader title="Configuration Checklist & Go-Live Readiness" />
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                {setupOverview?.checks && Object.entries(setupOverview.checks).map(([key, item]) => (
                  <div
                    key={key}
                    style={{
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      border: `1px solid ${item.passed ? '#a7f3d0' : '#fed7aa'}`,
                      backgroundColor: item.passed ? '#f0fdf4' : '#fffbeb',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.75rem'
                    }}
                  >
                    {item.passed ? (
                      <CheckCircle2 size={20} color="var(--sarvya-blue)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    ) : (
                      <AlertCircle size={20} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                    )}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1f2937' }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#4b5563', marginTop: '0.2rem' }}>
                        {item.passed ? 'Configured and validated' : 'Requires attention or configuration'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 600, color: '#111827' }}>
                  Conversational Customer Protection Notice:
                </h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.5 }}>
                  The SARVYA customer chat and messaging engine serves as an authoritative source of truth for property details, rooms, photo galleries, amenities, and price estimations. In compliance with hospitality domain standards, customer quotations generated via WhatsApp or Web Chat are informational estimates (subject to reservations staff confirmation) and do not directly lock inventory or charge cards.
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TAB 2: PROPERTY SETUP */}
      {/* ----------------------------------------------------------------- */}
      {activeSubTab === 'property' && currentProperty && (
        <Card>
          <CardHeader title={`Property Details: ${currentProperty.name}`} />
          <CardBody>
            <form onSubmit={handleSavePropertyDetails} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Property Name *</label>
                  <input
                    type="text"
                    required
                    value={currentProperty.name || ''}
                    onChange={(e) => setCurrentProperty({ ...currentProperty, name: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Property Type</label>
                  <select
                    value={currentProperty.property_type || 'RESORT'}
                    onChange={(e) => setCurrentProperty({ ...currentProperty, property_type: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                  >
                    <option value="RESORT">Resort</option>
                    <option value="HOTEL">Hotel</option>
                    <option value="VILLA">Private Villa</option>
                    <option value="HOMESTAY">Homestay</option>
                    <option value="GUESTHOUSE">Guesthouse</option>
                    <option value="SERVICED_APARTMENT">Serviced Apartment</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Currency</label>
                  <input
                    type="text"
                    value={currentProperty.currency || 'INR'}
                    onChange={(e) => setCurrentProperty({ ...currentProperty, currency: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Customer-Facing Description</label>
                <textarea
                  rows={3}
                  value={currentProperty.description || ''}
                  onChange={(e) => setCurrentProperty({ ...currentProperty, description: e.target.value })}
                  placeholder="Describe your property for guests on WhatsApp and web chat..."
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>

              {/* Contact and Timings */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Reservations Phone</label>
                  <input
                    type="text"
                    value={currentProperty.phone || ''}
                    onChange={(e) => setCurrentProperty({ ...currentProperty, phone: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Reservations Email</label>
                  <input
                    type="email"
                    value={currentProperty.email || ''}
                    onChange={(e) => setCurrentProperty({ ...currentProperty, email: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Check-In Time</label>
                  <input
                    type="text"
                    value={currentProperty.check_in_time || '14:00'}
                    onChange={(e) => setCurrentProperty({ ...currentProperty, check_in_time: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Check-Out Time</label>
                  <input
                    type="text"
                    value={currentProperty.check_out_time || '11:00'}
                    onChange={(e) => setCurrentProperty({ ...currentProperty, check_out_time: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              {/* Address */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Address Line</label>
                  <input
                    type="text"
                    value={currentProperty.address || ''}
                    onChange={(e) => setCurrentProperty({ ...currentProperty, address: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>District / City</label>
                  <input
                    type="text"
                    value={currentProperty.district || ''}
                    onChange={(e) => setCurrentProperty({ ...currentProperty, district: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>State</label>
                  <input
                    type="text"
                    value={currentProperty.state || ''}
                    onChange={(e) => setCurrentProperty({ ...currentProperty, state: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Postal Code</label>
                  <input
                    type="text"
                    value={currentProperty.postal_code || ''}
                    onChange={(e) => setCurrentProperty({ ...currentProperty, postal_code: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              {/* Imagery URLs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Logo Image URL</label>
                  <input
                    type="text"
                    value={currentProperty.logo_url || ''}
                    onChange={(e) => setCurrentProperty({ ...currentProperty, logo_url: e.target.value })}
                    placeholder="/uploads/logo.png or https://..."
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Cover Image URL</label>
                  <input
                    type="text"
                    value={currentProperty.cover_image_url || ''}
                    onChange={(e) => setCurrentProperty({ ...currentProperty, cover_image_url: e.target.value })}
                    placeholder="/uploads/cover.jpg or https://..."
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              {/* Property Photo Gallery Callout */}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#EDF4E6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2F5219' }}>
                    <ImageIcon size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#171719' }}>
                      Property Photo Gallery ({propertyGallery.length} Photos)
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#67676B' }}>
                      Manage resort grounds, pool, dining, and villa photos visible to guests in chat.
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActiveSubTab('images');
                    setGalleryScope('property');
                  }}
                >
                  <Eye size={14} /> Manage Photo Gallery
                </Button>
              </div>

              <div>
                <Button variant="primary" type="submit" disabled={saving}>
                  <Save size={16} />
                  Save Property Information
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TAB 3: ROOM CATEGORIES */}
      {/* ----------------------------------------------------------------- */}
      {activeSubTab === 'rooms' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Room Categories ({roomCategories.length})</h3>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditingRoom(null);
                setRoomForm({
                  name: '',
                  room_code: '',
                  description: '',
                  room_size: 350,
                  size_unit: 'sq_ft',
                  bed_type: '1 King Bed',
                  bed_count: 1,
                  standard_occupancy: 2,
                  max_occupancy: 3,
                  extra_adult_capacity: 1,
                  extra_child_capacity: 1,
                  extra_adult_price: 1200,
                  extra_child_price: 600,
                  bathroom_count: 1,
                  view_type: 'Sea View',
                  smoking_policy: 'NON_SMOKING',
                  accessibility_info: '',
                  amenities: ['Wi-Fi', 'Air Conditioning', 'En-suite Bathroom', 'Balcony / Patio'],
                  base_rate: 4500,
                  status: 'ACTIVE'
                });
                setShowRoomModal(true);
              }}
            >
              <Plus size={16} /> Add Room Category
            </Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {roomCategories.map(cat => (
              <Card key={cat.id} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'relative', height: '180px', backgroundColor: '#e5e7eb', overflow: 'hidden' }}>
                  {cat.primary_image_url ? (
                    <img
                      src={cat.primary_image_url}
                      alt={cat.name}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=600&q=80';
                      }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                      <ImageIcon size={48} />
                    </div>
                  )}
                  <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem' }}>
                    <Badge variant={cat.status === 'ACTIVE' ? 'success' : 'secondary'}>
                      {cat.status}
                    </Badge>
                  </div>
                  <div style={{ position: 'absolute', bottom: '0.75rem', left: '0.75rem', backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.8rem', fontWeight: 600 }}>
                    ₹{Number(cat.base_rate).toLocaleString('en-IN')}/night
                  </div>
                </div>

                <CardBody style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem', fontWeight: 600 }}>{cat.name}</h4>
                    {cat.room_code && <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Code: {cat.room_code}</span>}
                    <p style={{ fontSize: '0.85rem', color: '#4b5563', margin: '0.5rem 0', lineClamp: 2 }}>{cat.description || 'No description provided.'}</p>

                    <div style={{ fontSize: '0.8rem', color: '#6b7280', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', margin: '0.5rem 0' }}>
                      <div>📐 {cat.room_size} {cat.size_unit}</div>
                      <div>🛏️ {cat.bed_type}</div>
                      <div>👥 {cat.standard_occupancy} Std / {cat.max_occupancy} Max</div>
                      <div>🌅 {cat.view_type || 'Garden View'}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Button variant="outline" size="sm" onClick={() => handleOpenEditRoom(cat)}>
                        Edit Specs
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedRoomForImages(cat.id);
                          fetchRoomImages(cat.id, selectedPropertyId);
                          setActiveSubTab('images');
                        }}
                      >
                        <ImageIcon size={14} /> Photos ({cat.images_count || 0})
                      </Button>
                    </div>
                    <Button variant="danger" size="sm" onClick={() => handleArchiveRoom(cat.id)}>
                      Archive
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TAB 4: PROPERTY & ROOM PHOTO GALLERIES */}
      {/* ----------------------------------------------------------------- */}
      {activeSubTab === 'images' && (
        <Card>
          <CardHeader
            title="Property & Room Photo Galleries"
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowChatGalleryPreview(true)}
                  title="Preview how guests see this photo gallery in the customer web chat"
                >
                  <Eye size={14} /> Preview Customer Chat Gallery
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setImageUploadFile(null);
                    setImageUploadUrl('');
                    setImageCaption('');
                    setImageAltText('');
                    setImageIsPrimary(false);
                    setImageCategory('Resort & Amenities');
                    setShowImageUploadModal(true);
                  }}
                >
                  <Upload size={14} /> {galleryScope === 'property' ? 'Add Property Photo' : 'Upload Room Photo'}
                </Button>
              </div>
            }
          />
          <CardBody>
            {/* Scope Toggle: Property & Resort Gallery vs Room Category Galleries */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
              marginBottom: '1.5rem',
              paddingBottom: '1rem',
              borderBottom: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', gap: '6px', background: '#F5F5F6', padding: '4px', borderRadius: '8px', border: '1px solid #E5E5E8' }}>
                <button
                  type="button"
                  onClick={() => setGalleryScope('property')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: galleryScope === 'property' ? '1px solid #C3D1AC' : '1px solid transparent',
                    background: galleryScope === 'property' ? '#FFFFFF' : 'transparent',
                    color: galleryScope === 'property' ? '#2F5219' : '#67676B',
                    fontWeight: galleryScope === 'property' ? 700 : 500,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    boxShadow: galleryScope === 'property' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Building2 size={15} />
                  <span>Property & Resort Gallery</span>
                  <span style={{
                    fontSize: '0.7rem',
                    background: galleryScope === 'property' ? '#EDF4E6' : '#E5E5E8',
                    color: galleryScope === 'property' ? '#2F5219' : '#67676B',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    fontWeight: 700
                  }}>
                    {propertyGallery.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setGalleryScope('rooms')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: galleryScope === 'rooms' ? '1px solid #C3D1AC' : '1px solid transparent',
                    background: galleryScope === 'rooms' ? '#FFFFFF' : 'transparent',
                    color: galleryScope === 'rooms' ? '#2F5219' : '#67676B',
                    fontWeight: galleryScope === 'rooms' ? 700 : 500,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    boxShadow: galleryScope === 'rooms' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <BedDouble size={15} />
                  <span>Room Categories</span>
                  <span style={{
                    fontSize: '0.7rem',
                    background: galleryScope === 'rooms' ? '#EDF4E6' : '#E5E5E8',
                    color: galleryScope === 'rooms' ? '#2F5219' : '#67676B',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    fontWeight: 700
                  }}>
                    {roomCategories.length}
                  </span>
                </button>
              </div>

              {/* Scope specific secondary filter */}
              {galleryScope === 'rooms' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Category:</span>
                  <select
                    value={selectedRoomForImages || (roomCategories.length > 0 ? roomCategories[0].id : '')}
                    onChange={(e) => handleSelectRoomForImages(Number(e.target.value))}
                    style={{ padding: '0.45rem 0.85rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)', fontSize: '0.85rem', fontWeight: 600 }}
                  >
                    {roomCategories.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {['ALL', 'Beachfront & Exterior', 'Pool & Recreation', 'Dining & Restaurant', 'Gardens & Campus', 'Resort & Amenities'].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setGalleryCategoryFilter(cat)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: galleryCategoryFilter === cat ? '1px solid #C3D1AC' : '1px solid #E5E5E8',
                        background: galleryCategoryFilter === cat ? '#EDF4E6' : '#F5F5F6',
                        color: galleryCategoryFilter === cat ? '#2F5219' : '#67676B',
                        fontSize: '0.75rem',
                        fontWeight: galleryCategoryFilter === cat ? 700 : 500,
                        cursor: 'pointer'
                      }}
                    >
                      {cat === 'ALL' ? `All (${propertyGallery.length})` : cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Scope 1: Property Gallery View */}
            {galleryScope === 'property' && (
              <div>
                <div style={{
                  background: '#F8FAF5',
                  border: '1px solid #D9E4CC',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}>
                  <div style={{ fontSize: '0.8rem', color: '#2F5219', lineHeight: 1.45 }}>
                    🌴 <strong>Property & Resort Photos</strong> showcase your resort exterior, grounds, swimming pool, beachfront, and dining. Guests can view this gallery directly in chat links by tapping <em>"View Images of the Property"</em>.
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2F5219', whiteSpace: 'nowrap' }}>
                    {propertyGallery.length} Photos in Gallery
                  </span>
                </div>

                {propertyGallery.filter(img => galleryCategoryFilter === 'ALL' || img.category === galleryCategoryFilter).length === 0 ? (
                  <EmptyState
                    icon={<ImageIcon size={48} />}
                    title="No property photographs in this category"
                    description="Upload high-resolution property photos for your resort grounds, swimming pool, beachfront, and restaurant."
                    action={
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setImageUploadFile(null);
                          setImageUploadUrl('');
                          setImageCaption('');
                          setImageAltText('');
                          setImageIsPrimary(false);
                          setImageCategory(galleryCategoryFilter !== 'ALL' ? galleryCategoryFilter : 'Resort & Amenities');
                          setShowImageUploadModal(true);
                        }}
                      >
                        <Plus size={14} /> Add First Property Photo
                      </Button>
                    }
                  />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.25rem' }}>
                    {propertyGallery
                      .filter(img => galleryCategoryFilter === 'ALL' || img.category === galleryCategoryFilter)
                      .map((img, idx) => (
                        <div
                          key={img.id || idx}
                          style={{
                            border: img.is_primary ? '2px solid #2876B8' : '1px solid var(--border-color)',
                            borderRadius: '0.5rem',
                            overflow: 'hidden',
                            backgroundColor: 'var(--bg-surface)',
                            position: 'relative',
                            boxShadow: 'var(--shadow-xs)',
                            display: 'flex',
                            flexDirection: 'column'
                          }}
                        >
                          <div style={{ height: '170px', position: 'relative', overflow: 'hidden', backgroundColor: '#F1F5F9' }}>
                            <img
                              src={img.image_url}
                              alt={img.alt_text || img.caption || 'Property photo'}
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80';
                              }}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            {Boolean(img.is_primary) && (
                              <div style={{
                                position: 'absolute',
                                top: '0.5rem',
                                left: '0.5rem',
                                backgroundColor: '#2876B8',
                                color: '#fff',
                                fontSize: '0.725rem',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                              }}>
                                <Star size={11} fill="#fff" /> Primary Property Cover
                              </div>
                            )}
                            <div style={{
                              position: 'absolute',
                              bottom: '0.5rem',
                              right: '0.5rem',
                              backgroundColor: 'rgba(15, 23, 42, 0.72)',
                              color: '#fff',
                              fontSize: '0.675rem',
                              fontWeight: 600,
                              padding: '2px 7px',
                              borderRadius: '4px',
                              backdropFilter: 'blur(3px)'
                            }}>
                              {img.category || 'Resort & Amenities'}
                            </div>
                          </div>

                          <div style={{ padding: '0.85rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3px' }}>
                                {img.caption || 'Property Photograph'}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#67676B', marginBottom: '8px' }}>
                                Alt: {img.alt_text || img.caption || 'Resort grounds'}
                              </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid #E5E5E8' }}>
                              {!img.is_primary ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleSetPrimaryPropertyCover(img.id)}
                                  disabled={saving}
                                  title="Set as property cover image"
                                >
                                  Set Cover
                                </Button>
                              ) : (
                                <span style={{ fontSize: '0.725rem', color: '#2876B8', fontWeight: 700 }}>
                                  ✓ Cover Photo
                                </span>
                              )}
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeletePropertyImage(img.id)}
                                disabled={saving}
                              >
                                <Trash2 size={12} /> Delete
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Scope 2: Room Category Images View */}
            {galleryScope === 'rooms' && (
              <div>
                {roomImages.length === 0 ? (
                  <EmptyState
                    icon={<ImageIcon size={48} />}
                    title="No photographs added for this room category"
                    description="Upload high-resolution room photos so guests on WhatsApp and web chat can preview them."
                    action={
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setImageUploadFile(null);
                          setImageUploadUrl('');
                          setImageCaption('');
                          setImageAltText('');
                          setImageIsPrimary(false);
                          setShowImageUploadModal(true);
                        }}
                      >
                        <Plus size={14} /> Upload Room Photo
                      </Button>
                    }
                  />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.25rem' }}>
                    {roomImages.map(img => (
                      <div
                        key={img.id}
                        style={{
                          border: img.is_primary ? '2px solid #2876B8' : '1px solid var(--border-color)',
                          borderRadius: '0.5rem',
                          overflow: 'hidden',
                          backgroundColor: 'var(--bg-surface)',
                          position: 'relative',
                          boxShadow: 'var(--shadow-xs)',
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                      >
                        <div style={{ height: '170px', position: 'relative', overflow: 'hidden', backgroundColor: '#F1F5F9' }}>
                          <img
                            src={img.image_url}
                            alt={img.alt_text || 'Room photo'}
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=600&q=80';
                            }}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          {Boolean(img.is_primary) && (
                            <div style={{
                              position: 'absolute',
                              top: '0.5rem',
                              left: '0.5rem',
                              backgroundColor: '#2876B8',
                              color: '#fff',
                              fontSize: '0.725rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }}>
                              <Star size={11} fill="#fff" /> Primary Room Photo
                            </div>
                          )}
                        </div>
                        <div style={{ padding: '0.85rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3px' }}>
                              {img.caption || 'Room photo'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#67676B', marginBottom: '8px' }}>
                              Alt: {img.alt_text || 'Standard view'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid #E5E5E8' }}>
                            {!img.is_primary ? (
                              <Button variant="outline" size="sm" onClick={() => handleSetPrimaryImage(img.id)} disabled={saving}>
                                Set Primary
                              </Button>
                            ) : (
                              <span style={{ fontSize: '0.725rem', color: '#2876B8', fontWeight: 700 }}>
                                ✓ Primary Image
                              </span>
                            )}
                            <Button variant="danger" size="sm" onClick={() => handleDeleteImage(img.id)} disabled={saving}>
                              <Trash2 size={12} /> Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TAB 5: PHYSICAL ROOMS (KEYS) */}
      {/* ----------------------------------------------------------------- */}
      {activeSubTab === 'keys' && (
        <Card>
          <CardHeader
            title="Physical Room Units & Key Tracking"
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setKeyForm({
                    room_number: '',
                    room_type_id: roomCategories[0]?.id || '',
                    floor_or_building: 'Floor 1',
                    operational_status: 'OPERATIONAL',
                    notes: ''
                  });
                  setShowKeyModal(true);
                }}
              >
                <Plus size={14} /> Add Room Key
              </Button>
            }
          />
          <CardBody>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Track physical room door numbers, floors, and operational statuses (Maintenance, Out of Order, Operational).
              </p>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem' }}>Room Number</th>
                    <th style={{ padding: '0.75rem' }}>Category</th>
                    <th style={{ padding: '0.75rem' }}>Floor / Wing</th>
                    <th style={{ padding: '0.75rem' }}>Status</th>
                    <th style={{ padding: '0.75rem' }}>Notes</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {physicalRooms.map(rm => (
                    <tr key={rm.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 600 }}>{rm.room_number}</td>
                      <td style={{ padding: '0.75rem' }}>{rm.room_type_name || 'Category'}</td>
                      <td style={{ padding: '0.75rem' }}>{rm.floor_or_building || rm.floor || 'Floor 1'}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <Badge variant={rm.operational_status === 'OPERATIONAL' ? 'success' : rm.operational_status === 'MAINTENANCE' ? 'warning' : 'danger'}>
                          {rm.operational_status}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.75rem', color: '#6b7280' }}>{rm.notes || '—'}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <Button variant="danger" size="sm" onClick={() => handleDeletePhysicalRoom(rm.id, rm.room_number)}>
                          <Trash2 size={12} /> Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {physicalRooms.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
                        No individual physical room keys configured yet. Category-level pooled inventory is in effect.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TAB 6: INVENTORY CALENDAR & BLOCKS */}
      {/* ----------------------------------------------------------------- */}
      {activeSubTab === 'inventory' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Controls Bar */}
          <Card>
            <CardBody>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>From Date</label>
                    <input
                      type="date"
                      value={gridStartDate}
                      onChange={(e) => setGridStartDate(e.target.value)}
                      style={{ padding: '0.4rem 0.6rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>To Date</label>
                    <input
                      type="date"
                      value={gridEndDate}
                      onChange={(e) => setGridEndDate(e.target.value)}
                      style={{ padding: '0.4rem 0.6rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                    />
                  </div>
                  <Button variant="secondary" size="sm" onClick={loadHospitalityData} style={{ marginTop: '1rem' }}>
                    Filter Grid
                  </Button>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <Button variant="primary" size="sm" onClick={() => setShowBulkInventoryModal(true)}>
                    <ArrowUpDown size={14} /> Bulk Update Inventory
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowBlockModal(true)}>
                    <Lock size={14} /> Hold / Block Inventory
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Interactive Daily Inventory Matrix */}
          <Card>
            <CardHeader title="Authoritative Daily Availability Matrix" />
            <CardBody style={{ overflowX: 'auto', padding: '0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-subtle, #f9fafb)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left', minWidth: '160px', position: 'sticky', left: 0, backgroundColor: '#f9fafb', zIndex: 10 }}>
                      Category / Metric
                    </th>
                    {inventoryGrid?.dates?.map(d => (
                      <th key={d} style={{ padding: '0.5rem', textAlign: 'center', minWidth: '70px' }}>
                        <div>{new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short' })}</div>
                        <div style={{ fontWeight: 700 }}>{d.slice(5)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventoryGrid?.grid?.map(row => (
                    <React.Fragment key={row.room_type_id}>
                      <tr style={{ backgroundColor: '#f3f4f6', fontWeight: 600, borderTop: '2px solid var(--border-color)' }}>
                        <td colSpan={(inventoryGrid?.dates?.length || 0) + 1} style={{ padding: '0.5rem 0.75rem' }}>
                          🛏️ {row.room_type_name}
                        </td>
                      </tr>
                      {/* Sellable Inventory Row */}
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--sarvya-blue)', position: 'sticky', left: 0, backgroundColor: '#fff', zIndex: 9 }}>
                          Sellable Rooms
                        </td>
                        {inventoryGrid?.dates?.map(d => {
                          const cell = row.dates[d];
                          const sellable = cell?.sellable || 0;
                          return (
                            <td key={d} style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 700, backgroundColor: sellable === 0 ? '#fee2e2' : sellable <= 2 ? '#fef3c7' : '#ecfdf5', color: sellable === 0 ? '#b91c1c' : sellable <= 2 ? '#b45309' : '#047857' }}>
                              {cell?.is_closed ? 'CLOSED' : sellable}
                            </td>
                          );
                        })}
                      </tr>
                      {/* Total & Blocks */}
                      <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                        <td style={{ padding: '0.4rem 0.75rem', position: 'sticky', left: 0, backgroundColor: '#fff', zIndex: 9 }}>
                          Total / Blocked
                        </td>
                        {inventoryGrid?.dates?.map(d => {
                          const cell = row.dates[d];
                          return (
                            <td key={d} style={{ padding: '0.4rem', textAlign: 'center', fontSize: '0.75rem' }}>
                              {cell?.total || 5} / {cell?.blocked || 0}
                            </td>
                          );
                        })}
                      </tr>
                      {/* Base Rate */}
                      <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#4b5563' }}>
                        <td style={{ padding: '0.4rem 0.75rem', position: 'sticky', left: 0, backgroundColor: '#fff', zIndex: 9 }}>
                          Daily Rate (₹)
                        </td>
                        {inventoryGrid?.dates?.map(d => {
                          const cell = row.dates[d];
                          return (
                            <td key={d} style={{ padding: '0.4rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                              ₹{cell?.base_rate || row.base_rate}
                            </td>
                          );
                        })}
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          {/* Active Inventory Blocks List */}
          <Card>
            <CardHeader title="Active Inventory Hold Blocks (Maintenance, VIP, Closures)" />
            <CardBody>
              {inventoryBlocks.length === 0 ? (
                <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.85rem' }}>No active inventory blocks.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {inventoryBlocks.map(b => (
                    <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                          {b.room_type_name || 'Room'} — {b.blocked_qty} Room(s) Held
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                          📅 {b.start_date} to {b.end_date} | Reason: {b.reason || 'Manual hold'}
                        </div>
                      </div>
                      <div>
                        {b.status === 'ACTIVE' ? (
                          <Button variant="danger" size="sm" onClick={() => handleReleaseBlock(b.id)}>
                            <Unlock size={14} /> Release Block
                          </Button>
                        ) : (
                          <Badge variant="secondary">RELEASED</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TAB 7: RATE PLANS (MEAL PLANS) */}
      {/* ----------------------------------------------------------------- */}
      {activeSubTab === 'rate_plans' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Meal Plans & Rate Plans ({ratePlans.length})</h3>
            <Button variant="primary" size="sm" onClick={() => setShowRatePlanModal(true)}>
              <Plus size={16} /> Add Rate Plan
            </Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {ratePlans.map(plan => (
              <Card key={plan.id}>
                <CardHeader
                  title={`${plan.name} (${plan.code})`}
                  action={<Badge variant={plan.is_active ? 'success' : 'secondary'}>{plan.meal_plan}</Badge>}
                />
                <CardBody>
                  <p style={{ fontSize: '0.85rem', color: '#4b5563', margin: '0 0 0.75rem 0' }}>
                    {plan.description || 'No description provided.'}
                  </p>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    <strong>Cancellation:</strong> {plan.cancellation_policy || 'Property standard policy'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    <strong>Type:</strong> {plan.is_refundable ? 'Refundable Plan' : 'Non-Refundable Plan'}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TAB 8: SEASONAL RATES */}
      {/* ----------------------------------------------------------------- */}
      {activeSubTab === 'seasonal' && (
        <Card>
          <CardHeader
            title="Seasonal Pricing Rules"
            action={
              <Button variant="primary" size="sm" onClick={() => setShowSeasonalModal(true)}>
                <Plus size={16} /> Add Seasonal Rate
              </Button>
            }
          />
          <CardBody>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem' }}>Season Name</th>
                    <th style={{ padding: '0.75rem' }}>Room Category</th>
                    <th style={{ padding: '0.75rem' }}>Start Date</th>
                    <th style={{ padding: '0.75rem' }}>End Date</th>
                    <th style={{ padding: '0.75rem' }}>Nightly Price</th>
                    <th style={{ padding: '0.75rem' }}>Extra Adult</th>
                    <th style={{ padding: '0.75rem' }}>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonalRates.map(sr => (
                    <tr key={sr.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 600 }}>{sr.season_name}</td>
                      <td style={{ padding: '0.75rem' }}>{sr.room_type_name || 'All Categories'}</td>
                      <td style={{ padding: '0.75rem' }}>{sr.start_date}</td>
                      <td style={{ padding: '0.75rem' }}>{sr.end_date}</td>
                      <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--sarvya-blue)' }}>₹{Number(sr.price).toLocaleString('en-IN')}</td>
                      <td style={{ padding: '0.75rem' }}>₹{Number(sr.extra_adult_price || 0).toLocaleString('en-IN')}</td>
                      <td style={{ padding: '0.75rem' }}><Badge variant="secondary">Priority {sr.priority}</Badge></td>
                    </tr>
                  ))}
                  {seasonalRates.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
                        No seasonal rates configured. Standard base rate pricing applies.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TAB 9: DAILY OVERRIDES */}
      {/* ----------------------------------------------------------------- */}
      {activeSubTab === 'daily_rates' && (
        <Card>
          <CardHeader
            title="Specific Daily Rate Overrides"
            action={
              <Button variant="primary" size="sm" onClick={() => setShowDailyRateModal(true)}>
                <Plus size={16} /> Add Daily Override
              </Button>
            }
          />
          <CardBody>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem' }}>Date</th>
                    <th style={{ padding: '0.75rem' }}>Room Category</th>
                    <th style={{ padding: '0.75rem' }}>Override Price</th>
                    <th style={{ padding: '0.75rem' }}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRates.map(dr => (
                    <tr key={dr.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 600 }}>{dr.rate_date}</td>
                      <td style={{ padding: '0.75rem' }}>{dr.room_type_name}</td>
                      <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--sarvya-blue)' }}>₹{Number(dr.price).toLocaleString('en-IN')}</td>
                      <td style={{ padding: '0.75rem', color: '#6b7280' }}>{dr.reason || 'Manual override'}</td>
                    </tr>
                  ))}
                  {dailyRates.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
                        No daily rate overrides found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TAB 10: POLICIES & TAXES */}
      {/* ----------------------------------------------------------------- */}
      {activeSubTab === 'policies' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
          {/* Tax Slabs */}
          <Card>
            <CardHeader title="Indian GST Tax Rules" />
            <CardBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {taxRules.map(tax => (
                  <div key={tax.id} style={{ padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '0.375rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{tax.tax_name}</div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                        Slab: ₹{tax.min_slab_rate} - ₹{tax.max_slab_rate} / night
                      </div>
                    </div>
                    <Badge variant="primary">{tax.percentage}%</Badge>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Structured Policies */}
          <Card>
            <CardHeader title="Property Rules & Policies" />
            <CardBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {policies.map(pol => (
                  <div key={pol.id} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{pol.title || pol.policy_type}</div>
                    <div style={{ fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.4 }}>{pol.content}</div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TAB 11: FAQS */}
      {/* ----------------------------------------------------------------- */}
      {activeSubTab === 'faqs' && (
        <Card>
          <CardHeader
            title="Guest Knowledge Base FAQs (Chat Engine Grounding)"
            action={
              <Button variant="primary" size="sm" onClick={() => setShowFaqModal(true)}>
                <Plus size={16} /> Add FAQ
              </Button>
            }
          />
          <CardBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {faqs.map(faq => (
                <div key={faq.id} style={{ padding: '0.875rem', borderRadius: '0.375rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827', marginBottom: '0.25rem' }}>
                    Q: {faq.question}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.4 }}>
                    A: {faq.answer}
                  </div>
                  {faq.keywords && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                      Keywords: {faq.keywords}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TAB 12: LIVE QUOTE SIMULATOR */}
      {/* ----------------------------------------------------------------- */}
      {activeSubTab === 'simulator' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 400px) 1fr', gap: '1.5rem', alignItems: 'flex-start' }}>
          {/* Inputs Panel */}
          <Card>
            <CardHeader title="Simulate Customer Quote" />
            <CardBody>
              <form onSubmit={handleRunSimulation} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Room Category</label>
                  <select
                    value={simForm.room_type_id}
                    onChange={(e) => setSimForm({ ...simForm, room_type_id: Number(e.target.value) })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                  >
                    {roomCategories.map(r => (
                      <option key={r.id} value={r.id}>{r.name} (Base ₹{r.base_rate})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Rate Plan</label>
                  <select
                    value={simForm.rate_plan_id}
                    onChange={(e) => setSimForm({ ...simForm, rate_plan_id: Number(e.target.value) })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                  >
                    {ratePlans.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Check-In</label>
                    <input
                      type="date"
                      required
                      value={simForm.check_in}
                      onChange={(e) => setSimForm({ ...simForm, check_in: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Check-Out</label>
                    <input
                      type="date"
                      required
                      value={simForm.check_out}
                      onChange={(e) => setSimForm({ ...simForm, check_out: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Adults</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={simForm.adults}
                      onChange={(e) => setSimForm({ ...simForm, adults: Number(e.target.value) })}
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Children</label>
                    <input
                      type="number"
                      min={0}
                      max={6}
                      value={simForm.children}
                      onChange={(e) => setSimForm({ ...simForm, children: Number(e.target.value) })}
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Rooms</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={simForm.rooms}
                      onChange={(e) => setSimForm({ ...simForm, rooms: Number(e.target.value) })}
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                    />
                  </div>
                </div>

                <Button variant="primary" type="submit" disabled={simLoading} style={{ width: '100%', marginTop: '0.5rem' }}>
                  <Calculator size={16} /> Calculate Itemized Quote
                </Button>
              </form>
            </CardBody>
          </Card>

          {/* Quotation Result Card */}
          {simQuote ? (
            <Card>
              <CardHeader
                title={`Itemized Quotation (${simQuote.quote_id})`}
                action={
                  <Button variant="secondary" size="sm" onClick={handleCopyQuoteForWhatsApp}>
                    <Copy size={14} /> Copy for WhatsApp
                  </Button>
                }
              />
              <CardBody>
                {/* Availability Status Badge */}
                <div style={{ marginBottom: '1rem' }}>
                  <Badge variant={simQuote.availability.is_available ? 'success' : 'danger'}>
                    {simQuote.availability.status} ({simQuote.availability.min_sellable_rooms} sellable rooms available)
                  </Badge>
                </div>

                {/* Night-by-Night Breakdown Table */}
                <div style={{ overflowX: 'auto', marginBottom: '1.25rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '0.5rem' }}>Date</th>
                        <th style={{ padding: '0.5rem' }}>Rate Rule / Source</th>
                        <th style={{ padding: '0.5rem' }}>Room Rate</th>
                        <th style={{ padding: '0.5rem' }}>Extra Guests</th>
                        <th style={{ padding: '0.5rem' }}>Nightly Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simQuote.daily_breakdown.map(nbn => (
                        <tr key={nbn.date} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.5rem', fontWeight: 600 }}>{nbn.date}</td>
                          <td style={{ padding: '0.5rem', fontSize: '0.75rem' }}>
                            <Badge variant="secondary">{nbn.resolution_source}</Badge> {nbn.rule_details}
                          </td>
                          <td style={{ padding: '0.5rem' }}>₹{Number(nbn.room_charge).toLocaleString('en-IN')}</td>
                          <td style={{ padding: '0.5rem' }}>₹{Number(nbn.extra_adult_charge + nbn.extra_child_charge).toLocaleString('en-IN')}</td>
                          <td style={{ padding: '0.5rem', fontWeight: 600 }}>₹{Number(nbn.nightly_subtotal).toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pricing Summary Box */}
                <div style={{ backgroundColor: '#f9fafb', borderRadius: '0.5rem', padding: '1rem', border: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                    <span>Base Room Charges:</span>
                    <span style={{ fontWeight: 600 }}>₹{simQuote.pricing_summary.base_room_charges.toLocaleString('en-IN')}</span>
                  </div>
                  {simQuote.pricing_summary.extra_guest_charges > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                      <span>Extra Guest Charges:</span>
                      <span style={{ fontWeight: 600 }}>₹{simQuote.pricing_summary.extra_guest_charges.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                    <span>Subtotal Before Taxes:</span>
                    <span style={{ fontWeight: 600 }}>₹{simQuote.pricing_summary.subtotal_before_tax.toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', color: '#4b5563' }}>
                    <span>{simQuote.pricing_summary.taxes.tax_name} (CGST {simQuote.pricing_summary.taxes.cgst_rate}% + SGST {simQuote.pricing_summary.taxes.sgst_rate}%):</span>
                    <span>₹{simQuote.pricing_summary.taxes.total_tax.toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '2px solid #d1d5db', fontSize: '1.1rem', fontWeight: 700, color: 'var(--sarvya-blue)' }}>
                    <span>Estimated Total:</span>
                    <span>₹{simQuote.pricing_summary.estimated_grand_total.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Mandatory Disclaimer Box */}
                <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#fffbeb', border: '1px solid #fed7aa', borderRadius: '0.375rem', fontSize: '0.8rem', color: '#92400e', lineHeight: 1.4 }}>
                  <strong>Mandatory Customer Notice:</strong> {simQuote.disclaimer}
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <EmptyState
                  icon={<Calculator size={48} />}
                  title="Run a Quote Calculation"
                  description="Select check-in dates, room category, and guest counts to preview the authoritative pricing engine's calculation."
                />
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* MODAL: ADD / EDIT ROOM CATEGORY */}
      {/* ----------------------------------------------------------------- */}
      {showRoomModal && (
        <Modal
          title={editingRoom ? 'Edit Room Category' : 'Create Room Category'}
          isOpen={showRoomModal}
          onClose={() => setShowRoomModal(false)}
        >
          <form onSubmit={handleSaveRoomCategory} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>Category Name *</label>
                <input
                  type="text"
                  required
                  value={roomForm.name}
                  onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                  placeholder="e.g. Deluxe Sea View Villa"
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>Room Code</label>
                <input
                  type="text"
                  value={roomForm.room_code}
                  onChange={(e) => setRoomForm({ ...roomForm, room_code: e.target.value })}
                  placeholder="DSV"
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>Description</label>
              <textarea
                rows={2}
                value={roomForm.description}
                onChange={(e) => setRoomForm({ ...roomForm, description: e.target.value })}
                placeholder="Spacious coastal villa with private sun deck..."
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.2rem' }}>Base Price (₹) *</label>
                <input
                  type="number"
                  required
                  value={roomForm.base_rate}
                  onChange={(e) => setRoomForm({ ...roomForm, base_rate: Number(e.target.value) })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.2rem' }}>Size (sq ft)</label>
                <input
                  type="number"
                  value={roomForm.room_size}
                  onChange={(e) => setRoomForm({ ...roomForm, room_size: Number(e.target.value) })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.2rem' }}>Bedding</label>
                <input
                  type="text"
                  value={roomForm.bed_type}
                  onChange={(e) => setRoomForm({ ...roomForm, bed_type: e.target.value })}
                  placeholder="1 King Bed"
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.2rem' }}>Std Adults</label>
                <input
                  type="number"
                  min={1}
                  value={roomForm.standard_occupancy}
                  onChange={(e) => setRoomForm({ ...roomForm, standard_occupancy: Number(e.target.value) })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.2rem' }}>Max Guests</label>
                <input
                  type="number"
                  min={1}
                  value={roomForm.max_occupancy}
                  onChange={(e) => setRoomForm({ ...roomForm, max_occupancy: Number(e.target.value) })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.2rem' }}>Extra Adult (₹)</label>
                <input
                  type="number"
                  value={roomForm.extra_adult_price}
                  onChange={(e) => setRoomForm({ ...roomForm, extra_adult_price: Number(e.target.value) })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.2rem' }}>Extra Child (₹)</label>
                <input
                  type="number"
                  value={roomForm.extra_child_price}
                  onChange={(e) => setRoomForm({ ...roomForm, extra_child_price: Number(e.target.value) })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.2rem' }}>View Type</label>
                <input
                  type="text"
                  value={roomForm.view_type}
                  onChange={(e) => setRoomForm({ ...roomForm, view_type: e.target.value })}
                  placeholder="Sea View, Garden View..."
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.2rem' }}>Smoking Policy</label>
                <select
                  value={roomForm.smoking_policy}
                  onChange={(e) => setRoomForm({ ...roomForm, smoking_policy: e.target.value })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                >
                  <option value="NON_SMOKING">Non-Smoking</option>
                  <option value="SMOKING">Smoking Allowed</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <Button variant="outline" type="button" onClick={() => setShowRoomModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={saving}>Save Room Category</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* MODAL: IMAGE UPLOAD (PROPERTY & ROOM SCOPES) */}
      {/* ----------------------------------------------------------------- */}
      {showImageUploadModal && (
        <Modal
          title={galleryScope === 'property' ? 'Add Property & Resort Photograph' : 'Upload Room Category Photograph'}
          isOpen={showImageUploadModal}
          onClose={() => setShowImageUploadModal(false)}
        >
          <form onSubmit={galleryScope === 'property' ? handleUploadPropertyImage : handleUploadImage} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {galleryScope === 'property' ? (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Gallery Category *</label>
                <select
                  value={imageCategory}
                  onChange={(e) => setImageCategory(e.target.value)}
                  style={{ width: '100%', padding: '0.45rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
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
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Room Category *</label>
                <select
                  value={selectedRoomForImages || (roomCategories.length > 0 ? roomCategories[0].id : '')}
                  onChange={(e) => handleSelectRoomForImages(Number(e.target.value))}
                  style={{ width: '100%', padding: '0.45rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                >
                  {roomCategories.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Select Image File</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageUploadFile(e.target.files?.[0] || null)}
                style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '0.375rem' }}
              />
            </div>

            <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#6b7280' }}>— OR ENTER URL —</div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Image URL</label>
              <input
                type="text"
                placeholder="https://images.unsplash.com/..."
                value={imageUploadUrl}
                onChange={(e) => setImageUploadUrl(e.target.value)}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Caption / Title *</label>
              <input
                type="text"
                placeholder={galleryScope === 'property' ? 'e.g. Sunset Infinity Pool Deck' : 'e.g. Ocean view from master balcony'}
                value={imageCaption}
                onChange={(e) => setImageCaption(e.target.value)}
                required
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Alt Text (Optional)</label>
              <input
                type="text"
                placeholder="Descriptive text for accessibility"
                value={imageAltText}
                onChange={(e) => setImageAltText(e.target.value)}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="isPrimaryCheckbox"
                checked={imageIsPrimary}
                onChange={(e) => setImageIsPrimary(e.target.checked)}
              />
              <label htmlFor="isPrimaryCheckbox" style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                {galleryScope === 'property' ? 'Set as Primary Property Cover Photo' : 'Set as Primary Display Image for this room'}
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <Button variant="outline" type="button" onClick={() => setShowImageUploadModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? 'Uploading...' : 'Save & Add Photo'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* MODAL: LIVE CUSTOMER CHAT GALLERY PREVIEW */}
      {/* ----------------------------------------------------------------- */}
      {showChatGalleryPreview && (
        <Modal
          title={`Customer Chat Gallery Preview (${propertyGallery.length + roomImages.length} Photographs)`}
          isOpen={showChatGalleryPreview}
          onClose={() => setShowChatGalleryPreview(false)}
        >
          <div style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ background: '#F8FAF5', border: '1px solid #D9E4CC', borderRadius: '8px', padding: '10px 14px', fontSize: '0.8rem', color: '#2F5219' }}>
              💡 This is the exact interactive photo gallery guests will see when clicking <strong>"View Images of the Property"</strong> in your chat links or asking for photos in WhatsApp.
            </div>

            {/* Property Grounds Section */}
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#171719' }}>
                🌴 Resort Grounds & Amenities ({propertyGallery.length})
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
                {propertyGallery.map((img, i) => (
                  <div key={i} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #E5E5E8', background: '#F5F5F6' }}>
                    <img src={img.image_url} alt={img.caption} style={{ width: '100%', height: '120px', objectFit: 'cover' }} />
                    <div style={{ padding: '6px 8px', fontSize: '0.75rem', fontWeight: 600, color: '#171719' }}>
                      {img.caption}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Room Categories Section */}
            {roomCategories.map(cat => (
              <div key={cat.id}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#171719' }}>
                  🛏️ {cat.name}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
                  {cat.primary_image_url && (
                    <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #E5E5E8', background: '#F5F5F6' }}>
                      <img src={cat.primary_image_url} alt={cat.name} style={{ width: '100%', height: '120px', objectFit: 'cover' }} />
                      <div style={{ padding: '6px 8px', fontSize: '0.75rem', fontWeight: 600, color: '#171719' }}>
                        {cat.name} (Primary)
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <Button variant="outline" onClick={() => setShowChatGalleryPreview(false)}>Close Preview</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* MODAL: BULK INVENTORY UPDATE */}
      {/* ----------------------------------------------------------------- */}
      {showBulkInventoryModal && (
        <Modal
          title="Bulk Inventory Update"
          isOpen={showBulkInventoryModal}
          onClose={() => setShowBulkInventoryModal(false)}
        >
          <form onSubmit={handleBulkUpdateInventory} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Room Category *</label>
              <select
                value={bulkInvForm.room_type_id}
                onChange={(e) => setBulkInvForm({ ...bulkInvForm, room_type_id: Number(e.target.value) })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              >
                {roomCategories.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Start Date</label>
                <input
                  type="date"
                  required
                  value={bulkInvForm.start_date}
                  onChange={(e) => setBulkInvForm({ ...bulkInvForm, start_date: e.target.value })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>End Date</label>
                <input
                  type="date"
                  required
                  value={bulkInvForm.end_date}
                  onChange={(e) => setBulkInvForm({ ...bulkInvForm, end_date: e.target.value })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Total Physical Rooms</label>
                <input
                  type="number"
                  min={0}
                  value={bulkInvForm.total_rooms}
                  onChange={(e) => setBulkInvForm({ ...bulkInvForm, total_rooms: e.target.value })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Blocked / Held</label>
                <input
                  type="number"
                  min={0}
                  value={bulkInvForm.blocked_qty}
                  onChange={(e) => setBulkInvForm({ ...bulkInvForm, blocked_qty: e.target.value })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="isClosedBulk"
                checked={bulkInvForm.is_closed}
                onChange={(e) => setBulkInvForm({ ...bulkInvForm, is_closed: e.target.checked })}
              />
              <label htmlFor="isClosedBulk" style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                Close Room for Online/Chat Selling during these dates
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <Button variant="outline" type="button" onClick={() => setShowBulkInventoryModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={saving}>Apply Bulk Inventory</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* MODAL: HOLD / BLOCK INVENTORY */}
      {/* ----------------------------------------------------------------- */}
      {showBlockModal && (
        <Modal
          title="Place Inventory Block / Hold"
          isOpen={showBlockModal}
          onClose={() => setShowBlockModal(false)}
        >
          <form onSubmit={handleCreateBlock} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Room Category *</label>
              <select
                value={blockForm.room_type_id}
                onChange={(e) => setBlockForm({ ...blockForm, room_type_id: Number(e.target.value) })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              >
                {roomCategories.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Start Date</label>
                <input
                  type="date"
                  required
                  value={blockForm.start_date}
                  onChange={(e) => setBlockForm({ ...blockForm, start_date: e.target.value })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>End Date</label>
                <input
                  type="date"
                  required
                  value={blockForm.end_date}
                  onChange={(e) => setBlockForm({ ...blockForm, end_date: e.target.value })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Quantity to Block</label>
              <input
                type="number"
                min={1}
                required
                value={blockForm.blocked_qty}
                onChange={(e) => setBlockForm({ ...blockForm, blocked_qty: Number(e.target.value) })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Reason</label>
              <input
                type="text"
                placeholder="VIP Wedding Block, Deep Cleaning..."
                value={blockForm.reason}
                onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <Button variant="outline" type="button" onClick={() => setShowBlockModal(false)}>Cancel</Button>
              <Button variant="danger" type="submit" disabled={saving}>Place Hold Block</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* MODAL: ADD RATE PLAN */}
      {/* ----------------------------------------------------------------- */}
      {showRatePlanModal && (
        <Modal
          title="Add Meal / Rate Plan"
          isOpen={showRatePlanModal}
          onClose={() => setShowRatePlanModal(false)}
        >
          <form onSubmit={handleSaveRatePlan} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Plan Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bed & Breakfast"
                  value={ratePlanForm.name}
                  onChange={(e) => setRatePlanForm({ ...ratePlanForm, name: e.target.value })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Plan Code *</label>
                <input
                  type="text"
                  required
                  placeholder="CP"
                  value={ratePlanForm.code}
                  onChange={(e) => setRatePlanForm({ ...ratePlanForm, code: e.target.value })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Meal Category</label>
              <select
                value={ratePlanForm.meal_plan}
                onChange={(e) => setRatePlanForm({ ...ratePlanForm, meal_plan: e.target.value })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              >
                <option value="EP">EP — European Plan (Room Only)</option>
                <option value="CP">CP — Continental Plan (Breakfast Included)</option>
                <option value="MAP">MAP — Modified American Plan (Breakfast + Dinner)</option>
                <option value="AP">AP — American Plan (All Meals Included)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Description & Inclusions</label>
              <textarea
                rows={2}
                value={ratePlanForm.description}
                onChange={(e) => setRatePlanForm({ ...ratePlanForm, description: e.target.value })}
                placeholder="Complimentary buffet breakfast at seaside diner..."
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Cancellation Terms</label>
              <input
                type="text"
                value={ratePlanForm.cancellation_policy}
                onChange={(e) => setRatePlanForm({ ...ratePlanForm, cancellation_policy: e.target.value })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <Button variant="outline" type="button" onClick={() => setShowRatePlanModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={saving}>Save Plan</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* MODAL: ADD SEASONAL RATE */}
      {/* ----------------------------------------------------------------- */}
      {showSeasonalModal && (
        <Modal
          title="Add Seasonal Pricing Rule"
          isOpen={showSeasonalModal}
          onClose={() => setShowSeasonalModal(false)}
        >
          <form onSubmit={handleSaveSeasonalRate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Season Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Diwali Peak Season"
                value={seasonalForm.season_name}
                onChange={(e) => setSeasonalForm({ ...seasonalForm, season_name: e.target.value })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Room Category *</label>
              <select
                value={seasonalForm.room_type_id}
                onChange={(e) => setSeasonalForm({ ...seasonalForm, room_type_id: Number(e.target.value) })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              >
                {roomCategories.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Start Date</label>
                <input
                  type="date"
                  required
                  value={seasonalForm.start_date}
                  onChange={(e) => setSeasonalForm({ ...seasonalForm, start_date: e.target.value })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>End Date</label>
                <input
                  type="date"
                  required
                  value={seasonalForm.end_date}
                  onChange={(e) => setSeasonalForm({ ...seasonalForm, end_date: e.target.value })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Seasonal Price (₹)</label>
                <input
                  type="number"
                  required
                  value={seasonalForm.price}
                  onChange={(e) => setSeasonalForm({ ...seasonalForm, price: Number(e.target.value) })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Extra Adult (₹)</label>
                <input
                  type="number"
                  value={seasonalForm.extra_adult_price}
                  onChange={(e) => setSeasonalForm({ ...seasonalForm, extra_adult_price: Number(e.target.value) })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Priority</label>
                <input
                  type="number"
                  value={seasonalForm.priority}
                  onChange={(e) => setSeasonalForm({ ...seasonalForm, priority: Number(e.target.value) })}
                  style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <Button variant="outline" type="button" onClick={() => setShowSeasonalModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={saving}>Save Seasonal Rate</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* MODAL: ADD DAILY OVERRIDE */}
      {/* ----------------------------------------------------------------- */}
      {showDailyRateModal && (
        <Modal
          title="Add Daily Pricing Override"
          isOpen={showDailyRateModal}
          onClose={() => setShowDailyRateModal(false)}
        >
          <form onSubmit={handleSaveDailyRate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Room Category *</label>
              <select
                value={dailyRateForm.room_type_id}
                onChange={(e) => setDailyRateForm({ ...dailyRateForm, room_type_id: Number(e.target.value) })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              >
                {roomCategories.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Date *</label>
              <input
                type="date"
                required
                value={dailyRateForm.rate_date}
                onChange={(e) => setDailyRateForm({ ...dailyRateForm, rate_date: e.target.value })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Override Nightly Price (₹) *</label>
              <input
                type="number"
                required
                value={dailyRateForm.price}
                onChange={(e) => setDailyRateForm({ ...dailyRateForm, price: Number(e.target.value) })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Reason / Notes</label>
              <input
                type="text"
                placeholder="High demand Saturday night"
                value={dailyRateForm.reason}
                onChange={(e) => setDailyRateForm({ ...dailyRateForm, reason: e.target.value })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <Button variant="outline" type="button" onClick={() => setShowDailyRateModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={saving}>Save Override</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* MODAL: ADD FAQ */}
      {/* ----------------------------------------------------------------- */}
      {showFaqModal && (
        <Modal
          title="Add Customer FAQ"
          isOpen={showFaqModal}
          onClose={() => setShowFaqModal(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                const res = await fetch(`/api/v1/hospitality/properties/${selectedPropertyId}/faqs`, {
                  method: 'POST',
                  headers: getHeaders(),
                  body: JSON.stringify(faqForm)
                });
                const data = await res.json();
                if (!res.ok || !data.success) throw new Error(data.message || 'Failed to save FAQ');
                showNotification('FAQ added to guest knowledge base.');
                setShowFaqModal(false);
                loadHospitalityData();
              } catch (err) {
                showNotification(err.message, 'error');
              } finally {
                setSaving(false);
              }
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Question *</label>
              <input
                type="text"
                required
                placeholder="e.g. Do you offer pickup from Goa Airport?"
                value={faqForm.question}
                onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Answer *</label>
              <textarea
                rows={3}
                required
                placeholder="Yes, private transfers can be arranged on request..."
                value={faqForm.answer}
                onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Keywords (comma-separated)</label>
              <input
                type="text"
                placeholder="airport, taxi, pickup, cab, transfer"
                value={faqForm.keywords}
                onChange={(e) => setFaqForm({ ...faqForm, keywords: e.target.value })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <Button variant="outline" type="button" onClick={() => setShowFaqModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={saving}>Save FAQ</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* MODAL: ADD PHYSICAL ROOM KEY */}
      {/* ----------------------------------------------------------------- */}
      {showKeyModal && (
        <Modal
          title="Add Physical Room Unit / Key"
          isOpen={showKeyModal}
          onClose={() => setShowKeyModal(false)}
        >
          <form onSubmit={handleCreatePhysicalRoom} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Room Number *</label>
              <input
                type="text"
                required
                placeholder="e.g. 104 or Villa-A"
                value={keyForm.room_number}
                onChange={(e) => setKeyForm({ ...keyForm, room_number: e.target.value })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Room Category *</label>
              <select
                value={keyForm.room_type_id}
                onChange={(e) => setKeyForm({ ...keyForm, room_type_id: Number(e.target.value) })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              >
                {roomCategories.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Floor / Building / Wing</label>
              <input
                type="text"
                placeholder="e.g. Ground Floor - Beachfront Wing"
                value={keyForm.floor_or_building}
                onChange={(e) => setKeyForm({ ...keyForm, floor_or_building: e.target.value })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Operational Status</label>
              <select
                value={keyForm.operational_status}
                onChange={(e) => setKeyForm({ ...keyForm, operational_status: e.target.value })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              >
                <option value="OPERATIONAL">Operational (Available for Guests)</option>
                <option value="MAINTENANCE">Maintenance / Deep Clean</option>
                <option value="OUT_OF_ORDER">Out of Order / Renovation</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Internal Staff Notes</label>
              <input
                type="text"
                placeholder="e.g. Adjoining door with room 103"
                value={keyForm.notes}
                onChange={(e) => setKeyForm({ ...keyForm, notes: e.target.value })}
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <Button variant="outline" type="button" onClick={() => setShowKeyModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={saving}>Add Room Unit</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
