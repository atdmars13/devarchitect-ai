import * as vscode from 'vscode';
import { ProjectService } from '../services/ProjectService';
import { AICompletionService } from '../services/AICompletionService';

export class DevArchitectPanel {
    public static currentPanel: DevArchitectPanel | undefined;
    private static readonly viewType = 'devarchitect.dashboard';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _projectService: ProjectService;
    private readonly _aiCompletionService: AICompletionService;
    private _disposables: vscode.Disposable[] = [];
    private _isUpdatingFromWebview = false; // Prevent update loops

    public static createOrShow(
        extensionUri: vscode.Uri,
        projectService: ProjectService
    ) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // Si le panel existe déjà, le révéler
        if (DevArchitectPanel.currentPanel) {
            DevArchitectPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Sinon, créer un nouveau panel
        // Note: retainContextWhenHidden=false pour économiser la mémoire
        // Le state est persisté dans globalState, donc on peut recréer le webview
        const panel = vscode.window.createWebviewPanel(
            DevArchitectPanel.viewType,
            'DevArchitect AI',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: false, // Économie mémoire - le state est dans globalState
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'out'),
                    vscode.Uri.joinPath(extensionUri, 'webview-dist')
                ]
            }
        );

        DevArchitectPanel.currentPanel = new DevArchitectPanel(
            panel,
            extensionUri,
            projectService
        );
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        projectService: ProjectService
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._projectService = projectService;
        this._aiCompletionService = new AICompletionService();

        // Définir le contenu HTML initial
        this._update();

        // Écouter les changements de projet (synchronisation avec Sidebar)
        const projectChangeDisposable = this._projectService.onProjectChange((project) => {
            // Skip if the change came from this panel's webview
            if (this._isUpdatingFromWebview) {
                return;
            }
            if (this._panel.visible) {
                void this._panel.webview.postMessage({
                    type: 'projectData',
                    data: project,
                });
            }
        });
        this._disposables.push(projectChangeDisposable);

        // Écouter les événements du panel
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Écouter les changements de visibilité
        this._panel.onDidChangeViewState(
            () => {
                if (this._panel.visible) {
                    this._update();
                }
            },
            null,
            this._disposables
        );

        // Gérer les messages du webview
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.type) {
                    case 'getProject': {
                        const project = this._projectService.getCurrentProject();
                        void this._panel.webview.postMessage({
                            type: 'projectData',
                            data: project,
                        });
                        break;
                    }

                    case 'saveProject':
                        this._isUpdatingFromWebview = true;
                        try {
                            this._projectService.saveProject(message.data);
                        } finally {
                            this._isUpdatingFromWebview = false;
                        }
                        break;

                    case 'getLibrary': {
                        const library = this._projectService.getLibrary();
                        void this._panel.webview.postMessage({
                            type: 'libraryData',
                            data: library,
                        });
                        break;
                    }

                    case 'switchProject': {
                        const switchedProject = this._projectService.switchToProject(message.data.projectId);
                        if (switchedProject) {
                            void this._panel.webview.postMessage({
                                type: 'projectData',
                                data: switchedProject,
                            });
                        }
                        break;
                    }

                    case 'deleteLibraryProject':
                        this._projectService.deleteProject(message.data.projectId);
                        // Renvoyer la bibliothèque mise à jour
                        void this._panel.webview.postMessage({
                            type: 'libraryData',
                            data: this._projectService.getLibrary(),
                        });
                        // Renvoyer le projet actif (si changé)
                        void this._panel.webview.postMessage({
                            type: 'projectData',
                            data: this._projectService.getCurrentProject(),
                        });
                        break;

                    case 'createNewProject': {
                        const newProject = this._projectService.createNewProject(
                            message.data.name || 'Nouveau Projet',
                            message.data.type || 'WEB_MOBILE'
                        );
                        void this._panel.webview.postMessage({
                            type: 'projectData',
                            data: newProject,
                        });
                        void this._panel.webview.postMessage({
                            type: 'libraryData',
                            data: this._projectService.getLibrary(),
                        });
                        break;
                    }

                    case 'requestCompletion':
                        // Analyser le workspace et compléter le projet
                        await this.handleCompletion(message.data);
                        break;

                    case 'showInfo':
                        vscode.window.showInformationMessage(message.message);
                        break;

                    case 'showError':
                        vscode.window.showErrorMessage(message.message);
                        break;

                    case 'openExternal':
                        void vscode.env.openExternal(vscode.Uri.parse(message.url));
                        break;

                    case 'runCommand':
                        // Exécuter une commande dans le terminal
                        {
                            const terminal = vscode.window.createTerminal('DevArchitect');
                            terminal.sendText(message.command);
                            terminal.show();
                        }
                        break;

                }
            },
            null,
            this._disposables
        );

        // Écouter les changements de projet
        this._projectService.onProjectChange((project) => {
            void this._panel.webview.postMessage({
                type: 'projectData',
                data: project,
            });
        });
    }

    public dispose() {
        DevArchitectPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = this._getNonce();

        return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};">
    <title>DevArchitect AI</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        :root {
            --bg-primary: #0a0a0f;
            --bg-secondary: #12121a;
            --bg-card: #1a1a24;
            --border-color: rgba(0,243,255,0.2);
            --text-primary: #ffffff;
            --text-secondary: #a0a0b0;
            --accent-cyan: #00f3ff;
            --accent-purple: #8b5cf6;
            --accent-pink: #ec4899;
            --accent-green: #00ff88;
            --accent-yellow: #ffcc00;
            --accent-red: #ff5555;
        }
        
        body {
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            overflow-x: hidden;
        }
        
        /* Header */
        .header {
            background: linear-gradient(135deg, rgba(0,243,255,0.1), rgba(139,92,246,0.1));
            border-bottom: 1px solid var(--border-color);
            padding: 16px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .header h1 {
            font-size: 20px;
            font-weight: 700;
            background: linear-gradient(90deg, var(--accent-cyan), var(--accent-purple));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .header-actions {
            display: flex;
            gap: 8px;
        }
        
        /* Tabs */
        .tabs {
            display: flex;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            overflow-x: auto;
        }
        .tab {
            padding: 12px 20px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            color: var(--text-secondary);
            border: none;
            background: transparent;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
            white-space: nowrap;
        }
        .tab:hover {
            color: var(--text-primary);
            background: rgba(255,255,255,0.05);
        }
        .tab.active {
            color: var(--accent-cyan);
            border-bottom-color: var(--accent-cyan);
            background: rgba(0,243,255,0.1);
        }
        
        /* Main Content */
        .main-content {
            padding: 20px;
            max-height: calc(100vh - 120px);
            overflow-y: auto;
        }
        .tab-panel {
            display: none;
            animation: fadeIn 0.3s ease;
        }
        .tab-panel.active {
            display: block;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        /* Cards */
        .card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 16px;
        }
        .card-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }
        .card-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--accent-cyan);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        /* Form Elements */
        .form-group {
            margin-bottom: 12px;
        }
        .form-label {
            display: block;
            font-size: 11px;
            font-weight: 600;
            color: var(--text-secondary);
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .form-input, .form-textarea, .form-select {
            width: 100%;
            padding: 10px 12px;
            background: rgba(0,0,0,0.4);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            color: var(--text-primary);
            font-size: 13px;
            transition: border-color 0.2s;
        }
        .form-input:focus, .form-textarea:focus, .form-select:focus {
            outline: none;
            border-color: var(--accent-cyan);
            box-shadow: 0 0 0 2px rgba(0,243,255,0.1);
        }
        .form-textarea {
            min-height: 80px;
            resize: vertical;
        }
        
        /* Grid */
        .grid-2 {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
        }
        .grid-3 {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
        }
        
        /* Buttons */
        .btn {
            padding: 10px 16px;
            border: none;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .btn-primary {
            background: linear-gradient(135deg, var(--accent-cyan), #00a8b5);
            color: black;
        }
        .btn-primary:hover {
            box-shadow: 0 4px 12px rgba(0,243,255,0.3);
            transform: translateY(-1px);
        }
        .btn-secondary {
            background: rgba(255,255,255,0.1);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
        }
        .btn-secondary:hover {
            background: rgba(255,255,255,0.15);
        }
        .btn-ai {
            background: linear-gradient(135deg, rgba(139,92,246,0.3), rgba(236,72,153,0.3));
            border: 1px solid rgba(139,92,246,0.5);
            color: #e879f9;
        }
        .btn-ai:hover {
            background: linear-gradient(135deg, rgba(139,92,246,0.5), rgba(236,72,153,0.5));
        }
        .btn-success {
            background: linear-gradient(135deg, var(--accent-green), #00cc6a);
            color: black;
        }
        .btn-danger {
            background: rgba(255,85,85,0.2);
            border: 1px solid rgba(255,85,85,0.4);
            color: var(--accent-red);
        }
        
        /* Progress Bar */
        .progress-bar {
            height: 8px;
            background: rgba(255,255,255,0.1);
            border-radius: 4px;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--accent-cyan), var(--accent-green));
            border-radius: 4px;
            transition: width 0.3s ease;
        }
        .progress-label {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            margin-top: 4px;
        }
        
        /* Phase List */
        .phase-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .phase-item {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px;
            padding: 12px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .phase-status {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .phase-status.done { background: var(--accent-green); box-shadow: 0 0 8px var(--accent-green); }
        .phase-status.doing { background: var(--accent-yellow); box-shadow: 0 0 8px var(--accent-yellow); }
        .phase-status.review { background: var(--accent-cyan); box-shadow: 0 0 8px var(--accent-cyan); }
        .phase-status.todo, .phase-status.backlog { background: #666; }
        .phase-info {
            flex: 1;
        }
        .phase-title {
            font-weight: 600;
            font-size: 13px;
            margin-bottom: 4px;
        }
        .phase-meta {
            font-size: 11px;
            color: var(--text-secondary);
        }
        .phase-progress {
            width: 80px;
            text-align: right;
        }
        .phase-percent {
            font-size: 14px;
            font-weight: 700;
        }
        
        /* Assets Grid */
        .assets-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 12px;
        }
        .asset-card {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px;
            padding: 12px;
            text-align: center;
        }
        .asset-icon {
            font-size: 24px;
            margin-bottom: 8px;
        }
        .asset-name {
            font-size: 12px;
            font-weight: 500;
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .asset-category {
            font-size: 10px;
            color: var(--text-secondary);
        }
        
        /* Commands */
        .command-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .command-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            background: rgba(0,0,0,0.3);
            border: 1px solid var(--border-color);
            border-radius: 6px;
        }
        .command-label {
            font-weight: 600;
            font-size: 12px;
            min-width: 100px;
        }
        .command-text {
            flex: 1;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 12px;
            color: var(--accent-green);
        }
        .command-run {
            padding: 4px 10px;
            font-size: 10px;
        }
        
        /* Variables */
        .variable-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px;
            background: rgba(0,0,0,0.3);
            border-radius: 4px;
            margin-bottom: 6px;
        }
        .variable-key {
            font-family: monospace;
            font-weight: 600;
            color: var(--accent-purple);
            min-width: 150px;
        }
        .variable-value {
            flex: 1;
            font-family: monospace;
            color: var(--accent-green);
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        /* Stats */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 16px;
        }
        .stat-card {
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            padding: 16px;
            text-align: center;
        }
        .stat-value {
            font-size: 28px;
            font-weight: 700;
            background: linear-gradient(90deg, var(--accent-cyan), var(--accent-purple));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .stat-label {
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 4px;
        }
        
        /* Tags */
        .tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        .tag {
            padding: 4px 10px;
            background: linear-gradient(135deg, rgba(0,243,255,0.2), rgba(139,92,246,0.2));
            border: 1px solid rgba(0,243,255,0.3);
            border-radius: 12px;
            font-size: 11px;
            color: var(--accent-cyan);
        }
        
        /* Empty State */
        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--text-secondary);
        }
        .empty-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }
        
        /* Scrollbar */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
        
        .hidden { display: none !important; }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚡ DevArchitect AI</h1>
        <div class="header-actions">
            <button class="btn btn-ai" onclick="requestCompletion()">✨ Compléter avec IA</button>
            <button class="btn btn-secondary" onclick="saveProject()">💾 Sauvegarder</button>
        </div>
    </div>
    
    <div class="tabs">
        <button class="tab active" data-tab="vision">📋 Vision</button>
        <button class="tab" data-tab="specs">⚙️ Specs</button>
        <button class="tab" data-tab="design">🎨 Design</button>
        <button class="tab" data-tab="roadmap">🗓️ Roadmap</button>
        <button class="tab" data-tab="assets">🎨 Assets</button>
        <button class="tab" data-tab="devtools">🛠️ DevTools</button>
    </div>
    
    <div class="main-content">
        <!-- VISION TAB -->
        <div id="vision-panel" class="tab-panel active">
            <div class="card">
                <div class="card-header">
                    <span class="card-title">🎯 Identité du Projet</span>
                </div>
                <div class="form-group">
                    <label class="form-label">Nom du Projet</label>
                    <input type="text" class="form-input" id="project-name" placeholder="Mon Super Projet">
                </div>
                <div class="grid-2">
                    <div class="form-group">
                        <label class="form-label">Type</label>
                        <select class="form-select" id="project-type">
                            <option value="WEB_MOBILE">🌐 Web/Mobile</option>
                            <option value="GAME_2D">🎮 Jeu 2D</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Statut</label>
                        <select class="form-select" id="project-status">
                            <option value="PLANNING">📝 Planning</option>
                            <option value="IN_PROGRESS">🚀 En cours</option>
                            <option value="REVIEW">🔍 Review</option>
                            <option value="COMPLETED">✅ Terminé</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">💡 Concept & Vision</span>
                </div>
                <div class="form-group">
                    <label class="form-label">Elevator Pitch</label>
                    <input type="text" class="form-input" id="elevator-pitch" placeholder="Une phrase qui résume votre projet">
                </div>
                <div class="form-group">
                    <label class="form-label">Concept</label>
                    <textarea class="form-textarea" id="concept" placeholder="Description détaillée du concept..."></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">Audience Cible</label>
                    <input type="text" class="form-input" id="target-audience" placeholder="Développeurs, gamers, entreprises...">
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">🔧 Fonctionnalités Clés</span>
                </div>
                <div id="core-features" class="tags"></div>
            </div>
        </div>
        
        <!-- SPECS TAB -->
        <div id="specs-panel" class="tab-panel">
            <div class="card">
                <div class="card-header">
                    <span class="card-title">📱 Spécifications Techniques</span>
                </div>
                <div class="grid-2">
                    <div class="form-group">
                        <label class="form-label">Catégorie</label>
                        <input type="text" class="form-input" id="app-category" placeholder="Productivity, E-Commerce...">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Cible de Déploiement</label>
                        <input type="text" class="form-input" id="deployment-target" placeholder="Vercel, AWS, App Store...">
                    </div>
                </div>
                <div class="grid-2">
                    <div class="form-group">
                        <label class="form-label">Framework Frontend</label>
                        <input type="text" class="form-input" id="frontend-framework" placeholder="React, Vue, Angular...">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Framework Backend</label>
                        <input type="text" class="form-input" id="backend-framework" placeholder="Node.js, Django, Rails...">
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">📋 Architecture</span>
                </div>
                <div class="form-group">
                    <textarea class="form-textarea" id="architecture" placeholder="Description de l'architecture technique..." style="min-height: 150px; font-family: monospace;"></textarea>
                </div>
            </div>
        </div>
        
        <!-- DESIGN TAB -->
        <div id="design-panel" class="tab-panel">
            <div class="card">
                <div class="card-header">
                    <span class="card-title">🎨 Direction Artistique</span>
                </div>
                <div class="form-group">
                    <label class="form-label">Style Visuel</label>
                    <input type="text" class="form-input" id="art-direction" placeholder="Moderne, minimaliste, rétro...">
                </div>
                <div class="form-group">
                    <label class="form-label">Thème UI</label>
                    <input type="text" class="form-input" id="ui-theme" placeholder="Dark mode, Light mode...">
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">🎨 Palette de Couleurs</span>
                </div>
                <div class="grid-3">
                    <div class="form-group">
                        <label class="form-label">Primaire</label>
                        <input type="color" class="form-input" id="primary-color" value="#3b82f6" style="height: 40px; padding: 4px;">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Secondaire</label>
                        <input type="color" class="form-input" id="secondary-color" value="#8b5cf6" style="height: 40px; padding: 4px;">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Accent</label>
                        <input type="color" class="form-input" id="accent-color" value="#10b981" style="height: 40px; padding: 4px;">
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">✏️ Typographie</span>
                </div>
                <div class="grid-2">
                    <div class="form-group">
                        <label class="form-label">Police Titres</label>
                        <input type="text" class="form-input" id="font-heading" placeholder="Inter, Roboto...">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Police Corps</label>
                        <input type="text" class="form-input" id="font-body" placeholder="System, Open Sans...">
                    </div>
                </div>
            </div>
        </div>
        
        <!-- ROADMAP TAB -->
        <div id="roadmap-panel" class="tab-panel">
            <div class="stats-grid" id="roadmap-stats">
                <div class="stat-card">
                    <div class="stat-value" id="stat-done">0</div>
                    <div class="stat-label">✅ Terminées</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="stat-doing">0</div>
                    <div class="stat-label">🔄 En cours</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="stat-todo">0</div>
                    <div class="stat-label">📋 À faire</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="stat-progress">0%</div>
                    <div class="stat-label">📊 Global</div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">🗓️ Phases du Projet</span>
                    <button class="btn btn-secondary" onclick="addPhase()">➕ Ajouter</button>
                </div>
                <div class="progress-bar" style="margin-bottom: 16px;">
                    <div class="progress-fill" id="global-progress" style="width: 0%"></div>
                </div>
                <div id="phases-list" class="phase-list">
                    <div class="empty-state">
                        <div class="empty-icon">📋</div>
                        <p>Aucune phase définie</p>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- ASSETS TAB -->
        <div id="assets-panel" class="tab-panel">
            <div class="card">
                <div class="card-header">
                    <span class="card-title">🎨 Assets du Projet</span>
                    <button class="btn btn-secondary" onclick="scanAssets()">🔍 Scanner</button>
                </div>
                <div id="assets-grid" class="assets-grid">
                    <div class="empty-state">
                        <div class="empty-icon">🖼️</div>
                        <p>Aucun asset</p>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- DEVTOOLS TAB -->
        <div id="devtools-panel" class="tab-panel">
            <div class="card">
                <div class="card-header">
                    <span class="card-title">⚡ Commandes Rapides</span>
                </div>
                <div id="commands-list" class="command-list">
                    <div class="empty-state">
                        <div class="empty-icon">🛠️</div>
                        <p>Aucune commande</p>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">🔑 Variables d'Environnement</span>
                    <button class="btn btn-secondary" onclick="scanVariables()">🔍 Scanner</button>
                </div>
                <div id="variables-list">
                    <div class="empty-state">
                        <div class="empty-icon">🔐</div>
                        <p>Aucune variable</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let currentProject = null;
        
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab + '-panel').classList.add('active');
            });
        });
        
        // Escape HTML
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text || '';
            return div.innerHTML;
        }
        
        // Render project data
        function renderProject(project) {
            if (!project) return;
            currentProject = project;
            
            // Vision tab
            document.getElementById('project-name').value = project.name || '';
            document.getElementById('project-type').value = project.type || 'WEB_MOBILE';
            document.getElementById('project-status').value = project.status || 'PLANNING';
            document.getElementById('elevator-pitch').value = project.elevatorPitch || '';
            document.getElementById('concept').value = project.concept || '';
            document.getElementById('target-audience').value = project.targetAudience || '';
            
            // Core features
            const featuresEl = document.getElementById('core-features');
            const features = project.coreFeatures || [];
            featuresEl.innerHTML = features.length > 0 
                ? features.map(f => '<span class="tag">' + escapeHtml(f) + '</span>').join('')
                : '<span style="color: var(--text-secondary);">Aucune fonctionnalité définie</span>';
            
            // Specs tab
            if (project.specs) {
                document.getElementById('app-category').value = project.specs.appCategory || '';
                document.getElementById('deployment-target').value = project.specs.deploymentTarget || '';
                document.getElementById('frontend-framework').value = project.specs.frontendFramework || '';
                document.getElementById('backend-framework').value = project.specs.backendFramework || '';
            }
            document.getElementById('architecture').value = project.architecture || '';
            
            // Design tab
            if (project.design) {
                document.getElementById('art-direction').value = project.design.artDirection || '';
                document.getElementById('ui-theme').value = project.design.uiTheme || '';
                document.getElementById('primary-color').value = project.design.primaryColor || '#3b82f6';
                document.getElementById('secondary-color').value = project.design.secondaryColor || '#8b5cf6';
                document.getElementById('accent-color').value = project.design.accentColor || '#10b981';
                document.getElementById('font-heading').value = project.design.fontHeading || '';
                document.getElementById('font-body').value = project.design.fontBody || '';
            }
            
            // Roadmap
            renderRoadmap(project.roadmap || []);
            
            // Assets
            renderAssets(project.assets || []);
            
            // DevTools
            renderCommands(project.commands || []);
            renderVariables(project.variables || []);
        }
        
        function renderRoadmap(phases) {
            const done = phases.filter(p => p.status === 'done').length;
            const doing = phases.filter(p => p.status === 'doing').length;
            const todo = phases.filter(p => p.status === 'todo' || p.status === 'backlog' || p.status === 'review').length;
            const progress = phases.length > 0 
                ? Math.round(phases.reduce((acc, p) => acc + (p.progress || 0), 0) / phases.length) 
                : 0;
            
            document.getElementById('stat-done').textContent = done;
            document.getElementById('stat-doing').textContent = doing;
            document.getElementById('stat-todo').textContent = todo;
            document.getElementById('stat-progress').textContent = progress + '%';
            document.getElementById('global-progress').style.width = progress + '%';
            
            const listEl = document.getElementById('phases-list');
            if (phases.length === 0) {
                listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Aucune phase définie</p></div>';
                return;
            }
            
            listEl.innerHTML = phases.map(phase => {
                const statusClass = phase.status || 'todo';
                const progressColor = phase.progress >= 100 ? 'var(--accent-green)' : 
                                      phase.progress >= 50 ? 'var(--accent-yellow)' : 'var(--accent-cyan)';
                return '<div class="phase-item">' +
                    '<div class="phase-status ' + statusClass + '"></div>' +
                    '<div class="phase-info">' +
                        '<div class="phase-title">' + escapeHtml(phase.title) + '</div>' +
                        '<div class="phase-meta">' + escapeHtml(phase.description || '') + '</div>' +
                    '</div>' +
                    '<div class="phase-progress">' +
                        '<div class="phase-percent" style="color:' + progressColor + '">' + (phase.progress || 0) + '%</div>' +
                    '</div>' +
                '</div>';
            }).join('');
        }
        
        function renderAssets(assets) {
            const gridEl = document.getElementById('assets-grid');
            if (assets.length === 0) {
                gridEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🖼️</div><p>Aucun asset</p></div>';
                return;
            }
            
            const icons = {
                'Sprite': '🎨', 'UI_Element': '🖼️', 'Background': '🌄', 'Audio_SFX': '🔊',
                'Audio_Music': '🎵', 'Script': '📜', 'Mockup': '📐', 'Wireframe': '📋'
            };
            
            gridEl.innerHTML = assets.map(asset => {
                const icon = icons[asset.category] || '📄';
                return '<div class="asset-card">' +
                    '<div class="asset-icon">' + icon + '</div>' +
                    '<div class="asset-name">' + escapeHtml(asset.name) + '</div>' +
                    '<div class="asset-category">' + escapeHtml(asset.category) + '</div>' +
                '</div>';
            }).join('');
        }
        
        function renderCommands(commands) {
            const listEl = document.getElementById('commands-list');
            if (commands.length === 0) {
                listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🛠️</div><p>Aucune commande</p></div>';
                return;
            }
            
            listEl.innerHTML = commands.map(cmd => 
                '<div class="command-item">' +
                    '<span class="command-label">' + escapeHtml(cmd.label) + '</span>' +
                    '<code class="command-text">' + escapeHtml(cmd.command) + '</code>' +
                    '<button class="btn btn-secondary command-run" onclick="runCommand(\\'' + escapeHtml(cmd.command).replace(/'/g, "\\\\'") + '\\')">▶️</button>' +
                '</div>'
            ).join('');
        }
        
        function renderVariables(variables) {
            const listEl = document.getElementById('variables-list');
            if (variables.length === 0) {
                listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🔐</div><p>Aucune variable</p></div>';
                return;
            }
            
            listEl.innerHTML = variables.map(v => 
                '<div class="variable-item">' +
                    '<span class="variable-key">' + escapeHtml(v.key) + '</span>' +
                    '<span class="variable-value">' + escapeHtml(v.value || '***') + '</span>' +
                '</div>'
            ).join('');
        }
        
        // Actions
        function saveProject() {
            if (!currentProject) return;
            
            currentProject.name = document.getElementById('project-name').value;
            currentProject.type = document.getElementById('project-type').value;
            currentProject.status = document.getElementById('project-status').value;
            currentProject.elevatorPitch = document.getElementById('elevator-pitch').value;
            currentProject.concept = document.getElementById('concept').value;
            currentProject.targetAudience = document.getElementById('target-audience').value;
            currentProject.architecture = document.getElementById('architecture').value;
            
            currentProject.specs = currentProject.specs || {};
            currentProject.specs.appCategory = document.getElementById('app-category').value;
            currentProject.specs.deploymentTarget = document.getElementById('deployment-target').value;
            currentProject.specs.frontendFramework = document.getElementById('frontend-framework').value;
            currentProject.specs.backendFramework = document.getElementById('backend-framework').value;
            
            currentProject.design = currentProject.design || {};
            currentProject.design.artDirection = document.getElementById('art-direction').value;
            currentProject.design.uiTheme = document.getElementById('ui-theme').value;
            currentProject.design.primaryColor = document.getElementById('primary-color').value;
            currentProject.design.secondaryColor = document.getElementById('secondary-color').value;
            currentProject.design.accentColor = document.getElementById('accent-color').value;
            currentProject.design.fontHeading = document.getElementById('font-heading').value;
            currentProject.design.fontBody = document.getElementById('font-body').value;
            
            vscode.postMessage({ type: 'saveProject', data: currentProject });
            vscode.postMessage({ type: 'showInfo', message: '✅ Projet sauvegardé!' });
        }
        
        function requestCompletion() {
            if (!currentProject) return;
            vscode.postMessage({ type: 'requestCompletion', data: currentProject });
        }
        
        function runCommand(cmd) {
            vscode.postMessage({ type: 'runCommand', command: cmd });
        }
        
        function scanAssets() {
            vscode.postMessage({ type: 'showInfo', message: '🔍 Scan des assets en cours...' });
        }
        
        function scanVariables() {
            vscode.postMessage({ type: 'showInfo', message: '🔍 Scan des variables en cours...' });
        }
        
        function addPhase() {
            const title = prompt('Nom de la phase:');
            if (title && currentProject) {
                currentProject.roadmap = currentProject.roadmap || [];
                currentProject.roadmap.push({
                    id: 'phase-' + Date.now(),
                    title: title,
                    description: '',
                    status: 'todo',
                    progress: 0,
                    priority: 'Moyenne'
                });
                renderRoadmap(currentProject.roadmap);
            }
        }
        
        // Message handling
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'projectData':
                    renderProject(message.data);
                    break;
                case 'completionStarted':
                    vscode.postMessage({ type: 'showInfo', message: '🤖 Complétion IA en cours...' });
                    // Visual feedback: show all tabs as pending or something similar could be added here
                    break;
                case 'projectCompletionStep':
                    // Update specific section
                    if (message.data && currentProject) {
                        // Merge only the new data
                        Object.keys(message.data).forEach(key => {
                            currentProject[key] = message.data[key];
                        });
                        renderProject(currentProject);

                        // Switch to the relevant tab if needed, or show a toast
                        const sectionToTab = {
                            'vision': 'vision',
                            'specs': 'specs',
                            'design': 'design',
                            'roadmap': 'roadmap',
                            'assets': 'assets'
                        };
                        const tabId = sectionToTab[message.section];
                        if (tabId) {
                            // Highlight the tab momentarily or switch? switching might be annoying if user is reading.
                            // Let's just update the UI and maybe show a small notification or flash the tab.
                            const tabBtn = document.querySelector('.tab[data-tab="' + tabId + '"]');
                            if (tabBtn) {
                                tabBtn.style.color = 'var(--accent-green)';
                                setTimeout(() => tabBtn.style.color = '', 1000);
                            }
                        }
                    }
                    break;
                case 'projectCompletion':
                    if (message.error) {
                        vscode.postMessage({ type: 'showError', message: message.error });
                    } else if (message.data && currentProject) {
                        // Merge completion data
                        Object.keys(message.data).forEach(key => {
                            if (message.data[key] && !currentProject[key]) {
                                currentProject[key] = message.data[key];
                            }
                        });
                        renderProject(currentProject);
                        vscode.postMessage({ type: 'showInfo', message: '✨ Complétion appliquée!' });
                    }
                    break;
            }
        });
        
        // Initial load
        vscode.postMessage({ type: 'getProject' });
    </script>
