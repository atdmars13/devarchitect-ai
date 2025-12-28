import * as vscode from 'vscode';
import * as path from 'path';
import { DevArchitectPanel } from './panels/DevArchitectPanel';
import { SidebarProvider } from './providers/SidebarProvider';
import { ProjectService } from './services/ProjectService';
import { AICompletionService } from './services/AICompletionService';

/**
 * Crée un fichier de rapport Markdown dans le dossier .devarchitect-reports
 * et l'ouvre dans l'éditeur
 */
async function createAndOpenReport(
    reportType: string,
    content: string,
    sourceFileName?: string
): Promise<vscode.Uri | null> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        void vscode.window.showWarningMessage('Aucun workspace ouvert');
        return null;
    }
    
    // Créer le dossier .devarchitect-reports s'il n'existe pas
    const reportsDir = vscode.Uri.joinPath(workspaceFolder.uri, '.devarchitect-reports');
    try {
        await vscode.workspace.fs.createDirectory(reportsDir);
    } catch { /* Directory may already exist */ }
    
    // Générer un nom de fichier unique
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseName = sourceFileName ? path.basename(sourceFileName, path.extname(sourceFileName)) : 'code';
    const fileName = `${reportType}_${baseName}_${timestamp}.md`;
    const fileUri = vscode.Uri.joinPath(reportsDir, fileName);
    
    // Écrire le contenu
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
    
    // Ouvrir le fichier
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc, { preview: false });
    
    return fileUri;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('DevArchitect AI is now active!');

    // Initialize services
    const projectService = new ProjectService(context);
    const aiService = new AICompletionService();

    // Register Sidebar Provider
    const sidebarProvider = new SidebarProvider(context.extensionUri, projectService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'devarchitect.sidebarView',
            sidebarProvider
        )
    );

    // Command: Open Dashboard (Full Panel)
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.openDashboard', () => {
            DevArchitectPanel.createOrShow(context.extensionUri, projectService);
        })
    );

    // Command: New Project
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.newProject', async () => {
            const projectName = await vscode.window.showInputBox({
                prompt: 'Nom du projet',
                placeHolder: 'Mon Super Projet'
            });
            
            if (projectName) {
                const projectType = await vscode.window.showQuickPick(
                    [
                        { label: 'Application Web/Mobile', value: 'WEB_MOBILE' },
                        { label: 'Jeu 2D', value: 'GAME_2D' }
                    ],
                    { placeHolder: 'Type de projet' }
                );
                
                if (projectType) {
                    projectService.createNewProject(projectName, projectType.value as 'WEB_MOBILE' | 'GAME_2D');
                    DevArchitectPanel.createOrShow(context.extensionUri, projectService);
                    void vscode.window.showInformationMessage(`Projet "${projectName}" créé !`);
                }
            }
        })
    );

    // Command: Import Project
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.importProject', async () => {
            const fileUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: { 'JSON': ['json'] },
                title: 'Importer un projet DevArchitect'
            });

            if (fileUri && fileUri[0]) {
                const content = await vscode.workspace.fs.readFile(fileUri[0]);
                const jsonString = Buffer.from(content).toString('utf8');
                
                try {
                    const projectData = JSON.parse(jsonString);
                    projectService.importProject(projectData);
                    DevArchitectPanel.createOrShow(context.extensionUri, projectService);
                    void vscode.window.showInformationMessage('Projet importé avec succès !');
                } catch (_error) {
                    void vscode.window.showErrorMessage('Erreur lors de l\'import du projet.');
                }
            }
        })
    );

    // Command: Export Project
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.exportProject', async () => {
            const project = projectService.getCurrentProject();
            if (!project) {
                vscode.window.showWarningMessage('Aucun projet actif à exporter.');
                return;
            }

            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`${project.name.replace(/\s+/g, '_')}_devarchitect.json`),
                filters: { 'JSON': ['json'] },
                title: 'Exporter le projet DevArchitect'
            });

            if (saveUri) {
                const jsonContent = JSON.stringify(project, null, 2);
                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(jsonContent, 'utf8'));
                void vscode.window.showInformationMessage('Projet exporté avec succès !');
            }
        })
    );

    // ============================================
    // COMMANDES DE GESTION VRAM / MODÈLES IA
    // ============================================

    // Command: Unload current model from VRAM
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.unloadModel', async () => {
            try {
                const result = await aiService.unloadModel();
                if (result.success) {
                    void vscode.window.showInformationMessage(`✅ ${result.message}`);
                } else {
                    void vscode.window.showWarningMessage(`⚠️ ${result.message}`);
                }
                return result;
            } catch (error) {
                const message = `❌ Erreur: ${error instanceof Error ? error.message : String(error)}`;
                void vscode.window.showErrorMessage(message);
                return { success: false, message };
            }
        })
    );

    // Command: Unload all models from VRAM
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.unloadAllModels', async () => {
            try {
                const result = await aiService.unloadAllModels();
                if (result.success) {
                    void vscode.window.showInformationMessage(`✅ ${result.message}`);
                } else {
                    void vscode.window.showWarningMessage(`⚠️ ${result.message}`);
                }
                return result;
            } catch (error) {
                const message = `❌ Erreur: ${error instanceof Error ? error.message : String(error)}`;
                void vscode.window.showErrorMessage(message);
                return { success: false, message, unloadedCount: 0 };
            }
        })
    );

    // Command: Get VRAM status
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.getVramStatus', async () => {
            try {
                const status = await aiService.getLoadedModels();
                
                if (status.models.length === 0) {
                    void vscode.window.showInformationMessage('ℹ️ Aucun modèle chargé en VRAM');
                } else {
                    const totalGB = (status.totalVram / 1024 / 1024 / 1024).toFixed(2);
                    const modelList = status.models.map(m => {
                        const sizeGB = (m.sizeVram / 1024 / 1024 / 1024).toFixed(2);
                        return `${m.name}: ${sizeGB} GB`;
                    }).join('\n');
                    
                    const action = await vscode.window.showInformationMessage(
                        `📊 VRAM utilisée: ${totalGB} GB\n${modelList}`,
                        'Libérer VRAM'
                    );
                    
                    if (action === 'Libérer VRAM') {
                        await vscode.commands.executeCommand('devarchitect.unloadAllModels');
                    }
                }
                return status;
            } catch (error) {
                void vscode.window.showErrorMessage(`❌ Erreur: ${error instanceof Error ? error.message : String(error)}`);
                return { models: [], totalVram: 0 };
            }
        })
    );

    // Command: Sync project with workspace
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.syncWithWorkspace', async () => {
            try {
                const result = await projectService.syncProjectWithWorkspace();
                if (result.success) {
                    void vscode.window.showInformationMessage(`✅ Projet synchronisé: ${result.changes.join(', ')}`);
                } else {
                    void vscode.window.showWarningMessage(`⚠️ Synchronisation échouée: ${result.changes.join(', ')}`);
                }
            } catch (error) {
                void vscode.window.showErrorMessage(`❌ Erreur lors de la synchronisation: ${error instanceof Error ? error.message : String(error)}`);
            }
        })
    );

    // Command: Update phases progress from workspace
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.updatePhasesProgress', async () => {
            try {
                const result = await projectService.updatePhasesProgressFromWorkspace();
                if (result.success && result.updatedPhases.length > 0) {
                    void vscode.window.showInformationMessage(`✅ Progression mise à jour: ${result.updatedPhases.length} phases`);
                } else if (result.success) {
                    void vscode.window.showInformationMessage('✅ Aucune mise à jour de progression nécessaire');
                } else {
                    void vscode.window.showWarningMessage('⚠️ Impossible de mettre à jour la progression');
                }
            } catch (error) {
                void vscode.window.showErrorMessage(`❌ Erreur lors de la mise à jour: ${error instanceof Error ? error.message : String(error)}`);
            }
        })
    );

    // Command: Load or create workspace project
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.loadWorkspaceProject', async () => {
            try {
                const project = await projectService.loadOrCreateWorkspaceProject();
                void vscode.window.showInformationMessage(`✅ Projet chargé: ${project.name}`);
            } catch (error) {
                void vscode.window.showErrorMessage(`❌ Erreur lors du chargement: ${error instanceof Error ? error.message : String(error)}`);
            }
        })
    );

    // ============================================
    // COMMANDES IA - COMPLÉTION, REVIEW, REFACTORING
    // ============================================

    // Command: AI Complete Project
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.aiComplete', async () => {
            try {
                const isAvailable = await aiService.isOllamaAvailable();
                if (!isAvailable) {
                    void vscode.window.showWarningMessage('⚠️ Ollama n\'est pas disponible. Lancez Ollama puis réessayez.');
                    return null;
                }

                void vscode.window.showInformationMessage('🤖 Analyse IA en cours...');
                
                const currentProject = projectService.getCurrentProject();
                const result = await aiService.completeProject(currentProject);
                
                if (result && Object.keys(result).length > 0) {
                    // Fusionner les résultats avec le projet actuel
                    await projectService.mergeAICompletion(result);
                    void vscode.window.showInformationMessage('✅ Projet complété par l\'IA !');
                }
                
                return result;
            } catch (error) {
                const message = `❌ Erreur IA: ${error instanceof Error ? error.message : String(error)}`;
                void vscode.window.showErrorMessage(message);
                return null;
            }
        })
    );

    // Command: Check AI Status
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.checkAIStatus', async () => {
            try {
                const isAvailable = await aiService.isOllamaAvailable();
                const models = await aiService.listModels();
                const loadedModels = await aiService.getLoadedModels();
                
                return {
                    available: isAvailable,
                    models: models,
                    loadedModels: loadedModels.models,
                    totalVram: loadedModels.totalVram
                };
            } catch (error) {
                return {
                    available: false,
                    models: [],
                    loadedModels: [],
                    totalVram: 0,
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        })
    );

    // Command: Get Available Models
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.getAvailableModels', async () => {
            try {
                return await aiService.listModels();
            } catch (error) {
                void vscode.window.showErrorMessage(`❌ Erreur: ${error instanceof Error ? error.message : String(error)}`);
                return [];
            }
        })
    );

    // Command: Review Code
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.reviewCode', async () => {
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    void vscode.window.showWarningMessage('⚠️ Aucun fichier ouvert.');
                    return null;
                }

                const selection = editor.selection;
                const code = selection.isEmpty 
                    ? editor.document.getText() 
                    : editor.document.getText(selection);
                
                const language = editor.document.languageId;
                const fileName = editor.document.fileName;
                
                void vscode.window.showInformationMessage('🔍 Analyse du code en cours...');
                const result = await aiService.reviewCode(code, language);
                
                // Générer le rapport Markdown
                const scoreEmoji = result.score >= 80 ? '🟢' : result.score >= 60 ? '🟡' : '🔴';
                const report = `# 🔍 Code Review - ${path.basename(fileName)}

**Date:** ${new Date().toLocaleString('fr-FR')}
**Fichier:** \`${fileName}\`
**Langage:** ${language}

---

## ${scoreEmoji} Score Global: ${result.score}/100

---

## 📝 Résumé

${result.summary || 'Aucun résumé disponible.'}

---

## ⚠️ Problèmes Détectés (${result.issues?.length || 0})

${result.issues?.length > 0 ? result.issues.map((issue: any) => 
    `### ${issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵'} ${issue.message}\n\n${issue.suggestion ? `**Suggestion:** ${issue.suggestion}` : ''}\n\n**Ligne:** ${issue.line || 'N/A'} | **Sévérité:** ${issue.severity || 'info'}\n`
).join('\n') : '✅ Aucun problème détecté !\n'}

