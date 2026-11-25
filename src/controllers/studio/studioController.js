const studioExperienceService = require("../../services/studio/studioExperienceService");
const inappExperienceService = require("../../services/inapp/inappExperienceService");
const industryBlueprintService = require("../../services/studio/industryBlueprintService");
const emailNotificationService = require("../../services/studio/emailNotificationService");
const businessGoalService = require("../../services/studio/businessGoalService");
const experienceGovernanceService = require("../../services/studio/experienceGovernanceService");
const studioAnalyticsService = require("../../services/studio/studioAnalyticsService");
const domainProfileService = require("../../services/domainProfileService");

class StudioController {
  getOverview(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const data = studioExperienceService.getStudioOverview(tenantId);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  getComponents(req, res) {
    try {
      const data = studioExperienceService.getComponentsCatalog();
      return res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  listExperiences(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const list = inappExperienceService.listExperiences(tenantId, req.query || {});
      return res.status(200).json({ success: true, count: list.length, data: list });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  createGuided(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const actor = req.user?.email || req.user?.id || "studio";
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const data = studioExperienceService.createGuidedExperience(
        tenantId,
        { ...(req.body || {}), baseUrl: req.body?.baseUrl || baseUrl },
        actor
      );
      return res.status(201).json({ success: true, data });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  generateShareLink(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const actor = req.user?.email || req.user?.id || "studio";
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const data = studioExperienceService.generateWhatsAppShareLink(
        tenantId,
        req.params.id,
        { ...(req.body || {}), baseUrl: req.body?.baseUrl || baseUrl },
        actor
      );
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  listShareLinks(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const data = studioExperienceService.listShareLinks(tenantId, {
        experienceId: req.query?.experienceId || null,
        baseUrl
      });
      return res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  listExecutionHistory(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const data = studioExperienceService.listExecutionHistory(tenantId, {
        experienceId: req.query?.experienceId || null,
        limit: req.query?.limit || 50
      });
      return res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  listBlueprints(req, res) {
    try {
      const data = industryBlueprintService.listBlueprints({
        industry: req.query?.industry || "ALL",
        search: req.query?.search || ""
      });
      return res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  startBlueprintDemo(req, res) {
    try {
      const data = industryBlueprintService.startInteractiveDemo(req.params.key);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(err.statusCode || 400).json({ success: false, message: err.message });
    }
  }

  navigateBlueprintDemo(req, res) {
    try {
      const { demoToken, ...rest } = req.body || {};
      const data = industryBlueprintService.advanceInteractiveDemo(demoToken, rest);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message,
        fieldErrors: err.fieldErrors || undefined
      });
    }
  }

  installBlueprint(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const actor = req.user?.email || req.user?.id || "studio";
      const data = industryBlueprintService.cloneBlueprintToTenant(tenantId, req.params.key, req.body || {}, actor);
      return res.status(201).json({ success: true, data });
    } catch (err) {
      return res.status(err.statusCode || 400).json({ success: false, message: err.message });
    }
  }

  getEmailSettings(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const data = emailNotificationService.getTenantEmailSettings(tenantId);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  updateEmailSettings(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const actor = req.user?.email || req.user?.id || "studio";
      const data = emailNotificationService.updateTenantEmailSettings(tenantId, req.body || {}, actor);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  listEmailLogs(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const data = emailNotificationService.listNotificationLogs(tenantId, {
        status: req.query?.status || "ALL",
        limit: req.query?.limit || 50
      });
      return res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  retryEmailLog(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const data = emailNotificationService.retryNotificationLog(tenantId, req.params.id);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  listGoals(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const data = businessGoalService.listGoalOutcomes(tenantId, {
        experienceId: req.query?.experienceId || null,
        limit: req.query?.limit || 50
      });
      return res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  validateExperience(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const report = experienceGovernanceService.validateExperience(tenantId, req.params.id);
      return res.status(200).json({ success: true, data: report });
    } catch (err) {
      return res.status(err.statusCode || 400).json({ success: false, message: err.message });
    }
  }

  approveExperience(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const actor = req.user?.id || req.user?.email || "studio";
      const data = experienceGovernanceService.approveExperience(tenantId, req.params.id, {
        actor,
        actorEmail: req.user?.email || null,
        notes: req.body?.notes || ""
      });
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message,
        validationReport: err.validationReport || undefined
      });
    }
  }

  publishExperience(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const actor = req.user?.id || req.user?.email || "studio";
      const data = experienceGovernanceService.publishExperience(tenantId, req.params.id, {
        actor,
        actorEmail: req.user?.email || null,
        changelog: req.body?.changelog || ""
      });
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        code: err.code || undefined,
        message: err.message,
        validationReport: err.validationReport || undefined
      });
    }
  }

  rollbackExperience(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const actor = req.user?.id || req.user?.email || "studio";
      const target = req.body?.versionId || req.body?.versionNumber;
      const data = experienceGovernanceService.rollbackExperienceVersion(tenantId, req.params.id, target, {
        actor,
        actorEmail: req.user?.email || null
      });
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(err.statusCode || 400).json({ success: false, message: err.message });
    }
  }

  listVersions(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const data = experienceGovernanceService.listVersions(tenantId, req.params.id);
      return res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  listAuditLogs(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const data = experienceGovernanceService.listAuditLogs(tenantId, {
        experienceId: req.query?.experienceId || null,
        limit: req.query?.limit || 100
      });
      return res.status(200).json({ success: true, count: data.length, data });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  getAnalytics(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const data = studioAnalyticsService.getStudioAnalytics(tenantId, {
        days: req.query?.days || 30
      });
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  getDomainAccess(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const access = domainProfileService.getTenantDomainAccess(tenantId, {
        isPlatformAdmin: Boolean(req.user?.is_platform_admin)
      });
      return res.status(200).json({ success: true, data: access });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  activateDomain(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const { domain, makePrimary, businessName } = req.body || {};
      const result = domainProfileService.activateDomainForTenant(tenantId, domain, {
        makePrimary: Boolean(makePrimary),
        businessName: businessName || null,
        userId: req.user?.id || "owner",
        isPlatformAdmin: Boolean(req.user?.is_platform_admin)
      });
      return res.status(200).json({ success: true, data: result });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        code: err.code || undefined,
        message: err.message
      });
    }
  }
}

module.exports = new StudioController();