</body>
</html>`;
    }

    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Analyse le workspace et génère une complétion IA pour le projet
     */
    private async handleCompletion(currentProjectData: any): Promise<void> {
        try {
            // Notifier le début du traitement
            void this._panel.webview.postMessage({
                type: 'completionStarted',
            });

            // Vérifier si Ollama est disponible
            const ollamaAvailable = await this._aiCompletionService.isOllamaAvailable();
            const model = ollamaAvailable ? await this._aiCompletionService.selectBestModel() : null;

            // Utiliser la complétion séquentielle pour des mises à jour progressives
            const generator = this._aiCompletionService.completeProjectSequential(currentProjectData);

            let fullCompletion = {};

            for await (const step of generator) {
                // Mettre à jour les données complètes
                fullCompletion = { ...fullCompletion, ...step.data };

                // Envoyer la mise à jour partielle au webview
                void this._panel.webview.postMessage({
                    type: 'projectCompletionStep',
                    section: step.section,
                    data: step.data
                });
            }

            // Message informatif
            const source = model 
                ? `🤖 IA (${model})` 
                : '📁 Analyse workspace';
            
            vscode.window.showInformationMessage(
                `✨ Complétion terminée via ${source}`
            );

        } catch (error: any) {
            console.error('Completion error:', error);
            void this._panel.webview.postMessage({
                type: 'projectCompletion',
                error: error.message || 'Erreur lors de la complétion',
            });
            vscode.window.showErrorMessage(
                `Erreur de complétion: ${error.message || 'Erreur inconnue'}`
            );
        }
    }
}