---

## 💡 Améliorations Suggérées

${result.improvements?.length > 0 ? result.improvements.map((s: string) => `- ${s}`).join('\n') : 'Aucune amélioration suggérée.'}

## 🔐 Points de Sécurité

${result.securityConcerns?.length > 0 ? result.securityConcerns.map((s: string) => `- ⚠️ ${s}`).join('\n') : '✅ Aucun problème de sécurité identifié.'}

## ⚡ Performance

${result.performanceIssues?.length > 0 ? result.performanceIssues.map((s: string) => `- ${s}`).join('\n') : '✅ Aucun problème de performance identifié.'}

---

*Généré par DevArchitect AI avec Mistral*
`;
                
                await createAndOpenReport('review', report, fileName);
                void vscode.window.showInformationMessage(`✅ Review terminée - Score: ${result.score}/100`);
                return result;
            } catch (error) {
                void vscode.window.showErrorMessage(`❌ Erreur: ${error instanceof Error ? error.message : String(error)}`);
                return null;
            }
        })
    );

    // Command: Suggest Refactoring
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.suggestRefactoring', async () => {
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    void vscode.window.showWarningMessage('⚠️ Aucun fichier ouvert.');
                    return null;
                }

                const selection = editor.selection;
                const code = selection.isEmpty 
                    ? editor.document.getText() 
                    : editor.document.getText(selection);
                
                const language = editor.document.languageId;
                const fileName = editor.document.fileName;
                
                void vscode.window.showInformationMessage('🔧 Analyse pour refactoring...');
                const result = await aiService.suggestRefactoring(code, language);
                
                // Générer le rapport Markdown
                const report = `# 🔧 Suggestions de Refactoring - ${path.basename(fileName)}

