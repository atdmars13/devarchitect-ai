import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceAnalyzerService } from './WorkspaceAnalyzerService';

// Types (importés depuis le webview, mais définis ici pour le build)
export interface ProjectData {
    id: string;
    name: string;
    type: 'WEB_MOBILE' | 'GAME_2D';
    status: string;
    lastUpdated: string;
    concept: string;
    roadmap: DevBlock[];
    assets: ProjectAsset[];
    faqs: ProjectFaq[];
    commands: ProjectCommand[];
    variables: ProjectVariable[];
    specs: Record<string, any>;
    design: Record<string, any>;
    mode: 'EDIT' | 'TRACKING';
    workspacePath?: string; // Nouveau: Chemin du workspace associé
    isWorkspaceLinked?: boolean; // Nouveau: Indique si le projet est lié à un workspace
    [key: string]: any;
}

export interface DevBlock {
    id: string;
    title: string;
    description: string;
    status: 'backlog' | 'todo' | 'doing' | 'review' | 'done';
    priority: string;
    progress: number;
    [key: string]: any;
}

export interface ProjectAsset {
    id: string;
    name: string;
    category: string;
    status: string;
    priority: string;
    [key: string]: any;
}

export interface ProjectFaq {
    id: string;
    question: string;
    answer: string;
    category?: string;
}

export interface ProjectCommand {
    id: string;
    label: string;
    command: string;
    category: string;
    description?: string;
}

export interface ProjectVariable {
    id: string;
    key: string;
    value: string;
    description?: string;
    source?: string;
}

const INITIAL_PROJECT: ProjectData = {
    id: '',
    name: '',
    type: 'WEB_MOBILE',
    status: 'PLANNING',
    lastUpdated: new Date().toISOString(),
    concept: '',
    history: '',
    targetAudience: '',
    competitors: [],
    coreFeatures: [],
    monetizationModel: 'Free',
    marketingStrategy: '',
    elevatorPitch: '',
    roadmap: [],
    assets: [],
    faqs: [],
    commands: [],
    variables: [],
    testCases: [],
    validationCriteria: '',
    architecture: '',
    gameMechanics: '',
    whiteboardData: '',
    teamMembers: [],
    specs: {
        targetDevices: ['Mobile', 'Desktop'],
        supportedLanguages: ['Français', 'Anglais'],
        primaryUserRoles: ['User'],
        orientation: 'Portrait',
        frameRateTarget: '60 FPS',
        accessibilityLevel: 'AA'
    },
    design: {
        primaryColor: '#00f3ff',
        secondaryColor: '#ff00ff',
        accentColor: '#ffea00',
        backgroundColor: '#0f0f0f',
        fontHeading: 'Rajdhani',
        fontBody: 'Inter',
        moodboardUrls: [],
        artDirection: '',
        uiTheme: 'Cyberpunk'
    },
    mode: 'EDIT'
};

export class ProjectService {
    private context: vscode.ExtensionContext;
    private currentProject: ProjectData | null = null;
    private projectChangeEmitter = new vscode.EventEmitter<ProjectData | null>();
    private isProjectExplicitlyLoaded = false; // Track if a project was explicitly loaded

