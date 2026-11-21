const inappExperienceService = require("../services/inapp/inappExperienceService");
const { validateFormSubmission } = require("../services/inapp/inappValidator");

class InappExperienceController {
  async listExperiences(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const { domainType, status, search } = req.query;
      const list = inappExperienceService.listExperiences(tenantId, { domainType, status, search });
      return res.status(200).json({ success: true, count: list.length, data: list });
    } catch (err) {
      console.error("[InappExperienceController] listExperiences error:", err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async getExperience(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const exp = inappExperienceService.getExperienceById(req.params.id, tenantId);
      if (!exp) {
        return res.status(404).json({ success: false, message: "Experience not found" });
      }
      return res.status(200).json({ success: true, data: exp });
    } catch (err) {
      console.error("[InappExperienceController] getExperience error:", err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async createExperience(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const createdBy = req.user?.email || req.user?.name || "admin";
      const exp = inappExperienceService.createExperience(req.body, tenantId, createdBy);
      return res.status(201).json({ success: true, message: "Experience created successfully", data: exp });
    } catch (err) {
      console.error("[InappExperienceController] createExperience error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  async createFromStarter(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const createdBy = req.user?.email || req.user?.name || "admin";
      const { domainType = "HOSPITALITY", name, slug } = req.body;
      const exp = inappExperienceService.seedStarterExperience(domainType, tenantId, createdBy, { name, slug });
      return res.status(201).json({ success: true, message: `Created starter experience for ${domainType}`, data: exp });
    } catch (err) {
      console.error("[InappExperienceController] createFromStarter error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  async updateExperience(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const updatedBy = req.user?.email || req.user?.name || "admin";
      const exp = inappExperienceService.updateExperience(req.params.id, req.body, tenantId, updatedBy);
      return res.status(200).json({ success: true, message: "Experience updated successfully", data: exp });
    } catch (err) {
      console.error("[InappExperienceController] updateExperience error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  async updateStatus(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const updatedBy = req.user?.email || req.user?.name || "admin";
      const { status } = req.body;
      const result = inappExperienceService.updateExperienceStatus(req.params.id, status, tenantId, updatedBy);
      return res.status(200).json({ success: true, message: `Status updated to ${status}`, data: result });
    } catch (err) {
      console.error("[InappExperienceController] updateStatus error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  async deleteExperience(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const updatedBy = req.user?.email || req.user?.name || "admin";
      const result = inappExperienceService.deleteExperience(req.params.id, tenantId, updatedBy);
      return res.status(200).json(result);
    } catch (err) {
      console.error("[InappExperienceController] deleteExperience error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  async getQrCode(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const qrData = inappExperienceService.getExperienceQrCode(req.params.id, tenantId);
      return res.status(200).json({ success: true, data: qrData });
    } catch (err) {
      console.error("[InappExperienceController] getQrCode error:", err.message);
      return res.status(404).json({ success: false, message: err.message });
    }
  }

  // --- Screens ---

  async listScreens(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const screens = inappExperienceService.listScreens(req.params.id, tenantId);
      return res.status(200).json({ success: true, count: screens.length, data: screens });
    } catch (err) {
      console.error("[InappExperienceController] listScreens error:", err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async createScreen(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const createdBy = req.user?.email || req.user?.name || "admin";
      const screen = inappExperienceService.createScreen(req.params.id, req.body, tenantId, createdBy);
      return res.status(201).json({ success: true, message: "Screen created successfully", data: screen });
    } catch (err) {
      console.error("[InappExperienceController] createScreen error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  async updateScreen(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const updatedBy = req.user?.email || req.user?.name || "admin";
      const screen = inappExperienceService.updateScreen(req.params.screenId, req.body, tenantId, updatedBy);
      return res.status(200).json({ success: true, message: "Screen updated successfully", data: screen });
    } catch (err) {
      console.error("[InappExperienceController] updateScreen error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  async deleteScreen(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const updatedBy = req.user?.email || req.user?.name || "admin";
      const result = inappExperienceService.deleteScreen(req.params.screenId, tenantId, updatedBy);
      return res.status(200).json(result);
    } catch (err) {
      console.error("[InappExperienceController] deleteScreen error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  async reorderScreens(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const { screenIds } = req.body;
      const result = inappExperienceService.reorderScreens(req.params.id, screenIds, tenantId);
      return res.status(200).json(result);
    } catch (err) {
      console.error("[InappExperienceController] reorderScreens error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // --- Form Fields ---

  async listFields(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const fields = inappExperienceService.listFormFields(req.params.screenId, tenantId);
      return res.status(200).json({ success: true, count: fields.length, data: fields });
    } catch (err) {
      console.error("[InappExperienceController] listFields error:", err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async createField(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const createdBy = req.user?.email || req.user?.name || "admin";
      const field = inappExperienceService.createFormField(req.params.screenId, req.body, tenantId, createdBy);
      return res.status(201).json({ success: true, message: "Form field created successfully", data: field });
    } catch (err) {
      console.error("[InappExperienceController] createField error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  async updateField(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const updatedBy = req.user?.email || req.user?.name || "admin";
      const field = inappExperienceService.updateFormField(req.params.fieldId, req.body, tenantId, updatedBy);
      return res.status(200).json({ success: true, message: "Form field updated successfully", data: field });
    } catch (err) {
      console.error("[InappExperienceController] updateField error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  async deleteField(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const updatedBy = req.user?.email || req.user?.name || "admin";
      const result = inappExperienceService.deleteFormField(req.params.fieldId, tenantId, updatedBy);
      return res.status(200).json(result);
    } catch (err) {
      console.error("[InappExperienceController] deleteField error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  async reorderFields(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const { fieldIds } = req.body;
      const result = inappExperienceService.reorderFormFields(req.params.screenId, fieldIds, tenantId);
      return res.status(200).json(result);
    } catch (err) {
      console.error("[InappExperienceController] reorderFields error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // --- Form Validation Endpoint ---

  async validateForm(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const fields = inappExperienceService.listFormFields(req.params.screenId, tenantId);
      const submittedValues = req.body || {};
      const validationResult = validateFormSubmission(fields, submittedValues);
      return res.status(200).json({
        success: validationResult.isValid,
        isValid: validationResult.isValid,
        fieldErrors: validationResult.fieldErrors,
        normalizedValues: validationResult.normalizedValues
      });
    } catch (err) {
      console.error("[InappExperienceController] validateForm error:", err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new InappExperienceController();