**Date:** ${new Date().toLocaleString('fr-FR')}
**Fichier:** \`${fileName}\`
**Langage:** ${language}

---

## 📊 Résumé

**${result.suggestions?.length || 0} suggestion(s) de refactoring** identifiée(s).

---

## 💡 Suggestions

${result.suggestions?.length > 0 ? result.suggestions.map((s: any, i: number) => {
    const typeEmoji = s.type === 'performance' ? '⚡' : s.type === 'readability' ? '📖' : s.type === 'security' ? '🔒' : '🔧';
    let content = `### ${i + 1}. ${typeEmoji} ${s.title || 'Suggestion'}\n\n`;
    content += `**Type:** ${s.type || 'general'}\n`;
    content += `**Impact:** ${s.impact || 'moyen'}\n\n`;
    content += `${s.description || s}\n`;
    return content;
}).join('\n---\n\n') : '✅ Aucune suggestion de refactoring - le code semble bien structuré !\n'}

---

*Généré par DevArchitect AI avec Mistral*
`;
                
                await createAndOpenReport('refactoring', report, fileName);
                void vscode.window.showInformationMessage(`✅ ${result.suggestions?.length || 0} suggestions de refactoring`);
                return result;
            } catch (error) {
                void vscode.window.showErrorMessage(`❌ Erreur: ${error instanceof Error ? error.message : String(error)}`);
                return null;
            }
        })
    );

    // Command: Explain Code
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.explainCode', async () => {
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    void vscode.window.showWarningMessage('⚠️ Aucun fichier ouvert.');
                    return null;
                }

                const selection = editor.selection;
                const code = selection.isEmpty 
                    ? editor.document.getText() 
                    : editor.document.getText(selection);
                
                const language = editor.document.languageId;
                const fileName = editor.document.fileName;
                const isSelection = !selection.isEmpty;
                
                void vscode.window.showInformationMessage('📖 Génération de l\'explication...');
                const explanation = await aiService.explainCode(code, language);
                
                // Générer le rapport Markdown
                const report = `# 📖 Explication du Code - ${path.basename(fileName)}

