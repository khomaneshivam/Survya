import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAutomations } from './hooks/useAutomations';
import { AutomationStudioHeader } from './components/AutomationStudioHeader';
import { AutomationHomePage } from './pages/AutomationHomePage';
import { TemplateLibraryPage } from './pages/TemplateLibraryPage';
import { TemplateDetailsPage } from './pages/TemplateDetailsPage';
import { TemplateSetupPage } from './pages/TemplateSetupPage';
import { AutomationDetailsPage } from './pages/AutomationDetailsPage';
import { WorkflowBuilderPage } from './pages/WorkflowBuilderPage';
import { ExecutionHistoryPage } from './pages/ExecutionHistoryPage';
import { TemplateAdminPage } from './pages/TemplateAdminPage';

export default function AutomationStudio({ defaultView = 'my-automations', initialFlowId = null }) {
  const { isAdmin } = useAuth();
  const {
    automations,
    metrics,
    loading,
    refresh,
    toggleStatus,
    deleteAutomation,
    duplicateAutomation
  } = useAutomations();

  const [activeView, setActiveView] = useState(defaultView);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedFlowId, setSelectedFlowId] = useState(initialFlowId);
  const [selectedInstallationId, setSelectedInstallationId] = useState(null);

  // Top-level views that show the primary Studio header
  const isTopLevelView = ['my-automations', 'templates', 'history', 'admin'].includes(activeView);

  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    setActiveView('template-setup');
  };

  const handleInspectTemplate = (template) => {
    setSelectedTemplate(template);
    setActiveView('template-details');
  };

  const handleOpenBuilder = (flowId) => {
    setSelectedFlowId(flowId);
    setActiveView('builder');
  };

  const handleOpenDetails = (flowId, instId) => {
    setSelectedFlowId(flowId);
    setSelectedInstallationId(instId);
    setActiveView('automation-details');
  };

  const handleOpenHistory = (flowId) => {
    setSelectedFlowId(flowId);
    setActiveView('history');
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans">
      {/* Studio Header (shown for top-level pages) */}
      {isTopLevelView && (
        <AutomationStudioHeader
          activeView={activeView}
          onViewChange={setActiveView}
          onNewAutomation={() => setActiveView('templates')}
          onRefresh={refresh}
          loading={loading}
          isAdmin={isAdmin}
          metrics={metrics}
        />
      )}

      {/* Main View Switcher */}
      <div className="flex-1">
        {activeView === 'my-automations' && (
          <AutomationHomePage
            automations={automations}
            metrics={metrics}
            loading={loading}
            onOpenBuilder={handleOpenBuilder}
            onOpenDetails={handleOpenDetails}
            onOpenHistory={handleOpenHistory}
            onToggleStatus={toggleStatus}
            onDeleteAutomation={deleteAutomation}
            onDuplicateAutomation={duplicateAutomation}
            onBrowseTemplates={() => setActiveView('templates')}
          />
        )}

        {activeView === 'templates' && (
          <TemplateLibraryPage
            onSelectTemplate={handleSelectTemplate}
            onInspectTemplate={handleInspectTemplate}
            onBackToAutomations={() => setActiveView('my-automations')}
          />
        )}

        {activeView === 'template-details' && (
          <TemplateDetailsPage
            template={selectedTemplate}
            onStartSetup={(tpl) => {
              setSelectedTemplate(tpl);
              setActiveView('template-setup');
            }}
            onBack={() => setActiveView('templates')}
          />
        )}

        {activeView === 'template-setup' && selectedTemplate && (
          <TemplateSetupPage
            template={selectedTemplate}
            onComplete={(inst, flow) => {
              refresh();
              setActiveView('my-automations');
            }}
            onCancel={() => setActiveView('templates')}
          />
        )}

        {activeView === 'automation-details' && (
          <AutomationDetailsPage
            flowId={selectedFlowId}
            installationId={selectedInstallationId}
            onBack={() => setActiveView('my-automations')}
            onOpenBuilder={handleOpenBuilder}
            onOpenHistory={handleOpenHistory}
          />
        )}

        {activeView === 'builder' && (
          <WorkflowBuilderPage
            flowId={selectedFlowId}
            onBack={() => setActiveView('my-automations')}
            onSaved={refresh}
          />
        )}

        {activeView === 'history' && (
          <ExecutionHistoryPage
            initialFlowId={selectedFlowId}
            onBack={() => setActiveView('my-automations')}
          />
        )}

        {activeView === 'admin' && isAdmin && (
          <TemplateAdminPage />
        )}
      </div>
    </div>
  );
}

