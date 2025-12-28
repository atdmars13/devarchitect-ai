import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Structure pour l'historique des complétions IA
 */
export interface CompletionHistoryEntry {
    id: string;
    timestamp: number;
    workspacePath: string;
    projectName: string;
    model: string;
    fieldsCompleted: string[];
    phasesGenerated: number;
    duration: number; // ms
    success: boolean;
    error?: string;
}

/**
 * Structure pour le cache d'analyse persistant
 */
export interface PersistedAnalysis {
    workspacePath: string;
    workspaceName: string;
    analysisHash: string; // Hash du contenu pour détecter les changements
    timestamp: number;
    analysis: {
        projectType: 'WEB_MOBILE' | 'GAME_2D';
        dependencies: string[];
        devDependencies: string[];
        detectedFrameworks: string[];
        detectedFeatures: string[];
        codeMetrics: {
            totalFiles: number;
            codeFiles: number;
            testFiles: number;
            totalClasses: number;
            totalFunctions: number;
            totalComponents: number;
        };
        endpoints: string[];
        patterns: string[];
    };
}

/**
 * Feedback utilisateur sur les complétions
 */
export interface UserFeedback {
    id: string;
    timestamp: number;
    completionId: string;
    rating: 1 | 2 | 3 | 4 | 5;
    approved: string[];
    rejected: string[];
    comments?: string;
}

/**
 * Préférences de complétion apprises
 */
export interface LearnedPreferences {
    preferredPhaseCount: number;
    preferredDetailLevel: 'minimal' | 'standard' | 'detailed';
    favoritePatterns: string[];
    rejectedPatterns: string[];
    customInstructions: string[];
    lastUpdated: number;
}

/**
 * Structure principale de la base de données locale
 */
interface PersistenceDatabase {
    version: number;
    lastUpdated: number;
    analyses: Record<string, PersistedAnalysis>;
    completionHistory: CompletionHistoryEntry[];
    feedback: UserFeedback[];
    learnedPreferences: LearnedPreferences;
    statistics: {
        totalCompletions: number;
        successfulCompletions: number;
        averageCompletionTime: number;
        mostUsedModel: string;
    };
}

const DEFAULT_DATABASE: PersistenceDatabase = {
    version: 1,
    lastUpdated: Date.now(),
    analyses: {},
    completionHistory: [],
    feedback: [],
    learnedPreferences: {
        preferredPhaseCount: 12,
        preferredDetailLevel: 'standard',
        favoritePatterns: [],
        rejectedPatterns: [],
        customInstructions: [],
        lastUpdated: Date.now()
    },
    statistics: {
        totalCompletions: 0,
        successfulCompletions: 0,
        averageCompletionTime: 0,
        mostUsedModel: ''
    }
};

/**
 * Service de persistance pour mémoriser les données d'analyse et de complétion
 * Utilise le stockage global de VS Code + fichier JSON local pour la persistance
 */
export class PersistenceService {
    private static instance: PersistenceService | null = null;
    private context: vscode.ExtensionContext | null = null;
    private database: PersistenceDatabase = { ...DEFAULT_DATABASE };
    private dbFilePath: string = '';
    private isDirty: boolean = false;
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;
    
    // Constantes
    private static readonly DB_FILE_NAME = '.devarchitect-db.json';
    private static readonly MAX_HISTORY_ENTRIES = 100;
    private static readonly MAX_FEEDBACK_ENTRIES = 500;
    private static readonly SAVE_DEBOUNCE_MS = 2000;
    private static readonly ANALYSIS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
    
    private constructor() {}
    
    /**
     * Obtient l'instance singleton du service
     */
    public static getInstance(): PersistenceService {
        if (!PersistenceService.instance) {
            PersistenceService.instance = new PersistenceService();
        }
        return PersistenceService.instance;
    }
    