**Date:** ${new Date().toLocaleString('fr-FR')}
**Fichier:** \`${fileName}\`
**Langage:** ${language}
**Portée:** ${isSelection ? 'Sélection' : 'Fichier entier'}

---

## 📝 Explication

${explanation}

---

## 📄 Code Analysé

\`\`\`${language}
${code.length > 2000 ? code.slice(0, 2000) + '\n// ... (tronqué)' : code}
\`\`\`

---

*Généré par DevArchitect AI avec Mistral*
`;
                
                await createAndOpenReport('explication', report, fileName);
                void vscode.window.showInformationMessage('✅ Explication générée');
                return explanation;
            } catch (error) {
                void vscode.window.showErrorMessage(`❌ Erreur: ${error instanceof Error ? error.message : String(error)}`);
                return null;
            }
        })
    );

    // Command: Generate Tests
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.generateTests', async () => {
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    void vscode.window.showWarningMessage('⚠️ Aucun fichier ouvert.');
                    return null;
                }

                const selection = editor.selection;
                const code = selection.isEmpty 
                    ? editor.document.getText() 
                    : editor.document.getText(selection);
                
                const language = editor.document.languageId;
                const fileName = editor.document.fileName;
                
                void vscode.window.showInformationMessage('🧪 Génération des tests...');
                const tests = await aiService.generateTests(code, language);
                
                // Générer le rapport Markdown avec les tests
                const testFramework = language === 'typescript' || language === 'javascript' ? 'vitest/jest' : 'unittest';
                const report = `# 🧪 Tests Générés - ${path.basename(fileName)}

**Date:** ${new Date().toLocaleString('fr-FR')}
**Fichier source:** \`${fileName}\`
**Langage:** ${language}
**Framework suggéré:** ${testFramework}

---

## 📋 Tests Unitaires

Copiez ce code dans un fichier de test (ex: \`${path.basename(fileName, path.extname(fileName))}.test.${path.extname(fileName).slice(1)}\`)

\`\`\`${language}
${tests}
\`\`\`

---

## 💡 Instructions

1. Créez un nouveau fichier de test
2. Copiez le code ci-dessus
3. Installez les dépendances de test si nécessaire
4. Lancez les tests avec \`npm test\` ou la commande appropriée

---

*Généré par DevArchitect AI avec Mistral*
`;
                
                await createAndOpenReport('tests', report, fileName);
                void vscode.window.showInformationMessage('✅ Tests générés');
                return tests;
            } catch (error) {
                void vscode.window.showErrorMessage(`❌ Erreur: ${error instanceof Error ? error.message : String(error)}`);
                return null;
            }
        })
    );

    // Command: Detect Security Issues
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.detectSecurityIssues', async () => {
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    void vscode.window.showWarningMessage('⚠️ Aucun fichier ouvert.');
                    return [];
                }

                const code = editor.document.getText();
                const language = editor.document.languageId;
                const fileName = editor.document.fileName;
                
                void vscode.window.showInformationMessage('🔐 Analyse de sécurité...');
                const issues = await aiService.detectSecurityIssues(code, language);
                
                // Générer le rapport Markdown
                const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
                const sortedIssues = [...issues].sort((a: any, b: any) => 
                    (severityOrder[a.severity as keyof typeof severityOrder] || 4) - 
                    (severityOrder[b.severity as keyof typeof severityOrder] || 4)
                );
                
                const criticalCount = issues.filter((i: any) => i.severity === 'critical' || i.severity === 'high').length;
                const statusEmoji = criticalCount > 0 ? '🔴' : issues.length > 0 ? '🟡' : '🟢';
                
                const report = `# 🔐 Analyse de Sécurité - ${path.basename(fileName)}

**Date:** ${new Date().toLocaleString('fr-FR')}
**Fichier:** \`${fileName}\`
**Langage:** ${language}

---

## ${statusEmoji} Résumé

| Sévérité | Nombre |
|----------|--------|
| 🔴 Critique/Haute | ${issues.filter((i: any) => i.severity === 'critical' || i.severity === 'high').length} |
| 🟡 Moyenne | ${issues.filter((i: any) => i.severity === 'medium').length} |
| 🔵 Basse/Info | ${issues.filter((i: any) => i.severity === 'low' || i.severity === 'info').length} |
| **Total** | **${issues.length}** |

---

## 🚨 Vulnérabilités Détectées

${sortedIssues.length > 0 ? sortedIssues.map((issue: any, i: number) => {
    const sevEmoji = issue.severity === 'critical' ? '🔴' : issue.severity === 'high' ? '🟠' : issue.severity === 'medium' ? '🟡' : '🔵';
    let content = `### ${i + 1}. ${sevEmoji} ${issue.title || issue.type || 'Vulnérabilité'}\n\n`;
    content += `**Sévérité:** ${issue.severity || 'inconnue'}\n`;
    content += `**Type:** ${issue.type || 'N/A'}\n`;
    content += `**Ligne:** ${issue.line || 'N/A'}\n\n`;
    content += `${issue.description || issue.message || ''}\n\n`;
    if (issue.recommendation) {
        content += `**💡 Recommandation:** ${issue.recommendation}\n`;
    }
    return content;
}).join('\n---\n\n') : '✅ **Aucune vulnérabilité détectée !**\n\nLe code analysé ne présente pas de problèmes de sécurité évidents.\n'}

