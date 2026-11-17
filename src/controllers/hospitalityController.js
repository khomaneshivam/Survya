const configService = require("../services/hospitalityConfigService");
const availabilityService = require("../services/hospitalityAvailabilityService");
const pricingService = require("../services/hospitalityPricingService");
const chatService = require("../services/hospitalityChatService");

/**
 * -------------------------------------------------------------------------
 * PROPERTY SETUP & LIFECYCLE
 * -------------------------------------------------------------------------
 */
async function listProperties(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const isAdmin = req.user?.role === "ADMIN" || req.user?.role === "SYSTEM_ADMIN";
    const properties = configService.listProperties(tenantId, userId, isAdmin);
    res.json({ success: true, properties });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

async function getProperty(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const isAdmin = req.user?.role === "ADMIN" || req.user?.role === "SYSTEM_ADMIN";
    const property = configService.getPropertyById(tenantId, req.params.id, userId, isAdmin);
    if (!property) return res.status(404).json({ success: false, message: "Property not found." });
    res.json({ success: true, property });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

async function updateProperty(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const isAdmin = req.user?.role === "ADMIN" || req.user?.role === "SYSTEM_ADMIN";
    const property = configService.updateProperty(req.params.id, req.body, tenantId, userId, isAdmin);
    res.json({ success: true, property, message: "Property configuration updated." });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
}

async function publishProperty(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const isAdmin = req.user?.role === "ADMIN" || req.user?.role === "SYSTEM_ADMIN";
    const result = configService.publishProperty(req.params.id, tenantId, userId, isAdmin);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
}

async function unpublishProperty(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const isAdmin = req.user?.role === "ADMIN" || req.user?.role === "SYSTEM_ADMIN";
    const result = configService.unpublishProperty(req.params.id, tenantId, userId, isAdmin);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
}

async function getSetupOverview(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const overview = configService.getSetupOverview(tenantId, req.params.id);
    res.json({ success: true, overview });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

/**
 * -------------------------------------------------------------------------
 * ROOM CATEGORIES
 * -------------------------------------------------------------------------
 */
async function listRoomCategories(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const categories = configService.listRoomCategories(req.params.id, tenantId);
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getRoomCategory(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const category = configService.getRoomCategoryById(req.params.roomId, req.params.id, tenantId);
    if (!category) return res.status(404).json({ success: false, message: "Room category not found." });
    res.json({ success: true, category });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function createRoomCategory(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const category = configService.createRoomCategory(req.params.id, req.body, tenantId, userId);
    res.status(201).json({ success: true, category });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function updateRoomCategory(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const category = configService.updateRoomCategory(req.params.roomId, req.params.id, req.body, tenantId, userId);
    res.json({ success: true, category });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function archiveRoomCategory(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const result = configService.archiveRoomCategory(req.params.roomId, req.params.id, tenantId, userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * -------------------------------------------------------------------------
 * ROOM PHOTOGRAPHS & GALLERY
 * -------------------------------------------------------------------------
 */
async function listRoomImages(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const images = configService.listRoomImages(req.params.roomId, tenantId);
    res.json({ success: true, images });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function uploadRoomImage(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const propertyId = req.params.id;
    const roomId = req.params.roomId;

    let imageUrl = req.body.image_url;
    let storageKey = req.body.storage_key || null;

    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
      storageKey = req.file.filename;
    }

    if (!imageUrl) {
      return res.status(400).json({ success: false, message: "No image file or URL provided." });
    }

    const image = configService.addRoomImage(propertyId, roomId, {
      image_url: imageUrl,
      storage_key: storageKey,
      caption: req.body.caption || "",
      alt_text: req.body.alt_text || "",
      is_primary: req.body.is_primary === "true" || req.body.is_primary === true
    }, tenantId, userId);

    res.status(201).json({ success: true, image });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function setPrimaryRoomImage(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const result = configService.setPrimaryImage(req.params.imageId, req.params.roomId, tenantId, userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function reorderRoomImages(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const { imageIds } = req.body;
    const result = configService.reorderImages(req.params.roomId, imageIds, tenantId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteRoomImage(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const result = configService.deleteRoomImage(req.params.imageId, req.params.roomId, tenantId, userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * -------------------------------------------------------------------------
 * PROPERTY PHOTO GALLERY CONTROLLER ACTIONS
 * -------------------------------------------------------------------------
 */
async function getPropertyGallery(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const gallery = configService.getPropertyGallery(req.params.id, tenantId);
    res.json({ success: true, photos: gallery.all_photos, ...gallery });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

async function addPropertyGalleryImage(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const propertyId = req.params.id;

    let imageUrl = req.body.image_url;
    let storageKey = req.body.storage_key || null;

    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
      storageKey = req.file.filename;
    }

    if (!imageUrl) {
      return res.status(400).json({ success: false, message: "No image file or URL provided." });
    }

    const image = configService.addPropertyGalleryImage(propertyId, {
      image_url: imageUrl,
      storage_key: storageKey,
      caption: req.body.caption || "",
      category: req.body.category || "Resort & Amenities",
      alt_text: req.body.alt_text || "",
      is_primary: req.body.is_primary === "true" || req.body.is_primary === true
    }, tenantId, userId);

    res.status(201).json({ success: true, image, message: "Property gallery image added." });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

async function deletePropertyGalleryImage(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const result = configService.deletePropertyGalleryImage(req.params.id, req.params.imageId, tenantId, userId);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

async function setPropertyGalleryPrimary(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const result = configService.setPropertyGalleryPrimary(req.params.id, req.params.imageId, tenantId, userId);
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

async function publicGetPropertyGallery(req, res) {
  try {
    const tenantId = req.query.tenant_id ? Number(req.query.tenant_id) : 1;
    const gallery = configService.getPropertyGallery(req.params.id, tenantId);
    res.json({ success: true, photos: gallery.all_photos, ...gallery });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

/**
 * -------------------------------------------------------------------------
 * PHYSICAL ROOMS (Key tracking)
 * -------------------------------------------------------------------------
 */
async function listPhysicalRooms(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const rooms = configService.listPhysicalRooms(req.params.id, req.query.room_type_id, tenantId);
    res.json({ success: true, rooms });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function createPhysicalRoom(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const room = configService.createPhysicalRoom(req.params.id, req.body, tenantId);
    res.status(201).json({ success: true, room });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function updatePhysicalRoom(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const room = configService.updatePhysicalRoom(req.params.roomId, req.params.id, req.body, tenantId);
    res.json({ success: true, room });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function deletePhysicalRoom(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const result = configService.deletePhysicalRoom(req.params.roomId, req.params.id, tenantId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * -------------------------------------------------------------------------
 * FACILITIES, POLICIES & FAQS
 * -------------------------------------------------------------------------
 */
async function listFacilities(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const facilities = configService.listFacilities(req.params.id, tenantId, req.query.category);
    res.json({ success: true, facilities });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function addFacility(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const facility = configService.addFacility(req.params.id, req.body, tenantId);
    res.status(201).json({ success: true, facility });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function updateFacility(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const facility = configService.updateFacility(req.params.facilityId, req.params.id, req.body, tenantId);
    res.json({ success: true, facility });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteFacility(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const result = configService.deleteFacility(req.params.facilityId, req.params.id, tenantId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function listPolicies(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const policies = configService.listPolicies(req.params.id, tenantId);
    res.json({ success: true, policies });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function upsertPolicy(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const policy = configService.upsertPolicy(req.params.id, req.body, tenantId);
    res.json({ success: true, policy });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function listFaqs(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const faqs = configService.listFaqs(req.params.id, tenantId);
    res.json({ success: true, faqs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function createFaq(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const faq = configService.createFaq(req.params.id, req.body, tenantId);
    res.status(201).json({ success: true, faq });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function updateFaq(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const faq = configService.updateFaq(req.params.faqId, req.params.id, req.body, tenantId);
    res.json({ success: true, faq });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteFaq(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const result = configService.deleteFaq(req.params.faqId, req.params.id, tenantId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * -------------------------------------------------------------------------
 * AVAILABILITY & INVENTORY
 * -------------------------------------------------------------------------
 */
async function getInventoryGrid(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ success: false, message: "start_date and end_date query params required." });
    }
    const grid = availabilityService.getInventoryGrid(req.params.id, start_date, end_date, tenantId);
    res.json({ success: true, ...grid });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function bulkUpdateInventory(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const { room_type_id, start_date, end_date, updates } = req.body;
    const result = availabilityService.bulkUpdateInventory(req.params.id, room_type_id, start_date, end_date, updates, tenantId, userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function listInventoryBlocks(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const blocks = availabilityService.listInventoryBlocks(req.params.id, tenantId, req.query.status);
    res.json({ success: true, blocks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function createInventoryBlock(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const block = availabilityService.createInventoryBlock({
      propertyId: req.params.id,
      roomTypeId: req.body.room_type_id,
      startDate: req.body.start_date,
      endDate: req.body.end_date,
      blockedQty: req.body.blocked_qty,
      reason: req.body.reason,
      createdBy: req.user?.name || "Staff",
      tenantId,
      userId
    });
    res.status(201).json({ success: true, ...block });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function releaseInventoryBlock(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const result = availabilityService.releaseInventoryBlock(req.params.blockId, tenantId, userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function checkAvailability(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const { room_type_id, check_in, check_out, quantity } = req.query;
    if (!check_in || !check_out) {
      return res.status(400).json({ success: false, message: "check_in and check_out query parameters required." });
    }

    if (room_type_id) {
      const result = availabilityService.checkRoomAvailability(req.params.id, room_type_id, check_in, check_out, quantity || 1, tenantId);
      res.json({ success: true, availability: result });
    } else {
      const result = availabilityService.checkPropertyAvailability(req.params.id, check_in, check_out, quantity || 1, tenantId);
      res.json({ success: true, ...result });
    }
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * -------------------------------------------------------------------------
 * RATES & PRICING
 * -------------------------------------------------------------------------
 */
async function listRatePlans(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const plans = pricingService.listRatePlans(req.params.id, tenantId);
    res.json({ success: true, plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function createRatePlan(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const plan = pricingService.createRatePlan(req.params.id, req.body, tenantId, userId);
    res.status(201).json({ success: true, plan });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function updateRatePlan(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const plan = pricingService.updateRatePlan(req.params.planId, req.params.id, req.body, tenantId, userId);
    res.json({ success: true, plan });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteRatePlan(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const result = pricingService.deleteRatePlan(req.params.planId, req.params.id, tenantId, userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function listSeasonalRates(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const rates = pricingService.listSeasonalRates(req.params.id, tenantId);
    res.json({ success: true, rates });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function createSeasonalRate(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const result = pricingService.createSeasonalRate(req.params.id, req.body, tenantId, userId);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function updateSeasonalRate(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const result = pricingService.updateSeasonalRate(req.params.seasonId, req.params.id, req.body, tenantId, userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteSeasonalRate(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const result = pricingService.deleteSeasonalRate(req.params.seasonId, req.params.id, tenantId, userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function listDailyRates(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const rates = pricingService.listDailyRates(req.params.id, req.query.room_type_id, req.query.start_date, req.query.end_date, tenantId);
    res.json({ success: true, rates });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function upsertDailyRate(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const result = pricingService.upsertDailyRate(req.params.id, req.body, tenantId, userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function bulkUpsertDailyRates(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const result = pricingService.bulkUpsertDailyRates(req.params.id, req.body, tenantId, userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteDailyRate(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const result = pricingService.deleteDailyRate(req.params.dailyRateId, req.params.id, tenantId, userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function listTaxRules(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const taxRules = pricingService.listTaxRules(req.params.id, tenantId);
    res.json({ success: true, taxRules });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function upsertTaxRule(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const result = pricingService.upsertTaxRule(req.params.id, req.body, tenantId, userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteTaxRule(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const result = pricingService.deleteTaxRule(req.params.ruleId, req.params.id, tenantId, userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function calculateQuote(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const quote = pricingService.calculateQuote({
      propertyId: req.params.id,
      roomTypeId: req.body.room_type_id,
      ratePlanId: req.body.rate_plan_id,
      checkInDate: req.body.check_in,
      checkOutDate: req.body.check_out,
      adults: req.body.adults,
      children: req.body.children,
      rooms: req.body.rooms,
      tenantId
    });
    res.json({ success: true, quote });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * -------------------------------------------------------------------------
 * PUBLIC / CONVERSATIONAL CHAT API (Information-Only Source of Truth)
 * -------------------------------------------------------------------------
 */
async function publicSearchProperties(req, res) {
  try {
    const tenantId = req.query.tenant_id ? Number(req.query.tenant_id) : 1;
    const result = chatService.searchProperties({
      query: req.query.q,
      destination: req.query.destination,
      type: req.query.type,
      tenantId
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function publicGetProperty(req, res) {
  try {
    const tenantId = req.query.tenant_id ? Number(req.query.tenant_id) : 1;
    const result = chatService.getPropertyDetails({
      propertyId: req.params.id,
      tenantId
    });
    if (!result.found) {
      return res.status(404).json({ success: false, message: "Property not found or unpublished." });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function publicGetRoomCategories(req, res) {
  try {
    const tenantId = req.query.tenant_id ? Number(req.query.tenant_id) : 1;
    const result = chatService.getRoomCategories({
      propertyId: req.params.id,
      tenantId
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function publicGetRoomDetails(req, res) {
  try {
    const tenantId = req.query.tenant_id ? Number(req.query.tenant_id) : 1;
    const result = chatService.getRoomDetails({
      propertyId: req.params.id,
      roomTypeId: req.params.roomId,
      tenantId
    });
    if (!result.found) {
      return res.status(404).json({ success: false, message: "Room category not found." });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function publicCheckAvailability(req, res) {
  try {
    const tenantId = req.query.tenant_id ? Number(req.query.tenant_id) : 1;
    const { room_type_id, check_in, check_out, quantity } = req.query;
    if (!check_in || !check_out) {
      return res.status(400).json({ success: false, message: "check_in and check_out query parameters are required." });
    }

    if (room_type_id) {
      const result = chatService.checkRoomAvailabilityAction({
        propertyId: req.params.id,
        roomTypeId: room_type_id,
        checkInDate: check_in,
        checkOutDate: check_out,
        quantity: quantity || 1,
        tenantId
      });
      res.json({ success: true, ...result });
    } else {
      const result = availabilityService.checkPropertyAvailability(req.params.id, check_in, check_out, quantity || 1, tenantId);
      res.json({ success: true, ...result });
    }
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function publicCalculateQuote(req, res) {
  try {
    const tenantId = req.body.tenant_id ? Number(req.body.tenant_id) : 1;
    const result = chatService.calculatePropertyQuoteAction({
      propertyId: req.params.id,
      roomTypeId: req.body.room_type_id,
      ratePlanId: req.body.rate_plan_id,
      checkInDate: req.body.check_in,
      checkOutDate: req.body.check_out,
      adults: req.body.adults,
      children: req.body.children,
      rooms: req.body.rooms,
      tenantId
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function publicChatAction(req, res) {
  try {
    const { action, payload, tenant_id } = req.body;
    if (!action) {
      return res.status(400).json({ success: false, message: "action parameter is required." });
    }
    const tenantId = tenant_id ? Number(tenant_id) : 1;
    const result = chatService.handleHospitalityChatAction(action, payload || {}, tenantId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

module.exports = {
  // Properties
  listProperties,
  getProperty,
  updateProperty,
  publishProperty,
  unpublishProperty,
  getSetupOverview,

  // Room Categories
  listRoomCategories,
  getRoomCategory,
  createRoomCategory,
  updateRoomCategory,
  archiveRoomCategory,

  // Room Images
  listRoomImages,
  uploadRoomImage,
  setPrimaryRoomImage,
  reorderRoomImages,
  deleteRoomImage,

  // Property Photo Gallery
  getPropertyGallery,
  addPropertyGalleryImage,
  deletePropertyGalleryImage,
  setPropertyGalleryPrimary,

  // Physical Rooms
  listPhysicalRooms,
  createPhysicalRoom,
  updatePhysicalRoom,
  deletePhysicalRoom,

  // Facilities, Policies, FAQs
  listFacilities,
  addFacility,
  updateFacility,
  deleteFacility,
  listPolicies,
  upsertPolicy,
  listFaqs,
  createFaq,
  updateFaq,
  deleteFaq,

  // Availability & Inventory
  getInventoryGrid,
  bulkUpdateInventory,
  listInventoryBlocks,
  createInventoryBlock,
  releaseInventoryBlock,
  checkAvailability,

  // Rates & Pricing
  listRatePlans,
  createRatePlan,
  updateRatePlan,
  deleteRatePlan,
  listSeasonalRates,
  createSeasonalRate,
  updateSeasonalRate,
  deleteSeasonalRate,
  listDailyRates,
  upsertDailyRate,
  bulkUpsertDailyRates,
  deleteDailyRate,
  listTaxRules,
  upsertTaxRule,
  deleteTaxRule,
  calculateQuote,

  // Public Conversational API
  publicSearchProperties,
  publicGetProperty,
  publicGetPropertyGallery,
  publicGetRoomCategories,
  publicGetRoomDetails,
  publicCheckAvailability,
  publicCalculateQuote,
  publicChatAction
};

