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
        // Chemin vers le build Vite copié dans l'extension
        const distPath = vscode.Uri.joinPath(this._extensionUri, 'webview-dist');
        
        // Fichiers avec noms fixes (configurés dans vite.config.ts)
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(distPath, 'assets', 'index.js')
        );
        
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(distPath, 'assets', 'index.css')
        );

        const nonce = this._getNonce();

        // Note: Le bundle React sera chargé depuis le dossier webview/dist
        // Pour le développement, on peut utiliser une version simplifiée
        return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};">
    <title>DevArchitect AI</title>
    <link href="${styleUri.toString()}" rel="stylesheet">
    <style>
        /* Fallback styles si le CSS ne charge pas */
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f0f0f;
            color: white;
        }
        #root {
            min-height: 100vh;
        }
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            font-size: 18px;
            color: #00f3ff;
        }
    </style>
</head>
<body>
    <div id="root">
        <div class="loading">Chargement de DevArchitect AI...</div>
    </div>
    
    <script nonce="${nonce}">
        // Initialiser l'API VS Code
        const vscode = acquireVsCodeApi();
        
        // Exposer pour le React app
        window.vscodeApi = vscode;
        
        // Bridge pour la communication
        window.postToExtension = function(type, data) {
            vscode.postMessage({ type, ...data });
        };
        
        // Demander les données du projet au démarrage
        vscode.postMessage({ type: 'getProject' });
    </script>
    <script nonce="${nonce}" src="${scriptUri.toString()}"></script>
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

            // Générer la complétion (IA ou fallback)
            const completion = await this._aiCompletionService.completeProject(currentProjectData);

            // Envoyer la complétion au webview
            void this._panel.webview.postMessage({
                type: 'projectCompletion',
                data: completion,
            });

            // Message informatif
            const source = model 
                ? `🤖 IA (${model})` 
                : '📁 Analyse workspace';
            
            vscode.window.showInformationMessage(
                `✨ Complétion générée via ${source}`
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
