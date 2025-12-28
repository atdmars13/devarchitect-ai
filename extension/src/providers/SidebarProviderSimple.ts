import * as vscode from 'vscode';
import { ProjectService } from '../services/ProjectService';

export class SidebarProviderSimple implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _projectService: ProjectService;

    constructor(
        extensionUri: vscode.Uri,
        projectService: ProjectService
    ) {
        this._extensionUri = extensionUri;
        this._projectService = projectService;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        console.log('SidebarProviderSimple: resolveWebviewView called');
        void vscode.window.showInformationMessage('Sidebar webview loading...');
        
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlContent(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'getProject': {
                    const project = this._projectService.getCurrentProject();
                    void webviewView.webview.postMessage({
                        type: 'projectUpdate',
                        data: project,
                    });
                    break;
                }
                case 'openDashboard':
                    void vscode.commands.executeCommand('devarchitect.openDashboard');
                    break;
            }
        });
    }

    private _getHtmlContent(_webview: vscode.Webview): string {
        // Version ultra-minimale pour debug
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
</head>
<body style="background-color: #1e1e1e; color: white; padding: 20px; font-family: sans-serif;">
    <h2 style="color: #00f3ff;">DevArchitect</h2>
    <p>Sidebar fonctionne!</p>
</body>
</html>`;
    }
}
