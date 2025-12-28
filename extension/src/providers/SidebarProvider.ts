import * as vscode from 'vscode';
import * as fs from 'fs';
import { ProjectService, ProjectData, ProjectFaq } from '../services/ProjectService';
import { 
    isWebviewMessage, 
    WebviewToExtensionMessage,
    validateFaqInput 
} from '../types/messages';

// FAQ de développement chargées depuis un fichier JSON externe
// Lazy-loaded pour économiser la mémoire au démarrage
let _devFaqDatabase: ProjectFaq[] | null = null;

function getDevFaqDatabase(extensionUri: vscode.Uri): ProjectFaq[] {
    if (_devFaqDatabase === null) {
        try {
            const faqPath = vscode.Uri.joinPath(extensionUri, 'media', 'faq-database.json');
            const content = fs.readFileSync(faqPath.fsPath, 'utf-8');
            _devFaqDatabase = JSON.parse(content) as ProjectFaq[];
        } catch (error) {
            console.error('Failed to load FAQ database:', error);
            _devFaqDatabase = [];
        }
    }
    return _devFaqDatabase;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _projectService: ProjectService;
    private _isUpdatingFromWebview = false; // Prevent update loops

    constructor(
        extensionUri: vscode.Uri,
        projectService: ProjectService
    ) {
        this._extensionUri = extensionUri;
        this._projectService = projectService;

        // Écouter les changements de projet et envoyer les données au webview
        this._projectService.onProjectChange((project) => {
            // Skip sending to webview if the change originated from webview
            if (this._isUpdatingFromWebview) {
                return;
            }
            this._sendProjectToWebview(project);
            this._sendLibraryToWebview();
        });
    }

    private _sendProjectToWebview(project: ProjectData | null): void {
        if (this._view) {
            void this._view.webview.postMessage({
                type: 'projectUpdate',
                data: project
            });
        }
    }

    private _sendLibraryToWebview(): void {
        if (this._view) {
            const library = this._projectService.getLibrary();
            const currentProject = this._projectService.getCurrentProject();
            
            // Enrichir avec les données de progression
            const enrichedLibrary = library.map(p => {
                const fullProject = this._projectService.getProjectById?.(p.id);
                const progress = fullProject?.roadmap?.length 
                    ? Math.round(fullProject.roadmap.reduce((acc: number, b: any) => acc + (b.progress || 0), 0) / fullProject.roadmap.length)
                    : 0;
                return {
                    ...p,
                    progress,
                    phasesCount: fullProject?.roadmap?.length || 0
                };
            });
            
            void this._view.webview.postMessage({
                type: 'libraryUpdate',
                data: enrichedLibrary,
                currentProjectId: currentProject?.id
            });
        }
    }

    private _sendFaqsToWebview(): void {
        if (this._view) {
            const currentProject = this._projectService.getCurrentProject();
            void this._view.webview.postMessage({
                type: 'faqsUpdate',
                projectFaqs: currentProject?.faqs || [],
                devFaqs: getDevFaqDatabase(this._extensionUri)
            });
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlContent(webviewView.webview);

        // Gérer les messages du webview
        webviewView.webview.onDidReceiveMessage(async (rawMessage: unknown) => {
            // Validate incoming message structure
            if (!isWebviewMessage(rawMessage)) {
                console.warn('[SidebarProvider] Invalid message received:', rawMessage);
                return;
            }
            
            const message = rawMessage as WebviewToExtensionMessage & Record<string, unknown>;
            
            switch (message.type) {
                case 'getProject':
                    this._sendProjectToWebview(this._projectService.getCurrentProject());
                    break;

                case 'getLibrary':
                    this._sendLibraryToWebview();
                    break;

                case 'getFaqs':
                    this._sendFaqsToWebview();
                    break;

                case 'saveProject':
                    this._isUpdatingFromWebview = true;
                    try {
                        this._projectService.saveProject(message.data);
                    } finally {
                        this._isUpdatingFromWebview = false;
                    }
                    break;

                case 'switchProject':
                    this._isUpdatingFromWebview = true;
                    try {
                        this._projectService.switchToProject(message.projectId);
                    } finally {
                        this._isUpdatingFromWebview = false;
                    }
                    break;

                case 'deleteProject':
                case 'deleteLibraryProject':
                    {
                        const projectId = message.projectId || (message.data as any)?.projectId;
                        if (projectId) {
                            this._projectService.deleteProject(projectId);
                            this._sendLibraryToWebview();
                            this._sendProjectToWebview(this._projectService.getCurrentProject());
                        }
                    }
                    break;

                case 'closeProject':
                    this._projectService.closeProject();
                    this._sendLibraryToWebview();
                    break;

                case 'createProject':
                    this._projectService.createNewProject(message.name, message.projectType);
                    this._sendLibraryToWebview();
                    break;

                case 'addFaqToProject':
                    {
                        const devFaqs = getDevFaqDatabase(this._extensionUri);
                        const faq = devFaqs.find(f => f.id === message.faqId);
                        if (faq) {
                            this._projectService.addFaq({
                                question: faq.question,
                                answer: faq.answer,
                                category: faq.category,
                            });
                            this._sendFaqsToWebview();
                        }
                    }
                    break;

                case 'addProjectFaq':
                    {
                        const faqValidation = validateFaqInput({
                            question: message.question,
                            answer: message.answer,
                            category: message.category
                        });
                        if (!faqValidation.valid) {
                            console.warn('[SidebarProvider] Invalid FAQ input:', faqValidation.error);
                            void vscode.window.showWarningMessage(faqValidation.error || 'Invalid FAQ data');
                            break;
                        }
                        this._projectService.addFaq({
                            question: faqValidation.data!.question,
                            answer: faqValidation.data!.answer,
                            category: faqValidation.data!.category || 'Projet'
                        });
                        this._sendFaqsToWebview();
                    }
                    break;

                case 'deleteProjectFaq':
                    {
                        const currentProject = this._projectService.getCurrentProject();
                        if (currentProject) {
                            currentProject.faqs = currentProject.faqs.filter(f => f.id !== message.faqId);
                            this._projectService.saveProject(currentProject);
                            this._sendFaqsToWebview();
                        }
                    }
                    break;

                case 'openDashboard':
                    void vscode.commands.executeCommand('devarchitect.openDashboard');
                    break;

                case 'newProject':
                    void vscode.commands.executeCommand('devarchitect.newProject');
                    break;

                case 'importProject':
                    void vscode.commands.executeCommand('devarchitect.importProject');
                    break;

                // ========================================
                // Gestion VRAM / Modèles IA Mistral
                // ========================================
                case 'unloadModel':
                    {
                        const result = await vscode.commands.executeCommand('devarchitect.unloadModel');
                        this._view?.webview.postMessage({
                            type: 'vramStatusUpdate',
                            data: result
                        });
                    }
                    break;

                case 'unloadAllModels':
                    {
                        const result = await vscode.commands.executeCommand('devarchitect.unloadAllModels');
                        this._view?.webview.postMessage({
                            type: 'vramStatusUpdate',
                            data: result
                        });
                    }
                    break;

                case 'getVramStatus':
                    {
                        const status = await vscode.commands.executeCommand('devarchitect.getVramStatus');
                        this._view?.webview.postMessage({
                            type: 'vramStatusUpdate',
                            data: status
                        });
                    }
                    break;

                case 'getAIStatus':
                    {
                        const status = await vscode.commands.executeCommand('devarchitect.checkAIStatus');
                        this._view?.webview.postMessage({
                            type: 'aiStatusUpdate',
                            data: status
                        });
                    }
                    break;

                // ========================================
                // Code Review & Refactoring (IA Mistral)
                // ========================================
                case 'reviewCode':
                    {
                        this._view?.webview.postMessage({ type: 'aiLoading', action: 'reviewCode' });
                        const result = await vscode.commands.executeCommand('devarchitect.reviewCode');
                        this._view?.webview.postMessage({ type: 'reviewCodeResult', data: result });
                    }
                    break;

                case 'suggestRefactoring':
                    {
                        this._view?.webview.postMessage({ type: 'aiLoading', action: 'suggestRefactoring' });
                        const result = await vscode.commands.executeCommand('devarchitect.suggestRefactoring');
                        this._view?.webview.postMessage({ type: 'refactoringResult', data: result });
                    }
                    break;

                case 'explainCode':
                    {
                        this._view?.webview.postMessage({ type: 'aiLoading', action: 'explainCode' });
                        const result = await vscode.commands.executeCommand('devarchitect.explainCode');
                        this._view?.webview.postMessage({ type: 'explainCodeResult', data: result });
                    }
                    break;

                case 'generateTests':
                    {
                        this._view?.webview.postMessage({ type: 'aiLoading', action: 'generateTests' });
                        const result = await vscode.commands.executeCommand('devarchitect.generateTests');
                        this._view?.webview.postMessage({ type: 'generateTestsResult', data: result });
                    }
                    break;

                case 'detectSecurityIssues':
                    {
                        this._view?.webview.postMessage({ type: 'aiLoading', action: 'detectSecurityIssues' });
                        const result = await vscode.commands.executeCommand('devarchitect.detectSecurityIssues');
                        this._view?.webview.postMessage({ type: 'securityResult', data: result });
                    }
                    break;

                case 'aiCompleteProject':
                    {
                        this._view?.webview.postMessage({ type: 'aiLoading', action: 'aiComplete' });
                        const result = await vscode.commands.executeCommand('devarchitect.aiComplete');
                        this._view?.webview.postMessage({ type: 'aiCompleteResult', data: result });
                        // Refresh project data
                        this._sendProjectToWebview(this._projectService.getCurrentProject());
                    }
                    break;
            }
        });
    }

    private _getHtmlContent(_webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DevArchitect</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-sideBar-background);
            color: var(--vscode-sideBar-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
            font-size: 11px;
        }
        .header {
            text-align: center;
            padding: 6px;
            border-bottom: 1px solid var(--vscode-sideBar-border);
            background: linear-gradient(135deg, rgba(0,243,255,0.1), rgba(139,92,246,0.1));
        }
        .header h1 {
            font-size: 12px;
            font-weight: bold;
            color: #00f3ff;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }
        
        /* Tabs Navigation */
        .tabs {
            display: flex;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-editor-background);
        }
        .tab {
            flex: 1;
            padding: 6px 4px;
            text-align: center;
            cursor: pointer;
            font-size: 9px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            border: none;
            background: transparent;
            color: var(--vscode-descriptionForeground);
            transition: all 0.2s ease;
            border-bottom: 2px solid transparent;
            margin-bottom: -1px;
        }
        .tab:hover {
            color: var(--vscode-foreground);
            background: rgba(255,255,255,0.05);
        }
        .tab.active {
            color: #00f3ff;
            border-bottom-color: #00f3ff;
            background: rgba(0,243,255,0.1);
        }
        .tab-icon {
            display: block;
            font-size: 12px;
            margin-bottom: 2px;
        }
        
        /* Tab Content */
        .tab-content {
            flex: 1;
            overflow-y: auto;
            padding: 6px;
        }
        .tab-panel {
            display: none;
        }
        .tab-panel.active {
            display: block;
        }
        
        /* Project Card */
        .project-card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 8px;
            margin-bottom: 6px;
        }
        .project-name {
            font-size: 11px;
            font-weight: bold;
            margin-bottom: 3px;
            color: #00f3ff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .project-type {
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }
        .progress-bar {
            height: 4px;
            background: rgba(255,255,255,0.1);
            border-radius: 2px;
            overflow: hidden;
            margin-bottom: 4px;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #00f3ff, #00ff88);
            transition: width 0.3s ease;
            border-radius: 2px;
        }
        .stats {
            display: flex;
            justify-content: space-between;
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
        }
        
        /* Roadmap Mini */
        .roadmap-mini {
            margin-top: 6px;
            max-height: 100px;
            overflow-y: auto;
        }
        .phase-item {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 3px 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            font-size: 9px;
        }
        .phase-status {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .phase-status.done { background: #00ff88; box-shadow: 0 0 4px #00ff88; }
        .phase-status.doing { background: #ffea00; box-shadow: 0 0 4px #ffea00; }
        .phase-status.todo, .phase-status.backlog, .phase-status.review { background: #666; }
        
        /* Global Progress */
        .global-progress {
            margin: 8px 0;
        }
        .progress-bar.large {
            height: 8px;
            border-radius: 4px;
        }
        .progress-label {
            text-align: center;
            font-size: 10px;
            font-weight: 600;
            margin-top: 4px;
            color: #00f3ff;
        }
        
        /* Phase Stats Grid */
        .phase-stats {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 4px;
            margin: 8px 0;
        }
        .stat-item {
            background: rgba(255,255,255,0.05);
            border-radius: 4px;
            padding: 6px 4px;
            text-align: center;
        }
        .stat-item.done { border-left: 2px solid #00ff88; }
        .stat-item.review { border-left: 2px solid #00f3ff; }
        .stat-item.doing { border-left: 2px solid #ffcc00; }
        .stat-item.todo { border-left: 2px solid #666; }
        .stat-value {
            display: block;
            font-size: 14px;
            font-weight: 700;
            color: var(--vscode-foreground);
        }
        .stat-label {
            display: block;
            font-size: 7px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
        }
        
        /* Features Section */
        .features-section {
            margin: 8px 0;
        }
        .section-title {
            font-size: 9px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .features-list {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }
        .feature-tag {
            background: linear-gradient(135deg, rgba(0,243,255,0.2), rgba(255,0,255,0.2));
            border: 1px solid rgba(0,243,255,0.3);
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 8px;
            color: #00f3ff;
        }
        
        /* Phases Section */
        .phases-section {
            margin-top: 8px;
        }
        .phases-list {
            max-height: 180px;
            overflow-y: auto;
        }
        .phase-item-detailed {
            background: rgba(255,255,255,0.03);
            border-radius: 4px;
            padding: 6px;
            margin-bottom: 4px;
        }
        .phase-header {
            display: flex;
            align-items: center;
            gap: 4px;
            margin-bottom: 4px;
        }
        .phase-icon {
            font-size: 10px;
        }
        .phase-title {
            flex: 1;
            font-size: 9px;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .phase-percent {
            font-size: 9px;
            font-weight: 700;
        }
        .phase-progress-bar {
            height: 3px;
            background: rgba(255,255,255,0.1);
            border-radius: 2px;
            overflow: hidden;
        }
        .phase-progress-fill {
            height: 100%;
            border-radius: 2px;
            transition: width 0.3s ease;
        }
        .more-phases {
            text-align: center;
            font-size: 8px;
            color: var(--vscode-descriptionForeground);
            padding: 4px;
            font-style: italic;
        }
        
        /* Buttons */
        .btn {
            width: 100%;
            padding: 6px 8px;
            margin-top: 4px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 9px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            transition: all 0.2s ease;
        }
        .btn-primary {
            background: linear-gradient(135deg, #00f3ff, #00a8b5);
            color: black;
        }
        .btn-primary:hover {
            box-shadow: 0 2px 8px rgba(0,243,255,0.3);
        }
        .btn-secondary {
            background: rgba(255,255,255,0.1);
            color: var(--vscode-foreground);
            border: 1px solid rgba(255,255,255,0.2);
        }
        .btn-secondary:hover {
            background: rgba(255,255,255,0.15);
        }
        .btn-success {
            background: linear-gradient(135deg, #00ff88, #00cc6a);
            color: black;
        }
        
        /* Library */
        .library-item {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 4px;
            padding: 6px;
            margin-bottom: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .library-item:hover {
            background: rgba(0,243,255,0.1);
            border-color: rgba(0,243,255,0.3);
        }
        .library-item.active {
            border-color: #00f3ff;
            background: rgba(0,243,255,0.15);
        }
        .library-item-header {
            display: flex;
            align-items: center;
            gap: 4px;
            margin-bottom: 3px;
        }
        .library-item-icon {
            font-size: 12px;
        }
        .library-item-name {
            flex: 1;
            font-weight: 600;
            font-size: 10px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .library-item-meta {
            font-size: 8px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            justify-content: space-between;
        }
        .library-item-actions {
            display: flex;
            gap: 3px;
            margin-top: 4px;
        }
        .library-item-actions button {
            flex: 1;
            padding: 4px;
            font-size: 8px;
            border-radius: 3px;
            border: none;
            cursor: pointer;
        }
        .btn-load { background: rgba(0,243,255,0.2); color: #00f3ff; }
        .btn-delete { background: rgba(255,85,85,0.2); color: #ff5555; }
        
        /* New Project Form */
        .new-project-form {
            background: rgba(0,243,255,0.1);
            border: 1px solid rgba(0,243,255,0.3);
            border-radius: 4px;
            padding: 8px;
            margin-bottom: 6px;
        }
        .form-input {
            width: 100%;
            padding: 5px 6px;
            margin-bottom: 4px;
            background: rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 3px;
            color: white;
            font-size: 10px;
        }
        .form-input:focus {
            outline: none;
            border-color: #00f3ff;
        }
        .type-selector {
            display: flex;
            gap: 4px;
            margin-bottom: 4px;
        }
        .type-btn {
            flex: 1;
            padding: 5px;
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 3px;
            background: rgba(0,0,0,0.3);
            color: white;
            cursor: pointer;
            font-size: 9px;
            transition: all 0.2s;
        }
        .type-btn.selected {
            border-color: #00f3ff;
            background: rgba(0,243,255,0.2);
        }
        
        /* Wiki/FAQ */
        .faq-section {
            margin-bottom: 8px;
        }
        .faq-section-title {
            font-size: 9px;
            font-weight: 600;
            color: #00f3ff;
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }
        .faq-item {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 3px;
            margin-bottom: 3px;
            overflow: hidden;
        }
        .faq-question {
            padding: 6px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 9px;
            font-weight: 500;
        }
        .faq-question:hover {
            background: rgba(255,255,255,0.05);
        }
        .faq-answer {
            display: none;
            padding: 6px;
            background: rgba(0,0,0,0.3);
            font-size: 9px;
            line-height: 1.4;
            color: var(--vscode-descriptionForeground);
            border-top: 1px solid rgba(255,255,255,0.05);
        }
        .faq-item.expanded .faq-answer {
            display: block;
        }
        .faq-category {
            font-size: 7px;
            padding: 1px 4px;
            background: rgba(0,243,255,0.2);
            color: #00f3ff;
            border-radius: 2px;
            text-transform: uppercase;
            flex-shrink: 0;
        }
        .faq-add-btn {
            margin-top: 4px;
            padding: 4px 6px;
            background: rgba(0,255,136,0.2);
            color: #00ff88;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 8px;
            width: 100%;
        }
        
        /* Search */
        .search-box {
            position: relative;
            margin-bottom: 6px;
        }
        .search-input {
            width: 100%;
            padding: 5px 6px 5px 22px;
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 3px;
            color: white;
            font-size: 9px;
        }
        .search-icon {
            position: absolute;
            left: 6px;
            top: 50%;
            transform: translateY(-50%);
            opacity: 0.5;
            font-size: 10px;
        }
        
        /* Category Filters */
        .category-filters {
            display: flex;
            flex-wrap: wrap;
            gap: 2px;
            margin-bottom: 6px;
        }
        .category-filter {
            padding: 2px 5px;
            font-size: 8px;
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 2px;
            background: transparent;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            transition: all 0.2s;
        }
        .category-filter:hover {
            border-color: rgba(255,255,255,0.4);
        }
        .category-filter.active {
            background: rgba(0,243,255,0.2);
            border-color: #00f3ff;
            color: #00f3ff;
        }
        
        .no-project, .loading {
            text-align: center;
            padding: 16px 10px;
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
        }
        .empty-icon {
            font-size: 24px;
            opacity: 0.5;
            margin-bottom: 6px;
        }
        
        .hidden { display: none !important; }
        
        /* Toggle */
        .toggle-section {
            display: flex;
            gap: 2px;
            margin-bottom: 6px;
        }
        .toggle-btn {
            flex: 1;
            padding: 5px;
            font-size: 8px;
            font-weight: 600;
            border: 1px solid rgba(255,255,255,0.2);
            background: transparent;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            transition: all 0.2s;
        }
        .toggle-btn.active {
            background: rgba(0,243,255,0.2);
            border-color: #00f3ff;
            color: #00f3ff;
        }
        
        /* Action Buttons Container */
        .action-buttons {
            display: flex;
            gap: 6px;
            margin: 8px 0;
        }
        .action-buttons .btn {
            flex: 1;
        }
        
        /* Bouton IA Mistral Principal */
        .btn-ai-main {
            background: linear-gradient(135deg, rgba(139,92,246,0.4), rgba(236,72,153,0.4));
            border: 1px solid rgba(139,92,246,0.6);
            color: #e879f9;
            font-weight: 600;
            text-shadow: 0 0 8px rgba(139,92,246,0.5);
        }
        .btn-ai-main:hover {
            background: linear-gradient(135deg, rgba(139,92,246,0.6), rgba(236,72,153,0.6));
            box-shadow: 0 0 12px rgba(139,92,246,0.4);
            transform: translateY(-1px);
        }
        
        /* VRAM Panel - Gestion modèles IA */
        .btn-vram {
            background: linear-gradient(135deg, rgba(139,92,246,0.3), rgba(236,72,153,0.3));
            border: 1px solid rgba(139,92,246,0.5);
            color: #e879f9;
        }
        .btn-vram:hover {
            background: linear-gradient(135deg, rgba(139,92,246,0.5), rgba(236,72,153,0.5));
        }
        .vram-panel {
            background: rgba(139,92,246,0.1);
            border: 1px solid rgba(139,92,246,0.3);
            border-radius: 6px;
            padding: 8px;
            margin: 8px 0;
        }
        .vram-status {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            padding: 6px;
            background: rgba(0,0,0,0.2);
            border-radius: 4px;
        }
        .vram-status .model-name {
            color: #e879f9;
            font-weight: bold;
        }
        .vram-status .vram-size {
            color: #00ff88;
        }
        .btn-danger {
            background: linear-gradient(135deg, rgba(239,68,68,0.3), rgba(220,38,38,0.3));
            border: 1px solid rgba(239,68,68,0.5);
            color: #f87171;
            width: 100%;
            padding: 8px;
            font-size: 11px;
            font-weight: bold;
        }
        .btn-danger:hover {
            background: linear-gradient(135deg, rgba(239,68,68,0.5), rgba(220,38,38,0.5));
        }
        
        /* Scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚡ DevArchitect</h1>
    </div>
    
    <div class="tabs">
        <button class="tab active" data-tab="project">
            <span class="tab-icon">🚀</span>
            Projet
        </button>
        <button class="tab" data-tab="library">
            <span class="tab-icon">📚</span>
            Biblio
        </button>
        <button class="tab" data-tab="wiki">
            <span class="tab-icon">📖</span>
            Wiki
        </button>
    </div>
    
    <div class="tab-content">
        <!-- PROJECT TAB -->
        <div id="project-panel" class="tab-panel active">
            <div id="loading" class="loading">⏳ Chargement...</div>
            <div id="project-content" class="hidden"></div>
        </div>
        
        <!-- LIBRARY TAB -->
        <div id="library-panel" class="tab-panel">
            <div id="new-project-form" class="new-project-form hidden">
                <input type="text" id="new-project-name" class="form-input" placeholder="Nom du projet...">
                <div class="type-selector">
                    <button class="type-btn selected" data-type="WEB_MOBILE">🌐 Web/App</button>
                    <button class="type-btn" data-type="GAME_2D">🎮 Jeu 2D</button>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button id="create-project-btn" class="btn btn-success" style="flex:1;">Créer</button>
                    <button id="cancel-new-btn" class="btn btn-secondary" style="flex:1;">Annuler</button>
                </div>
            </div>
            
            <button id="new-project-toggle" class="btn btn-primary" style="margin-bottom: 12px;">
                ➕ Nouveau Projet
            </button>
            <button id="import-project-btn" class="btn btn-secondary" style="margin-bottom: 12px;">
                📥 Importer JSON
            </button>
            
            <div id="library-list"></div>
        </div>
        
        <!-- WIKI TAB -->
        <div id="wiki-panel" class="tab-panel">
            <div class="toggle-section">
                <button class="toggle-btn active" data-wiki="project">📝 FAQ Projet</button>
                <button class="toggle-btn" data-wiki="database">📚 Base Dev</button>
            </div>
            
            <div class="search-box">
                <span class="search-icon">🔍</span>
                <input type="text" id="faq-search" class="search-input" placeholder="Rechercher...">
            </div>
            
            <div id="wiki-project" class="faq-section">
                <div class="faq-section-title">FAQ du Projet</div>
                <div id="project-faqs-list"></div>
                <button id="add-faq-btn" class="btn btn-secondary" style="margin-top: 8px;">
                    ➕ Nouvelle Entrée
                </button>
            </div>
            
            <div id="wiki-database" class="faq-section hidden">
                <div class="faq-section-title">Base de Connaissances</div>
                <div class="category-filters" id="faq-categories"></div>
                <div id="dev-faqs-list"></div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentProject = null;
        let library = [];
        let currentProjectId = null;
        let projectFaqs = [];
        let devFaqs = [];
        let selectedType = 'WEB_MOBILE';
        let faqSearchQuery = '';
        let faqCategory = 'Tout';
        
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab + '-panel').classList.add('active');
                
                // Load data for tab
                if (tab.dataset.tab === 'library') {
                    vscode.postMessage({ type: 'getLibrary' });
                } else if (tab.dataset.tab === 'wiki') {
                    vscode.postMessage({ type: 'getFaqs' });
                }
            });
        });
        
        // Wiki toggle
        document.querySelectorAll('.toggle-btn[data-wiki]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.toggle-btn[data-wiki]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('wiki-project').classList.toggle('hidden', btn.dataset.wiki !== 'project');
                document.getElementById('wiki-database').classList.toggle('hidden', btn.dataset.wiki !== 'database');
            });
        });
        
        // Type selector
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedType = btn.dataset.type;
            });
        });
        
        // New project toggle
        document.getElementById('new-project-toggle').addEventListener('click', () => {
            document.getElementById('new-project-form').classList.remove('hidden');
            document.getElementById('new-project-toggle').classList.add('hidden');
            document.getElementById('new-project-name').focus();
        });
        
        document.getElementById('cancel-new-btn').addEventListener('click', () => {
            document.getElementById('new-project-form').classList.add('hidden');
            document.getElementById('new-project-toggle').classList.remove('hidden');
            document.getElementById('new-project-name').value = '';
        });
        
        document.getElementById('create-project-btn').addEventListener('click', () => {
            const name = document.getElementById('new-project-name').value.trim();
            if (name) {
                vscode.postMessage({ type: 'createProject', name, projectType: selectedType });
                document.getElementById('new-project-form').classList.add('hidden');
                document.getElementById('new-project-toggle').classList.remove('hidden');
                document.getElementById('new-project-name').value = '';
            }
        });
        
        document.getElementById('import-project-btn').addEventListener('click', () => {
            vscode.postMessage({ type: 'importProject' });
        });
        
        // FAQ search
        document.getElementById('faq-search').addEventListener('input', (e) => {
            faqSearchQuery = e.target.value.toLowerCase();
            renderFaqs();
        });
        
        document.getElementById('add-faq-btn').addEventListener('click', () => {
            const question = prompt('Question:');
            if (question) {
                const answer = prompt('Réponse:');
                if (answer) {
                    vscode.postMessage({ type: 'addProjectFaq', question, answer });
                }
            }
        });
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text || '';
            return div.innerHTML;
        }
        
        function renderProject(project) {
            const content = document.getElementById('project-content');
            const loading = document.getElementById('loading');
            
            loading.classList.add('hidden');
            content.classList.remove('hidden');
            
            if (!project || !project.name) {
                content.innerHTML = \`
                    <div class="no-project">
                        <div class="empty-icon">📁</div>
                        <p>Aucun projet actif</p>
                        <p style="font-size: 11px; margin-top: 8px;">Créez ou sélectionnez un projet dans la Bibliothèque</p>
                    </div>
                    <button class="btn btn-primary" onclick="vscode.postMessage({ type: 'newProject' })">
                        ➕ Nouveau Projet
                    </button>
                \`;
                return;
            }

            const roadmap = project.roadmap || [];
            const progress = roadmap.length > 0
                ? Math.round(roadmap.reduce((acc, b) => acc + (b.progress || 0), 0) / roadmap.length)
                : 0;

            // Statistiques détaillées des phases
            const donePhases = roadmap.filter(p => p.status === 'done').length;
            const reviewPhases = roadmap.filter(p => p.status === 'review').length;
            const doingPhases = roadmap.filter(p => p.status === 'doing').length;
            const todoPhases = roadmap.filter(p => p.status === 'todo' || p.status === 'backlog').length;

            const typeLabel = project.type === 'GAME_2D' ? '🎮 Jeu 2D' : '📱 App Web/Mobile';
            
            // Afficher les 6 premières phases avec plus de détails
            const phasesHtml = roadmap.slice(0, 6).map(phase => {
                const statusIcon = phase.status === 'done' ? '✅' : 
                                   phase.status === 'review' ? '🔍' :
                                   phase.status === 'doing' ? '🔄' : '📋';
                const progressColor = phase.progress >= 100 ? '#00ff88' :
                                      phase.progress >= 50 ? '#ffcc00' :
                                      phase.progress > 0 ? '#00f3ff' : '#666';
                return \`
                    <div class="phase-item-detailed">
                        <div class="phase-header">
                            <span class="phase-icon">\${statusIcon}</span>
                            <span class="phase-title">\${escapeHtml(phase.title)}</span>
                            <span class="phase-percent" style="color: \${progressColor}">\${phase.progress || 0}%</span>
                        </div>
                        <div class="phase-progress-bar">
                            <div class="phase-progress-fill" style="width: \${phase.progress || 0}%; background: \${progressColor}"></div>
                        </div>
                    </div>
                \`;
            }).join('');

            // Features détectées
            const featuresHtml = (project.coreFeatures || []).slice(0, 4).map(f => 
                \`<span class="feature-tag">\${escapeHtml(f)}</span>\`
            ).join('');

            // Assets du projet
            const assets = project.assets || [];
            const assetsIcons = {
                'Sprite': '🎨', 'UI_Element': '🖼️', 'Background': '🌄', 'Audio_SFX': '🔊',
                'Audio_Music': '🎵', 'Script': '📜', 'Mockup': '📐', 'Wireframe': '📋',
                'Image': '🖼️', 'Video': '🎬', 'Font': '🔤', 'Icon': '💎', 'Document': '📄'
            };
            const assetsHtml = assets.slice(0, 4).map(asset => {
                const icon = assetsIcons[asset.category] || '📦';
                return \`<span class="feature-tag" style="font-size: 8px;">\${icon} \${escapeHtml(asset.name)}</span>\`;
            }).join('');

            content.innerHTML = \`
                <div class="project-card">
                    <div class="project-name">\${escapeHtml(project.name)}</div>
                    <div class="project-type">\${typeLabel}</div>
                    
                    <!-- Barre de progression globale -->
                    <div class="global-progress">
                        <div class="progress-bar large">
                            <div class="progress-fill" style="width: \${progress}%"></div>
                        </div>
                        <div class="progress-label">\${progress}% Global</div>
                    </div>
                    
                    <!-- Statistiques des phases -->
                    <div class="phase-stats">
                        <div class="stat-item done">
                            <span class="stat-value">\${donePhases}</span>
                            <span class="stat-label">✅ Terminé</span>
                        </div>
                        <div class="stat-item review">
                            <span class="stat-value">\${reviewPhases}</span>
                            <span class="stat-label">🔍 Review</span>
                        </div>
                        <div class="stat-item doing">
                            <span class="stat-value">\${doingPhases}</span>
                            <span class="stat-label">🔄 En cours</span>
                        </div>
                        <div class="stat-item todo">
                            <span class="stat-value">\${todoPhases}</span>
                            <span class="stat-label">📋 À faire</span>
                        </div>
                    </div>
                    
                    <!-- Features détectées -->
                    \${featuresHtml ? \`
                        <div class="features-section">
                            <div class="section-title">🔧 Technologies</div>
                            <div class="features-list">\${featuresHtml}</div>
                        </div>
                    \` : ''}
                    
                    <!-- Liste des phases -->
                    <div class="phases-section">
                        <div class="section-title">📋 Sprints (\${roadmap.length})</div>
                        <div class="phases-list">\${phasesHtml}</div>
                        \${roadmap.length > 6 ? \`<div class="more-phases">+ \${roadmap.length - 6} autres phases...</div>\` : ''}
                    </div>
                    
                    <!-- Assets du projet -->
                    \${assets.length > 0 ? \`
                        <div class="features-section" style="margin-top: 8px;">
                            <div class="section-title">🎨 Assets (\${assets.length})</div>
                            <div class="features-list">\${assetsHtml}</div>
                            \${assets.length > 4 ? \`<div class="more-phases">+ \${assets.length - 4} autres assets...</div>\` : ''}
                        </div>
                    \` : ''}
                </div>
                
                <div class="action-buttons">
                    <button class="btn btn-primary" onclick="vscode.postMessage({ type: 'openDashboard' })">
                        🖥️ Dashboard
                    </button>
                    <button id="vram-btn" class="btn btn-ai-main" onclick="toggleVramPanel()">
                        🧠 IA Mistral
                    </button>
                </div>
                <div id="vram-panel" class="vram-panel hidden">
                    <div class="vram-status" id="vram-status">Chargement...</div>
                    <div class="ai-actions" style="display: flex; flex-direction: column; gap: 4px; margin-top: 8px;">
                        <button class="btn btn-ai" onclick="aiAction('aiCompleteProject')" style="background: linear-gradient(135deg, rgba(0,243,255,0.2), rgba(139,92,246,0.2)); border-color: rgba(0,243,255,0.4);">
                            ✨ Compléter Projet (IA)
                        </button>
                        <div style="display: flex; gap: 4px;">
                            <button class="btn btn-ai" onclick="aiAction('reviewCode')" style="flex:1; font-size: 9px; background: rgba(0,200,100,0.15); border-color: rgba(0,200,100,0.4);">
                                🔍 Review
                            </button>
                            <button class="btn btn-ai" onclick="aiAction('suggestRefactoring')" style="flex:1; font-size: 9px; background: rgba(255,200,0,0.15); border-color: rgba(255,200,0,0.4);">
                                🔧 Refactor
                            </button>
                        </div>
                        <div style="display: flex; gap: 4px;">
                            <button class="btn btn-ai" onclick="aiAction('explainCode')" style="flex:1; font-size: 9px; background: rgba(100,150,255,0.15); border-color: rgba(100,150,255,0.4);">
                                📖 Expliquer
                            </button>
                            <button class="btn btn-ai" onclick="aiAction('generateTests')" style="flex:1; font-size: 9px; background: rgba(200,100,255,0.15); border-color: rgba(200,100,255,0.4);">
                                🧪 Tests
                            </button>
                        </div>
                        <button class="btn btn-ai" onclick="aiAction('detectSecurityIssues')" style="font-size: 9px; background: rgba(255,85,85,0.15); border-color: rgba(255,85,85,0.4);">
                            🔐 Analyse Sécurité
                        </button>
                    </div>
                    <button class="btn btn-danger" onclick="unloadModels()" style="margin-top: 8px;">
                        ⚡ Libérer VRAM
                    </button>
                </div>
                <button class="btn btn-close" onclick="closeProject()" style="background: rgba(255,85,85,0.2); color: #ff5555; border: 1px solid rgba(255,85,85,0.4);">
                    ✕ Fermer Projet
                </button>
            \`;
        }
        
        function renderLibrary() {
            const list = document.getElementById('library-list');
            
            if (library.length === 0) {
                list.innerHTML = \`
                    <div class="no-project">
                        <div class="empty-icon">📚</div>
                        <p>Aucun projet sauvegardé</p>
                        <p style="font-size: 11px; margin-top: 8px;">Créez votre premier projet</p>
                    </div>
                \`;
                return;
            }
            
            list.innerHTML = library.map(p => \`
                <div class="library-item \${p.id === currentProjectId ? 'active' : ''}" data-id="\${p.id}">
                    <div class="library-item-header">
                        <span class="library-item-icon">\${p.type === 'GAME_2D' ? '🎮' : '🌐'}</span>
                        <span class="library-item-name">\${escapeHtml(p.name)}</span>
                    </div>
                    <div class="progress-bar" style="margin-bottom: 4px;">
                        <div class="progress-fill" style="width: \${p.progress || 0}%"></div>
                    </div>
                    <div class="library-item-meta">
                        <span>\${p.progress || 0}%</span>
                        <span>\${p.phasesCount || 0} phases</span>
                    </div>
                    <div class="library-item-actions">
                        \${p.id !== currentProjectId ? \`<button class="btn-load" data-action="load" data-pid="\${p.id}">Charger</button>\` : '<button class="btn-load" disabled style="opacity:0.5">Actif</button>'}
                        <button class="btn-delete" data-action="delete" data-pid="\${p.id}">🗑️</button>
                    </div>
                </div>
            \`).join('');
            
            // Attach event listeners with proper data handling
            list.querySelectorAll('[data-action="load"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    loadProject(btn.dataset.pid);
                });
            });
            list.querySelectorAll('[data-action="delete"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteProject(btn.dataset.pid, e);
                });
            });
        }
        
        function renderFaqs() {
            // Project FAQs
            const projectList = document.getElementById('project-faqs-list');
            const filteredProjectFaqs = projectFaqs.filter(f => 
                faqSearchQuery === '' || 
                f.question.toLowerCase().includes(faqSearchQuery) || 
                f.answer.toLowerCase().includes(faqSearchQuery)
            );
            
            if (filteredProjectFaqs.length === 0) {
                projectList.innerHTML = '<p style="text-align:center; color: var(--vscode-descriptionForeground); font-size: 11px; padding: 20px;">Aucune FAQ projet. Ajoutez des entrées ou importez depuis la base.</p>';
            } else {
                projectList.innerHTML = filteredProjectFaqs.map(faq => \`
                    <div class="faq-item" onclick="this.classList.toggle('expanded')">
                        <div class="faq-question">
                            <span>\${escapeHtml(faq.question)}</span>
                            <span class="faq-category">\${faq.category || 'Projet'}</span>
                        </div>
                        <div class="faq-answer">
                            \${escapeHtml(faq.answer)}
                            <button class="faq-add-btn" style="background: rgba(255,85,85,0.2); color: #ff5555; margin-top: 8px;" onclick="event.stopPropagation(); deleteProjectFaq('\${faq.id}')">
                                🗑️ Supprimer
                            </button>
                        </div>
                    </div>
                \`).join('');
            }
            
            // Dev FAQs
            const categories = ['Tout', ...new Set(devFaqs.map(f => f.category))];
            document.getElementById('faq-categories').innerHTML = categories.map(cat => \`
                <button class="category-filter \${cat === faqCategory ? 'active' : ''}" onclick="setFaqCategory('\${cat}')">\${cat}</button>
            \`).join('');
            
            const devList = document.getElementById('dev-faqs-list');
            const filteredDevFaqs = devFaqs.filter(f => {
                const matchCat = faqCategory === 'Tout' || f.category === faqCategory;
                const matchSearch = faqSearchQuery === '' || 
                    f.question.toLowerCase().includes(faqSearchQuery) || 
                    f.answer.toLowerCase().includes(faqSearchQuery);
                return matchCat && matchSearch;
            });
            
            devList.innerHTML = filteredDevFaqs.map(faq => \`
                <div class="faq-item" onclick="this.classList.toggle('expanded')">
                    <div class="faq-question">
                        <span>\${escapeHtml(faq.question)}</span>
                        <span class="faq-category">\${faq.category}</span>
                    </div>
                    <div class="faq-answer">
                        \${escapeHtml(faq.answer)}
                        <button class="faq-add-btn" onclick="event.stopPropagation(); addFaqToProject('\${faq.id}')">
                            ➕ Ajouter au projet
                        </button>
                    </div>
                </div>
            \`).join('');
        }
        
        window.loadProject = function(id) {
            vscode.postMessage({ type: 'switchProject', projectId: id });
        };
        
        window.deleteProject = function(id, event) {
            event.stopPropagation();
            if (confirm('Supprimer ce projet ?')) {
                vscode.postMessage({ type: 'deleteProject', projectId: id });
            }
        };
        
        window.setFaqCategory = function(cat) {
            faqCategory = cat;
            renderFaqs();
        };
        
        window.addFaqToProject = function(faqId) {
            vscode.postMessage({ type: 'addFaqToProject', faqId });
        };
        
        window.deleteProjectFaq = function(faqId) {
            vscode.postMessage({ type: 'deleteProjectFaq', faqId });
        };
        
        window.closeProject = function() {
            vscode.postMessage({ type: 'closeProject' });
            currentProject = null;
            currentProjectId = null;
            renderProject(null);
        };
        
        // ========================================
        // Gestion VRAM / Modèles IA Mistral
        // ========================================
        let vramPanelOpen = false;
        
        window.toggleVramPanel = function() {
            const panel = document.getElementById('vram-panel');
            vramPanelOpen = !vramPanelOpen;
            
            if (vramPanelOpen) {
                panel.classList.remove('hidden');
                // Demander le statut VRAM
                vscode.postMessage({ type: 'getVramStatus' });
            } else {
                panel.classList.add('hidden');
            }
        };
        
        window.unloadModels = function() {
            const statusEl = document.getElementById('vram-status');
            statusEl.innerHTML = '⏳ Déchargement en cours...';
            vscode.postMessage({ type: 'unloadAllModels' });
        };
        
        // ========================================
        // Actions IA (Code Review, Refactoring, etc.)
        // ========================================
        window.aiAction = function(action) {
            const statusEl = document.getElementById('vram-status');
            const actionNames = {
                'reviewCode': '🔍 Revue de code',
                'suggestRefactoring': '🔧 Analyse refactoring',
                'explainCode': '📖 Explication',
                'generateTests': '🧪 Génération tests',
                'detectSecurityIssues': '🔐 Analyse sécurité',
                'aiCompleteProject': '✨ Complétion IA'
            };
            statusEl.innerHTML = \`⏳ \${actionNames[action] || action} en cours...\`;
            vscode.postMessage({ type: action });
        };
        
        function updateVramStatus(data) {
            const statusEl = document.getElementById('vram-status');
            if (!statusEl) return;
            
            if (data.models && data.models.length > 0) {
                const totalGB = (data.totalVram / 1024 / 1024 / 1024).toFixed(2);
                const modelsList = data.models.map(m => {
                    const sizeGB = (m.sizeVram / 1024 / 1024 / 1024).toFixed(2);
                    return \`<div>🧠 <span class="model-name">\${m.name}</span>: <span class="vram-size">\${sizeGB} GB</span></div>\`;
                }).join('');
                
                statusEl.innerHTML = \`
                    <div style="margin-bottom: 4px; font-weight: bold;">VRAM utilisée: <span class="vram-size">\${totalGB} GB</span></div>
                    \${modelsList}
                \`;
            } else if (data.success !== undefined) {
                // Résultat de déchargement
                statusEl.innerHTML = data.success 
                    ? \`✅ \${data.message}\`
                    : \`❌ \${data.message}\`;
            } else {
                statusEl.innerHTML = '✅ Aucun modèle chargé en VRAM';
            }
        }

        // Message handling
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'projectUpdate':
                    currentProject = message.data;
                    renderProject(currentProject);
                    break;
                case 'libraryUpdate':
                    library = message.data || [];
                    currentProjectId = message.currentProjectId;
                    renderLibrary();
                    break;
                case 'faqsUpdate':
                    projectFaqs = message.projectFaqs || [];
                    devFaqs = message.devFaqs || [];
                    renderFaqs();
                    break;
                case 'vramStatusUpdate':
                    updateVramStatus(message.data);
                    break;
                case 'aiStatusUpdate':
                    console.log('AI Status:', message.data);
                    updateVramStatus(message.data);
                    break;
                case 'aiLoading':
                    // Déjà géré dans aiAction
                    break;
                case 'reviewCodeResult':
                    handleAIResult('Revue de code', message.data);
                    break;
                case 'refactoringResult':
                    handleAIResult('Refactoring', message.data);
                    break;
                case 'explainCodeResult':
                    handleAIResult('Explication', message.data);
                    break;
                case 'generateTestsResult':
                    handleAIResult('Tests générés', message.data);
                    break;
                case 'securityResult':
                    handleAIResult('Sécurité', message.data);
                    break;
                case 'aiCompleteResult':
                    handleAIResult('Complétion IA', message.data);
                    break;
            }
        });
        
        function handleAIResult(actionName, result) {
            const statusEl = document.getElementById('vram-status');
            if (!statusEl) return;
            
            if (result && result.success) {
                let summary = '';
                if (result.review) {
                    const r = result.review;
                    const emoji = r.score >= 80 ? '🌟' : r.score >= 60 ? '✅' : r.score >= 40 ? '⚠️' : '❌';
                    summary = \`\${emoji} Score: \${r.score}/100 | \${r.issues?.length || 0} issues\`;
                } else if (result.refactoring) {
                    summary = \`✅ \${result.refactoring.suggestions?.length || 0} suggestions\`;
                } else if (result.explanation) {
                    summary = '✅ Voir console pour détails';
                    console.log('Explication:', result.explanation);
                } else if (result.tests) {
                    summary = '✅ Tests générés';
                    console.log('Tests:', result.tests);
                } else if (result.issues) {
                    const critical = result.issues.filter(i => i.severity === 'critical').length;
                    const high = result.issues.filter(i => i.severity === 'high').length;
                    if (critical > 0) summary = \`🚨 \${critical} critique(s)!\`;
                    else if (high > 0) summary = \`⚠️ \${high} haute(s)\`;
                    else if (result.issues.length > 0) summary = \`🔍 \${result.issues.length} mineur(s)\`;
                    else summary = '✅ Aucune vulnérabilité';
                } else if (result.completion) {
                    summary = '✅ Projet complété par l\\'IA';
                } else {
                    summary = '✅ ' + actionName + ' terminé';
                }
                statusEl.innerHTML = summary;
            } else {
                statusEl.innerHTML = \`❌ Erreur: \${result?.error || 'Échec'}\`;
            }
        }

        // Initial load
        vscode.postMessage({ type: 'getProject' });
    </script>
</body>
</html>`;
    }
}