    /**
     * Initialise le service avec le contexte VS Code
     */
    public async initialize(context: vscode.ExtensionContext): Promise<void> {
        this.context = context;
        
        // Déterminer le chemin du fichier de base de données
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.dbFilePath = path.join(workspaceFolders[0].uri.fsPath, PersistenceService.DB_FILE_NAME);
        } else {
            // Fallback vers le dossier global de l'extension
            this.dbFilePath = path.join(context.globalStorageUri.fsPath, 'devarchitect-db.json');
        }
        
        // Charger la base de données
        await this.loadDatabase();
        
        // Nettoyer les anciennes entrées
        this.cleanupOldEntries();
        
        console.log('[PersistenceService] Initialized with database at:', this.dbFilePath);
    }
    
    /**
     * Charge la base de données depuis le fichier
     */
    private async loadDatabase(): Promise<void> {
        try {
            if (fs.existsSync(this.dbFilePath)) {
                const content = fs.readFileSync(this.dbFilePath, 'utf-8');
                const loaded = JSON.parse(content) as PersistenceDatabase;
                
                // Migration si nécessaire
                this.database = this.migrateDatabase(loaded);
                console.log('[PersistenceService] Database loaded successfully');
            } else {
                this.database = { ...DEFAULT_DATABASE };
                console.log('[PersistenceService] Created new database');
            }
        } catch (error) {
            console.error('[PersistenceService] Failed to load database:', error);
            this.database = { ...DEFAULT_DATABASE };
        }
    }
    
    /**
     * Migre la base de données si nécessaire
     */
    private migrateDatabase(loaded: any): PersistenceDatabase {
        // Fusionner avec les valeurs par défaut pour les nouveaux champs
        return {
            ...DEFAULT_DATABASE,
            ...loaded,
            learnedPreferences: {
                ...DEFAULT_DATABASE.learnedPreferences,
                ...(loaded.learnedPreferences || {})
            },
            statistics: {
                ...DEFAULT_DATABASE.statistics,
                ...(loaded.statistics || {})
            }
        };
    }
    
    /**
     * Sauvegarde la base de données (avec debounce)
     */
    private scheduleSave(): void {
        this.isDirty = true;
        
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        this.saveTimeout = setTimeout(() => {
            this.saveDatabase();
        }, PersistenceService.SAVE_DEBOUNCE_MS);
    }
    
    /**
     * Sauvegarde immédiate de la base de données
     */
    public async saveDatabase(): Promise<void> {
        if (!this.isDirty) return;
        
        try {
            this.database.lastUpdated = Date.now();
            
            // Créer le dossier parent si nécessaire
            const dir = path.dirname(this.dbFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(this.dbFilePath, JSON.stringify(this.database, null, 2), 'utf-8');
            this.isDirty = false;
            console.log('[PersistenceService] Database saved');
        } catch (error) {
            console.error('[PersistenceService] Failed to save database:', error);
        }
    }
    
    /**
     * Nettoie les anciennes entrées
     */
    private cleanupOldEntries(): void {
        const now = Date.now();
        let changed = false;
        
        // Nettoyer les analyses trop anciennes
        for (const key of Object.keys(this.database.analyses)) {
            const analysis = this.database.analyses[key];
            if (now - analysis.timestamp > PersistenceService.ANALYSIS_CACHE_MAX_AGE_MS) {
                delete this.database.analyses[key];
                changed = true;
            }
        }
        
        // Limiter l'historique des complétions
        if (this.database.completionHistory.length > PersistenceService.MAX_HISTORY_ENTRIES) {
            this.database.completionHistory = this.database.completionHistory
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, PersistenceService.MAX_HISTORY_ENTRIES);
            changed = true;
        }
        
        // Limiter les feedbacks
        if (this.database.feedback.length > PersistenceService.MAX_FEEDBACK_ENTRIES) {
            this.database.feedback = this.database.feedback
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, PersistenceService.MAX_FEEDBACK_ENTRIES);
            changed = true;
        }
        
        if (changed) {
            this.scheduleSave();
        }
    }
    
    // ===========================
    // API: Analyses persistées
    // ===========================
    
    /**
     * Génère un hash simple pour détecter les changements de contenu
     */
    private generateAnalysisHash(deps: string[], devDeps: string[], fileCount: number): string {
        const content = [...deps, ...devDeps, fileCount.toString()].sort().join('|');
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(16);
    }
    
    /**
     * Récupère une analyse persistée si elle est encore valide
     */
    public getCachedAnalysis(workspacePath: string): PersistedAnalysis | null {
        const cached = this.database.analyses[workspacePath];
        if (!cached) return null;
        
        const now = Date.now();
        if (now - cached.timestamp > PersistenceService.ANALYSIS_CACHE_MAX_AGE_MS) {
            delete this.database.analyses[workspacePath];
            this.scheduleSave();
            return null;
        }
        
        return cached;
    }
    
    /**
     * Vérifie si le cache est valide (hash identique)
     */
    public isAnalysisCacheValid(workspacePath: string, deps: string[], devDeps: string[], fileCount: number): boolean {
        const cached = this.getCachedAnalysis(workspacePath);
        if (!cached) return false;
        
        const currentHash = this.generateAnalysisHash(deps, devDeps, fileCount);
        return cached.analysisHash === currentHash;
    }
    
    /**
     * Sauvegarde une analyse
     */
    public saveAnalysis(
        workspacePath: string,
        workspaceName: string,
        deps: string[],
        devDeps: string[],
        analysis: PersistedAnalysis['analysis']
    ): void {
        const hash = this.generateAnalysisHash(deps, devDeps, analysis.codeMetrics.totalFiles);
        
        this.database.analyses[workspacePath] = {
            workspacePath,
            workspaceName,
            analysisHash: hash,
            timestamp: Date.now(),
            analysis
        };
        
        this.scheduleSave();
        console.log('[PersistenceService] Analysis saved for:', workspaceName);
    }
    
    // ===========================
    // API: Historique des complétions
    // ===========================
    
    /**
     * Enregistre une complétion
     */
    public recordCompletion(entry: Omit<CompletionHistoryEntry, 'id' | 'timestamp'>): string {
        const id = `comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const fullEntry: CompletionHistoryEntry = {
            ...entry,
            id,
            timestamp: Date.now()
        };
        
        this.database.completionHistory.unshift(fullEntry);
        
        // Mettre à jour les statistiques
        this.database.statistics.totalCompletions++;
        if (entry.success) {
            this.database.statistics.successfulCompletions++;
        }
        
        // Calculer le temps moyen
        const successfulCompletions = this.database.completionHistory.filter(c => c.success);
        if (successfulCompletions.length > 0) {
            const totalTime = successfulCompletions.reduce((sum, c) => sum + c.duration, 0);
            this.database.statistics.averageCompletionTime = Math.round(totalTime / successfulCompletions.length);
        }
        
        // Modèle le plus utilisé
        const modelCounts: Record<string, number> = {};
        for (const comp of this.database.completionHistory) {
            modelCounts[comp.model] = (modelCounts[comp.model] || 0) + 1;
        }
        const sortedModels = Object.entries(modelCounts).sort((a, b) => b[1] - a[1]);
        if (sortedModels.length > 0) {
            this.database.statistics.mostUsedModel = sortedModels[0][0];
        }
        
        this.scheduleSave();
        return id;
    }
    
    /**
     * Récupère l'historique des complétions
     */
    public getCompletionHistory(limit: number = 20): CompletionHistoryEntry[] {
        return this.database.completionHistory.slice(0, limit);
    }
    
    /**
     * Récupère l'historique pour un workspace spécifique
     */
    public getWorkspaceCompletionHistory(workspacePath: string, limit: number = 10): CompletionHistoryEntry[] {
        return this.database.completionHistory
            .filter(c => c.workspacePath === workspacePath)
            .slice(0, limit);
    }
    
    // ===========================
    // API: Feedback utilisateur
    // ===========================
    
    /**
     * Enregistre un feedback utilisateur
     */
    public recordFeedback(feedback: Omit<UserFeedback, 'id' | 'timestamp'>): string {
        const id = `fb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const fullFeedback: UserFeedback = {
            ...feedback,
            id,
            timestamp: Date.now()
        };
        
        this.database.feedback.unshift(fullFeedback);
        
        // Apprendre des feedbacks
        this.learnFromFeedback(fullFeedback);
        
        this.scheduleSave();
        return id;
    }
    
    /**
     * Apprend des feedbacks pour améliorer les futures complétions
     */
    private learnFromFeedback(feedback: UserFeedback): void {
        const prefs = this.database.learnedPreferences;
        
        // Ajuster les préférences en fonction des champs approuvés/rejetés
        // (Logique simple qui peut être étendue)
        
        if (feedback.rating >= 4) {
            // Bon feedback - renforcer les patterns utilisés
            // TODO: Analyser quels patterns ont été utilisés dans cette complétion
        } else if (feedback.rating <= 2) {
            // Mauvais feedback - noter les problèmes
            // TODO: Analyser et éviter les patterns problématiques
        }
        
        prefs.lastUpdated = Date.now();
    }
    
    /**
     * Récupère les feedbacks récents
     */
    public getRecentFeedback(limit: number = 20): UserFeedback[] {
        return this.database.feedback.slice(0, limit);
    }
    
    // ===========================
    // API: Préférences apprises
    // ===========================
    
    /**
     * Récupère les préférences apprises
     */
    public getLearnedPreferences(): LearnedPreferences {
        return { ...this.database.learnedPreferences };
    }
    
    /**
     * Met à jour les préférences
     */
    public updatePreferences(updates: Partial<LearnedPreferences>): void {
        this.database.learnedPreferences = {
            ...this.database.learnedPreferences,
            ...updates,
            lastUpdated: Date.now()
        };
        this.scheduleSave();
    }
    
    /**
     * Ajoute une instruction personnalisée
     */
    public addCustomInstruction(instruction: string): void {
        if (!this.database.learnedPreferences.customInstructions.includes(instruction)) {
            this.database.learnedPreferences.customInstructions.push(instruction);
            this.database.learnedPreferences.lastUpdated = Date.now();
            this.scheduleSave();
        }
    }
    
    /**
     * Supprime une instruction personnalisée
     */
    public removeCustomInstruction(instruction: string): void {
        const index = this.database.learnedPreferences.customInstructions.indexOf(instruction);
        if (index > -1) {
            this.database.learnedPreferences.customInstructions.splice(index, 1);
            this.database.learnedPreferences.lastUpdated = Date.now();
            this.scheduleSave();
        }
    }
    
    // ===========================
    // API: Statistiques
    // ===========================
    
    /**
     * Récupère les statistiques
     */
    public getStatistics(): PersistenceDatabase['statistics'] {
        return { ...this.database.statistics };
    }
    
    /**
     * Calcule le taux de succès
     */
    public getSuccessRate(): number {
        if (this.database.statistics.totalCompletions === 0) return 0;
        return Math.round(
            (this.database.statistics.successfulCompletions / this.database.statistics.totalCompletions) * 100
        );
    }
    
    // ===========================
    // API: Utilitaires
    // ===========================
    
    /**
     * Exporte toutes les données (pour backup)
     */
    public exportData(): PersistenceDatabase {
        return JSON.parse(JSON.stringify(this.database));
    }
    
    /**
     * Importe des données (restauration)
     */
    public async importData(data: PersistenceDatabase): Promise<void> {
        this.database = this.migrateDatabase(data);
        await this.saveDatabase();
    }
    
    /**
     * Réinitialise la base de données
     */
    public async resetDatabase(): Promise<void> {
        this.database = { ...DEFAULT_DATABASE };
        await this.saveDatabase();
        console.log('[PersistenceService] Database reset');
    }
    
    /**
     * Force la sauvegarde immédiate (pour shutdown)
     */
    public async flush(): Promise<void> {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        await this.saveDatabase();
    }
}
