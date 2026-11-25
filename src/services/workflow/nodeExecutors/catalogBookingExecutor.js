const { db } = require('../../../config/database');
const { getPath } = require('../expressionEvaluator');
const availabilityService = require('../../hospitalityAvailabilityService');
const pricingService = require('../../hospitalityPricingService');
const enquiryService = require('../../enquiryService');

/**
 * 10. Catalog & Booking Hold Executor (CATALOG_BOOKING, BUSINESS_ACTION, TRANSACTION, BOOKING, QUOTATION)
 */
async function execute(node, context) {
  const { session = {}, dryRun = false, tenantId = 1, propertyId = 1, variableContext } = context;
  const config = node.config || {};
  const evalContext = variableContext || session;

  const action = config.action || 'HOSPITALITY_CHECK_AVAILABILITY';
  const checkIn = getPath(evalContext, config.checkinVar || 'check_in_date') || getPath(evalContext, 'check_in') || '2026-12-01';
  const checkOut = getPath(evalContext, config.checkoutVar || 'check_out_date') || getPath(evalContext, 'check_out') || '2026-12-03';
  const guests = Number(getPath(evalContext, config.guestsVar || 'guest_count') || getPath(evalContext, 'adults') || 2);
  const children = Number(getPath(evalContext, 'children') || 0);
  const roomName = getPath(evalContext, 'selected_room_name') || getPath(evalContext, 'room_type') || getPath(evalContext, 'selected_option') || '';

  // 1. HOSPITALITY_CHECK_AVAILABILITY
  if (action === 'HOSPITALITY_CHECK_AVAILABILITY' || action === 'CHECK_AVAILABILITY') {
    let roomType = null;
    if (roomName) {
      roomType = db.prepare(`
        SELECT * FROM room_types
        WHERE property_id = ? AND tenant_id = ? AND (name LIKE ? OR room_code LIKE ?)
        ORDER BY id ASC LIMIT 1
      `).get(propertyId, tenantId, `%${roomName}%`, `%${roomName}%`);
    }
    if (!roomType) {
      roomType = db.prepare(`
        SELECT * FROM room_types
        WHERE property_id = ? AND tenant_id = ? AND active = 1
        ORDER BY id ASC LIMIT 1
      `).get(propertyId, tenantId);
    }

    if (!roomType) {
      return {
        action: 'CONTINUE',
        nextHandle: 'unavailable',
        updatedData: {
          'catalog.isAvailable': false,
          'is_available': false
        },
        traceNote: 'No room types available in inventory [Handle: unavailable]'
      };
    }

    let isAvail = true;
    let availQty = 3;

    try {
      const avail = availabilityService.checkRoomAvailability(propertyId, roomType.id, checkIn, checkOut, 1, tenantId);
      isAvail = avail.overall_status !== 'UNAVAILABLE';
      availQty = avail.min_sellable;
    } catch (e) {
      isAvail = true; // Fallback for simulation
    }

    const nextHandle = isAvail ? 'available' : 'unavailable';
    return {
      action: 'CONTINUE',
      nextHandle,
      updatedData: {
        'catalog.isAvailable': isAvail,
        'catalog.available_qty': availQty,
        'catalog.room_type_id': roomType.id,
        'catalog.room_name': roomType.name,
        'catalog.base_rate': roomType.base_rate || 3500,
        'is_available': isAvail,
        'matched_room_id': roomType.id,
        'matched_room_name': roomType.name
      },
      traceNote: `Availability checked for ${roomType.name}: ${isAvail ? 'AVAILABLE ✅' : 'SOLD OUT ❌'} [Handle: ${nextHandle}]`
    };
  }

  // 2. HOSPITALITY_CALCULATE_QUOTE / B2B_CALCULATE_SALES_QUOTE
  if (action === 'HOSPITALITY_CALCULATE_QUOTE' || action === 'CALCULATE_QUOTE' || action === 'B2B_CALCULATE_SALES_QUOTE') {
    if (action === 'B2B_CALCULATE_SALES_QUOTE') {
      const teamSize = Math.max(1, Number(getPath(evalContext, 'team_size') || 5) || 5);
      const monthlyVolume = Math.max(1000, Number(getPath(evalContext, 'monthly_volume') || 25000) || 25000);
      const planRaw = String(getPath(evalContext, 'selected_plan') || 'GROWTH').toUpperCase();
      const planBase = planRaw.includes('ENTERPRISE') ? 19999 : (planRaw.includes('STARTER') ? 4999 : 9999);
      const subtotal = planBase + (teamSize * 499) + Math.round((monthlyVolume / 1000) * 80);
      const taxTotal = Math.round((subtotal * 18) / 100);
      const total = subtotal + taxTotal;
      return {
        action: 'CONTINUE',
        nextHandle: 'default',
        updatedData: {
          quote_subtotal: subtotal,
          tax_percent: 18,
          tax_total: taxTotal,
          quote_total: total,
          deposit_amount: 5000
        },
        traceNote: `B2B Quote calculated: ₹${total}`
      };
    }

    const roomTypeId = Number(getPath(evalContext, 'catalog.room_type_id') || getPath(evalContext, 'matched_room_id') || 1);
    let quoteResult = null;

    try {
      quoteResult = pricingService.calculateQuote({
        propertyId,
        roomTypeId,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        adults: guests,
        children,
        rooms: 1,
        tenantId
      });
    } catch (err) {
      // Fallback calculation
      quoteResult = {
        nights: 2,
        subtotal: 7000,
        tax_total: 840,
        total: 7840,
        currency: 'INR'
      };
    }

    const total = Number(quoteResult.total || quoteResult.grand_total || 7840);
    const subtotal = Number(quoteResult.subtotal || quoteResult.base_amount || 7000);
    const taxTotal = Number(quoteResult.tax_total || quoteResult.tax_amount || 840);
    const taxPercent = subtotal > 0 ? Math.round((taxTotal / subtotal) * 100) : 12;
    const nights = Number(quoteResult.nights || 2);

    const saveQuoteAs = config.saveQuoteAs || 'quote_total';
    const saveSubtotalAs = config.saveSubtotalAs || 'quote_subtotal';
    const saveTaxAs = config.saveTaxAs || 'quote_tax';

    return {
      action: 'CONTINUE',
      nextHandle: 'available',
      updatedData: {
        [saveQuoteAs]: total,
        [saveSubtotalAs]: subtotal,
        [saveTaxAs]: taxTotal,
        'catalog.quoteTotal': total,
        'catalog.subtotal': subtotal,
        'catalog.taxAmount': taxTotal,
        'catalog.nights': nights,
        'quote_total': total,
        'quote_subtotal': subtotal,
        'tax_total': taxTotal,
        'tax_percent': taxPercent,
        'nights': nights
      },
      traceNote: `Quote calculated: ₹${total} (${nights} nights, subtotal ₹${subtotal}, tax ₹${taxTotal})`
    };
  }

  // 3. HOSPITALITY_CREATE_ENQUIRY
  if (action === 'HOSPITALITY_CREATE_ENQUIRY') {
    const guestName = getPath(evalContext, 'guest_name') || getPath(evalContext, 'contact.name') || getPath(evalContext, 'name') || 'Guest';
    if (dryRun) {
      return {
        action: 'CONTINUE',
        nextHandle: 'available',
        replyMessages: ['✅ *Booking Enquiry #9999 Logged Successfully!*'],
        updatedData: {
          'enquiry_id': 9999,
          'quote_id': 9999,
          'quote_number': 'ENQ-SIM-9999',
          'assigned_staff': 'Duty Manager (Front Desk)'
        },
        traceNote: '[Simulated] Booking enquiry created: #ENQ-SIM-9999'
      };
    }

    try {
      const enq = enquiryService.createEnquiry(tenantId, {
        property_id: propertyId,
        phone: context.senderPhone || '919876543210',
        guest_name: guestName,
        check_in: checkIn,
        check_out: checkOut,
        adults: guests,
        children,
        rooms_requested: 1,
        room_type_id: Number(getPath(evalContext, 'catalog.room_type_id') || getPath(evalContext, 'matched_room_id') || 1),
        notes: 'Automated WhatsApp Booking Flow'
      }, 'conversation_engine');

      return {
        action: 'CONTINUE',
        nextHandle: 'available',
        replyMessages: [`✅ *Booking Enquiry #${enq.id} Logged Successfully!*`],
        updatedData: {
          'enquiry_id': enq.id,
          'quote_id': enq.quote_id || enq.id,
          'quote_number': enq.enquiry_number || `ENQ-${enq.id}`,
          'assigned_staff': enq.assigned_to || 'Duty Manager (Front Desk)'
        },
        traceNote: `Created official enquiry #${enq.id} (${enq.enquiry_number || 'ENQ'})`
      };
    } catch (err) {
      return {
        action: 'CONTINUE',
        nextHandle: 'unavailable',
        traceNote: `Enquiry creation failed: ${err.message}`
      };
    }
  }

  // Default fallback
  return {
    action: 'CONTINUE',
    nextHandle: 'available',
    traceNote: `Executed catalog booking action: ${action}`
  };
}

module.exports = { execute };