    public readonly onProjectChange = this.projectChangeEmitter.event;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadProject();
    }

    // Clé pour la bibliothèque globale de projets (tous les projets)
    private getLibraryKey(): string {
        return 'devarchitect_projects_library';
    }

    // Clé pour le projet actif sélectionné (global, pas par workspace)
    private getActiveProjectKey(): string {
        return 'devarchitect_active_project';
    }

    // Clé pour stocker les données d'un projet spécifique
    private getProjectDataKey(projectId: string): string {
        return `devarchitect_project_data_${projectId}`;
    }

    private loadProject(): void {
        // Charger le projet actif depuis le stockage global
        const activeProjectId = this.context.globalState.get<string>(this.getActiveProjectKey());
        if (activeProjectId) {
            const saved = this.context.globalState.get<ProjectData>(this.getProjectDataKey(activeProjectId));
            if (saved) {
                this.currentProject = this.ensureValidProject(saved);
                this.isProjectExplicitlyLoaded = true;
                return;
            }
        }
        // Si pas de projet actif, essayer de charger le premier de la bibliothèque
        const library = this.context.globalState.get<{id: string}[]>(this.getLibraryKey());
        if (library && library.length > 0) {
            const firstProjectData = this.context.globalState.get<ProjectData>(this.getProjectDataKey(library[0].id));
            if (firstProjectData) {
                this.currentProject = this.ensureValidProject(firstProjectData);
                this.context.globalState.update(this.getActiveProjectKey(), library[0].id);
                this.isProjectExplicitlyLoaded = true;
                return;
            }
        }
        // Sinon, projet vide - not explicitly loaded
        this.currentProject = null;
        this.isProjectExplicitlyLoaded = false;
    }

    private ensureValidProject(saved: ProjectData): ProjectData {
        return {
            ...INITIAL_PROJECT,
            ...saved,
            roadmap: saved.roadmap || [],
            assets: saved.assets || [],
            commands: saved.commands || [],
            variables: saved.variables || [],
            faqs: saved.faqs || [],
            testCases: saved.testCases || [],
            competitors: saved.competitors || [],
            coreFeatures: saved.coreFeatures || [],
            teamMembers: saved.teamMembers || [],
            specs: { ...INITIAL_PROJECT.specs, ...saved.specs },
            design: { ...INITIAL_PROJECT.design, ...saved.design }
        };
    }

    public getCurrentProject(): ProjectData {
        // Always return a valid project (never null)
        if (!this.currentProject) {
            this.currentProject = {
                ...INITIAL_PROJECT,
                id: Date.now().toString()
            };
            // Note: This creates a default project but doesn't mark it as explicitly loaded
        }

        // Ensure all arrays are defined
        return {
            ...this.currentProject,
            roadmap: this.currentProject.roadmap || [],
            assets: this.currentProject.assets || [],
            faqs: this.currentProject.faqs || [],
            commands: this.currentProject.commands || [],
            variables: this.currentProject.variables || [],
            testCases: this.currentProject.testCases || [],
            competitors: this.currentProject.competitors || [],
            coreFeatures: this.currentProject.coreFeatures || [],
            teamMembers: this.currentProject.teamMembers || []
        };
    }

    /**
     * Check if a project has been explicitly loaded or selected.
     * Returns false if only a default project placeholder exists.
     */
    public hasCurrentProject(): boolean {
        return this.isProjectExplicitlyLoaded && this.currentProject !== null;
    }

    /**
     * Get the current project only if one was explicitly loaded.
     * Returns null if no project has been selected/loaded.
     */
    public getCurrentProjectOrNull(): ProjectData | null {
        if (!this.hasCurrentProject()) {
            return null;
        }
        return this.getCurrentProject();
    }

    public saveProject(project: ProjectData): void {
        const updated = {
            ...project,
            lastUpdated: new Date().toISOString()
        };
        this.currentProject = updated;
        this.isProjectExplicitlyLoaded = true; // Project is now explicitly saved/loaded
        
        // Sauvegarder les données du projet
        this.context.globalState.update(this.getProjectDataKey(updated.id), updated);
        
        // Mettre à jour le projet actif
        this.context.globalState.update(this.getActiveProjectKey(), updated.id);
        
        // Mettre à jour la bibliothèque (métadonnées)
        this.updateLibrary(updated);
        
        this.projectChangeEmitter.fire(updated);
    }

    private updateLibrary(project: ProjectData): void {
        const library = this.context.globalState.get<{id: string, name: string, type: string, lastUpdated: string}[]>(this.getLibraryKey()) || [];
        
        const metadata = {
            id: project.id,
            name: project.name,
            type: project.type,
            lastUpdated: project.lastUpdated
        };
        
        const existingIndex = library.findIndex(p => p.id === project.id);
        if (existingIndex >= 0) {
            library[existingIndex] = metadata;
        } else {
            library.unshift(metadata);
        }
        
        this.context.globalState.update(this.getLibraryKey(), library);
    }

    public switchToProject(projectId: string): ProjectData | null {
        const projectData = this.context.globalState.get<ProjectData>(this.getProjectDataKey(projectId));
        if (projectData) {
            this.currentProject = this.ensureValidProject(projectData);
            this.context.globalState.update(this.getActiveProjectKey(), projectId);
            this.projectChangeEmitter.fire(this.currentProject);
            return this.currentProject;
        }
        return null;
    }

    public getLibrary(): {id: string, name: string, type: string, lastUpdated: string}[] {
        return this.context.globalState.get<{id: string, name: string, type: string, lastUpdated: string}[]>(this.getLibraryKey()) || [];
    }

    public getProjectById(projectId: string): ProjectData | null {
        const projectData = this.context.globalState.get<ProjectData>(this.getProjectDataKey(projectId));
        return projectData ? this.ensureValidProject(projectData) : null;
    }

    public deleteProject(projectId: string): void {
        // Supprimer les données
        this.context.globalState.update(this.getProjectDataKey(projectId), undefined);
        
        // Retirer de la bibliothèque
        const library = this.getLibrary().filter(p => p.id !== projectId);
        this.context.globalState.update(this.getLibraryKey(), library);
        
        // Si c'était le projet actif, charger un autre
        if (this.currentProject?.id === projectId) {
            if (library.length > 0) {
                this.switchToProject(library[0].id);
            } else {
                this.currentProject = null;
                this.context.globalState.update(this.getActiveProjectKey(), undefined);
            }
        }
    }

    public closeProject(): void {
        // Fermer le projet actif sans le supprimer
        this.currentProject = null;
        this.context.globalState.update(this.getActiveProjectKey(), undefined);
        this.projectChangeEmitter.fire(null);
    }

    public createNewProject(name: string, type: 'WEB_MOBILE' | 'GAME_2D'): ProjectData {
        const newProject: ProjectData = {
            ...INITIAL_PROJECT,
            id: Date.now().toString(),
            name,
            type,
            lastUpdated: new Date().toISOString()
        };
        this.saveProject(newProject);
        return newProject;
    }

    public importProject(data: ProjectData): void {
        // Validation basique
        if (!data.id || !data.name) {
            throw new Error('Invalid project data');
        }
        data.commands = data.commands || [];
        data.variables = data.variables || [];
        data.faqs = data.faqs || [];
        this.saveProject(data);
    }

    // --- Méthodes de manipulation du projet pour l'extension ---

    public updateProjectField(field: string, value: any): void {
        const project = this.getCurrentProject();
        (project as any)[field] = value;
        this.saveProject(project);
    }

    public addRoadmapPhase(phase: Omit<DevBlock, 'id'>): DevBlock {
        const project = this.getCurrentProject();
        
        const newPhase: DevBlock = {
            id: Date.now().toString(),
            title: phase.title || 'Nouvelle Phase',
            description: phase.description || '',
            status: phase.status || 'todo',
            priority: phase.priority || 'Moyenne',
            progress: phase.progress || 0,
            ...phase
        };
        
        project.roadmap.push(newPhase);
        this.saveProject(project);
        return newPhase;
    }

    public updateRoadmapPhase(id: string, updates: Partial<DevBlock>): void {
        const project = this.getCurrentProject();

        const index = project.roadmap.findIndex(b => b.id === id);
        if (index !== -1) {
            project.roadmap[index] = {
                ...project.roadmap[index],
                ...updates
            };
            this.saveProject(project);
        }
    }

    public deleteRoadmapPhase(id: string): void {
        const project = this.getCurrentProject();
        project.roadmap = project.roadmap.filter(b => b.id !== id);
        this.saveProject(project);
    }

    public addAsset(asset: Omit<ProjectAsset, 'id'>): ProjectAsset {
        const project = this.getCurrentProject();

        const newAsset: ProjectAsset = {
            id: Date.now().toString(),
            name: asset.name || 'Nouvel Asset',
            category: asset.category || 'UI_Element',
            status: asset.status || 'Concept',
            priority: asset.priority || 'Moyenne',
            ...asset
        };

        project.assets.push(newAsset);
        this.saveProject(project);
        return newAsset;
    }

    public addCommand(command: Omit<ProjectCommand, 'id'>): ProjectCommand {
        const project = this.getCurrentProject();

        const newCommand: ProjectCommand = {
            ...command,
            id: Date.now().toString()
        };

        project.commands.push(newCommand);
        this.saveProject(project);
        return newCommand;
    }

    public addFaq(faq: Omit<ProjectFaq, 'id'>): ProjectFaq {
        const project = this.getCurrentProject();

        const newFaq: ProjectFaq = {
            ...faq,
            id: Date.now().toString()
        };

        project.faqs.push(newFaq);
        this.saveProject(project);
        return newFaq;
    }

    public getProjectSummary(): string {
        if (!this.currentProject || !this.currentProject.name) {
            return '📋 **Aucun projet actif.**\n\nUtilisez `/sync` pour créer un projet depuis le workspace ou ouvrez le Dashboard pour en créer un nouveau.';
        }

        const p = this.currentProject;
        const progress = p.roadmap.length > 0
            ? Math.round(p.roadmap.reduce((acc, b) => acc + (b.progress || 0), 0) / p.roadmap.length)
            : 0;

        // Calculate roadmap stats
        const done = p.roadmap.filter(b => b.status === 'done').length;
        const doing = p.roadmap.filter(b => b.status === 'doing' || b.status === 'review').length;
        const todo = p.roadmap.filter(b => b.status === 'todo' || b.status === 'backlog').length;

        // Progress bar
        const filled = Math.floor(progress / 5);
        const progressBar = '█'.repeat(filled) + '░'.repeat(20 - filled);

        // Stack info
        const stackParts: string[] = [];
        if (p.specs?.frontendFramework) stackParts.push(p.specs.frontendFramework);
        if (p.specs?.backendFramework) stackParts.push(p.specs.backendFramework);
        if (p.specs?.gameEngine) stackParts.push(p.specs.gameEngine);
        const stackStr = stackParts.length > 0 ? stackParts.join(' + ') : 'Non détecté';

        // Next actions
        const nextPhase = p.roadmap.find(r => r.status === 'doing') || p.roadmap.find(r => r.status === 'todo');
        const nextAction = nextPhase
            ? `🎯 **Prochaine action:** ${nextPhase.title} (${nextPhase.progress}%)`
            : p.roadmap.length === 0
                ? '💡 **Suggestion:** Utilisez `/sync` pour générer un plan de développement'
                : '🎉 **Toutes les phases sont terminées!**';

        return `
## 📊 Projet: ${p.name}

**Type:** ${p.type === 'GAME_2D' ? '🎮 Jeu 2D' : '🌐 Web/Mobile'} | **Stack:** ${stackStr}

### Progression globale: ${progress}%
\`[${progressBar}]\`

| ✅ Terminées | 🔄 En cours | 📋 À faire |
|:------------:|:-----------:|:----------:|
| ${done} | ${doing} | ${todo} |

### Ressources
- 📦 **${p.assets.length}** assets | ⚙️ **${p.commands.length}** commandes | 🔑 **${p.variables.length}** variables

${nextAction}

${p.concept ? `\n### Concept\n_${p.concept.substring(0, 200)}${p.concept.length > 200 ? '...' : ''}_` : ''}
        `.trim();
    }

    // --- Méthodes de synchronisation avec le workspace ---

    /**
     * Détecte si un workspace est ouvert et retourne son chemin
     */
    public getCurrentWorkspacePath(): string | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }
        return workspaceFolders[0].uri.fsPath;
    }

    /**
     * Vérifie si le projet actuel est lié à un workspace
     */
    public isProjectLinkedToWorkspace(): boolean {
        const project = this.getCurrentProject();
        const workspacePath = this.getCurrentWorkspacePath();
        return !!project.workspacePath && project.workspacePath === workspacePath;
    }

    /**
     * Crée un projet basé sur l'analyse du workspace actuel
     */
    public async createProjectFromWorkspace(): Promise<ProjectData> {
        const workspacePath = this.getCurrentWorkspacePath();
        if (!workspacePath) {
            throw new Error('Aucun workspace ouvert');
        }

        const analyzer = new WorkspaceAnalyzerService();
        const analysis = await analyzer.analyzeWorkspace();

        if (!analysis) {
            throw new Error('Impossible d\'analyser le workspace');
        }

        const newProject: ProjectData = {
            ...INITIAL_PROJECT,
            id: Date.now().toString(),
            name: analysis.name,
            type: analysis.type,
            concept: analysis.concept,
            elevatorPitch: analysis.elevatorPitch,
            targetAudience: analysis.targetAudience,
            coreFeatures: analysis.coreFeatures,
            architecture: analysis.architecture,
            teamMembers: analysis.teamMembers,
            testCases: analysis.testCases,
            validationCriteria: analysis.validationCriteria,
            specs: analysis.specs,
            design: analysis.design,
            commands: analysis.commands.map(cmd => ({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                ...cmd
            })),
            variables: analysis.variables.map(v => ({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                ...v
            })),
            assets: analysis.assets.map(asset => ({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: asset.name,
                category: asset.category,
                status: 'Final',
                priority: 'Moyenne',
                path: asset.path,
                notes: `Auto-détecté (${asset.extension})`
            })),
            roadmap: analysis.suggestedPhases.map((phase, i) => {
                const progress = phase.progress ?? 0;
                return {
                    id: `phase-${Date.now()}-${i}`,
                    title: phase.title,
                    description: phase.description,
                    // Statut basé sur la progression factuelle
                    status: progress === 100 ? 'done' : 
                            progress >= 50 ? 'doing' : 
                            progress >= 20 ? 'todo' : 'backlog',
                    priority: phase.priority,
                    // Progression factuelle calculée par l'analyseur
                    progress: progress,
                    linkedAssets: [],
                    dependencies: [],
                    // Preuves factuelles de la progression
                    evidence: phase.evidence || [],
                    missingItems: phase.missingItems || []
                };
            }),
            workspacePath: workspacePath,
            isWorkspaceLinked: true,
            lastUpdated: new Date().toISOString()
        };

        this.saveProject(newProject);
        return newProject;
    }

    /**
     * Synchronise le projet actuel avec le workspace
     */
    public async syncProjectWithWorkspace(): Promise<{ success: boolean; changes: string[] }> {
        const project = this.getCurrentProject();
        const workspacePath = this.getCurrentWorkspacePath();

        if (!workspacePath) {
            return { success: false, changes: ['Aucun workspace ouvert'] };
        }

        const analyzer = new WorkspaceAnalyzerService();
        const analysis = await analyzer.analyzeWorkspace();

        if (!analysis) {
            return { success: false, changes: ['Impossible d\'analyser le workspace'] };
        }

        const changes: string[] = [];
        let updated = false;

        // Mettre à jour les champs basés sur le workspace
        if (!project.workspacePath || project.workspacePath !== workspacePath) {
            project.workspacePath = workspacePath;
            project.isWorkspaceLinked = true;
            changes.push('Liaison au workspace établie');
            updated = true;
        }

        // Mettre à jour les specs
        const updatedSpecs = { ...project.specs, ...analysis.specs };
        if (JSON.stringify(updatedSpecs) !== JSON.stringify(project.specs)) {
            project.specs = updatedSpecs;
            changes.push('Spécifications techniques mises à jour');
            updated = true;
        }

        // Mettre à jour les commandes
        const existingCmds = new Set(project.commands?.map(c => c.command) || []);
        const newCommands = analysis.commands.filter(c => !existingCmds.has(c.command));
        if (newCommands.length > 0) {
            project.commands = [...(project.commands || []), ...newCommands.map(c => ({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                ...c
            }))];
            changes.push(`${newCommands.length} nouvelles commandes ajoutées`);
            updated = true;
        }

        // Mettre à jour les variables
        const existingVars = new Set(project.variables?.map(v => v.key) || []);
        const newVariables = analysis.variables.filter(v => !existingVars.has(v.key));
        if (newVariables.length > 0) {
            project.variables = [...(project.variables || []), ...newVariables.map(v => ({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                ...v
            }))];
            changes.push(`${newVariables.length} nouvelles variables ajoutées`);
            updated = true;
        }

        // Mettre à jour les assets
        const existingPaths = new Set(project.assets?.map(a => a.path) || []);
        const newAssets = analysis.assets.filter(a => !existingPaths.has(a.path));
        if (newAssets.length > 0) {
            project.assets = [...(project.assets || []), ...newAssets.map(a => ({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: a.name,
                category: a.category,
                status: 'Final',
                priority: 'Moyenne',
                path: a.path,
                notes: `Auto-détecté (${a.extension})`
            }))];
            changes.push(`${newAssets.length} nouveaux assets ajoutés`);
            updated = true;
        }

        // Mettre à jour la roadmap si vide
        if (project.roadmap.length === 0 && analysis.suggestedPhases.length > 0) {
            project.roadmap = analysis.suggestedPhases.map((phase, i) => {
                const progress = phase.progress ?? 0;
                return {
                    id: `phase-${Date.now()}-${i}`,
                    title: phase.title,
                    description: phase.description,
                    // Statut basé sur la progression factuelle
                    status: progress === 100 ? 'done' : 
                            progress >= 50 ? 'doing' : 
                            progress >= 20 ? 'todo' : 'backlog',
                    priority: phase.priority,
                    // Progression factuelle calculée par l'analyseur
                    progress: progress,
                    linkedAssets: [],
                    dependencies: [],
                    // Preuves factuelles de la progression
                    evidence: phase.evidence || [],
                    missingItems: phase.missingItems || []
                };
            });
            changes.push(`Roadmap générée avec ${analysis.suggestedPhases.length} phases (progression factuelle)`);
            updated = true;
        }

        if (updated) {
            project.lastUpdated = new Date().toISOString();
            this.saveProject(project);
        }

        return { success: true, changes };
    }

    /**
     * Met à jour la progression des phases basées sur l'analyse FACTUELLE du workspace
     */
    public async updatePhasesProgressFromWorkspace(): Promise<{ success: boolean; updatedPhases: string[] }> {
        const project = this.getCurrentProject();
        const workspacePath = this.getCurrentWorkspacePath();

        if (!workspacePath || project.roadmap.length === 0) {
            return { success: false, updatedPhases: [] };
        }

        // Invalider le cache pour forcer une nouvelle analyse
        WorkspaceAnalyzerService.invalidateCache();
        
        const analyzer = new WorkspaceAnalyzerService();
        const analysis = await analyzer.analyzeWorkspace();

        if (!analysis) {
            return { success: false, updatedPhases: [] };
        }

        const updatedPhases: string[] = [];

        // Utiliser les phases analysées avec progression factuelle
        for (const phase of project.roadmap) {
            // Chercher la phase correspondante dans l'analyse
            const analyzedPhase = analysis.suggestedPhases.find(
                sp => sp.title.toLowerCase() === phase.title.toLowerCase() ||
                      sp.title.toLowerCase().includes(phase.title.toLowerCase().split(' ')[0])
            );

            if (analyzedPhase && analyzedPhase.progress !== undefined) {
                const newProgress = analyzedPhase.progress;
                const oldProgress = phase.progress;

                if (newProgress !== oldProgress) {
                    // Déterminer le nouveau statut basé sur la progression
                    const newStatus = newProgress === 100 ? 'done' : 
                                      newProgress >= 50 ? 'doing' : 
                                      newProgress >= 20 ? 'todo' : 'backlog';

                    this.updateRoadmapPhase(phase.id, { 
                        progress: newProgress,
                        status: newStatus,
                        // @ts-ignore - extension des données de phase
                        evidence: analyzedPhase.evidence || [],
                        missingItems: analyzedPhase.missingItems || []
                    });
                    
                    const evidenceCount = analyzedPhase.evidence?.length || 0;
                    const missingCount = analyzedPhase.missingItems?.length || 0;
                    updatedPhases.push(
                        `${phase.title}: ${oldProgress}% → ${newProgress}% ` +
                        `(${evidenceCount} preuves, ${missingCount} manquants)`
                    );
                }
            }
        }

        return { success: true, updatedPhases };
    }

    /**
     * Charge ou crée un projet basé sur le workspace actuel
     */
    public async loadOrCreateWorkspaceProject(): Promise<ProjectData> {
        const workspacePath = this.getCurrentWorkspacePath();
        if (!workspacePath) {
            throw new Error('Aucun workspace ouvert');
        }

        // Vérifier si un projet existe déjà pour ce workspace
        const existingProjects = this.getLibrary();
        const workspaceProject = existingProjects.find(p => {
            const projectData = this.getProjectById(p.id);
            return projectData?.workspacePath === workspacePath;
        });

        if (workspaceProject) {
            // Charger le projet existant
            const project = this.switchToProject(workspaceProject.id);
            if (project) {
                return project;
            }
        }

        // Sinon, créer un nouveau projet basé sur le workspace
        return this.createProjectFromWorkspace();
    }

    /**
     * Génère un prompt contextuel basé sur le projet actuel
     * Utile pour copier le contexte et l'utiliser avec des outils IA
     */
    public getContextualPrompt(): string {
        const project = this.getCurrentProject();
        if (!project) {
            return 'Aucun projet DevArchitect actif.';
        }

        return `
Contexte du projet DevArchitect:
- Nom: ${project.name}
- Type: ${project.type === 'GAME_2D' ? 'Jeu 2D Unity/Godot' : 'Application Web/Mobile'}
- Stack: ${project.specs?.frontendFramework || 'Non défini'} / ${project.specs?.backendFramework || 'Non défini'}
- Moteur: ${project.specs?.gameEngine || 'N/A'}
- Phases: ${project.roadmap.map(r => `${r.title} (${r.status})`).join(', ')}
- Concept: ${project.concept}
        `.trim();
    }

    /**
     * Fusionne les résultats de la complétion IA avec le projet actuel
     * Ne remplace que les champs vides ou manquants
     */
    public async mergeAICompletion(aiResult: Record<string, any>): Promise<void> {
        const project = this.getCurrentProject();
        
        // Fusionner uniquement les champs non remplis
        if (!project.name?.trim() && aiResult.name) {
            project.name = aiResult.name;
        }
        if (!project.concept?.trim() && aiResult.concept) {
            project.concept = aiResult.concept;
        }
        if (!project.elevatorPitch?.trim() && aiResult.elevatorPitch) {
            project.elevatorPitch = aiResult.elevatorPitch;
        }
        if (!project.targetAudience?.trim() && aiResult.targetAudience) {
            project.targetAudience = aiResult.targetAudience;
        }
        if (!project.validationCriteria?.trim() && aiResult.validationCriteria) {
            project.validationCriteria = aiResult.validationCriteria;
        }
        if (!project.architecture?.trim() && aiResult.architecture) {
            project.architecture = aiResult.architecture;
        }
        
        // Type
        if (aiResult.type) {
            project.type = aiResult.type;
        }
        
        // Specs (fusionner)
        if (aiResult.specs) {
            project.specs = { ...project.specs, ...aiResult.specs };
        }
        
        // Design (fusionner)
        if (aiResult.design) {
            project.design = { ...project.design, ...aiResult.design };
        }
        
        // Core Features (ajouter si vide)
        if ((!project.coreFeatures || project.coreFeatures.length === 0) && aiResult.coreFeatures) {
            project.coreFeatures = aiResult.coreFeatures;
        }
        
        // Test Cases (ajouter si vide)
        if ((!project.testCases || project.testCases.length === 0) && aiResult.testCases) {
            project.testCases = aiResult.testCases;
        }
        
        // Roadmap (ajouter les phases manquantes)
        if (aiResult.roadmap && Array.isArray(aiResult.roadmap)) {
            const existingTitles = new Set(project.roadmap.map(p => p.title.toLowerCase()));
            
            for (const phase of aiResult.roadmap) {
                if (!existingTitles.has(phase.title.toLowerCase())) {
                    project.roadmap.push({
                        id: `phase-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        title: phase.title,
                        description: phase.description || '',
                        status: 'todo',
                        priority: phase.priority || 'Moyenne',
                        progress: 0,
                        estimatedHours: phase.estimatedHours || 0,
                        actualHours: 0,
                        isMilestone: false,
                        dependencies: []
                    });
                }
            }
        }
        
        // Sauvegarder
        this.saveProject(project);
    }
}
