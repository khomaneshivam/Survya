/**
 * AI Assistant Controller
 * Provides REST endpoints for:
 * - Agent & Policy Guardrail Configuration
 * - Grounded Knowledge Sources CRUD
 * - Interactive Test Query Sandbox
 * - AI Interaction Logs
 * - Inbox AI Copilot (Draft, Translate, Summarize)
 */
const { getDb } = require('../config/database');
const taskScopedAiAgentService = require('../services/ai/taskScopedAiAgentService');
const inboxCopilotService = require('../services/ai/inboxCopilotService');
const knowledgeRetrievalService = require('../services/ai/knowledgeRetrievalService');

class AiAssistantController {
  /**
   * GET /api/v1/ai/config
   */
  async getConfig(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const config = taskScopedAiAgentService.getAgentConfig(tenantId);
      return res.json({ success: true, data: config });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * PUT /api/v1/ai/config
   */
  async updateConfig(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const updated = taskScopedAiAgentService.updateAgentConfig(tenantId, req.body || {});
      return res.json({
        success: true,
        message: 'AI Agent configuration updated successfully.',
        data: updated
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/v1/ai/knowledge
   */
  async listKnowledge(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const db = getDb();
      const sources = db.prepare(`
        SELECT * FROM ai_knowledge_sources
        WHERE tenant_id = ? AND delete_status = 0
        ORDER BY id DESC
      `).all(tenantId).map(s => {
        let tags = [];
        try {
          tags = typeof s.tags_json === 'string' ? JSON.parse(s.tags_json) : (s.tags_json || []);
        } catch (e) {}
        return {
          ...s,
          tags: Array.isArray(tags) ? tags : []
        };
      });

      return res.json({ success: true, data: sources });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/v1/ai/knowledge
   */
  async createKnowledge(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const { title, source_type = 'TEXT_FAQ', content_text, tags = [] } = req.body || {};

      if (!title || !title.trim()) {
        return res.status(400).json({ success: false, message: 'Title is required.' });
      }
      if (!content_text || !content_text.trim()) {
        return res.status(400).json({ success: false, message: 'Content text is required.' });
      }

      const db = getDb();
      const userId = req.user?.id || 'admin';
      const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : [tags]);

      const result = db.prepare(`
        INSERT INTO ai_knowledge_sources (
          tenant_id, title, source_type, content_text, tags_json,
          active_status, delete_status, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
      `).run(tenantId, title.trim(), source_type, content_text.trim(), tagsJson, userId, userId);

      const created = db.prepare('SELECT * FROM ai_knowledge_sources WHERE id = ?').get(result.lastInsertRowid);
      return res.status(201).json({
        success: true,
        message: 'Knowledge source created successfully.',
        data: {
          ...created,
          tags: Array.isArray(tags) ? tags : []
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * PUT /api/v1/ai/knowledge/:id
   */
  async updateKnowledge(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const { id } = req.params;
      const { title, source_type, content_text, tags, active_status } = req.body || {};

      const db = getDb();
      const existing = db.prepare(`
        SELECT * FROM ai_knowledge_sources WHERE id = ? AND tenant_id = ? AND delete_status = 0
      `).get(id, tenantId);

      if (!existing) {
        return res.status(404).json({ success: false, message: 'Knowledge source not found.' });
      }

      const updates = [];
      const params = [];

      if (title !== undefined) {
        updates.push('title = ?');
        params.push(title.trim());
      }
      if (source_type !== undefined) {
        updates.push('source_type = ?');
        params.push(source_type);
      }
      if (content_text !== undefined) {
        updates.push('content_text = ?');
        params.push(content_text.trim());
      }
      if (tags !== undefined) {
        updates.push('tags_json = ?');
        params.push(JSON.stringify(Array.isArray(tags) ? tags : [tags]));
      }
      if (active_status !== undefined) {
        updates.push('active_status = ?');
        params.push(active_status ? 1 : 0);
      }

      updates.push('updated_by = ?');
      params.push(req.user?.id || 'admin');

      params.push(id);
      params.push(tenantId);

      db.prepare(`
        UPDATE ai_knowledge_sources
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?
      `).run(...params);

      const updated = db.prepare('SELECT * FROM ai_knowledge_sources WHERE id = ?').get(id);
      let updatedTags = [];
      try {
        updatedTags = typeof updated.tags_json === 'string' ? JSON.parse(updated.tags_json) : (updated.tags_json || []);
      } catch (e) {}

      return res.json({
        success: true,
        message: 'Knowledge source updated successfully.',
        data: {
          ...updated,
          tags: Array.isArray(updatedTags) ? updatedTags : []
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * DELETE /api/v1/ai/knowledge/:id
   */
  async deleteKnowledge(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const { id } = req.params;
      const db = getDb();

      const existing = db.prepare(`
        SELECT * FROM ai_knowledge_sources WHERE id = ? AND tenant_id = ? AND delete_status = 0
      `).get(id, tenantId);

      if (!existing) {
        return res.status(404).json({ success: false, message: 'Knowledge source not found.' });
      }

      db.prepare(`
        UPDATE ai_knowledge_sources
        SET delete_status = 1, deleted_at = CURRENT_TIMESTAMP, deleted_by = ?
        WHERE id = ? AND tenant_id = ?
      `).run(req.user?.id || 'admin', id, tenantId);

      return res.json({ success: true, message: 'Knowledge source removed to Recycle Bin.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/v1/ai/test-query
   * Interactive Sandbox simulation
   */
  async testQuery(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const { query = '', inputType = 'TEXT' } = req.body || {};

      if (!query || !query.trim()) {
        return res.status(400).json({ success: false, message: 'Query text is required.' });
      }

      const result = await taskScopedAiAgentService.generateReply({
        tenantId,
        senderPhone: 'sandbox_test_user',
        userInput: query.trim(),
        inputType,
        isSimulation: true
      });

      return res.json({
        success: true,
        data: result
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/v1/ai/logs
   */
  async getLogs(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const logs = taskScopedAiAgentService.getInteractionLogs(tenantId, limit);
      return res.json({ success: true, data: logs });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/v1/ai/usage
   */
  async getUsage(req, res) {
    try {
      const tenantId = Number(req.user?.tenant_id || 1);
      const summary = taskScopedAiAgentService.getAiUsageSummary(tenantId);
      return res.json({ success: true, data: summary });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/v1/ai/copilot/draft-reply
   */
  async copilotDraftReply(req, res) {
    try {
      const tenantId = req.user?.tenant_id || 1;
      const { phone, messages = [], customerName = 'Guest' } = req.body || {};
      const result = await inboxCopilotService.draftReply({
        conversationPhone: phone,
        messages,
        tenantId,
        customerName
      });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/v1/ai/copilot/translate
   */
  async copilotTranslate(req, res) {
    try {
      const { text, targetLanguage = 'en' } = req.body || {};
      const result = await inboxCopilotService.translateMessage({ text, targetLanguage });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/v1/ai/copilot/summarize
   */
  async copilotSummarize(req, res) {
    try {
      const { messages = [], customerName = 'Guest', phone = '' } = req.body || {};
      const result = await inboxCopilotService.summarizeThread({ messages, customerName, phone });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new AiAssistantController();