---

## 📚 Ressources OWASP

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)

---

*Généré par DevArchitect AI avec Mistral*
`;
                
                await createAndOpenReport('securite', report, fileName);
                
                if (issues.length === 0) {
                    void vscode.window.showInformationMessage('✅ Aucune vulnérabilité détectée');
                } else {
                    void vscode.window.showWarningMessage(`⚠️ ${issues.length} problème(s) de sécurité détecté(s)`);
                }
                return issues;
            } catch (error) {
                void vscode.window.showErrorMessage(`❌ Erreur: ${error instanceof Error ? error.message : String(error)}`);
                return [];
            }
        })
    );

    // Command: Analyze Image with Vision
    context.subscriptions.push(
        vscode.commands.registerCommand('devarchitect.analyzeImage', async () => {
            try {
                const fileUri = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: { 
                        'Images': ['png', 'jpg', 'jpeg', 'webp', 'gif'] 
                    },
                    title: 'Sélectionner une image à analyser'
                });

                if (!fileUri || !fileUri[0]) {
                    return null;
                }

                void vscode.window.showInformationMessage('🖼️ Analyse de l\'image en cours...');
                const result = await aiService.analyzeImage(fileUri[0].fsPath);
                
                void vscode.window.showInformationMessage('✅ Analyse terminée');
                return result;
            } catch (error) {
                void vscode.window.showErrorMessage(`❌ Erreur: ${error instanceof Error ? error.message : String(error)}`);
                return null;
            }
        })
    );
}

export function deactivate() {
    console.log('DevArchitect AI is now deactivated.');
}
