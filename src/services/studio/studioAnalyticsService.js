const { db } = require("../../config/database");

/**
 * Computes tenant-isolated Studio Performance & Conversion Funnel Analytics
 * strictly from persisted SQL data (no mock numbers).
 */
function getStudioAnalytics(tenantId = 1, { days = 30 } = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const safeDays = Math.max(1, Math.min(365, Number(days) || 30));

  const linksSummary = db.prepare(`
    SELECT
      COUNT(*) as total_links,
      COALESCE(SUM(clicks_count), 0) as total_clicks,
      COALESCE(SUM(conversations_count), 0) as initiated_conversations
    FROM chat_links
    WHERE tenant_id = ?
  `).get(numericTenantId) || {};

  const sessionStats = db.prepare(`
    SELECT
      COUNT(*) as total_launches,
      SUM(CASE WHEN demo_mode = 1 THEN 1 ELSE 0 END) as demo_sessions,
      SUM(CASE WHEN demo_mode = 0 AND goal_status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_sessions,
      SUM(CASE WHEN demo_mode = 0 AND status = 'EXPIRED' THEN 1 ELSE 0 END) as expired_sessions,
      SUM(CASE WHEN demo_mode = 0 AND status = 'ACTIVE' AND goal_status != 'COMPLETED' THEN 1 ELSE 0 END) as active_in_progress,
      SUM(CASE WHEN demo_mode = 0 AND channel_owner = 'HUMAN' THEN 1 ELSE 0 END) as human_handoffs,
      SUM(CASE WHEN demo_mode = 0 AND channel_owner = 'WHATSAPP' THEN 1 ELSE 0 END) as returned_to_whatsapp
    FROM inapp_sessions
    WHERE tenant_id = ? AND delete_status = 0
      AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
  `).get(numericTenantId, safeDays) || {};

  const goalsByType = db.prepare(`
    SELECT
      event_name,
      COUNT(*) as count,
      COALESCE(SUM(monetary_value), 0) as revenue
    FROM business_goal_outcomes
    WHERE tenant_id = ?
      AND achieved_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
    GROUP BY event_name
    ORDER BY count DESC
  `).all(numericTenantId, safeDays);

  const emailSummary = db.prepare(`
    SELECT
      status,
      COUNT(*) as count
    FROM email_notification_logs
    WHERE tenant_id = ?
      AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
    GROUP BY status
  `).all(numericTenantId, safeDays);

  const perExperience = db.prepare(`
    SELECT
      e.id, e.name, e.slug, e.domain_type, e.goal_type, e.status, e.published_version_number,
      (SELECT COUNT(*) FROM inapp_sessions s WHERE s.experience_id = e.id AND s.demo_mode = 0 AND s.delete_status = 0) as launches,
      (SELECT COUNT(*) FROM business_goal_outcomes b WHERE b.experience_id = e.id) as goals_completed,
      (SELECT COALESCE(SUM(b.monetary_value), 0) FROM business_goal_outcomes b WHERE b.experience_id = e.id) as total_value
    FROM inapp_experiences e
    WHERE e.tenant_id = ? AND e.delete_status = 0
    ORDER BY goals_completed DESC, launches DESC
    LIMIT 50
  `).all(numericTenantId);

  const liveLaunches = Math.max(0, Number(sessionStats.total_launches || 0) - Number(sessionStats.demo_sessions || 0));
  const completedCount = Number(sessionStats.completed_sessions || 0);
  const abandonedCount = Number(sessionStats.expired_sessions || 0);
  const conversionRate = liveLaunches > 0 ? Number(((completedCount / liveLaunches) * 100).toFixed(1)) : 0;
  const totalRevenue = goalsByType.reduce((acc, g) => acc + Number(g.revenue || 0), 0);

  return {
    windowDays: safeDays,
    funnel: {
      waLinkClicks: Number(linksSummary.total_clicks || 0),
      waConversationsStarted: Number(linksSummary.initiated_conversations || 0),
      chatLaunches: liveLaunches,
      demoSessionsExcluded: Number(sessionStats.demo_sessions || 0),
      activeInProgress: Number(sessionStats.active_in_progress || 0),
      abandonedSessions: abandonedCount,
      goalsCompleted: completedCount,
      conversionRatePercent: conversionRate,
      humanHandoffs: Number(sessionStats.human_handoffs || 0),
      returnedToWhatsapp: Number(sessionStats.returned_to_whatsapp || 0),
      totalAttributedRevenue: totalRevenue
    },
    goalsBreakdown: goalsByType,
    emailDeliverability: emailSummary,
    experiencesBreakdown: perExperience
  };
}

module.exports = {
  getStudioAnalytics
};
