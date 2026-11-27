const XLSX = require("xlsx");
const { db } = require("../config/database");
const { getScopedUserId, isPlatformAdmin, isWorkspaceAdmin } = require("../middleware/authMiddleware");
const timeUtil = require("../utils/timeUtil");

/**
 * Get detailed campaign delivery reports with pagination and filtering
 */
async function getCampaignReports(req, res) {
  try {
    const { campaignId, status, search, limit = 50, page = 1, userId } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    const conditions = [];

    if (!isPlatformAdmin(req.user)) {
      conditions.push("COALESCE(c.tenant_id, 1) = ?");
      params.push(Number(req.user?.tenant_id || 1));
      if (!isWorkspaceAdmin(req.user)) {
        conditions.push("c.user_id = ?");
        params.push(req.user.id);
      }
    } else if (userId && String(userId).trim() && String(userId).trim() !== "ALL") {
      conditions.push("c.user_id = ?");
      params.push(String(userId).trim());
    }

    if (campaignId && campaignId !== "ALL") {
      conditions.push("r.campaign_id = ?");
      params.push(campaignId);
    }

    if (status && status !== "ALL") {
      conditions.push("r.status = ?");
      params.push(status);
    }

    if (search) {
      conditions.push("(r.contact_name LIKE ? OR r.phone_number LIKE ? OR r.clean_phone LIKE ?)");
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countQuery = `
      SELECT COUNT(*) as count 
      FROM campaign_recipients r
      LEFT JOIN campaigns c ON r.campaign_id = c.id
      ${whereClause}
    `;
    const totalCount = db.prepare(countQuery).get(...params).count;

    const dataQuery = `
      SELECT 
        r.id, r.campaign_id, c.name as campaign_name,
        r.contact_name, r.contact_name as recipient_name,
        r.phone_number, r.clean_phone,
        r.status, r.status as delivery_status,
        r.meta_message_id,
        r.error_code,
        r.error_message, r.error_message as error_reason,
        r.sent_at, r.sent_at as dispatched_at,
        r.delivered_at,
        r.read_at,
        r.failed_at,
        c.template_name
      FROM campaign_recipients r
      LEFT JOIN campaigns c ON r.campaign_id = c.id
      ${whereClause}
      ORDER BY r.sent_at DESC, r.id DESC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(dataQuery).all(...params, parseInt(limit, 10), offset);

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: totalCount,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(totalCount / parseInt(limit, 10))
      }
    });
  } catch (error) {
    console.error("Reports getCampaignReports error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Sanitizes cell values to prevent CSV / Excel formula injection vulnerabilities (OWASP compliance)
 */
function sanitizeCell(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Export campaign delivery logs as Excel or CSV file
 */
async function exportCampaignReport(req, res) {
  try {
    const { campaignId, format = "xlsx", userId } = req.query;

    const conditions = [];
    const params = [];

    if (campaignId && campaignId !== "ALL") {
      const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
      if (!campaign) {
        return res.status(404).json({ success: false, message: "Campaign not found." });
      }
      if (!isPlatformAdmin(req.user)) {
        if (Number(campaign.tenant_id || 1) !== Number(req.user?.tenant_id || 1)) {
          return res.status(403).json({ success: false, message: "Forbidden: You do not have access to this campaign." });
        }
        if (!isWorkspaceAdmin(req.user) && campaign.user_id !== req.user?.id) {
          return res.status(403).json({ success: false, message: "Forbidden: You do not have access to this campaign." });
        }
      }
      conditions.push("r.campaign_id = ?");
      params.push(campaignId);
    }

    if (!isPlatformAdmin(req.user)) {
      conditions.push("COALESCE(c.tenant_id, 1) = ?");
      params.push(Number(req.user?.tenant_id || 1));
      if (!isWorkspaceAdmin(req.user)) {
        conditions.push("c.user_id = ?");
        params.push(req.user.id);
      }
    } else if (userId && String(userId).trim() && String(userId).trim() !== "ALL") {
      conditions.push("c.user_id = ?");
      params.push(String(userId).trim());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rawRows = db.prepare(`
      SELECT 
        r.id as "ID",
        c.name as "Campaign Name",
        c.template_name as "Template",
        r.contact_name as "Recipient Name",
        r.clean_phone as "Phone Number",
        r.status as "Delivery Status",
        r.meta_message_id as "Meta Message ID",
        r.error_code as "Error Code",
        r.error_message as "Error Reason",
        r.sent_at as "Dispatched At",
        r.delivered_at as "Delivered At",
        r.read_at as "Read At",
        r.failed_at as "Failed At"
      FROM campaign_recipients r
      LEFT JOIN campaigns c ON r.campaign_id = c.id
      ${whereClause}
      ORDER BY r.sent_at DESC
    `).all(...params);

    if (rawRows.length === 0) {
      return res.status(404).json({ success: false, message: "No recipient records found to export." });
    }

    // Apply security sanitization and format timestamps to Indian Standard Time (IST)
    const rows = rawRows.map(row => {
      const sanitized = {};
      for (const [key, value] of Object.entries(row)) {
        if (["Dispatched At", "Delivered At", "Read At", "Failed At"].includes(key)) {
          sanitized[`${key} (IST)`] = value ? sanitizeCell(timeUtil.formatIndianDateTime(value, true)) : "";
        } else {
          sanitized[key] = sanitizeCell(value);
        }
      }
      return sanitized;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Delivery Audit");

    const filename = `whatsapp_broadcast_report_${campaignId || "all"}_${Date.now()}.${format === "csv" ? "csv" : "xlsx"}`;

    if (format === "csv") {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      return res.send(csv);
    }

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) {
    console.error("Export report error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Get 4-Stage Booking Lifecycle Automation reports
 */
async function getAutomationReports(req, res) {
  try {
    const { triggerType, status, limit = 50, page = 1, userId } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const conditions = [];
    const params = [];

    if (!isPlatformAdmin(req.user)) {
      conditions.push("COALESCE(u_abd.tenant_id, 1) = ?");
      params.push(Number(req.user?.tenant_id || 1));
      if (!isWorkspaceAdmin(req.user)) {
        conditions.push("abd.user_id = ?");
        params.push(req.user.id);
      }
    } else if (userId && String(userId).trim() && String(userId).trim() !== "ALL") {
      conditions.push("abd.user_id = ?");
      params.push(String(userId).trim());
    }

    if (triggerType && triggerType !== "ALL") {
      conditions.push("abd.trigger_type = ?");
      params.push(triggerType);
    }

    if (status && status !== "ALL") {
      conditions.push("abd.status = ?");
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countQuery = `
      SELECT COUNT(*) as count
      FROM automated_booking_dispatches abd
      LEFT JOIN users u_abd ON abd.user_id = u_abd.id
      ${whereClause}
    `;
    const totalCount = db.prepare(countQuery).get(...params).count;

    const dataQuery = `
      SELECT 
        abd.id, abd.guest_name, abd.phone_number, abd.clean_phone, abd.property_name,
        abd.checkin_date, abd.checkout_date, abd.trigger_type, abd.template_name,
        abd.meta_message_id, abd.status, abd.error_message, abd.dispatched_at
      FROM automated_booking_dispatches abd
      LEFT JOIN users u_abd ON abd.user_id = u_abd.id
      ${whereClause}
      ORDER BY abd.dispatched_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(dataQuery).all(...params, parseInt(limit, 10), offset);

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: totalCount,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(totalCount / parseInt(limit, 10))
      }
    });
  } catch (error) {
    console.error("Automation reports error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Overview analytics metrics for reports dashboard
 */
async function getOverviewAnalytics(req, res) {
  try {
    const targetUserId = req.query?.userId;
    const platformAdmin = isPlatformAdmin(req.user);
    const workspaceAdmin = isWorkspaceAdmin(req.user);
    const activeTenantId = Number(req.user?.tenant_id || 1);

    const campConditions = [];
    const campParams = [];
    if (!platformAdmin) {
      campConditions.push("COALESCE(tenant_id, 1) = ?");
      campParams.push(activeTenantId);
      if (!workspaceAdmin) {
        campConditions.push("user_id = ?");
        campParams.push(req.user.id);
      }
    } else if (targetUserId && String(targetUserId).trim() && String(targetUserId).trim() !== "ALL") {
      campConditions.push("user_id = ?");
      campParams.push(String(targetUserId).trim());
    }
    const campWhere = campConditions.length > 0 ? `WHERE ${campConditions.join(" AND ")}` : "";

    const abdConditions = [];
    const abdParams = [];
    if (!platformAdmin) {
      abdConditions.push("COALESCE(u_abd.tenant_id, 1) = ?");
      abdParams.push(activeTenantId);
      if (!workspaceAdmin) {
        abdConditions.push("abd.user_id = ?");
        abdParams.push(req.user.id);
      }
    } else if (targetUserId && String(targetUserId).trim() && String(targetUserId).trim() !== "ALL") {
      abdConditions.push("abd.user_id = ?");
      abdParams.push(String(targetUserId).trim());
    }
    const abdWhere = abdConditions.length > 0 ? `WHERE ${abdConditions.join(" AND ")}` : "";

    // Campaigns summary
    const campStats = db.prepare(`
      SELECT 
        COUNT(*) as total_campaigns,
        COALESCE(SUM(total_contacts), 0) as total_contacts,
        COALESCE(SUM(sent_count), 0) as total_sent,
        COALESCE(SUM(failed_count), 0) as total_failed
      FROM campaigns
      ${campWhere}
    `).get(...campParams);

    // Automation dispatches breakdown by stage
    const autoStats = db.prepare(`
      SELECT 
        COUNT(*) as total_dispatches,
        SUM(CASE WHEN abd.trigger_type IN ('BEFORE_CHECKIN', 'PRE_CHECKIN') THEN 1 ELSE 0 END) as before_checkin_count,
        SUM(CASE WHEN abd.trigger_type = 'ON_CHECKIN' THEN 1 ELSE 0 END) as on_checkin_count,
        SUM(CASE WHEN abd.trigger_type IN ('ON_CHECKOUT', 'CHECKOUT') THEN 1 ELSE 0 END) as on_checkout_count,
        SUM(CASE WHEN abd.trigger_type = 'AFTER_CHECKOUT' THEN 1 ELSE 0 END) as after_checkout_count,
        SUM(CASE WHEN abd.status = 'SENT' THEN 1 ELSE 0 END) as sent_success,
        SUM(CASE WHEN abd.status != 'SENT' THEN 1 ELSE 0 END) as sent_failed
      FROM automated_booking_dispatches abd
      LEFT JOIN users u_abd ON abd.user_id = u_abd.id
      ${abdWhere}
    `).get(...abdParams);

    // Active scheduled count
    const scheduledStats = db.prepare(`
      SELECT COUNT(*) as count FROM campaigns 
      ${campWhere ? campWhere + " AND status = 'SCHEDULED'" : "WHERE status = 'SCHEDULED'"}
    `).get(...campParams);

    // Join params for recipients
    const joinConditions = [];
    const joinParams = [];
    if (!platformAdmin) {
      joinConditions.push("COALESCE(c.tenant_id, 1) = ?");
      joinParams.push(activeTenantId);
      if (!workspaceAdmin) {
        joinConditions.push("c.user_id = ?");
        joinParams.push(req.user.id);
      }
    } else if (targetUserId && String(targetUserId).trim() && String(targetUserId).trim() !== "ALL") {
      joinConditions.push("c.user_id = ?");
      joinParams.push(String(targetUserId).trim());
    }
    const joinClause = joinConditions.length > 0 ? `WHERE ${joinConditions.join(" AND ")}` : "";

    // Recipient delivery status breakdown (Delivered vs Read vs Failed)
    const recipientStats = db.prepare(`
      SELECT 
        SUM(CASE WHEN r.status = 'DELIVERED' THEN 1 ELSE 0 END) as count_delivered_only,
        SUM(CASE WHEN r.status = 'READ' THEN 1 ELSE 0 END) as count_read,
        SUM(CASE WHEN r.status IN ('DELIVERED', 'READ') THEN 1 ELSE 0 END) as count_delivered,
        SUM(CASE WHEN r.status = 'FAILED' THEN 1 ELSE 0 END) as count_failed,
        SUM(CASE WHEN r.status = 'SENT' THEN 1 ELSE 0 END) as count_sent,
        SUM(CASE WHEN r.status = 'PENDING' THEN 1 ELSE 0 END) as count_pending
      FROM campaign_recipients r
      LEFT JOIN campaigns c ON r.campaign_id = c.id
      ${joinClause}
    `).get(...joinParams);

    // Customer direct reply counts (connected to campaigns)
    const replyConditions = [];
    const replyParams = [];
    if (!platformAdmin) {
      replyConditions.push("COALESCE(cr.tenant_id, 1) = ?");
      replyParams.push(activeTenantId);
      if (!workspaceAdmin) {
        replyConditions.push("cr.user_id = ?");
        replyParams.push(req.user.id);
      }
    } else if (targetUserId && String(targetUserId).trim() && String(targetUserId).trim() !== "ALL") {
      replyConditions.push("cr.user_id = ?");
      replyParams.push(String(targetUserId).trim());
    }
    const replyClause = replyConditions.length > 0 ? `WHERE ${replyConditions.join(" AND ")}` : "";

    const replyStats = db.prepare(`
      SELECT 
        COUNT(*) as total_replies,
        COUNT(DISTINCT from_phone) as unique_repliers
      FROM customer_replies cr
      ${replyClause}
    `).get(...replyParams);

    const totalSent = Number(campStats.total_sent || 0) + Number(autoStats.sent_success || 0);
    const totalFailed = Number(campStats.total_failed || 0) + Number(autoStats.sent_failed || 0);
    const totalAttempted = totalSent + totalFailed;

    const trackedRecipientsTotal = Number(recipientStats.count_delivered || 0) + Number(recipientStats.count_sent || 0) + Number(recipientStats.count_failed || 0) + Number(recipientStats.count_pending || 0);
    const totalDelivered = trackedRecipientsTotal > 0 ? Number(recipientStats.count_delivered || 0) : totalSent;
    const totalRead = Number(recipientStats.count_read || 0);
    const totalReplies = Number(replyStats.total_replies || 0);

    const deliveryRate = totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(1) : "0.0";
    const readRate = totalDelivered > 0 ? ((totalRead / totalDelivered) * 100).toFixed(1) : "0.0";
    const failureRate = totalAttempted > 0 ? ((totalFailed / totalAttempted) * 100).toFixed(1) : "0.0";
    const replyRate = totalDelivered > 0 ? (((replyStats.unique_repliers || 0) / totalDelivered) * 100).toFixed(1) : "0.0";

    // Tenant-scoped real DB revenue & messaging/AI cost aggregation
    const requestedTenantId = req.query?.tenantId ? Number(req.query.tenantId) : null;
    const effectiveFinTenantId = (!platformAdmin) ? activeTenantId : (Number.isFinite(requestedTenantId) ? requestedTenantId : null);
    const finTenantFilter = effectiveFinTenantId !== null
      ? "COALESCE(tenant_id, 1) = ?"
      : "COALESCE(tenant_id, 1) NOT IN (SELECT id FROM tenants WHERE COALESCE(is_sandbox, 0) = 1)";
    const finTenantParams = effectiveFinTenantId !== null ? [effectiveFinTenantId] : [];

    let txStats = { total_transactions: 0, paid_count: 0, revenue_inr: 0 };
    try {
      txStats = db.prepare(`
        SELECT
          COUNT(*) as total_transactions,
          COALESCE(SUM(CASE WHEN payment_status IN ('PAID', 'PARTIALLY_PAID', 'SETTLED') THEN 1 ELSE 0 END), 0) as paid_count,
          COALESCE(SUM(CASE WHEN payment_status IN ('PAID', 'PARTIALLY_PAID', 'SETTLED') THEN GREATEST(COALESCE(amount_paid, 0), CASE WHEN payment_status = 'PAID' THEN COALESCE(grand_total, 0) ELSE 0 END) ELSE 0 END), 0) as revenue_inr
        FROM universal_transactions
        WHERE COALESCE(delete_status, 0) = 0 AND ${finTenantFilter}
      `).get(...finTenantParams) || txStats;
    } catch (e) {}

    let orderStats = { paid_count: 0, revenue_inr: 0 };
    try {
      orderStats = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN payment_status IN ('PAID', 'SETTLED') THEN 1 ELSE 0 END), 0) as paid_count,
          COALESCE(SUM(CASE WHEN payment_status IN ('PAID', 'SETTLED') THEN COALESCE(grand_total, 0) ELSE 0 END), 0) as revenue_inr
        FROM unified_orders
        WHERE ${finTenantFilter}
      `).get(...finTenantParams) || orderStats;
    } catch (e) {}

    let quoteStats = { won_count: 0, revenue_inr: 0 };
    try {
      const qTenantFilter = effectiveFinTenantId !== null
        ? "COALESCE(q.tenant_id, 1) = ?"
        : "COALESCE(q.tenant_id, 1) NOT IN (SELECT id FROM tenants WHERE COALESCE(is_sandbox, 0) = 1)";
      // Reconcile latest quote per WON/CONFIRMED enquiry without multi-quote inflation
      quoteStats = db.prepare(`
        SELECT
          COUNT(DISTINCT COALESCE(q.enquiry_id, q.id)) as won_count,
          COALESCE(SUM(COALESCE(q.total, 0)), 0) as revenue_inr
        FROM quotes q
        LEFT JOIN booking_enquiries be ON be.id = q.enquiry_id
        WHERE (
            (be.id IS NOT NULL AND COALESCE(be.delete_status, 0) = 0 AND (
              UPPER(COALESCE(be.status, '')) IN ('WON', 'CONFIRMED')
              OR (
                UPPER(COALESCE(be.status, '')) NOT IN ('CANCELLED', 'LOST', 'ARCHIVED', 'REJECTED')
                AND UPPER(COALESCE(q.status, '')) IN ('WON', 'ACCEPTED', 'PAID')
              )
            ))
            OR (be.id IS NULL AND UPPER(COALESCE(q.status, '')) IN ('WON', 'ACCEPTED', 'PAID'))
          )
          AND (
            q.enquiry_id IS NULL
            OR q.id = (SELECT q2.id FROM quotes q2 WHERE q2.enquiry_id = q.enquiry_id ORDER BY q2.id DESC LIMIT 1)
          )
          AND ${qTenantFilter}
      `).get(...finTenantParams) || quoteStats;
    } catch (e) {}

    let waCostStats = { total_messages: 0, billed_messages: 0, waived_messages: 0, cost_inr: 0 };
    try {
      waCostStats = db.prepare(`
        SELECT
          COUNT(*) as total_messages,
          COALESCE(SUM(CASE WHEN billing_status NOT IN ('WAIVED', 'WAIVED_SANDBOX') THEN 1 ELSE 0 END), 0) as billed_messages,
          COALESCE(SUM(CASE WHEN billing_status IN ('WAIVED', 'WAIVED_SANDBOX') THEN 1 ELSE 0 END), 0) as waived_messages,
          COALESCE(SUM(CASE WHEN billing_status NOT IN ('WAIVED', 'WAIVED_SANDBOX') THEN COALESCE(unit_cost, 0) ELSE 0 END), 0) as cost_inr
        FROM whatsapp_usage_ledger
        WHERE ${finTenantFilter}
      `).get(...finTenantParams) || waCostStats;
    } catch (e) {}

    let aiCostStats = { total_calls: 0, total_tokens: 0, cost_inr: 0 };
    try {
      aiCostStats = db.prepare(`
        SELECT
          COUNT(*) as total_calls,
          COALESCE(SUM(COALESCE(tokens_total, 0)), 0) as total_tokens,
          COALESCE(SUM(COALESCE(estimated_cost_inr, 0)), 0) as cost_inr
        FROM ai_interaction_logs
        WHERE ${finTenantFilter}
      `).get(...finTenantParams) || aiCostStats;
    } catch (e) {}

    const universalRevenueInr = Number(txStats.revenue_inr || 0);
    const unifiedOrdersRevenueInr = Number(orderStats.revenue_inr || 0);
    const quotesWonRevenueInr = Number(quoteStats.revenue_inr || 0);
    const totalRevenueInr = Number((universalRevenueInr + unifiedOrdersRevenueInr + quotesWonRevenueInr).toFixed(2));
    const whatsappCostInr = Number(Number(waCostStats.cost_inr || 0).toFixed(4));
    const aiCostInr = Number(Number(aiCostStats.cost_inr || 0).toFixed(4));
    const totalCostInr = Number((whatsappCostInr + aiCostInr).toFixed(4));
    const netContributionInr = Number((totalRevenueInr - totalCostInr).toFixed(2));
    const paidConversions = Number(txStats.paid_count || 0) + Number(orderStats.paid_count || 0) + Number(quoteStats.won_count || 0);

    let subscriptionUsage = null;
    try {
      const billingService = require("../services/billingService");
      subscriptionUsage = billingService.getTenantEntitlementSnapshot(effectiveFinTenantId || activeTenantId);
    } catch (_) {}

    return res.status(200).json({
      success: true,
      data: {
        // Top-level telemetry for UI metrics cards
        totalBroadcasts: Number(campStats.total_campaigns || 0),
        totalRecipients: Number(campStats.total_contacts || 0),
        totalDelivered: Number(totalDelivered || 0),
        actualDelivered: Number(recipientStats.count_delivered || 0),
        totalRead: Number(totalRead || 0),
        totalFailed: Number(totalFailed || 0),
        totalSent: Number(totalSent || 0),
        totalReplies: Number(totalReplies || 0),
        deliveryRate: `${deliveryRate}%`,
        readRate: `${readRate}%`,
        replyRate: `${replyRate}%`,
        failureRate: `${failureRate}%`,
        activeScheduled: scheduledStats.count || 0,
        totalDispatches: autoStats.total_dispatches || 0,
        subscriptionUsage,

        // Real DB-derived Revenue, Costs & Funnel
        revenue: {
          currency: "INR",
          totalRevenueInr,
          universalTransactionsInr: Number(universalRevenueInr.toFixed(2)),
          unifiedOrdersInr: Number(unifiedOrdersRevenueInr.toFixed(2)),
          quotesWonInr: Number(quotesWonRevenueInr.toFixed(2)),
          paidConversions
        },
        costs: {
          currency: "INR",
          whatsappCostInr,
          aiCostInr,
          totalCostInr,
          billedMessages: Number(waCostStats.billed_messages || 0),
          waivedMessages: Number(waCostStats.waived_messages || 0),
          aiCalls: Number(aiCostStats.total_calls || 0),
          aiTokensTotal: Number(aiCostStats.total_tokens || 0)
        },
        financials: {
          currency: "INR",
          totalRevenueInr,
          totalCostInr,
          netContributionInr
        },
        funnel: {
          attempted: Number(totalAttempted || 0),
          sent: Number(totalSent || 0),
          delivered: Number(recipientStats.count_delivered || 0),
          read: Number(totalRead || 0),
          replied: Number(totalReplies || 0),
          paidConversions
        },

        // Deep structured telemetry
        campaigns: campStats,
        automation: autoStats,
        recipients: recipientStats,
        overall: {
          totalSent,
          totalDelivered,
          actualDelivered: Number(recipientStats.count_delivered || 0),
          totalRead,
          totalFailed,
          deliveryRate: parseFloat(deliveryRate),
          readRate: parseFloat(readRate),
          replyRate: parseFloat(replyRate),
          totalRevenueInr,
          totalCostInr,
          netContributionInr
        }
      }
    });
  } catch (error) {
    console.error("Overview analytics error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  getCampaignReports,
  exportCampaignReport,
  getAutomationReports,
  getOverviewAnalytics
};
