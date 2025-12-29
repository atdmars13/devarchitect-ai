import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { WorkspaceAnalyzerService, WorkspaceAnalysis } from './WorkspaceAnalyzerService';
import { PersistenceService, CompletionHistoryEntry, UserFeedback } from './PersistenceService';
import { AIClientService, LLMModelInfo, ModelCapabilities, OllamaResponse, OllamaConfig } from './ai/AIClientService';
import { DependencyGraphService } from './analysis/DependencyGraphService';

export interface AICompletionResult {
    name?: string;
    concept?: string;
    elevatorPitch?: string;
    targetAudience?: string;
    type?: 'WEB_MOBILE' | 'GAME_2D';
    specs?: Record<string, any>;
    design?: Record<string, any>;
    roadmap?: any[];
    commands?: any[];
    variables?: any[];
    testCases?: string[];
    validationCriteria?: string;
    architecture?: string;
    coreFeatures?: string[];
}

/**
 * Résultat d'analyse d'image avec Vision
 */
export interface VisionAnalysisResult {
    description: string;
    suggestedAssets?: Array<{ name: string; category: string; description: string }>;
    suggestedColors?: { primary: string; secondary: string; accent?: string };
    suggestedUIComponents?: string[];
    detectedPatterns?: string[];
    confidence: number;
}

interface OllamaResponse {
    model: string;
    response: string;
    done: boolean;
}

/**
 * Configuration Ollama depuis les settings utilisateur
 */
interface OllamaConfig {
    baseUrl: string;
    preferredModel: string;
    timeout: number;
    enabled: boolean;
}

/**
 * Configuration des capacités des modèles LLM
 */
interface ModelCapabilities {
    vision: boolean;          // Supporte l'analyse d'images
    codeGeneration: boolean;  // Optimisé pour le code
    longContext: boolean;     // Contexte > 32k tokens
    reasoning: boolean;       // Capacités de raisonnement avancé
    maxTokens: number;        // Limite de tokens en entrée
}

interface LLMModelInfo {
    name: string;
    provider: 'mistral' | 'qwen' | 'deepseek' | 'meta' | 'other';
    capabilities: ModelCapabilities;
}

/**
 * Résultat d'une revue de code
 */
export interface CodeReviewResult {
    summary: string;
    issues: Array<{
        severity: 'critical' | 'warning' | 'info';
        line?: number;
        message: string;
        suggestion?: string;
    }>;
    improvements: string[];
    securityConcerns: string[];
    performanceIssues: string[];
    score: number; // 0-100
}

/**
 * Résultat de suggestions de refactoring
 */
export interface RefactoringResult {
    suggestions: Array<{
        type: 'extract-function' | 'rename' | 'simplify' | 'pattern' | 'performance' | 'security' | 'modernize';
        title: string;
        description: string;
        priority: 'high' | 'medium' | 'low';
        codeExample?: string;
    }>;
    complexity: {
        current: string;
        potential: string;
    };
    maintainability: string;
}

/**
 * Résultat de détection de vulnérabilités
 */
export interface SecurityIssue {
    severity: 'critical' | 'high' | 'medium' | 'low';
    type: string;
    description: string;
    line?: number;
    fix: string;
}

export class AICompletionService {
    private workspaceAnalyzer: WorkspaceAnalyzerService;
    private persistenceService: PersistenceService;
    private aiClient: AIClientService;
    private dependencyGraph: DependencyGraphService;
    
    // Cache pour les résultats d'analyse IA (évite les appels répétés)
    private static analysisCache: Map<string, { result: AICompletionResult; timestamp: number }> = new Map();
    private static readonly ANALYSIS_CACHE_TTL_MS = 300000; // 5 minutes

    constructor() {
        this.workspaceAnalyzer = new WorkspaceAnalyzerService();
        this.persistenceService = PersistenceService.getInstance();
        this.aiClient = AIClientService.getInstance();
        this.dependencyGraph = new DependencyGraphService();
    }

    /**
     * Enregistre un feedback utilisateur pour une complétion
     * @param completionId ID de la complétion
     * @param rating Note de 1 à 5
     * @param approved Champs approuvés
     * @param rejected Champs rejetés
     * @param comments Commentaires de l'utilisateur
     */
    public recordFeedback(
        completionId: string,
        rating: 1 | 2 | 3 | 4 | 5,
        approved: string[] = [],
        rejected: string[] = [],
        comments?: string
    ): string {
        const feedback: Omit<UserFeedback, 'id' | 'timestamp'> = {
            completionId,
            rating,
            approved,
            rejected,
            comments
        };
        return this.persistenceService.recordFeedback(feedback);
    }

    /**
     * Obtient les statistiques de complétion
     */
    public getCompletionStats(): { 
        totalCompletions: number; 
        successfulCompletions: number;
        averageCompletionTime: number; 
        mostUsedModel: string;
        successRate: number;
    } {
        const stats = this.persistenceService.getStatistics();
        const successRate = this.persistenceService.getSuccessRate();
        return {
            ...stats,
            successRate
        };
    }

    // Proxy methods to AIClientService
    public async isOllamaAvailable(): Promise<boolean> { return this.aiClient.isOllamaAvailable(); }
    public async listModels(): Promise<string[]> { return this.aiClient.listModels(); }
    public async unloadModel(model?: string): Promise<{ success: boolean; message: string; freedModel?: string }> {
        const result = await this.aiClient.unloadModel(model);
        return { success: result.success, message: result.message, freedModel: model };
    }
    public async unloadAllModels(): Promise<{ success: boolean; message: string; unloadedCount: number }> { return this.aiClient.unloadAllModels(); }
    public async getLoadedModels() { return this.aiClient.getLoadedModels(); }
    public async selectBestModel() { return this.aiClient.selectBestModel(); }
    public async selectVisionModel() { return this.aiClient.selectVisionModel(); }
    public async selectLongContextModel() { return this.aiClient.selectLongContextModel(); }
    public getModelInfo(name: string) { return this.aiClient.getModelInfo(name); }
    public async generateWithOllama(prompt: string, model: string, options?: any) { return this.aiClient.generate(prompt, model, options); }
    public async generateWithVision(prompt: string, path: string, model?: string) { return this.aiClient.generateWithVision(prompt, path, model); }
    
    /**
     * Analyse une image (maquette, screenshot, mockup) pour extraire des informations de design
     * Utilise pixtral-large ou autre modèle vision disponible
     */
    public async analyzeImage(imagePath: string): Promise<VisionAnalysisResult> {
        const prompt = `Tu es un expert en UI/UX design et développement web/mobile.

Analyse cette image (maquette, screenshot, ou mockup) et fournis une analyse détaillée au format JSON:

{
  "description": "Description générale de ce que montre l'image (type d'interface, style, fonctionnalités visibles)",
  "suggestedAssets": [
    {"name": "Nom de l'asset", "category": "Icon|Background|UI_Element|Sprite", "description": "Description de l'asset à créer"}
  ],
  "suggestedColors": {
    "primary": "#hexcode",
    "secondary": "#hexcode",
    "accent": "#hexcode"
  },
  "suggestedUIComponents": ["Liste des composants UI visibles/nécessaires"],
  "detectedPatterns": ["Patterns de design détectés (cards, lists, navigation, etc.)"],
  "confidence": 0.85
}

Réponds UNIQUEMENT avec le JSON valide. Sois précis et actionnable.`;

        try {
            const response = await this.generateWithVision(prompt, imagePath);
            
            // Parser la réponse JSON
            let cleanResponse = response.trim();
            if (cleanResponse.startsWith('```json')) {
                cleanResponse = cleanResponse.slice(7);
            } else if (cleanResponse.startsWith('```')) {
                cleanResponse = cleanResponse.slice(3);
            }
            if (cleanResponse.endsWith('```')) {
                cleanResponse = cleanResponse.slice(0, -3);
            }
            
            return JSON.parse(cleanResponse.trim());
        } catch (error) {
            console.error('[AICompletionService] Vision analysis failed:', error);
            return {
                description: 'Analyse impossible',
                confidence: 0
            };
        }
    }
    
    /**
     * Génère des suggestions de phases/features basées sur une maquette
     */
    public async generateRoadmapFromMockup(imagePath: string): Promise<Array<{ title: string; description: string; priority: string }>> {
        const prompt = `Tu es un chef de projet technique expert.

Analyse cette maquette/mockup et génère une roadmap de développement au format JSON.
Identifie toutes les fonctionnalités visibles et estime la complexité.

{
  "phases": [
    {
      "title": "Nom de la phase",
      "description": "Description des fonctionnalités à implémenter",
      "priority": "Critique|Haute|Moyenne|Basse",
      "estimatedHours": 40,
      "features": ["Feature 1", "Feature 2"]
    }
  ]
}

Réponds UNIQUEMENT avec le JSON valide. Ordonne les phases par priorité de développement.`;

        try {
            const response = await this.generateWithVision(prompt, imagePath);
            
            let cleanResponse = response.trim();
            if (cleanResponse.startsWith('```json')) {
                cleanResponse = cleanResponse.slice(7);
            } else if (cleanResponse.startsWith('```')) {
                cleanResponse = cleanResponse.slice(3);
            }
            if (cleanResponse.endsWith('```')) {
                cleanResponse = cleanResponse.slice(0, -3);
            }
            
            const result = JSON.parse(cleanResponse.trim());
            return result.phases || [];
        } catch (error) {
            console.error('[AICompletionService] Roadmap from mockup failed:', error);
            return [];
        }
    }
    
    /**
     * Vérifie si le support vision est disponible
     */
    public async isVisionAvailable(): Promise<boolean> {
        const visionModel = await this.selectVisionModel();
        return visionModel !== null;
    }

    // ===========================
    // CODE REVIEW & REFACTORING
    // ===========================

    /**
     * Effectue une revue de code avec l'IA Mistral
     * Analyse le code pour détecter les problèmes, améliorer la qualité et la sécurité
     */
    public async reviewCode(code: string, language: string = 'typescript', context?: string): Promise<CodeReviewResult> {
        const ollamaAvailable = await this.isOllamaAvailable();
        if (!ollamaAvailable) {
            throw new Error('Ollama non disponible pour la revue de code');
        }

        const model = await this.selectBestModel();
        if (!model) {
            throw new Error('Aucun modèle disponible');
        }

        const prompt = `Tu es un expert en revue de code ${language}. Analyse le code suivant et fournis une revue détaillée.

${context ? `**Contexte:** ${context}\n\n` : ''}**Code à analyser:**
\`\`\`${language}
${code}
\`\`\`

Réponds UNIQUEMENT avec un JSON valide au format suivant:
{
  "summary": "Résumé de la qualité du code en 2-3 phrases",
  "issues": [
    {
      "severity": "critical|warning|info",
      "line": 10,
      "message": "Description du problème",
      "suggestion": "Comment corriger"
    }
  ],
  "improvements": ["Amélioration suggérée 1", "Amélioration suggérée 2"],
  "securityConcerns": ["Problème de sécurité si applicable"],
  "performanceIssues": ["Problème de performance si applicable"],
  "score": 75
}

**Critères d'évaluation:**
- Lisibilité et maintenabilité
- Gestion des erreurs
- Bonnes pratiques ${language}
- Sécurité (injections, XSS, etc.)
- Performance (algorithmes, mémoire)
- Tests potentiels manquants

Score: 0-40 = Critique, 41-60 = Amélioration nécessaire, 61-80 = Bon, 81-100 = Excellent`;

        try {
            const response = await this.generateWithOllama(prompt, model, { temperature: 0.3, num_predict: 3000 });
            
            let cleanResponse = response.trim();
            if (cleanResponse.startsWith('```json')) cleanResponse = cleanResponse.slice(7);
            else if (cleanResponse.startsWith('```')) cleanResponse = cleanResponse.slice(3);
            if (cleanResponse.endsWith('```')) cleanResponse = cleanResponse.slice(0, -3);
            
            return JSON.parse(cleanResponse.trim());
        } catch (error) {
            console.error('[AICompletionService] Code review failed:', error);
            return {
                summary: 'Erreur lors de l\'analyse',
                issues: [],
                improvements: [],
                securityConcerns: [],
                performanceIssues: [],
                score: 0
            };
        }
    }

    /**
     * Génère des suggestions de refactoring pour améliorer le code
     * Identifie les patterns à extraire, simplifier ou moderniser
     */
    public async suggestRefactoring(code: string, language: string = 'typescript', focus?: 'performance' | 'readability' | 'security' | 'all'): Promise<RefactoringResult> {
        const ollamaAvailable = await this.isOllamaAvailable();
        if (!ollamaAvailable) {
            throw new Error('Ollama non disponible pour les suggestions de refactoring');
        }

        const model = await this.selectBestModel();
        if (!model) {
            throw new Error('Aucun modèle disponible');
        }

        const focusText = focus === 'all' || !focus 
            ? 'tous les aspects (performance, lisibilité, sécurité)'
            : focus === 'performance' ? 'la performance et l\'optimisation'
            : focus === 'readability' ? 'la lisibilité et la maintenabilité'
            : 'la sécurité et les bonnes pratiques';

        const prompt = `Tu es un architecte logiciel expert en ${language}. Analyse ce code et propose des refactorings ciblés sur ${focusText}.

**Code à refactorer:**
\`\`\`${language}
${code}
\`\`\`

Réponds UNIQUEMENT avec un JSON valide:
{
  "suggestions": [
    {
      "type": "extract-function|rename|simplify|pattern|performance|security|modernize",
      "title": "Titre court de la suggestion",
      "description": "Explication détaillée de pourquoi et comment refactorer",
      "priority": "high|medium|low",
      "codeExample": "// Exemple de code refactoré (optionnel)"
    }
  ],
  "complexity": {
    "current": "Description de la complexité actuelle",
    "potential": "Complexité après refactoring"
  },
  "maintainability": "Évaluation de la maintenabilité et suggestions globales"
}

**Types de refactoring à considérer:**
- extract-function: Extraire du code en fonctions réutilisables
- rename: Renommer variables/fonctions pour plus de clarté
- simplify: Simplifier la logique complexe
- pattern: Appliquer un design pattern approprié
- performance: Optimiser les performances
- security: Corriger les failles de sécurité
- modernize: Utiliser des syntaxes/APIs modernes ${language}`;

        try {
            const response = await this.generateWithOllama(prompt, model, { temperature: 0.4, num_predict: 4000 });
            
            let cleanResponse = response.trim();
            if (cleanResponse.startsWith('```json')) cleanResponse = cleanResponse.slice(7);
            else if (cleanResponse.startsWith('```')) cleanResponse = cleanResponse.slice(3);
            if (cleanResponse.endsWith('```')) cleanResponse = cleanResponse.slice(0, -3);
            
            return JSON.parse(cleanResponse.trim());
        } catch (error) {
            console.error('[AICompletionService] Refactoring suggestions failed:', error);
            return {
                suggestions: [],
                complexity: { current: 'Analyse impossible', potential: 'N/A' },
                maintainability: 'Erreur lors de l\'analyse'
            };
        }
    }

    /**
     * Explique un morceau de code en langage naturel
     */
    public async explainCode(code: string, language: string = 'typescript', level: 'beginner' | 'intermediate' | 'expert' = 'intermediate'): Promise<string> {
        const ollamaAvailable = await this.isOllamaAvailable();
        if (!ollamaAvailable) {
            throw new Error('Ollama non disponible');
        }

        const model = await this.selectBestModel();
        if (!model) {
            throw new Error('Aucun modèle disponible');
        }

        const levelText = level === 'beginner' 
            ? 'un débutant qui apprend à coder' 
            : level === 'expert' 
                ? 'un développeur senior qui veut comprendre les subtilités'
                : 'un développeur intermédiaire';

        const prompt = `Explique ce code ${language} à ${levelText}. Sois clair et pédagogique.

\`\`\`${language}
${code}
\`\`\`

**Instructions:**
- Explique ce que fait le code ligne par ligne si nécessaire
- Mentionne les concepts importants utilisés
- Signale les points d'attention ou pièges potentiels
- ${level === 'beginner' ? 'Utilise des analogies simples' : level === 'expert' ? 'Discute des choix d\'implémentation et alternatives' : 'Équilibre entre détails et clarté'}`;

        try {
            return await this.generateWithOllama(prompt, model, { temperature: 0.5, num_predict: 2000 });
        } catch (error) {
            console.error('[AICompletionService] Code explanation failed:', error);
            return 'Erreur lors de l\'explication du code.';
        }
    }

    /**
     * Génère des tests unitaires pour un morceau de code
     */
    public async generateTests(code: string, language: string = 'typescript', framework: string = 'vitest'): Promise<string> {
        const ollamaAvailable = await this.isOllamaAvailable();
        if (!ollamaAvailable) {
            throw new Error('Ollama non disponible');
        }

        const model = await this.selectBestModel();
        if (!model) {
            throw new Error('Aucun modèle disponible');
        }

        const prompt = `Génère des tests unitaires ${framework} pour ce code ${language}.

**Code à tester:**
\`\`\`${language}
${code}
\`\`\`

**Instructions:**
- Génère des tests complets couvrant les cas normaux et edge cases
- Utilise la syntaxe ${framework} (describe, it/test, expect)
- Ajoute des commentaires expliquant chaque test
- Inclus des tests pour les erreurs potentielles
- Mock les dépendances externes si nécessaire

Réponds UNIQUEMENT avec le code des tests, prêt à être utilisé.`;

        try {
            return await this.generateWithOllama(prompt, model, { temperature: 0.3, num_predict: 4000 });
        } catch (error) {
            console.error('[AICompletionService] Test generation failed:', error);
            return '// Erreur lors de la génération des tests';
        }
    }

    /**
     * Détecte les failles de sécurité potentielles dans le code
     */
    public async detectSecurityIssues(code: string, language: string = 'typescript'): Promise<SecurityIssue[]> {
        const ollamaAvailable = await this.isOllamaAvailable();
        if (!ollamaAvailable) {
            throw new Error('Ollama non disponible');
        }

        const model = await this.selectBestModel();
        if (!model) {
            throw new Error('Aucun modèle disponible');
        }

        const prompt = `Tu es un expert en sécurité applicative. Analyse ce code ${language} pour détecter les vulnérabilités.

**Code à analyser:**
\`\`\`${language}
${code}
\`\`\`

Réponds UNIQUEMENT avec un JSON valide:
[
  {
    "severity": "critical|high|medium|low",
    "type": "Type de vulnérabilité (XSS, SQL Injection, etc.)",
    "description": "Description détaillée du problème",
    "line": 10,
    "fix": "Comment corriger cette vulnérabilité"
  }
]

**Vulnérabilités à rechercher:**
- Injection (SQL, NoSQL, Command, LDAP)
- XSS (Cross-Site Scripting)
- CSRF (Cross-Site Request Forgery)
- Exposition de données sensibles
- Authentification/Autorisation faible
- Configuration non sécurisée
- Dépendances vulnérables
- Cryptographie faible
- Validation d'entrée manquante
- Race conditions

Si aucune vulnérabilité, retourne un tableau vide: []`;

        try {
            const response = await this.generateWithOllama(prompt, model, { temperature: 0.2, num_predict: 3000 });
            
            let cleanResponse = response.trim();
            if (cleanResponse.startsWith('```json')) cleanResponse = cleanResponse.slice(7);
            else if (cleanResponse.startsWith('```')) cleanResponse = cleanResponse.slice(3);
            if (cleanResponse.endsWith('```')) cleanResponse = cleanResponse.slice(0, -3);
            
            return JSON.parse(cleanResponse.trim());
        } catch (error) {
            console.error('[AICompletionService] Security analysis failed:', error);
            return [];
        }
    }

    /**
     * Génère la complétion du projet
     */
    public async completeProject(currentProject: any): Promise<AICompletionResult> {
        // 1. Analyser le workspace pour avoir du contexte
        const workspaceAnalysis = await this.workspaceAnalyzer.analyzeWorkspace();
        
        // 2. Vérifier si Ollama est disponible
        const ollamaAvailable = await this.isOllamaAvailable();
        
        if (ollamaAvailable) {
            // Préférer un modèle long contexte si beaucoup de données
            const hasLargeContext = (workspaceAnalysis?.dependencies?.length || 0) > 20 || 
                                    (workspaceAnalysis?.fileStats?.totalFiles || 0) > 50;
            
            const model = hasLargeContext 
                ? (await this.selectLongContextModel()) || (await this.selectBestModel())
                : await this.selectBestModel();
                
            if (model) {
                try {
                    console.log(`[AICompletionService] Using model: ${model} (large context: ${hasLargeContext})`);
                    return await this.completeWithAI(currentProject, workspaceAnalysis, model);
                } catch (error) {
                    console.error('AI completion failed, using fallback:', error);
                }
            }
        }

        // 3. Fallback: utiliser l'analyse du workspace
        return this.completeFromAnalysis(currentProject, workspaceAnalysis);
    }

    /**
     * Génère un contexte enrichi pour le LLM avec toutes les informations disponibles
     */
    private buildEnrichedContext(
        currentProject: any,
        analysis: WorkspaceAnalysis | null
    ): string {
        const sections: string[] = [];
        
        // === Section 1: Informations du Workspace ===
        if (analysis) {
            // Construire une analyse détaillée des dépendances avec catégories
            const depCategories = this.categorizeDependencies(analysis.dependencies);
            const devDepCategories = this.categorizeDependencies(analysis.devDependencies);
            
            sections.push(`## 📊 ANALYSE APPROFONDIE DU WORKSPACE

### 🏷️ Identité du Projet
- **Nom du projet**: ${analysis.name}
- **Type détecté**: ${analysis.type === 'GAME_2D' ? '🎮 Jeu vidéo 2D' : '🌐 Application Web/Mobile'}
- **Description extraite du README**: ${analysis.concept || 'Non disponible - à définir'}

### 🛠️ Stack Technique Détaillée
**Frontend:**
- Framework principal: ${analysis.specs.frontendFramework || 'Non détecté'}
- Bibliothèques UI: ${depCategories.ui.join(', ') || 'Aucune'}
- State Management: ${depCategories.stateManagement.join(', ') || 'Non détecté'}
- Styling: ${analysis.detectedFiles.hasTailwind ? 'Tailwind CSS' : depCategories.styling.join(', ') || 'CSS standard'}

**Backend:**
- Framework: ${analysis.specs.backendFramework || 'Non détecté'}
- ORM/Database: ${analysis.detectedFiles.hasPrisma ? 'Prisma' : depCategories.database.join(', ') || 'Non détecté'}
- API: ${analysis.detectedFiles.hasGraphQL ? 'GraphQL' : depCategories.api.join(', ') || 'REST probable'}
- Auth: ${depCategories.auth.join(', ') || 'Non détecté'}

**Jeu (si applicable):**
- Moteur: ${analysis.specs.gameEngine || 'Non détecté'}
- Rendu: ${depCategories.gameEngine.join(', ') || 'N/A'}

**Infrastructure:**
- Cible de déploiement: ${analysis.specs.deploymentTarget || 'Non configurée'}
- PWA: ${analysis.specs.pwaSupport ? '✅ Oui' : '❌ Non'}
- Docker: ${analysis.detectedFiles.hasDockerfile ? '✅ Configuré' : '❌ Non'}
- CI/CD: ${analysis.detectedFiles.hasCICD ? '✅ Configuré' : '❌ Non'}

### 📦 Dépendances Analysées

**Production (${analysis.dependencies.length} packages):**
${this.formatDependencyList(analysis.dependencies, depCategories)}

**Développement (${analysis.devDependencies.length} packages):**
- Testing: ${devDepCategories.testing.join(', ') || 'Non configuré'}
- Linting: ${devDepCategories.linting.join(', ') || 'Non configuré'}
- Build: ${devDepCategories.build.join(', ') || 'Non configuré'}

### 📈 Métriques du Code Source
| Catégorie | Nombre | Détails |
|-----------|--------|---------|
| Fichiers totaux | ${analysis.fileStats.totalFiles} | Tous fichiers confondus |
| Fichiers de code | ${analysis.fileStats.codeFiles} | .ts, .tsx, .js, .jsx, etc. |
| Fichiers de test | ${analysis.fileStats.testFiles} | .test., .spec. |
| Composants UI | ${analysis.fileStats.componentFiles} | React/Vue/Svelte components |
| Couverture estimée | ${analysis.fileStats.testFiles > 0 ? Math.round((analysis.fileStats.testFiles / Math.max(1, analysis.fileStats.codeFiles)) * 100) : 0}% | Ratio tests/code |

### ✅ Configuration Détectée
| Fichier | Présent | Implication |
|---------|---------|-------------|
| package.json | ${analysis.detectedFiles.hasPackageJson ? '✅' : '❌'} | Projet Node.js |
| tsconfig.json | ${analysis.detectedFiles.hasTsConfig ? '✅' : '❌'} | TypeScript activé |
| Dockerfile | ${analysis.detectedFiles.hasDockerfile ? '✅' : '❌'} | Containerisation prête |
| prisma/schema | ${analysis.detectedFiles.hasPrisma ? '✅' : '❌'} | ORM Prisma configuré |
| GraphQL schema | ${analysis.detectedFiles.hasGraphQL ? '✅' : '❌'} | API GraphQL |
| tailwind.config | ${analysis.detectedFiles.hasTailwind ? '✅' : '❌'} | Tailwind CSS |
| Tests config | ${analysis.detectedFiles.hasTests ? '✅' : '❌'} | Tests unitaires |
| CI/CD config | ${analysis.detectedFiles.hasCICD ? '✅' : '❌'} | Intégration continue |

### 🎯 Fonctionnalités Principales Identifiées
${analysis.coreFeatures?.length > 0 ? analysis.coreFeatures.map((f, i) => `${i + 1}. ${f}`).join('\n') : '⚠️ Aucune feature spécifique détectée - à définir manuellement'}

### 🖼️ Assets Détectés (${analysis.assets?.length || 0})
${analysis.assets?.length > 0 ? analysis.assets.slice(0, 15).map(a => `- [${a.category}] ${a.name}${a.path ? ` → ${a.path}` : ''}`).join('\n') : '⚠️ Aucun asset détecté'}

### 🔐 Variables d'Environnement (${analysis.variables?.length || 0})
${analysis.variables?.length > 0 ? analysis.variables.slice(0, 10).map(v => `- \`${v.key}\`: ${v.description || 'Configuration requise'}`).join('\n') : '⚠️ Aucune variable détectée'}`);
        } else {
            sections.push(`## ⚠️ WORKSPACE
Aucun workspace ouvert ou analyse impossible. Génération basée sur les informations projet uniquement.`);
        }
        
        // === Section 2: Données du Projet Existant ===
        if (currentProject) {
            const roadmapSummary = currentProject.roadmap?.length > 0
                ? currentProject.roadmap.map((p: any, i: number) => 
                    `${i + 1}. **${p.title}** - ${p.status} (${p.progress}%) ${p.priority ? `[${p.priority}]` : ''}\n   ${p.description || 'Pas de description'}`
                ).join('\n')
                : '⚠️ Aucune phase définie - roadmap à créer';
            
            // Calculer les statistiques du projet
            const totalProgress = currentProject.roadmap?.length > 0 
                ? Math.round(currentProject.roadmap.reduce((acc: number, p: any) => acc + (p.progress || 0), 0) / currentProject.roadmap.length)
                : 0;
            
            const phasesByStatus = currentProject.roadmap?.reduce((acc: Record<string, number>, p: any) => {
                acc[p.status] = (acc[p.status] || 0) + 1;
                return acc;
            }, {}) || {};
            
            sections.push(`## 📋 ÉTAT ACTUEL DU PROJET

### 🏷️ Informations Générales
| Champ | Valeur | Status |
|-------|--------|--------|
| Nom | ${currentProject.name || '❌ Non défini'} | ${currentProject.name ? '✅' : '⚠️ À compléter'} |
| Type | ${currentProject.type || '❌ Non défini'} | ${currentProject.type ? '✅' : '⚠️ À définir'} |
| Concept | ${currentProject.concept ? currentProject.concept.substring(0, 100) + '...' : '❌ Non défini'} | ${currentProject.concept ? '✅' : '⚠️ À compléter'} |
| Public cible | ${currentProject.targetAudience || '❌ Non défini'} | ${currentProject.targetAudience ? '✅' : '⚠️ À définir'} |
| Elevator Pitch | ${currentProject.elevatorPitch || '❌ Non défini'} | ${currentProject.elevatorPitch ? '✅' : '⚠️ À compléter'} |
| Architecture | ${currentProject.architecture ? 'Définie' : '❌ Non définie'} | ${currentProject.architecture ? '✅' : '⚠️ À documenter'} |
| Critères de validation | ${currentProject.validationCriteria ? 'Définis' : '❌ Non définis'} | ${currentProject.validationCriteria ? '✅' : '⚠️ À définir'} |

### 📊 Progression du Projet
- **Avancement global**: ${totalProgress}%
- Phases backlog: ${phasesByStatus['backlog'] || 0}
- Phases todo: ${phasesByStatus['todo'] || 0}
- Phases en cours: ${phasesByStatus['doing'] || 0}
- Phases en review: ${phasesByStatus['review'] || 0}
- Phases terminées: ${phasesByStatus['done'] || 0}

### 🗺️ Roadmap Actuelle (${currentProject.roadmap?.length || 0} phases)
${roadmapSummary}

### 📦 Ressources du Projet
- 🖼️ Assets: ${currentProject.assets?.length || 0} fichiers
- ⌨️ Commandes: ${currentProject.commands?.length || 0} scripts
- 🔐 Variables: ${currentProject.variables?.length || 0} configs
- ❓ FAQs: ${currentProject.faqs?.length || 0} entrées
- 🧪 Cas de test: ${currentProject.testCases?.length || 0} scénarios

### 🎯 Features Principales Déclarées
${currentProject.coreFeatures?.length > 0 ? currentProject.coreFeatures.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n') : '⚠️ Aucune feature déclarée'}`);
        } else {
            sections.push(`## 📋 PROJET
Aucun projet actif. Création d'un nouveau projet.`);
        }
        
        return sections.join('\n\n---\n\n');
    }
    
    /**
     * Catégorise les dépendances par type pour une meilleure analyse
     */
    private categorizeDependencies(deps: string[]): Record<string, string[]> {
        const categories: Record<string, string[]> = {
            ui: [],
            stateManagement: [],
            styling: [],
            database: [],
            api: [],
            auth: [],
            gameEngine: [],
            testing: [],
            linting: [],
            build: [],
            utils: []
        };
        
        const patterns: Record<string, RegExp> = {
            ui: /^(react|vue|svelte|angular|next|nuxt|remix|gatsby|solid|preact|@mui|@chakra|antd|@headless|radix|shadcn)/i,
            stateManagement: /^(redux|zustand|jotai|recoil|mobx|pinia|vuex|xstate|valtio)/i,
            styling: /^(styled-components|emotion|sass|less|postcss|@emotion|tailwind|bootstrap|bulma)/i,
            database: /^(prisma|mongoose|typeorm|sequelize|knex|drizzle|@prisma|pg|mysql|mongodb|redis|sqlite)/i,
            api: /^(axios|graphql|apollo|urql|@tanstack|swr|trpc|express|fastify|koa|hono|@hono)/i,
            auth: /^(next-auth|passport|jwt|bcrypt|@auth|lucia|clerk|auth0|firebase-admin)/i,
            gameEngine: /^(phaser|pixi|three|babylon|matter|p5|kontra|excalibur|kaboom)/i,
            testing: /^(jest|vitest|mocha|chai|cypress|playwright|@testing-library|msw)/i,
            linting: /^(eslint|prettier|@typescript-eslint|stylelint|husky|lint-staged)/i,
            build: /^(webpack|vite|esbuild|rollup|parcel|turbo|tsup|unbuild)/i
        };
        
        for (const dep of deps) {
            let categorized = false;
            for (const [category, pattern] of Object.entries(patterns)) {
                if (pattern.test(dep)) {
                    categories[category].push(dep);
                    categorized = true;
                    break;
                }
            }
            if (!categorized) {
                categories.utils.push(dep);
            }
        }
        
        return categories;
    }
    
    /**
     * Formate la liste des dépendances de manière lisible
     */
    private formatDependencyList(deps: string[], categories: Record<string, string[]>): string {
        const lines: string[] = [];
        
        if (categories.ui.length > 0) {
            lines.push(`- **UI/Framework**: ${categories.ui.join(', ')}`);
        }
        if (categories.stateManagement.length > 0) {
            lines.push(`- **State Management**: ${categories.stateManagement.join(', ')}`);
        }
        if (categories.database.length > 0) {
            lines.push(`- **Database/ORM**: ${categories.database.join(', ')}`);
        }
        if (categories.api.length > 0) {
            lines.push(`- **API/HTTP**: ${categories.api.join(', ')}`);
        }
        if (categories.auth.length > 0) {
            lines.push(`- **Authentification**: ${categories.auth.join(', ')}`);
        }
        if (categories.gameEngine.length > 0) {
            lines.push(`- **Moteur de jeu**: ${categories.gameEngine.join(', ')}`);
        }
        if (categories.utils.length > 0) {
            lines.push(`- **Utilitaires**: ${categories.utils.slice(0, 10).join(', ')}${categories.utils.length > 10 ? ` (+${categories.utils.length - 10} autres)` : ''}`);
        }
        
        return lines.length > 0 ? lines.join('\n') : '- Aucune dépendance analysable';
    }
    
    /**
     * Complétion avec IA (Ollama) - Contexte enrichi avec VRAI code source
     */
    private async completeWithAI(
        currentProject: any, 
        analysis: WorkspaceAnalysis | null,
        model: string
    ): Promise<AICompletionResult> {
        const startTime = Date.now();
        
        // Vérifier le cache
        const cacheKey = `complete_${currentProject?.id || 'new'}_${analysis?.name || 'noWorkspace'}`;
        const cached = AICompletionService.analysisCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < AICompletionService.ANALYSIS_CACHE_TTL_MS) {
            console.log('[AICompletionService] Returning cached completion result');
            return cached.result;
        }
        
        // === ANALYSE PROFONDE: Collecter et lire le code source réel ===
        console.log('[AICompletionService] Starting deep project analysis...');
        
        // 1. Build Graph
        await this.dependencyGraph.buildGraph();

        // 2. Collecter les fichiers de configuration et documentation importants
        const configFiles = await this.collectImportantConfigFiles();
        console.log(`[AICompletionService] Collected ${configFiles.length} config/doc files`);
        
        // 3. Collecter les fichiers de code source (augmenté à 50 pour une analyse complète)
        const projectFiles = await this.collectProjectFiles(50);
        console.log(`[AICompletionService] Collected ${projectFiles.length} source code files`);
        
        // 4. Générer l'analyse structurelle complète
        const codeAnalysis = this.analyzeCodeStructure(projectFiles);
        
        // 5. Générer le contexte avec le CODE SOURCE RÉEL et analyse en profondeur
        const realCodeContext = this.buildRealCodeContext(configFiles, projectFiles, codeAnalysis);
        
        // 6. Enrichir avec le Dependency Graph
        const entryPoints = projectFiles.filter(f => f.path.includes('index') || f.path.includes('main') || f.path.includes('App'));
        let architectureContext = '\n### 🏗️ ARCHITECTURE DU PROJET (DÉDUITE DU GRAPHE DE DÉPENDANCE)\n';

        for (const entry of entryPoints.slice(0, 3)) {
            const deps = this.dependencyGraph.getCluster(entry.path, 2); // Depth 2
            architectureContext += `- **Point d'entrée:** \`${entry.path}\`\n  - Dépend de: ${deps.slice(0, 5).join(', ')}${deps.length > 5 ? '...' : ''}\n`;
        }

        console.log(`[AICompletionService] Analysis complete: ${codeAnalysis.totalClasses} classes, ${codeAnalysis.totalFunctions} functions, ${codeAnalysis.apiEndpoints.length} endpoints, ${codeAnalysis.detectedPatterns.length} patterns`);
        console.log(`[AICompletionService] Features detected: ${codeAnalysis.implementedFeatures.join(', ')}`);
        
        // Construire le contexte enrichi avec le code source RÉEL et le Graphe
        const enrichedContext = this.buildEnrichedContextWithRealCode(currentProject, analysis, realCodeContext + architectureContext, codeAnalysis);
        
        // Log la taille du contexte pour debug
        console.log(`[AICompletionService] Context size: ${enrichedContext.length} characters`);
        
        // Adapter les instructions au modèle
        const modelInfo = this.getModelInfo(model);
        const isAdvancedModel = modelInfo?.capabilities.reasoning ?? false;
        
        // Déterminer le type de projet
        const projectType = analysis?.type || currentProject?.type || 'WEB_MOBILE';
        const isGame = projectType === 'GAME_2D';
        
        // Construire le prompt spécialisé avec le code analysé
        const prompt = this.buildAdvancedCompletionPrompt(
            enrichedContext, 
            currentProject, 
            analysis, 
            isAdvancedModel, 
            isGame
        );

        const response = await this.generateWithOllama(prompt, model, { 
            temperature: 0.3, // Température très basse pour précision maximale basée sur le code réel
            num_predict: 10000 // Plus de tokens pour des réponses très détaillées
        });
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Log pour debug
        console.log(`[AICompletionService] Model used: ${model}, Response length: ${response.length}, Duration: ${duration}ms`);
        
        // Parser la réponse JSON
        try {
            // Nettoyer la réponse (enlever markdown code blocks si présent)
            let cleanResponse = response.trim();
            if (cleanResponse.startsWith('```json')) {
                cleanResponse = cleanResponse.slice(7);
            } else if (cleanResponse.startsWith('```')) {
                cleanResponse = cleanResponse.slice(3);
            }
            if (cleanResponse.endsWith('```')) {
                cleanResponse = cleanResponse.slice(0, -3);
            }
            cleanResponse = cleanResponse.trim();

            const parsed = JSON.parse(cleanResponse);
            
            // Mettre en cache le résultat
            const result = this.mergeWithAnalysis(parsed, analysis, currentProject);
            AICompletionService.analysisCache.set(cacheKey, { result, timestamp: Date.now() });
            
            // === PERSISTANCE: Enregistrer la complétion réussie ===
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
            const completionEntry: Omit<CompletionHistoryEntry, 'id' | 'timestamp'> = {
                workspacePath,
                projectName: result.name || analysis?.name || 'Unknown',
                model,
                duration,
                success: true,
                fieldsCompleted: Object.keys(result).filter(k => result[k as keyof AICompletionResult] !== undefined),
                phasesGenerated: result.roadmap?.length || 0
            };
            this.persistenceService.recordCompletion(completionEntry);
            
            // Sauvegarder l'analyse dans le cache persistant
            if (analysis && workspacePath) {
                // Convertir WorkspaceAnalysis en PersistedAnalysis['analysis']
                const persistedAnalysis = {
                    projectType: analysis.type,
                    dependencies: analysis.dependencies,
                    devDependencies: analysis.devDependencies,
                    detectedFrameworks: [
                        analysis.specs?.frontendFramework,
                        analysis.specs?.backendFramework,
                        analysis.specs?.gameEngine,
                        analysis.specs?.cssFramework
                    ].filter((f): f is string => !!f),
                    detectedFeatures: analysis.coreFeatures || [],
                    codeMetrics: {
                        totalFiles: analysis.fileStats?.totalFiles || 0,
                        codeFiles: analysis.fileStats?.codeFiles || 0,
                        testFiles: analysis.fileStats?.testFiles || 0,
                        totalClasses: analysis.codeAnalysis?.totalClasses || 0,
                        totalFunctions: analysis.codeAnalysis?.totalFunctions || 0,
                        totalComponents: analysis.codeAnalysis?.totalComponents || 0
                    },
                    // Convertir les ApiEndpoint en strings pour la persistance
                    endpoints: (analysis.codeAnalysis?.apiEndpoints || []).map(
                        ep => `${ep.method} ${ep.path}`
                    ),
                    patterns: analysis.codeAnalysis?.detectedPatterns || []
                };
                
                this.persistenceService.saveAnalysis(
                    workspacePath,
                    analysis.name,
                    analysis.dependencies,
                    analysis.devDependencies,
                    persistedAnalysis
                );
            }
            
            // Fusionner avec l'analyse du workspace
            return result;
        } catch (parseError) {
            console.error('Failed to parse AI response:', parseError);
            
            // === PERSISTANCE: Enregistrer l'échec ===
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
            const failedEntry: Omit<CompletionHistoryEntry, 'id' | 'timestamp'> = {
                workspacePath,
                projectName: analysis?.name || 'Unknown',
                model,
                duration: Date.now() - startTime,
                success: false,
                fieldsCompleted: [],
                phasesGenerated: 0,
                error: parseError instanceof Error ? parseError.message : 'Parse error'
            };
            this.persistenceService.recordCompletion(failedEntry);
            
            // Fallback to workspace analysis
            return this.completeFromAnalysis(currentProject, analysis);
        }
    }
    
    /**
     * Analyse la structure du code pour extraire des métriques détaillées
     */
    private analyzeCodeStructure(files: Array<{ path: string; content: string; language: string }>): {
        totalClasses: number;
        totalFunctions: number;
        totalInterfaces: number;
        totalComponents: number;
        apiEndpoints: string[];
        detectedPatterns: string[];
        mainModules: Array<{ name: string; type: string; exports: string[]; description: string }>;
        implementedFeatures: string[];
        todos: string[];
    } {
        let totalClasses = 0;
        let totalFunctions = 0;
        let totalInterfaces = 0;
        let totalComponents = 0;
        const apiEndpoints: string[] = [];
        const detectedPatterns: Set<string> = new Set();
        const mainModules: Array<{ name: string; type: string; exports: string[]; description: string }> = [];
        const implementedFeatures: Set<string> = new Set();
        const todos: string[] = [];
        
        for (const file of files) {
            const content = file.content;
            const fileName = file.path.split('/').pop() || file.path.split('\\').pop() || '';
            
            // Compter les classes
            const classMatches = content.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g) || [];
            totalClasses += classMatches.length;
            
            // Compter les fonctions
            const funcMatches = content.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?:=>|{)/g) || [];
            totalFunctions += funcMatches.length;
            
            // Compter les interfaces/types
            const interfaceMatches = content.match(/(?:export\s+)?(?:interface|type)\s+(\w+)/g) || [];
            totalInterfaces += interfaceMatches.length;
            
            // Détecter les composants React/Vue/Svelte
            if (/export\s+(?:default\s+)?(?:function|const)\s+\w+.*(?:return\s*\(?\s*<|jsx|tsx)/i.test(content) ||
                /React\.FC|React\.Component|useState|useEffect/.test(content)) {
                totalComponents++;
                implementedFeatures.add('Composants UI React');
            }
            
            // Détecter les endpoints API
            const routeMatches = content.match(/(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi) || [];
            for (const match of routeMatches) {
                const endpoint = match.replace(/(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]/gi, '').replace(/['"`]$/, '');
                apiEndpoints.push(endpoint);
            }
            
            // Détecter les routes Next.js/API Routes
            if (file.path.includes('/api/') || file.path.includes('/app/api/')) {
                const methodMatch = content.match(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS)/);
                if (methodMatch) {
                    const routePath = file.path.replace(/.*\/api\//, '/api/').replace(/\/route\.(ts|js)$/, '');
                    apiEndpoints.push(`${methodMatch[1]} ${routePath}`);
                    implementedFeatures.add('API Routes');
                }
            }
            
            // Détecter les patterns de design
            if (/Singleton|getInstance|static\s+instance/i.test(content)) detectedPatterns.add('Singleton');
            if (/Factory|createInstance|create\w+/i.test(content)) detectedPatterns.add('Factory');
            if (/Observer|subscribe|emit|addEventListener|EventEmitter/i.test(content)) detectedPatterns.add('Observer/EventEmitter');
            if (/Repository|findById|findAll|save|delete/i.test(content)) detectedPatterns.add('Repository');
            if (/Service|@Injectable|@Service/i.test(content)) detectedPatterns.add('Service Layer');
            if (/Middleware|next\s*\(|use\s*\(/i.test(content)) detectedPatterns.add('Middleware');
            if (/Provider|Context|createContext|useContext/i.test(content)) detectedPatterns.add('Context/Provider');
            if (/Reducer|useReducer|dispatch|action/i.test(content)) detectedPatterns.add('Reducer');
            if (/Store|zustand|createStore|useStore/i.test(content)) detectedPatterns.add('State Store');
            if (/Hook|use[A-Z]\w+/i.test(content) && file.path.includes('hook')) detectedPatterns.add('Custom Hooks');
            
            // Détecter les features implémentées
            if (/auth|login|signup|session|jwt|passport/i.test(content)) implementedFeatures.add('Authentification');
            if (/prisma|sequelize|typeorm|mongoose|knex/i.test(content)) implementedFeatures.add('ORM/Base de données');
            if (/upload|multer|formidable|multipart/i.test(content)) implementedFeatures.add('Upload de fichiers');
            if (/socket|websocket|pusher|sse|realtime/i.test(content)) implementedFeatures.add('Temps réel');
            if (/email|nodemailer|sendgrid|mailgun/i.test(content)) implementedFeatures.add('Envoi d\'emails');
            if (/stripe|payment|checkout|billing/i.test(content)) implementedFeatures.add('Paiement');
            if (/search|elasticsearch|algolia|meilisearch/i.test(content)) implementedFeatures.add('Recherche avancée');
            if (/cache|redis|memcache/i.test(content)) implementedFeatures.add('Caching');
            if (/test|describe|it\(|expect\(/i.test(content) && file.path.includes('test')) implementedFeatures.add('Tests automatisés');
            if (/i18n|intl|translate|localize/i.test(content)) implementedFeatures.add('Internationalisation');
            if (/theme|darkMode|lightMode|colorScheme/i.test(content)) implementedFeatures.add('Thèmes clair/sombre');
            if (/notification|toast|alert|snackbar/i.test(content)) implementedFeatures.add('Notifications UI');
            if (/modal|dialog|drawer|sheet/i.test(content)) implementedFeatures.add('Modals/Dialogs');
            if (/table|datagrid|pagination|sort/i.test(content)) implementedFeatures.add('Tableaux de données');
            if (/form|useForm|formik|zod|yup|validation/i.test(content)) implementedFeatures.add('Formulaires avec validation');
            if (/chart|graph|d3|recharts|chartjs/i.test(content)) implementedFeatures.add('Graphiques/Charts');
            if (/dashboard|analytics|metrics/i.test(content)) implementedFeatures.add('Dashboard/Analytics');
            
            // Extraire les TODOs et FIXMEs
            const todoMatches = content.match(/(?:TODO|FIXME|HACK|XXX):\s*(.+)/gi) || [];
            todos.push(...todoMatches.slice(0, 3).map(t => t.replace(/^(?:TODO|FIXME|HACK|XXX):\s*/i, '')));
            
            // Analyser les exports pour identifier les modules principaux
            const exportMatches = content.match(/export\s+(?:default\s+)?(?:class|function|const|interface|type)\s+(\w+)/g) || [];
            if (exportMatches.length > 0) {
                const exports = exportMatches.map(e => e.replace(/export\s+(?:default\s+)?(?:class|function|const|interface|type)\s+/, ''));
                
                let moduleType = 'Module';
                let description = '';
                
                if (file.path.includes('service')) {
                    moduleType = 'Service';
                    description = 'Service métier gérant une logique spécifique';
                } else if (file.path.includes('component') || /\.(tsx|jsx)$/.test(file.path)) {
                    moduleType = 'Component';
                    description = 'Composant UI réutilisable';
                } else if (file.path.includes('hook')) {
                    moduleType = 'Hook';
                    description = 'Hook React personnalisé';
                } else if (file.path.includes('util') || file.path.includes('helper')) {
                    moduleType = 'Utility';
                    description = 'Fonctions utilitaires';
                } else if (file.path.includes('api') || file.path.includes('route')) {
                    moduleType = 'API';
                    description = 'Endpoint ou route API';
                } else if (file.path.includes('store') || file.path.includes('state')) {
                    moduleType = 'Store';
                    description = 'Gestion d\'état global';
                } else if (file.path.includes('type') || file.path.includes('interface')) {
                    moduleType = 'Types';
                    description = 'Définitions de types TypeScript';
                } else if (file.path.includes('config')) {
                    moduleType = 'Config';
                    description = 'Configuration de l\'application';
                }
                
                mainModules.push({
                    name: fileName,
                    type: moduleType,
                    exports,
                    description
                });
            }
        }
        
        return {
            totalClasses,
            totalFunctions,
            totalInterfaces,
            totalComponents,
            apiEndpoints: [...new Set(apiEndpoints)].slice(0, 20),
            detectedPatterns: Array.from(detectedPatterns),
            mainModules: mainModules.slice(0, 15),
            implementedFeatures: Array.from(implementedFeatures),
            todos: todos.slice(0, 10)
        };
    }
    
    /**
     * Construit le contexte enrichi avec le code source analysé
     */
    private buildEnrichedContextWithCode(
        currentProject: any,
        analysis: WorkspaceAnalysis | null,
        codeSummary: string,
        codeAnalysis: ReturnType<typeof AICompletionService.prototype.analyzeCodeStructure>
    ): string {
        // Contexte de base
        let context = this.buildEnrichedContext(currentProject, analysis);
        
        // === Ajouter l'analyse du code source ===
        const codeSection = `

---

## 🔍 ANALYSE PROFONDE DU CODE SOURCE

### 📊 Métriques du Code Analysé
| Métrique | Valeur |
|----------|--------|
| Classes/Modules | ${codeAnalysis.totalClasses} |
| Fonctions | ${codeAnalysis.totalFunctions} |
| Interfaces/Types | ${codeAnalysis.totalInterfaces} |
| Composants UI | ${codeAnalysis.totalComponents} |
| Endpoints API | ${codeAnalysis.apiEndpoints.length} |

### 🏗️ Patterns de Design Détectés
${codeAnalysis.detectedPatterns.length > 0 
    ? codeAnalysis.detectedPatterns.map(p => `- ✅ **${p}**`).join('\n')
    : '⚠️ Aucun pattern clairement identifié'}

### ✅ Fonctionnalités RÉELLEMENT Implémentées
**Ces fonctionnalités sont présentes dans le code source:**
${codeAnalysis.implementedFeatures.length > 0
    ? codeAnalysis.implementedFeatures.map((f, i) => `${i + 1}. ✅ ${f}`).join('\n')
    : '⚠️ Aucune fonctionnalité majeure détectée'}

### 🌐 Endpoints API Détectés
${codeAnalysis.apiEndpoints.length > 0
    ? codeAnalysis.apiEndpoints.slice(0, 15).map(e => `- \`${e}\``).join('\n')
    : '⚠️ Aucune route API détectée'}

### 📦 Modules Principaux
| Fichier | Type | Exports | Description |
|---------|------|---------|-------------|
${codeAnalysis.mainModules.slice(0, 12).map(m => 
    `| ${m.name} | ${m.type} | ${m.exports.slice(0, 3).join(', ')}${m.exports.length > 3 ? '...' : ''} | ${m.description} |`
).join('\n')}

${codeAnalysis.todos.length > 0 ? `### 📝 TODOs/FIXMEs dans le Code
${codeAnalysis.todos.map(t => `- ⚠️ ${t}`).join('\n')}` : ''}

### 📂 Structure du Code Source
${codeSummary}
`;
        
        return context + codeSection;
    }

    /**
     * Construit un prompt avancé et détaillé pour la complétion de projet
     */
    private buildAdvancedCompletionPrompt(
        enrichedContext: string,
        currentProject: any,
        analysis: WorkspaceAnalysis | null,
        isAdvancedModel: boolean,
        isGame: boolean
    ): string {
        // Identifier les champs manquants
        const missingFields: string[] = [];
        if (!currentProject?.name?.trim()) missingFields.push('name');
        if (!currentProject?.concept?.trim()) missingFields.push('concept');
        if (!currentProject?.elevatorPitch?.trim()) missingFields.push('elevatorPitch');
        if (!currentProject?.targetAudience?.trim()) missingFields.push('targetAudience');
        if (!currentProject?.validationCriteria?.trim()) missingFields.push('validationCriteria');
        if (!currentProject?.architecture?.trim()) missingFields.push('architecture');
        if (!currentProject?.roadmap?.length) missingFields.push('roadmap');
        if (!currentProject?.testCases?.length) missingFields.push('testCases');
        if (!currentProject?.coreFeatures?.length) missingFields.push('coreFeatures');
        
        const systemContext = isGame 
            ? `Tu es un **Game Designer Senior** et **Chef de Projet Jeux Vidéo** avec 15 ans d'expérience.
Tu as travaillé sur des jeux indépendants et AAA. Tu connais parfaitement les pipelines de production de jeux 2D, 
les moteurs comme Phaser, PixiJS, Godot. Tu maîtrises les méthodes Agile adaptées au game dev.`
            : `Tu es un **Architecte Logiciel Senior** et **Chef de Projet Tech** avec 15 ans d'expérience.
Tu as conçu des applications web/mobile à grande échelle. Tu maîtrises les architectures modernes (microservices, 
serverless, JAMstack), les patterns de conception, et les méthodologies Agile/Scrum.`;
        
        const analysisInstructions = isAdvancedModel ? `
## 🔍 PHASE D'ANALYSE (modèle avancé détecté)

Avant de générer le JSON, effectue une analyse approfondie:

1. **Analyse des dépendances**: Identifie la stack exacte et ses implications
2. **Évaluation de la maturité**: Estime le niveau d'avancement du projet
3. **Détection des risques**: Identifie les points de friction potentiels
4. **Opportunités d'amélioration**: Propose des optimisations basées sur les best practices
5. **Cohérence technique**: Vérifie que les choix technologiques sont cohérents entre eux

Intègre ces insights dans tes suggestions de roadmap et d'architecture.
` : '';
        
        const gameSpecificGuidelines = isGame ? `
## 🎮 GUIDELINES SPÉCIFIQUES JEU VIDÉO

### Pour le CONCEPT (3-5 phrases):
- Décris le genre exact (platformer, roguelike, puzzle, shooter, etc.)
- Mentionne la boucle de gameplay principale ("core loop")
- Indique les influences/références (jeux similaires qui inspirent)
- Précise l'USP (Unique Selling Point) qui différencie ce jeu
- Évoque l'ambiance/esthétique visuelle

### Pour la ROADMAP (8-12 phases minimum):
Structure en jalons typiques du game dev:
1. **Pre-Production**
   - GDD (Game Design Document)
   - Concept Art & Direction Artistique
   - Prototype technique (proof of concept)
   
2. **Production - Core**
   - Core Mechanics Implementation
   - Player Controller & Physics
   - Camera System
   - Base Level Design
   
3. **Production - Content**
   - Asset Production (sprites, animations)
   - Sound Design & Music
   - Level/Stage Creation
   - Enemy/NPC Design
   
4. **Production - Systems**
   - UI/UX & Menus
   - Save/Load System
   - Progression System
   - Audio Manager
   
5. **Polish & QA**
   - Game Feel & Juice (screen shake, particles, etc.)
   - Balancing & Difficulty Curve
   - Bug Fixing & Optimization
   - Accessibility Features
   
6. **Release**
   - Build Pipeline
   - Store Integration (itch.io, Steam, etc.)
   - Launch Marketing
   - Post-Launch Support

### Pour l'ARCHITECTURE:
- Décris le pattern utilisé (ECS, Scene Graph, State Machine)
- Mentionne l'organisation des assets
- Explique la gestion des états de jeu
- Détaille le système d'événements/signaux

### Pour les TEST CASES:
- Gameplay: "Le joueur peut [action] et [résultat attendu]"
- Performance: "Le jeu maintient 60 FPS avec [X] entités"
- Edge cases: "Le jeu gère correctement [situation limite]"

### Pour les CRITÈRES DE VALIDATION:
Format: "Performance | Gameplay | UX | Accessibilité | Technique"
Exemple: "60 FPS constant | Contrôles réactifs (<100ms) | Tutoriel intégré | Options de difficulté | Pas de memory leak"
` : `
## 🌐 GUIDELINES SPÉCIFIQUES APPLICATION WEB/MOBILE

### Pour le CONCEPT (3-5 phrases):
- Décris le problème résolu et la valeur apportée
- Mentionne les fonctionnalités clés (3-4 max)
- Indique le modèle d'utilisation (SaaS, outil interne, marketplace, etc.)
- Précise les intégrations importantes
- Évoque l'approche technique générale

### Pour la ROADMAP (10-15 phases minimum):
Structure en sprints/jalons typiques:

1. **Foundation**
   - Architecture & Setup projet
   - CI/CD Pipeline
   - Base de données & ORM
   - Authentication & Authorization
   
2. **Core Features**
   - API REST/GraphQL design
   - Domain models implementation
   - Business logic layer
   - Data validation & sanitization
   
3. **Frontend - Structure**
   - Design System & Components
   - Routing & Navigation
   - State Management
   - API Integration layer
   
4. **Frontend - Features**
   - Feature pages implementation
   - Forms & Validation
   - Error handling & Feedback
   - Responsive design
   
5. **Integration**
   - Third-party integrations
   - Payment processing (si applicable)
   - Email/Notifications
   - File uploads/Storage
   
6. **Security & Performance**
   - Security audit & hardening
   - Performance optimization
   - Caching strategy
   - Rate limiting
   
7. **Quality Assurance**
   - Unit tests (>80% coverage)
   - Integration tests
   - E2E tests (happy paths)
   - Load testing
   
8. **Deployment**
   - Staging environment
   - Production setup
   - Monitoring & Logging
   - Documentation

### Pour l'ARCHITECTURE:
- Décris les couches (presentation, business, data)
- Mentionne les patterns (MVC, Clean Architecture, Hexagonal)
- Explique la stratégie de déploiement
- Détaille la gestion des erreurs et logs

### Pour les TEST CASES:
- Fonctionnel: "L'utilisateur peut [action] depuis [contexte]"
- API: "GET /resource retourne [status] avec [payload]"
- Sécurité: "Un utilisateur non-auth ne peut pas [action protégée]"
- Performance: "La page charge en moins de [X]ms"

### Pour les CRITÈRES DE VALIDATION:
Format: "Performance | Sécurité | UX | Qualité | Monitoring"
Exemple: "LCP < 2.5s | OWASP Top 10 mitigé | Score Lighthouse > 90 | Coverage > 80% | APM configuré"
`;
        
        const exampleOutput = isGame ? `
### EXEMPLE DE SORTIE ATTENDUE (Jeu 2D):
\`\`\`json
{
  "name": "Neon Dash",
  "concept": "Un runner/platformer 2D néon-rétro où le joueur incarne un coureur cyberpunk fuyant les forces corporatives dans un monde dystopique. La boucle de gameplay repose sur un système de dash/esquive et de collecte d'énergie pour maintenir sa vitesse. Inspiré par Celeste pour la précision des contrôles et Hotline Miami pour l'esthétique. L'USP est le système de 'time-flow' qui ralentit le temps pendant les esquives réussies.",
  "elevatorPitch": "Celeste rencontre Blade Runner dans un runner 2D où chaque milliseconde compte.",
  "targetAudience": "Joueurs mid-core (18-35 ans) appréciant les jeux à skill expression élevée. Fans de speedrunning et de défis précis. Communauté indie gaming sur Steam et itch.io.",
  "validationCriteria": "60 FPS constant sur GPU mid-range | Input lag < 50ms | Première heure engageante (rétention > 70%) | Accessibilité: remapping complet + mode daltonien | Speedrun-friendly: timer intégré",
  "architecture": "Architecture ECS (Entity-Component-System) avec Phaser 3. Scene Manager pour transitions fluides. Event Bus centralisé pour communication inter-systèmes. Asset pipeline avec TexturePacker pour atlases optimisés. State Machine pour les états du joueur (idle, run, dash, hurt). Pooling d'objets pour les particules et projectiles.",
  "coreFeatures": [
    "Dash omnidirectionnel avec i-frames",
    "Système de combo multiplicateur",
    "Time-flow (bullet time) sur esquive parfaite",
    "Génération procédurale de segments de niveau",
    "Leaderboards en temps réel",
    "Mode quotidien avec seed partagé"
  ],
  "roadmap": [
    {"title": "Game Design Document", "description": "Documentation complète des mécaniques: dash, time-flow, scoring. Flowcharts de progression. Moodboard artistique néon-cyberpunk.", "priority": "Critique", "estimatedHours": 24},
    {"title": "Prototype Core - Movement", "description": "Implémentation du player controller: run, jump, dash. Physics tweaking pour le 'game feel'. Configuration des collisions.", "priority": "Critique", "estimatedHours": 40},
    {"title": "Prototype Core - Time Flow", "description": "Système de ralentissement temporel. Détection d'esquive parfaite. Feedback visuel (shader slowmo).", "priority": "Critique", "estimatedHours": 32},
    {"title": "Camera System", "description": "Camera follow avec smoothing. Screen shake sur impact. Zoom dynamique selon la vitesse.", "priority": "Haute", "estimatedHours": 16},
    {"title": "Level Design - Tileset", "description": "Création du tileset néon. Règles de placement automatique. Props et décorations.", "priority": "Haute", "estimatedHours": 40},
    {"title": "Enemy Design", "description": "3 types d'ennemis de base: patrouilleur, tireur, chargeur. Patterns d'attaque. IA simple mais lisible.", "priority": "Haute", "estimatedHours": 48},
    {"title": "Audio - SFX", "description": "Sons de dash, impact, collectibles. Layering audio pour intensité. Système de mixage dynamique.", "priority": "Haute", "estimatedHours": 24},
    {"title": "Audio - Music", "description": "Track synthwave principal. Variations selon l'intensité. Transitions musicales seamless.", "priority": "Moyenne", "estimatedHours": 32},
    {"title": "UI/UX Menus", "description": "Menu principal stylisé. Pause menu. Settings (audio, contrôles, accessibilité). HUD minimal.", "priority": "Haute", "estimatedHours": 32},
    {"title": "Progression System", "description": "Système de déverrouillage. Sauvegarde locale. Statistiques de run.", "priority": "Moyenne", "estimatedHours": 24},
    {"title": "Polish - VFX", "description": "Particules de dash, trainées de vitesse. Post-processing bloom/chromatic. Death animation satisfaisante.", "priority": "Moyenne", "estimatedHours": 32},
    {"title": "Balancing", "description": "Ajustement de la courbe de difficulté. Playtests avec métriques. Itération sur les timings.", "priority": "Haute", "estimatedHours": 40},
    {"title": "QA & Bug Fixing", "description": "Tests systématiques de tous les niveaux. Correction des edge cases. Optimisation mémoire.", "priority": "Critique", "estimatedHours": 48},
    {"title": "Build & Release", "description": "Builds Windows/Mac/Linux. Page Steam/itch.io. Trailer de lancement. Press kit.", "priority": "Critique", "estimatedHours": 32}
  ],
  "testCases": [
    "Le joueur peut dash dans les 8 directions avec les i-frames actives",
    "Le time-flow s'active sur esquive parfaite (marge de 5 frames)",
    "Le score multiplicateur se reset correctement après un hit",
    "Le jeu maintient 60 FPS avec 50+ entités à l'écran",
    "La sauvegarde persiste correctement entre les sessions",
    "Les inputs sont reconnus en moins de 50ms",
    "Le jeu ne crash pas après 1h de session continue",
    "Le mode accessibilité daltonien fonctionne sur tous les éléments UI"
  ]
}
\`\`\`
` : `
### EXEMPLE DE SORTIE ATTENDUE (Application Web):
\`\`\`json
{
  "name": "TaskFlow Pro",
  "concept": "Une plateforme SaaS de gestion de projet collaborative conçue pour les équipes tech de 5-50 personnes. Combine la simplicité de Trello avec la puissance de Jira. Focus sur l'automatisation des workflows répétitifs et l'intégration native avec les outils de développement (GitHub, GitLab, Slack). Architecture moderne serverless pour une scalabilité optimale et des coûts réduits.",
  "elevatorPitch": "La gestion de projet qui s'adapte à votre équipe, pas l'inverse - automatisez 80% de vos tâches administratives.",
  "targetAudience": "Équipes de développement (startups et scale-ups). Tech leads et engineering managers. Product managers en environnement agile. Segment principal: équipes de 10-30 personnes en mode hybride/remote.",
  "validationCriteria": "LCP < 2s | TTFB < 200ms | Score Lighthouse > 95 | OWASP Top 10 audité | Uptime 99.9% SLA | Tests coverage > 85% | Accessibilité WCAG 2.1 AA",
  "architecture": "Architecture Clean/Hexagonale avec Next.js 14 (App Router). API Routes pour BFF pattern. Prisma + PostgreSQL pour la persistance. Redis pour le caching et les sessions. Architecture événementielle avec webhooks pour les intégrations. Déploiement sur Vercel (Edge Functions) avec Neon pour la DB serverless. Authentification via NextAuth.js avec SSO SAML/OIDC. Feature flags via LaunchDarkly pour le déploiement progressif.",
  "coreFeatures": [
    "Boards Kanban avec colonnes personnalisables",
    "Automatisations no-code (triggers + actions)",
    "Intégrations Git (PR linking, branch création)",
    "Time tracking intégré avec rapports",
    "Templates de projets partagés",
    "Notifications temps réel (WebSocket)",
    "API REST publique + webhooks"
  ],
  "roadmap": [
    {"title": "Project Setup & Architecture", "description": "Initialisation Next.js 14, configuration TypeScript strict, setup Prisma avec PostgreSQL, configuration ESLint/Prettier, Husky pre-commit hooks, structure des dossiers Clean Architecture.", "priority": "Critique", "estimatedHours": 16},
    {"title": "CI/CD Pipeline", "description": "GitHub Actions pour tests automatisés, preview deployments sur PR, production deployment sur merge main. Configuration Vercel avec environment secrets.", "priority": "Critique", "estimatedHours": 12},
    {"title": "Authentication System", "description": "NextAuth.js avec providers (Google, GitHub, Email magic link). Gestion des sessions JWT. Middleware de protection des routes. Pages login/signup/reset password.", "priority": "Critique", "estimatedHours": 24},
    {"title": "Database Schema & ORM", "description": "Modélisation Prisma: Users, Workspaces, Projects, Boards, Columns, Cards, Comments, Activities. Relations et indexes. Seed data pour développement.", "priority": "Critique", "estimatedHours": 20},
    {"title": "Design System", "description": "Components library avec Radix UI + Tailwind. Tokens (couleurs, typographie, spacing). Composants: Button, Input, Card, Modal, Dropdown, Toast. Documentation Storybook.", "priority": "Haute", "estimatedHours": 40},
    {"title": "Workspace & Project CRUD", "description": "API Routes pour workspaces et projets. Gestion des membres et rôles (owner, admin, member). Invitations par email. Settings pages.", "priority": "Haute", "estimatedHours": 32},
    {"title": "Kanban Board - Core", "description": "Affichage board avec colonnes et cards. Drag & drop (dnd-kit). Création/édition inline. Card detail modal. Filtres et recherche.", "priority": "Critique", "estimatedHours": 48},
    {"title": "Card Features", "description": "Assignees, due dates, labels, checklists. Markdown description avec preview. Attachments (upload vers S3/Cloudinary). Activity log.", "priority": "Haute", "estimatedHours": 40},
    {"title": "Comments & Collaboration", "description": "Système de commentaires threaded. Mentions @user. Reactions emoji. Notifications in-app. Email digest.", "priority": "Haute", "estimatedHours": 32},
    {"title": "Real-time Updates", "description": "WebSocket avec Socket.io ou Pusher. Sync en temps réel du board. Présence indicators (qui regarde quoi). Optimistic updates.", "priority": "Haute", "estimatedHours": 32},
    {"title": "Automations Engine", "description": "UI builder d'automations (when X then Y). Triggers: card moved, due date, label added. Actions: assign, notify, move, create. Historique d'exécution.", "priority": "Moyenne", "estimatedHours": 56},
    {"title": "Integrations - GitHub", "description": "OAuth GitHub App. Link PR to cards. Auto-move card on PR merge. Branch name from card. Commit references.", "priority": "Moyenne", "estimatedHours": 40},
    {"title": "API publique & Webhooks", "description": "REST API documentée (OpenAPI/Swagger). API keys management. Rate limiting. Webhooks configurables avec retry logic.", "priority": "Moyenne", "estimatedHours": 32},
    {"title": "Search & Filters", "description": "Recherche full-text avec PostgreSQL ou Algolia. Filtres avancés sauvegardables. Vues personnalisées.", "priority": "Moyenne", "estimatedHours": 24},
    {"title": "Testing Suite", "description": "Unit tests Vitest (utils, hooks, API handlers). Integration tests avec MSW. E2E Playwright (user journeys critiques). Visual regression tests.", "priority": "Haute", "estimatedHours": 48},
    {"title": "Performance Optimization", "description": "Analyse bundle avec @next/bundle-analyzer. Code splitting agressif. Image optimization. Caching Redis pour queries fréquentes. DB indexes optimization.", "priority": "Haute", "estimatedHours": 24},
    {"title": "Security Hardening", "description": "Audit OWASP. CSP headers. Input sanitization. Rate limiting par IP/user. Logs de sécurité. Penetration testing.", "priority": "Critique", "estimatedHours": 32},
    {"title": "Monitoring & Observability", "description": "Sentry pour error tracking. Vercel Analytics. Custom metrics avec Prometheus/Grafana ou Datadog. Health check endpoints.", "priority": "Haute", "estimatedHours": 16},
    {"title": "Documentation", "description": "README complet. Guide de contribution. Documentation API. Guide utilisateur. Changelog automatisé.", "priority": "Moyenne", "estimatedHours": 16},
    {"title": "Launch Preparation", "description": "Staging environment validation. Load testing avec k6. Runbook opérationnel. Support channels setup. Billing integration (Stripe).", "priority": "Critique", "estimatedHours": 32}
  ],
  "testCases": [
    "Un utilisateur peut créer un compte et se connecter via email magic link",
    "Un utilisateur peut créer un workspace et inviter des membres par email",
    "Le drag & drop des cards fonctionne avec synchronisation temps réel multi-utilisateurs",
    "Les automations se déclenchent correctement sur les triggers configurés",
    "L'API publique respecte les rate limits configurés (100 req/min)",
    "Un utilisateur non-membre ne peut pas accéder à un workspace privé (401)",
    "La page board charge en moins de 2 secondes avec 500 cards",
    "Les webhooks sont retentés 3 fois en cas d'échec avec backoff exponentiel",
    "Le score Lighthouse reste > 90 sur les pages principales",
    "Les sessions expirent correctement après 7 jours d'inactivité"
  ]
}
\`\`\`
`;

        return `${systemContext}

Tu dois générer une fiche projet **COMPLÈTE, DÉTAILLÉE et PROFESSIONNELLE** basée sur l'analyse APPROFONDIE du code source ci-dessous.

**⚠️ IMPORTANT: Tu as accès à une analyse RÉELLE du code source du projet!**
- Les fonctionnalités listées dans "Fonctionnalités RÉELLEMENT Implémentées" sont CONFIRMÉES par le code
- Les patterns détectés proviennent de l'analyse statique du code
- Les endpoints API ont été extraits des fichiers de routing
- Les modules et leurs exports sont issus du scan des fichiers sources

**Utilise ces informations pour personnaliser ta réponse au maximum!**

${enrichedContext}

---
${analysisInstructions}
${gameSpecificGuidelines}

## 📝 CHAMPS À COMPLÉTER

Les champs suivants sont vides ou manquants et **DOIVENT** être générés: **${missingFields.join(', ')}**

## ⚠️ RÈGLES CRITIQUES

1. **ANALYSE DU CODE**: Base tes suggestions sur les VRAIES fonctionnalités détectées dans le code
2. **QUANTITÉ**: Génère au minimum 10-15 phases dans la roadmap, chacune avec une description de 2-3 phrases
3. **QUALITÉ**: Chaque phase doit être spécifique au projet analysé (mentionne les fichiers/modules réels si pertinent)
4. **COHÉRENCE**: La roadmap doit correspondre à l'état actuel du code (ne pas suggérer ce qui existe déjà)
5. **RÉALISME**: Les estimatedHours doivent être réalistes (16-56h par phase typiquement)
6. **FRANÇAIS**: Tous les textes en français, sauf termes techniques anglais acceptés
7. **ARCHITECTURE**: Décris l'architecture en te basant sur les patterns DÉTECTÉS dans le code
8. **FEATURES**: Liste les coreFeatures en incluant celles déjà implémentées + les prochaines à développer

${exampleOutput}

## 🎯 FORMAT DE SORTIE

Réponds **UNIQUEMENT** avec le JSON valide (pas de texte avant/après, pas d'explication).
Assure-toi que le JSON est valide et peut être parsé.

\`\`\`json
{
  "name": "...",
  "concept": "...",
  "elevatorPitch": "...",
  "targetAudience": "...",
  "validationCriteria": "...",
  "architecture": "...",
  "coreFeatures": ["...", "..."],
  "roadmap": [
    {"title": "...", "description": "...", "priority": "Critique|Haute|Moyenne|Basse", "estimatedHours": 40}
  ],
  "testCases": ["...", "..."]
}
\`\`\`
`;
    }

    /**
     * Fusionne le résultat IA avec l'analyse du workspace - Version améliorée avec code source
     */
    private mergeWithAnalysis(
        aiResult: any, 
        analysis: WorkspaceAnalysis | null,
        currentProject: any
    ): AICompletionResult {
        const result: AICompletionResult = {};
        
        console.log('[AICompletionService] Merging AI result with analysis...');
        console.log(`[AICompletionService] AI returned: ${Object.keys(aiResult).join(', ')}`);

        // Priorité: données existantes > IA > analyse workspace

        // Nom - utiliser le nom du package.json en priorité
        if (!currentProject?.name?.trim()) {
            result.name = analysis?.name || aiResult.name || 'Nouveau Projet';
        }

        // Concept - L'IA est prioritaire car elle a analysé le code
        if (!currentProject?.concept?.trim()) {
            // Si l'IA a généré un concept avec du contexte réel (> 100 chars), le préférer
            if (aiResult.concept && aiResult.concept.length > 100) {
                result.concept = aiResult.concept;
            } else {
                result.concept = analysis?.concept || aiResult.concept || '';
            }
        }

        // Elevator Pitch
        if (!currentProject?.elevatorPitch?.trim()) {
            result.elevatorPitch = aiResult.elevatorPitch || analysis?.elevatorPitch || '';
        }

        // Target Audience
        if (!currentProject?.targetAudience?.trim()) {
            result.targetAudience = aiResult.targetAudience || analysis?.targetAudience || '';
        }

        // Type
        result.type = analysis?.type || currentProject?.type || 'WEB_MOBILE';

        // Specs - fusion intelligente
        result.specs = {
            ...(currentProject?.specs || {}),
            ...(analysis?.specs || {}),
            ...(aiResult.specs || {})
        };

        // Validation Criteria
        if (!currentProject?.validationCriteria?.trim()) {
            result.validationCriteria = aiResult.validationCriteria || analysis?.validationCriteria || '';
        }

        // Architecture - L'IA est prioritaire si elle a détecté des patterns dans le code
        if (!currentProject?.architecture?.trim()) {
            if (aiResult.architecture && aiResult.architecture.length > 50) {
                result.architecture = aiResult.architecture;
            } else {
                result.architecture = analysis?.architecture || aiResult.architecture || '';
            }
        }

        // Core Features - Fusionner les features détectées par l'analyse + celles de l'IA
        if (!currentProject?.coreFeatures?.length) {
            const aiFeatures = aiResult.coreFeatures || [];
            const analysisFeatures = analysis?.coreFeatures || [];
            // Combiner et dédupliquer les features
            const allFeatures = [...new Set([...analysisFeatures, ...aiFeatures])];
            result.coreFeatures = allFeatures.length > 0 ? allFeatures : undefined;
        }

        // Roadmap (seulement si vide) - L'IA est prioritaire car elle a le contexte du code
        if (!currentProject?.roadmap?.length) {
            const aiRoadmap = aiResult.roadmap || [];
            const analysisRoadmap = analysis?.suggestedPhases || [];
            
            // Préférer la roadmap IA si elle a plus de 5 phases (signe d'une analyse détaillée)
            const sourceRoadmap = aiRoadmap.length >= 5 ? aiRoadmap : 
                                  aiRoadmap.length > 0 ? aiRoadmap :
                                  analysisRoadmap;
            
            result.roadmap = sourceRoadmap.map((phase: any, i: number) => ({
                id: `gen-${Date.now()}-${i}`,
                title: phase.title,
                description: phase.description || '',
                status: phase.status || 'todo',
                priority: phase.priority || 'Moyenne',
                progress: phase.progress || 0,
                estimatedHours: phase.estimatedHours || undefined,
                linkedAssets: [],
                dependencies: []
            }));
            
            console.log(`[AICompletionService] Generated ${result.roadmap?.length || 0} roadmap phases from ${aiRoadmap.length >= 5 ? 'AI' : 'fallback'}`);
        }

        // Commands (depuis analyse workspace)
        if (!currentProject?.commands?.length && analysis?.commands) {
            result.commands = analysis.commands.map((cmd, i) => ({
                id: `cmd-${Date.now()}-${i}`,
                label: cmd.label,
                command: cmd.command,
                category: cmd.category,
                description: cmd.description
            }));
        }

        // Variables (depuis analyse workspace)
        if (!currentProject?.variables?.length && analysis?.variables) {
            result.variables = analysis.variables.map((v, i) => ({
                id: `var-${Date.now()}-${i}`,
                key: v.key,
                value: v.value,
                description: v.description
            }));
        }

        // Test Cases - Fusionner IA et analyse
        if (!currentProject?.testCases?.length) {
            result.testCases = aiResult.testCases || [];
        }

        return result;
    }

    /**
     * Complétion depuis l'analyse du workspace uniquement (fallback amélioré)
     */
    private completeFromAnalysis(currentProject: any, analysis: WorkspaceAnalysis | null): AICompletionResult {
        if (!analysis) {
            return this.generateDefaultCompletion(currentProject);
        }

        const result: AICompletionResult = {};
        const isGame = analysis.type === 'GAME_2D';
        const projectName = analysis.name || currentProject?.name || 'Mon Projet';

        // Utiliser les données de l'analyse
        if (!currentProject?.name?.trim()) {
            result.name = analysis.name;
        }

        if (!currentProject?.concept?.trim()) {
            // Générer un concept basé sur les dépendances détectées
            const deps = analysis.dependencies || [];
            const specs = analysis.specs || {};
            
            if (isGame) {
                const engine = specs.gameEngine || 'un moteur 2D';
                result.concept = `${projectName} est un jeu 2D développé avec ${engine}. ${analysis.concept || 'Ce projet combine des mécaniques de gameplay engageantes avec un style visuel distinctif pour créer une expérience de jeu unique et mémorable.'}`;
            } else {
                const frontend = specs.frontendFramework || 'des technologies modernes';
                const backend = specs.backendFramework ? ` avec un backend ${specs.backendFramework}` : '';
                result.concept = `${projectName} est une application ${specs.pwaSupport ? 'PWA ' : ''}construite avec ${frontend}${backend}. ${analysis.concept || 'Ce projet vise à offrir une expérience utilisateur fluide et moderne, avec une architecture pensée pour la scalabilité et la maintenabilité.'}`;
            }
        }

        result.type = analysis.type;
        result.specs = { ...(currentProject?.specs || {}), ...analysis.specs };

        // Générer une roadmap détaillée basée sur l'analyse
        if (!currentProject?.roadmap?.length) {
            result.roadmap = this.generateDetailedRoadmapFromAnalysis(analysis, isGame);
        }

        if (!currentProject?.commands?.length) {
            result.commands = analysis.commands.map((cmd, i) => ({
                id: `cmd-${Date.now()}-${i}`,
                ...cmd
            }));
        }

        if (!currentProject?.variables?.length) {
            result.variables = analysis.variables.map((v, i) => ({
                id: `var-${Date.now()}-${i}`,
                ...v
            }));
        }

        // Elevator Pitch basé sur l'analyse
        if (!currentProject?.elevatorPitch?.trim()) {
            if (isGame) {
                const engine = analysis.specs.gameEngine;
                result.elevatorPitch = `${projectName} - ${engine ? `Propulsé par ${engine}, u` : 'U'}ne expérience de jeu 2D unique où chaque session compte.`;
            } else {
                const stack = analysis.specs.frontendFramework || 'une stack moderne';
                result.elevatorPitch = `${projectName} - Une application ${stack} conçue pour simplifier et enrichir votre quotidien numérique.`;
            }
        }

        // Target Audience adapté au type de projet
        if (!currentProject?.targetAudience?.trim()) {
            if (isGame) {
                result.targetAudience = 'Joueurs indépendants et mid-core (16-40 ans) appréciant les expériences de jeu soignées. Communauté gaming sur Steam, itch.io et Discord. Streamers et content creators à la recherche de contenus originaux.';
            } else {
                const hasPWA = analysis.specs.pwaSupport;
                result.targetAudience = `Utilisateurs ${hasPWA ? 'mobiles et desktop' : 'web'} recherchant des outils efficaces et bien conçus. Professionnels et équipes (25-50 ans) valorisant la productivité. Early adopters ouverts aux solutions modernes.`;
            }
        }

        // Critères de validation détaillés
        if (!currentProject?.validationCriteria?.trim()) {
            if (isGame) {
                result.validationCriteria = 'Performance: 60 FPS sur GPU mid-range | Gameplay: Input lag < 50ms, contrôles précis | UX: Tutoriel intuitif, courbe d\'apprentissage douce | Stabilité: Pas de crash sur 2h de session | Accessibilité: Remapping des contrôles, options visuelles';
            } else {
                const hasTests = analysis.detectedFiles.hasTests;
                const hasCICD = analysis.detectedFiles.hasCICD;
                result.validationCriteria = `Performance: LCP < 2.5s, TTI < 3.5s | UX: Score Lighthouse > 85 | ${hasTests ? 'Tests: Coverage > 80%' : 'Qualité: Code review systématique'} | Sécurité: OWASP Top 10 | ${hasCICD ? 'CI/CD: Déploiement automatisé' : 'Déploiement: Process documenté'}`;
            }
        }

        // Architecture basée sur les technologies détectées
        if (!currentProject?.architecture?.trim()) {
            result.architecture = this.generateArchitectureFromAnalysis(analysis, isGame);
        }

        // Test Cases détaillés
        if (!currentProject?.testCases?.length) {
            result.testCases = this.generateTestCasesFromAnalysis(analysis, isGame);
        }

        // Core Features
        if (!currentProject?.coreFeatures?.length && analysis.coreFeatures?.length > 0) {
            result.coreFeatures = analysis.coreFeatures;
        }

        return result;
    }

    /**
     * Génère une roadmap détaillée basée sur l'analyse du workspace
     */
    private generateDetailedRoadmapFromAnalysis(analysis: WorkspaceAnalysis, isGame: boolean): any[] {
        const baseTimestamp = Date.now();
        const roadmap: any[] = [];
        
        if (isGame) {
            // Roadmap détaillée pour jeu 2D
            roadmap.push(
                { id: `gen-${baseTimestamp}-1`, title: 'Game Design Document', description: 'Documentation exhaustive des mécaniques de jeu, core loop, progression, et direction artistique. Moodboard et références.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 24 },
                { id: `gen-${baseTimestamp}-2`, title: 'Prototype - Player Controller', description: 'Implémentation du contrôleur joueur: mouvements, physique, collisions. Itération sur le game feel.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 32 },
                { id: `gen-${baseTimestamp}-3`, title: 'Core Mechanics', description: 'Développement des mécaniques principales différenciantes. Validation du fun factor via playtests.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 40 }
            );
            
            if (analysis.specs.gameEngine) {
                roadmap.push({ id: `gen-${baseTimestamp}-4`, title: `Configuration ${analysis.specs.gameEngine}`, description: `Optimisation de la configuration ${analysis.specs.gameEngine}, structure des scenes, pipeline de build.`, status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 16 });
            }
            
            roadmap.push(
                { id: `gen-${baseTimestamp}-5`, title: 'Camera & View System', description: 'Système de caméra avec smooth follow, boundaries, effets dynamiques (shake, zoom).', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 16 },
                { id: `gen-${baseTimestamp}-6`, title: 'Art Assets Production', description: 'Création des sprites, backgrounds, animations. Cohérence visuelle avec la direction artistique.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 60 },
                { id: `gen-${baseTimestamp}-7`, title: 'Level Design', description: 'Création des niveaux avec progression de difficulté. Placement des éléments, secrets, tutoriel.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 48 },
                { id: `gen-${baseTimestamp}-8`, title: 'Audio Integration', description: 'Effets sonores, musique, système audio adaptatif. Mixage et mastering.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 32 },
                { id: `gen-${baseTimestamp}-9`, title: 'UI/UX & Menus', description: 'Menus principal, pause, settings. HUD in-game. Transitions et feedback visuels.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 28 },
                { id: `gen-${baseTimestamp}-10`, title: 'Save System', description: 'Sauvegarde/chargement, progression persistante, gestion des slots.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 16 },
                { id: `gen-${baseTimestamp}-11`, title: 'Polish & Juice', description: 'Screen shake, particules, animations de transition, feedback satisfaisants.', status: 'todo', priority: 'Moyenne', progress: 0, estimatedHours: 32 },
                { id: `gen-${baseTimestamp}-12`, title: 'Balancing', description: 'Ajustement difficulté, pacing, courbe de progression. Playtests itératifs.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 24 },
                { id: `gen-${baseTimestamp}-13`, title: 'QA & Bug Fixing', description: 'Tests exhaustifs, correction des bugs critiques, tests de régression.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 40 },
                { id: `gen-${baseTimestamp}-14`, title: 'Build & Release', description: 'Builds multi-plateformes, page store, trailer, press kit, soumission.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 24 }
            );
        } else {
            // Roadmap détaillée pour application web/mobile
            roadmap.push(
                { id: `gen-${baseTimestamp}-1`, title: 'Architecture & Project Setup', description: 'Structure du projet, configuration TypeScript, ESLint, Prettier. Patterns architecturaux.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 16 }
            );
            
            if (analysis.detectedFiles.hasCICD || analysis.devDependencies.some(d => /husky|lint-staged/.test(d))) {
                roadmap.push({ id: `gen-${baseTimestamp}-2`, title: 'CI/CD Pipeline', description: 'GitHub Actions / GitLab CI. Tests automatisés, preview deployments, production workflow.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 12 });
            }
            
            if (analysis.detectedFiles.hasPrisma || analysis.dependencies.some(d => /prisma|typeorm|mongoose|sequelize/.test(d))) {
                roadmap.push({ id: `gen-${baseTimestamp}-3`, title: 'Database & ORM', description: 'Schéma de données, migrations, relations, indexes. Seed data pour développement.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 20 });
            }
            
            roadmap.push(
                { id: `gen-${baseTimestamp}-4`, title: 'Authentication System', description: 'Inscription, connexion, reset password, sessions. Middleware de protection.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 28 }
            );
            
            if (analysis.detectedFiles.hasTailwind || analysis.dependencies.some(d => /tailwind|@mui|chakra|radix/.test(d))) {
                roadmap.push({ id: `gen-${baseTimestamp}-5`, title: 'Design System', description: 'Bibliothèque de composants UI, tokens design, thème. Documentation Storybook.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 36 });
            }
            
            roadmap.push(
                { id: `gen-${baseTimestamp}-6`, title: 'Core API Development', description: 'Endpoints REST/GraphQL principaux. Validation, gestion d\'erreurs, documentation.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 44 },
                { id: `gen-${baseTimestamp}-7`, title: 'Frontend - Core Pages', description: 'Pages principales: dashboard, listings, formulaires. Routing, state management.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 48 }
            );
            
            if (analysis.dependencies.some(d => /socket|pusher|sse|realtime/.test(d))) {
                roadmap.push({ id: `gen-${baseTimestamp}-8`, title: 'Real-time Features', description: 'WebSocket/SSE, notifications live, sync multi-utilisateurs.', status: 'todo', priority: 'Moyenne', progress: 0, estimatedHours: 24 });
            }
            
            roadmap.push(
                { id: `gen-${baseTimestamp}-9`, title: 'Search & Filtering', description: 'Recherche full-text, filtres avancés, pagination performante.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 20 }
            );
            
            if (analysis.detectedFiles.hasTests || analysis.devDependencies.some(d => /vitest|jest|mocha|cypress|playwright/.test(d))) {
                roadmap.push({ id: `gen-${baseTimestamp}-10`, title: 'Testing Suite', description: 'Tests unitaires, intégration, E2E. Coverage > 80% sur la logique métier.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 40 });
            }
            
            roadmap.push(
                { id: `gen-${baseTimestamp}-11`, title: 'Security Audit', description: 'Audit OWASP, headers CSP, rate limiting, sanitization, encryption.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 20 },
                { id: `gen-${baseTimestamp}-12`, title: 'Performance Optimization', description: 'Bundle analysis, code splitting, caching, DB optimization, CDN.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 20 },
                { id: `gen-${baseTimestamp}-13`, title: 'Monitoring Setup', description: 'Error tracking, analytics, APM, alerting. Dashboards opérationnels.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 12 },
                { id: `gen-${baseTimestamp}-14`, title: 'Documentation', description: 'README, API docs, guides utilisateur, changelog, contributing.', status: 'todo', priority: 'Moyenne', progress: 0, estimatedHours: 14 },
                { id: `gen-${baseTimestamp}-15`, title: 'Launch Preparation', description: 'Staging validation, load testing, runbook, plan de rollback, go-live.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 20 }
            );
        }
        
        return roadmap;
    }

    /**
     * Génère une description d'architecture basée sur l'analyse
     */
    private generateArchitectureFromAnalysis(analysis: WorkspaceAnalysis, isGame: boolean): string {
        const specs = analysis.specs;
        const deps = analysis.dependencies;
        
        if (isGame) {
            const engine = specs.gameEngine || 'moteur 2D';
            return `Architecture ${engine} avec pattern Scene Manager pour la navigation entre écrans. ` +
                   `Système ECS (Entity-Component-System) pour les entités de jeu. ` +
                   `Event Bus centralisé pour la communication inter-systèmes. ` +
                   `Object pooling pour l'optimisation mémoire des particules et projectiles. ` +
                   `State Machine pour les états des entités (player, ennemis). ` +
                   `Asset pipeline avec chargement différé et progress tracking.`;
        } else {
            const parts: string[] = [];
            
            if (specs.frontendFramework) {
                parts.push(`Frontend ${specs.frontendFramework}`);
            }
            
            if (specs.backendFramework) {
                parts.push(`backend ${specs.backendFramework}`);
            }
            
            if (deps.some(d => /prisma/.test(d))) {
                parts.push('ORM Prisma pour la couche données');
            } else if (deps.some(d => /typeorm|sequelize|mongoose/.test(d))) {
                parts.push('ORM pour la persistance');
            }
            
            if (deps.some(d => /redis/.test(d))) {
                parts.push('Redis pour le caching');
            }
            
            if (analysis.detectedFiles.hasGraphQL) {
                parts.push('API GraphQL');
            }
            
            if (deps.some(d => /trpc/.test(d))) {
                parts.push('tRPC pour la type-safety API');
            }
            
            const baseArch = parts.length > 0 ? parts.join(' avec ') + '. ' : '';
            
            return `${baseArch}Architecture modulaire séparant les couches présentation, logique métier et données. ` +
                   `Pattern Repository pour l'accès aux données. ` +
                   `Gestion centralisée des erreurs et logging. ` +
                   `${specs.pwaSupport ? 'Support PWA avec service worker pour le mode offline. ' : ''}` +
                   `${analysis.detectedFiles.hasDockerfile ? 'Containerisation Docker pour le déploiement. ' : ''}` +
                   `CI/CD avec tests automatisés et déploiement continu.`;
        }
    }

    /**
     * Génère des cas de test basés sur l'analyse
     */
    private generateTestCasesFromAnalysis(analysis: WorkspaceAnalysis, isGame: boolean): string[] {
        if (isGame) {
            return [
                'Le joueur peut se déplacer dans toutes les directions avec des contrôles réactifs',
                'Les collisions avec l\'environnement et les entités sont détectées correctement',
                'La mécanique principale fonctionne avec feedback visuel et sonore',
                'Le jeu maintient 60 FPS avec la charge maximale d\'entités prévue',
                'La sauvegarde persiste correctement entre les sessions',
                'Le jeu charge en temps acceptable (< 5s) sur le matériel cible',
                'Aucun crash après une session prolongée (2h+)',
                'Les options d\'accessibilité s\'appliquent immédiatement',
                'L\'audio se mixe correctement sans clipping ni saturation',
                'Le jeu gère correctement la perte/reprise de focus'
            ];
        } else {
            const testCases = [
                'Un utilisateur peut créer un compte et se connecter',
                'Le reset password fonctionne avec envoi d\'email',
                'Les opérations CRUD sont persistées correctement'
            ];
            
            if (analysis.detectedFiles.hasPrisma || analysis.dependencies.some(d => /prisma|typeorm/.test(d))) {
                testCases.push('Les relations de base de données sont maintenues lors des opérations');
            }
            
            testCases.push(
                'Un utilisateur non-authentifié ne peut pas accéder aux routes protégées',
                'Les validations de formulaires affichent les erreurs appropriées',
                'La recherche retourne des résultats pertinents en temps acceptable'
            );
            
            if (analysis.specs.pwaSupport) {
                testCases.push('L\'application fonctionne en mode offline avec les données cachées');
            }
            
            testCases.push(
                'L\'interface est responsive sur mobile, tablette et desktop',
                'Les erreurs serveur sont affichées de manière user-friendly',
                'Les performances restent acceptables avec un grand volume de données'
            );
            
            return testCases;
        }
    }

    /**
     * Génère une complétion par défaut sans workspace (fallback amélioré)
     */
    private generateDefaultCompletion(currentProject: any): AICompletionResult {
        const isGame = currentProject?.type === 'GAME_2D';
        const projectName = currentProject?.name || 'Mon Projet';
        
        if (isGame) {
            return {
                concept: `${projectName} est un jeu 2D innovant qui combine des mécaniques de gameplay addictives avec un style visuel distinctif. Le core loop est centré sur une progression satisfaisante et un système de maîtrise récompensant. L'expérience est conçue pour être accessible aux nouveaux joueurs tout en offrant de la profondeur aux joueurs expérimentés.`,
                
                elevatorPitch: `${projectName} - Une expérience de jeu 2D où chaque session compte et chaque victoire est méritée.`,
                
                targetAudience: 'Joueurs casual et mid-core (16-40 ans) appréciant les jeux indépendants de qualité. Communauté Steam et itch.io. Fans de jeux à rejouabilité élevée et de challenges bien dosés. Streamers et content creators recherchant des jeux visuellement intéressants.',
                
                validationCriteria: 'Performance: 60 FPS constant sur GPU mid-range | Gameplay: Contrôles réactifs (input lag < 50ms) | Rétention: Première session > 30 min | Accessibilité: Remapping complet des contrôles | Stabilité: Pas de crash sur 2h de session | Audio: Mixage équilibré et non-fatiguant',
                
                architecture: 'Architecture basée sur un pattern Scene Manager avec transitions fluides entre les écrans. Système ECS (Entity-Component-System) pour les entités de jeu. Event Bus centralisé pour la communication inter-systèmes. Object Pooling pour les particules et projectiles. State Machine pour les états du joueur et des ennemis. Asset Manager avec chargement différé et progress tracking.',
                
                coreFeatures: [
                    'Gameplay principal avec feedback satisfaisant',
                    'Système de progression et récompenses',
                    'Contrôles précis et responsifs',
                    'Sauvegarde automatique et manuelle',
                    'Options d\'accessibilité complètes',
                    'Système audio adaptatif'
                ],
                
                roadmap: [
                    { id: `gen-${Date.now()}-1`, title: 'Game Design Document', description: 'Documentation exhaustive des mécaniques de jeu, flowcharts de progression, définition des core pillars du game design, moodboard artistique et références visuelles.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 24 },
                    { id: `gen-${Date.now()}-2`, title: 'Prototype - Player Controller', description: 'Implémentation du contrôleur joueur de base: mouvements, collisions, physique. Itération sur le game feel jusqu\'à obtenir des contrôles satisfaisants.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 32 },
                    { id: `gen-${Date.now()}-3`, title: 'Prototype - Core Mechanic', description: 'Développement et polishing de la mécanique principale différenciante. Tests utilisateurs précoces pour valider le fun factor.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 40 },
                    { id: `gen-${Date.now()}-4`, title: 'Camera & View System', description: 'Système de caméra avec smooth follow, screen boundaries, et effets dynamiques (shake, zoom). Configuration des zones et transitions.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 16 },
                    { id: `gen-${Date.now()}-5`, title: 'Art Direction & Assets', description: 'Création du style artistique définitif. Production des sprites joueur, ennemis, environnements. Animations frame-by-frame ou skeletal.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 80 },
                    { id: `gen-${Date.now()}-6`, title: 'Level Design', description: 'Création des premiers niveaux/zones. Design de la courbe de difficulté. Placement des éléments interactifs et secrets.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 48 },
                    { id: `gen-${Date.now()}-7`, title: 'Audio - Sound Effects', description: 'Création ou sourcing des effets sonores: actions joueur, feedbacks, ambiances. Intégration avec le système audio.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 24 },
                    { id: `gen-${Date.now()}-8`, title: 'Audio - Music', description: 'Composition ou licensing de la bande son. Création des couches musicales adaptatives. Système de transitions musicales.', status: 'todo', priority: 'Moyenne', progress: 0, estimatedHours: 32 },
                    { id: `gen-${Date.now()}-9`, title: 'UI/UX & Menus', description: 'Design et implémentation du menu principal, pause, settings, HUD in-game. Navigation fluide et accessible.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 32 },
                    { id: `gen-${Date.now()}-10`, title: 'Save System', description: 'Implémentation de la sauvegarde/chargement. Gestion des slots, auto-save, cloud save si applicable.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 16 },
                    { id: `gen-${Date.now()}-11`, title: 'Polish & Juice', description: 'Ajout de feedback visuel: particles, screen effects, animations de transition. Amélioration du game feel global.', status: 'todo', priority: 'Moyenne', progress: 0, estimatedHours: 40 },
                    { id: `gen-${Date.now()}-12`, title: 'Balancing & Playtests', description: 'Sessions de playtest avec métriques. Ajustement de la difficulté, économie du jeu, pacing. Itérations basées sur les retours.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 32 },
                    { id: `gen-${Date.now()}-13`, title: 'QA & Bug Fixing', description: 'Tests systématiques de toutes les features. Correction des bugs critiques et majeurs. Tests de régression.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 40 },
                    { id: `gen-${Date.now()}-14`, title: 'Optimization', description: 'Profiling performance, optimisation mémoire et GPU. Tests sur hardware cible minimum. Réduction du bundle size.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 24 },
                    { id: `gen-${Date.now()}-15`, title: 'Build & Release', description: 'Configuration des builds multi-plateformes. Création de la page store (Steam/itch.io). Trailer, screenshots, press kit. Soumission.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 32 }
                ],
                
                testCases: [
                    'Le joueur peut se déplacer dans toutes les directions sans blocage',
                    'Les collisions avec l\'environnement sont détectées correctement',
                    'La mécanique principale fonctionne avec le feedback visuel et sonore',
                    'Le jeu maintient 60 FPS constants avec 100 entités à l\'écran',
                    'La sauvegarde persiste correctement entre les sessions',
                    'Le jeu charge en moins de 5 secondes sur SSD',
                    'Aucun crash après 2 heures de session continue',
                    'Les options d\'accessibilité s\'appliquent immédiatement',
                    'L\'audio se mixe correctement sans clipping',
                    'Le jeu se pause correctement lors de la perte de focus'
                ]
            };
        } else {
            return {
                concept: `${projectName} est une application web moderne conçue pour offrir une expérience utilisateur fluide et intuitive. Elle résout un besoin concret en simplifiant les workflows complexes et en automatisant les tâches répétitives. L'architecture est pensée pour la scalabilité et la maintenabilité à long terme.`,
                
                elevatorPitch: `${projectName} - Simplifiez votre quotidien avec une solution moderne qui s'adapte à vos besoins.`,
                
                targetAudience: 'Professionnels et équipes (25-50 ans) recherchant des outils efficaces et bien conçus. Early adopters technophiles ouverts aux nouvelles solutions. Entreprises de 10-200 employés en phase de digitalisation. Utilisateurs valorisant la productivité et l\'UX.',
                
                validationCriteria: 'Performance: LCP < 2.5s, FID < 100ms | Sécurité: OWASP Top 10 audité | UX: Score Lighthouse > 90 | Qualité: Test coverage > 80% | Accessibilité: WCAG 2.1 AA | Uptime: 99.5% SLA | Mobile: Fully responsive',
                
                architecture: 'Architecture Clean/Hexagonale séparant les couches présentation, domaine et infrastructure. API RESTful avec documentation OpenAPI. Pattern Repository pour l\'accès aux données. Event-driven pour les opérations asynchrones. Caching multi-niveaux (CDN, Redis, in-memory). Authentification JWT avec refresh tokens. Logging centralisé et monitoring temps réel.',
                
                coreFeatures: [
                    'Authentification sécurisée multi-providers',
                    'Dashboard personnalisable',
                    'Gestion des données avec CRUD complet',
                    'Système de notifications temps réel',
                    'Export/Import de données',
                    'API publique documentée',
                    'Mode hors-ligne avec sync'
                ],
                
                roadmap: [
                    { id: `gen-${Date.now()}-1`, title: 'Architecture & Setup', description: 'Initialisation du projet avec la stack choisie. Configuration TypeScript strict, ESLint, Prettier. Structure des dossiers suivant les patterns choisis. Setup Husky pour pre-commit hooks.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 16 },
                    { id: `gen-${Date.now()}-2`, title: 'CI/CD Pipeline', description: 'Configuration GitHub Actions ou GitLab CI. Tests automatisés sur PR, preview deployments, production deployment sur merge. Variables d\'environnement sécurisées.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 12 },
                    { id: `gen-${Date.now()}-3`, title: 'Database & ORM', description: 'Modélisation du schéma de données. Configuration de l\'ORM (Prisma/TypeORM). Migrations initiales. Seed data pour le développement. Indexes et optimisations.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 20 },
                    { id: `gen-${Date.now()}-4`, title: 'Authentication System', description: 'Implémentation de l\'authentification: inscription, connexion, reset password, email verification. Gestion des sessions. Middleware de protection des routes.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 32 },
                    { id: `gen-${Date.now()}-5`, title: 'Design System', description: 'Création de la bibliothèque de composants UI. Définition des tokens (couleurs, typographie, spacing). Documentation Storybook. Thème clair/sombre.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 40 },
                    { id: `gen-${Date.now()}-6`, title: 'Core API Development', description: 'Développement des endpoints API principaux. Validation des inputs. Gestion des erreurs standardisée. Documentation OpenAPI/Swagger.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 48 },
                    { id: `gen-${Date.now()}-7`, title: 'Frontend - Pages principales', description: 'Implémentation des pages clés: dashboard, listing, détail, formulaires. Routing et navigation. State management. Gestion du loading et des erreurs.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 56 },
                    { id: `gen-${Date.now()}-8`, title: 'Real-time Features', description: 'Intégration WebSocket ou Server-Sent Events. Notifications temps réel. Mise à jour live des données. Gestion de la reconnexion.', status: 'todo', priority: 'Moyenne', progress: 0, estimatedHours: 24 },
                    { id: `gen-${Date.now()}-9`, title: 'File Management', description: 'Upload de fichiers sécurisé. Stockage cloud (S3/Cloudinary). Preview et téléchargement. Gestion des quotas et formats.', status: 'todo', priority: 'Moyenne', progress: 0, estimatedHours: 20 },
                    { id: `gen-${Date.now()}-10`, title: 'Search & Filtering', description: 'Recherche full-text avec highlight. Filtres avancés combinables. Tri multi-colonnes. Pagination performante.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 24 },
                    { id: `gen-${Date.now()}-11`, title: 'Email Notifications', description: 'Templates email transactionnels. Queue d\'envoi avec retry. Tracking d\'ouverture. Préférences utilisateur pour les notifications.', status: 'todo', priority: 'Moyenne', progress: 0, estimatedHours: 20 },
                    { id: `gen-${Date.now()}-12`, title: 'Testing Suite', description: 'Tests unitaires pour la logique métier. Tests d\'intégration API avec fixtures. Tests E2E pour les parcours critiques. Mocking des services externes.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 40 },
                    { id: `gen-${Date.now()}-13`, title: 'Security Hardening', description: 'Audit de sécurité OWASP. Configuration CSP headers. Rate limiting. Sanitization des inputs. Encryption des données sensibles. Logs de sécurité.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 24 },
                    { id: `gen-${Date.now()}-14`, title: 'Performance Optimization', description: 'Analyse du bundle size. Code splitting. Lazy loading. Caching stratégie (CDN, Redis). Optimisation des requêtes DB. Compression.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 24 },
                    { id: `gen-${Date.now()}-15`, title: 'Monitoring & Logging', description: 'Error tracking (Sentry). Analytics utilisateur. APM et métriques custom. Alerting sur anomalies. Dashboards de monitoring.', status: 'todo', priority: 'Haute', progress: 0, estimatedHours: 16 },
                    { id: `gen-${Date.now()}-16`, title: 'Documentation', description: 'README complet avec setup local. Documentation API interactive. Guide utilisateur. Changelog. Contributing guide.', status: 'todo', priority: 'Moyenne', progress: 0, estimatedHours: 16 },
                    { id: `gen-${Date.now()}-17`, title: 'Launch Preparation', description: 'Environnement staging validé. Load testing. Runbook opérationnel. Plan de rollback. Backup & recovery testés. DNS et certificats SSL.', status: 'todo', priority: 'Critique', progress: 0, estimatedHours: 24 }
                ],
                
                testCases: [
                    'Un utilisateur peut s\'inscrire avec email et se connecter',
                    'Le reset password envoie un email et permet le changement',
                    'Les données CRUD sont persistées correctement en base',
                    'Un utilisateur ne peut accéder qu\'à ses propres données',
                    'L\'API retourne 401 sur les routes protégées sans auth',
                    'La recherche retourne des résultats pertinents en < 500ms',
                    'Les uploads de fichiers sont validés (type, taille)',
                    'Le score Lighthouse reste > 90 sur les pages principales',
                    'Les tests E2E passent sur les 5 parcours critiques',
                    'Le monitoring capture et alerte sur les erreurs 500'
                ]
            };
        }
    }

    // ===========================
    // PROJECT-WIDE ANALYSIS
    // ===========================

    /**
     * Collecte les fichiers de configuration et documentation importants
     * Ces fichiers sont prioritaires car ils décrivent le projet
     */
    private async collectImportantConfigFiles(): Promise<Array<{ path: string; content: string; type: string }>> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return [];

        const rootPath = workspaceFolders[0].uri.fsPath;
        
        // Fichiers à la racine du projet
        const rootFiles = [
            { name: 'package.json', type: 'dependencies' },
            { name: 'README.md', type: 'documentation' },
            { name: 'readme.md', type: 'documentation' },
            { name: 'README.en.md', type: 'documentation' },
            { name: 'tsconfig.json', type: 'config' },
            { name: 'jsconfig.json', type: 'config' },
            { name: '.env.example', type: 'environment' },
            { name: '.env.local.example', type: 'environment' },
            { name: '.env.development', type: 'environment' },
            { name: 'docker-compose.yml', type: 'deployment' },
            { name: 'docker-compose.yaml', type: 'deployment' },
            { name: 'Dockerfile', type: 'deployment' },
            { name: 'prisma/schema.prisma', type: 'database' },
            { name: 'drizzle.config.ts', type: 'database' },
            { name: 'knexfile.js', type: 'database' },
            { name: 'knexfile.ts', type: 'database' },
            { name: 'next.config.js', type: 'framework' },
            { name: 'next.config.mjs', type: 'framework' },
            { name: 'next.config.ts', type: 'framework' },
            { name: 'vite.config.ts', type: 'framework' },
            { name: 'vite.config.js', type: 'framework' },
            { name: 'nuxt.config.ts', type: 'framework' },
            { name: 'astro.config.mjs', type: 'framework' },
            { name: 'svelte.config.js', type: 'framework' },
            { name: 'remix.config.js', type: 'framework' },
            { name: 'tailwind.config.js', type: 'styling' },
            { name: 'tailwind.config.ts', type: 'styling' },
            { name: 'openapi.yaml', type: 'api' },
            { name: 'openapi.json', type: 'api' },
            { name: 'swagger.json', type: 'api' },
            { name: 'swagger.yaml', type: 'api' },
            { name: 'CONTRIBUTING.md', type: 'documentation' },
            { name: 'CHANGELOG.md', type: 'documentation' },
            { name: 'vitest.config.ts', type: 'testing' },
            { name: 'jest.config.js', type: 'testing' },
            { name: 'jest.config.ts', type: 'testing' },
            { name: 'playwright.config.ts', type: 'testing' },
            { name: 'cypress.config.ts', type: 'testing' },
            { name: '.eslintrc.js', type: 'linting' },
            { name: '.eslintrc.json', type: 'linting' },
            { name: 'eslint.config.js', type: 'linting' },
            { name: 'eslint.config.mjs', type: 'linting' },
            { name: 'pyproject.toml', type: 'dependencies' },
            { name: 'requirements.txt', type: 'dependencies' },
            { name: 'setup.py', type: 'dependencies' },
            { name: 'Cargo.toml', type: 'dependencies' },
            { name: 'go.mod', type: 'dependencies' },
            { name: 'pom.xml', type: 'dependencies' },
            { name: 'build.gradle', type: 'dependencies' },
        ];

        const collected: Array<{ path: string; content: string; type: string }> = [];

        // Collecter les fichiers racine
        for (const file of rootFiles) {
            try {
                const filePath = path.join(rootPath, file.name);
                const uri = vscode.Uri.file(filePath);
                const content = await vscode.workspace.fs.readFile(uri);
                const text = Buffer.from(content).toString('utf8');
                
                // Limiter la taille à 20KB pour les fichiers de config
                if (text.length > 20000) {
                    collected.push({
                        path: file.name,
                        content: text.substring(0, 20000) + '\n... [TRUNCATED - ' + (text.length - 20000) + ' chars remaining]',
                        type: file.type
                    });
                } else {
                    collected.push({
                        path: file.name,
                        content: text,
                        type: file.type
                    });
                }
            } catch {
                // File doesn't exist, skip it
            }
        }
        
        // Collecter les schémas GraphQL
        const graphqlPatterns = ['**/*.graphql', '**/*.gql', '**/schema.graphql'];
        for (const pattern of graphqlPatterns) {
            const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 10);
            for (const file of files) {
                try {
                    const content = await vscode.workspace.fs.readFile(file);
                    const text = Buffer.from(content).toString('utf8');
                    if (text.length < 30000) {
                        collected.push({
                            path: vscode.workspace.asRelativePath(file),
                            content: text,
                            type: 'graphql'
                        });
                    }
                } catch {
                    // Skip
                }
            }
        }
        
        // Collecter les fichiers SQL de migration/schema
        const sqlPatterns = ['**/migrations/*.sql', '**/schema.sql', '**/init.sql', '**/db/*.sql'];
        for (const pattern of sqlPatterns) {
            const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 10);
            for (const file of files.slice(0, 5)) { // Max 5 fichiers SQL
                try {
                    const content = await vscode.workspace.fs.readFile(file);
                    const text = Buffer.from(content).toString('utf8');
                    if (text.length < 15000) {
                        collected.push({
                            path: vscode.workspace.asRelativePath(file),
                            content: text,
                            type: 'sql'
                        });
                    }
                } catch {
                    // Skip
                }
            }
        }
        
        // Collecter les fichiers de types globaux
        const typePatterns = ['**/types/index.ts', '**/types/global.ts', '**/types.ts', '**/@types/*.ts'];
        for (const pattern of typePatterns) {
            const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 5);
            for (const file of files) {
                try {
                    const content = await vscode.workspace.fs.readFile(file);
                    const text = Buffer.from(content).toString('utf8');
                    if (text.length < 25000) {
                        collected.push({
                            path: vscode.workspace.asRelativePath(file),
                            content: text,
                            type: 'types'
                        });
                    }
                } catch {
                    // Skip
                }
            }
        }

        return collected;
    }

    /**
     * Construit un contexte avec le CODE SOURCE RÉEL des fichiers
     */
    private buildRealCodeContext(
        configFiles: Array<{ path: string; content: string; type: string }>,
        codeFiles: Array<{ path: string; content: string; language: string }>,
        codeAnalysis: ReturnType<typeof AICompletionService.prototype.analyzeCodeStructure>
    ): string {
        const sections: string[] = [];
        
        // === Section 1: Fichiers de Configuration COMPLETS ===
        sections.push('# 📋 FICHIERS DE CONFIGURATION ET DOCUMENTATION\n');
        sections.push('> Ces fichiers décrivent le projet et ses dépendances\n');
        
        for (const file of configFiles) {
            sections.push(`## 📄 ${file.path} (${file.type})`);
            sections.push('```' + this.getMarkdownLangFromType(file.type));
            sections.push(file.content);
            sections.push('```\n');
        }
        
        // === Section 2: ANALYSE DÉTAILLÉE de chaque fichier de code ===
        sections.push('\n# 💻 ANALYSE DÉTAILLÉE DU CODE SOURCE\n');
        sections.push('> Analyse en profondeur de chaque fichier important\n');
        
        // Prioriser les fichiers les plus importants
        const prioritizedFiles = this.prioritizeCodeFiles(codeFiles);
        
        // Analyser les 15 fichiers les plus importants en détail
        const filesToAnalyzeDeep = prioritizedFiles.slice(0, 15);
        const remainingFiles = prioritizedFiles.slice(15);
        
        for (const file of filesToAnalyzeDeep) {
            // Analyse en profondeur du fichier
            const deepAnalysis = this.analyzeFileInDepth(file.path, file.content, file.language);
            sections.push(this.formatFileAnalysis(deepAnalysis));
            
            // Inclure aussi le code source complet pour les fichiers les plus importants (top 8)
            if (filesToAnalyzeDeep.indexOf(file) < 8) {
                let content = file.content;
                // Limiter à 10KB mais garder le maximum possible
                if (content.length > 10000) {
                    content = content.substring(0, 10000) + '\n\n// ... [FICHIER TRONQUÉ - ' + (file.content.length - 10000) + ' caractères restants]';
                }
                sections.push('\n**Code source complet:**');
                sections.push('```' + file.language);
                sections.push(content);
                sections.push('```');
            }
            sections.push('\n---\n');
        }
        
        // === Section 3: Résumé des Autres Fichiers avec analyse légère ===
        if (remainingFiles.length > 0) {
            sections.push('\n# 📂 AUTRES FICHIERS DU PROJET\n');
            sections.push('> Analyse résumée des fichiers restants\n');
            
            for (const file of remainingFiles.slice(0, 25)) {
                const quickAnalysis = this.analyzeFileInDepth(file.path, file.content, file.language);
                
                // Version condensée
                sections.push(`### ${file.path}`);
                sections.push(`- **Lignes:** ${quickAnalysis.lines} | **Exports:** ${quickAnalysis.exports.slice(0, 5).join(', ') || 'aucun'}`);
                
                if (quickAnalysis.classes.length > 0) {
                    sections.push(`- **Classes:** ${quickAnalysis.classes.map(c => c.name).join(', ')}`);
                }
                if (quickAnalysis.functions.length > 0) {
                    sections.push(`- **Fonctions:** ${quickAnalysis.functions.slice(0, 8).map(f => f.name).join(', ')}${quickAnalysis.functions.length > 8 ? '...' : ''}`);
                }
                if (quickAnalysis.reactComponents.length > 0) {
                    sections.push(`- **Composants:** ${quickAnalysis.reactComponents.map(c => c.name).join(', ')}`);
                }
                if (quickAnalysis.apiRoutes.length > 0) {
                    sections.push(`- **Routes:** ${quickAnalysis.apiRoutes.map(r => r.method + ' ' + r.path).join(', ')}`);
                }
                sections.push('');
            }
        }
        
        // === Section 4: Synthèse Globale ===
        sections.push('\n# 🔍 SYNTHÈSE DE L\'ARCHITECTURE\n');
        
        sections.push('## 📊 Métriques Globales');
        sections.push(`| Métrique | Valeur |`);
        sections.push(`|----------|--------|`);
        sections.push(`| Total Fichiers Analysés | ${codeFiles.length} |`);
        sections.push(`| Classes/Modules | ${codeAnalysis.totalClasses} |`);
        sections.push(`| Fonctions | ${codeAnalysis.totalFunctions} |`);
        sections.push(`| Interfaces/Types | ${codeAnalysis.totalInterfaces} |`);
        sections.push(`| Composants UI | ${codeAnalysis.totalComponents} |`);
        sections.push(`| Endpoints API | ${codeAnalysis.apiEndpoints.length} |`);
        
        if (codeAnalysis.apiEndpoints.length > 0) {
            sections.push('\n## 🌐 Carte des Endpoints API');
            sections.push('```');
            codeAnalysis.apiEndpoints.slice(0, 30).forEach(ep => {
                sections.push(ep);
            });
            sections.push('```');
        }
        
        if (codeAnalysis.detectedPatterns.length > 0) {
            sections.push('\n## 🏗️ Patterns Architecturaux Détectés');
            codeAnalysis.detectedPatterns.forEach(p => {
                sections.push(`- ✅ **${p}**`);
            });
        }
        
        if (codeAnalysis.implementedFeatures.length > 0) {
            sections.push('\n## ✅ Fonctionnalités Implémentées (détectées dans le code)');
            let featureNum = 1;
            codeAnalysis.implementedFeatures.forEach(f => {
                sections.push(`${featureNum}. ${f}`);
                featureNum++;
            });
        }
        
        if (codeAnalysis.mainModules.length > 0) {
            sections.push('\n## 📦 Modules Principaux');
            sections.push('| Module | Type | Exports Clés | Description |');
            sections.push('|--------|------|--------------|-------------|');
            codeAnalysis.mainModules.slice(0, 20).forEach(m => {
                sections.push(`| ${m.name} | ${m.type} | ${m.exports.slice(0, 4).join(', ')} | ${m.description} |`);
            });
        }
        
        if (codeAnalysis.todos.length > 0) {
            sections.push('\n## 📝 TODOs et Travaux en Cours');
            sections.push('> Ces éléments indiquent les tâches restantes identifiées dans le code\n');
            codeAnalysis.todos.slice(0, 20).forEach(t => {
                sections.push(`- ⚠️ ${t}`);
            });
        }
        
        return sections.join('\n');
    }
    
    /**
     * Priorise les fichiers de code par importance
     */
    private prioritizeCodeFiles(files: Array<{ path: string; content: string; language: string }>): Array<{ path: string; content: string; language: string }> {
        // Scoring system for file importance
        const scoreFile = (file: { path: string; content: string; language: string }): number => {
            let score = 0;
            const pathLower = file.path.toLowerCase();
            
            // Entry points and main files
            if (pathLower.includes('index.') || pathLower.includes('main.') || pathLower.includes('app.')) score += 100;
            if (pathLower.includes('server.') || pathLower.includes('api/')) score += 80;
            if (pathLower.includes('extension.ts') || pathLower.includes('extension.js')) score += 100;
            
            // Source directories
            if (pathLower.includes('/src/')) score += 30;
            if (pathLower.includes('/lib/')) score += 25;
            if (pathLower.includes('/services/')) score += 50;
            if (pathLower.includes('/components/')) score += 40;
            if (pathLower.includes('/hooks/')) score += 35;
            if (pathLower.includes('/utils/')) score += 20;
            if (pathLower.includes('/api/')) score += 60;
            if (pathLower.includes('/routes/')) score += 55;
            if (pathLower.includes('/controllers/')) score += 50;
            if (pathLower.includes('/models/')) score += 45;
            
            // Test files are lower priority
            if (pathLower.includes('.test.') || pathLower.includes('.spec.') || pathLower.includes('__tests__')) score -= 50;
            
            // Type definitions
            if (pathLower.includes('/types/') || pathLower.endsWith('.d.ts')) score += 20;
            
            // File size (prefer medium-sized files)
            const lines = file.content.split('\n').length;
            if (lines >= 50 && lines <= 500) score += 20;
            if (lines > 500 && lines <= 1000) score += 10;
            
            // Contains important patterns
            if (file.content.includes('export default')) score += 10;
            if (file.content.includes('export class')) score += 15;
            if (file.content.includes('async function')) score += 5;
            if (/\.(get|post|put|delete|patch)\s*\(/.test(file.content)) score += 30; // API routes
            
            return score;
        };
        
        return [...files].sort((a, b) => scoreFile(b) - scoreFile(a));
    }
    
    /**
     * Obtient l'extension markdown appropriée pour le type de fichier
     */
    private getMarkdownLangFromType(type: string): string {
        const langMap: Record<string, string> = {
            'dependencies': 'json',
            'documentation': 'markdown',
            'config': 'json',
            'environment': 'bash',
            'deployment': 'yaml',
            'database': 'prisma',
            'framework': 'javascript',
            'styling': 'javascript',
            'api': 'yaml'
        };
        return langMap[type] || 'text';
    }

    /**
     * Construit le contexte enrichi avec le code source RÉEL
     */
    private buildEnrichedContextWithRealCode(
        currentProject: any,
        analysis: WorkspaceAnalysis | null,
        realCodeContext: string,
        codeAnalysis: ReturnType<typeof AICompletionService.prototype.analyzeCodeStructure>
    ): string {
        // Contexte de base du projet
        let context = this.buildEnrichedContext(currentProject, analysis);
        
        // Ajouter le contexte avec le code source réel
        context += `

---

# 🔬 DONNÉES D'ANALYSE RÉELLES DU WORKSPACE

**IMPORTANT**: Les informations ci-dessous proviennent de l'analyse DIRECTE des fichiers du projet.
Utilise ces données RÉELLES pour générer une complétion précise et pertinente.

${realCodeContext}

---

## ⚠️ INSTRUCTIONS CRITIQUES

1. **BASE-TOI UNIQUEMENT SUR LE CODE ANALYSÉ CI-DESSUS** pour décrire le projet
2. **NE PAS INVENTER** de fonctionnalités qui ne sont pas présentes dans le code
3. **UTILISE LES NOMS RÉELS** des classes, fonctions et fichiers du projet
4. **La roadmap doit refléter** l'état actuel du code et les TODOs trouvés
5. **Sois PRÉCIS** sur les technologies et frameworks détectés

`;
        
        return context;
    }

    /**
     * Analyse détaillée d'un fichier de code - extrait TOUTES les informations importantes
     */
    private analyzeFileInDepth(filePath: string, content: string, language: string): {
        path: string;
        language: string;
        lines: number;
        imports: string[];
        exports: string[];
        classes: Array<{ name: string; extends?: string; implements?: string[]; methods: string[]; properties: string[] }>;
        functions: Array<{ name: string; params: string; returnType?: string; isAsync: boolean; isExported: boolean }>;
        interfaces: Array<{ name: string; properties: string[] }>;
        types: Array<{ name: string; definition: string }>;
        constants: Array<{ name: string; type?: string; value?: string }>;
        reactComponents: Array<{ name: string; props?: string[]; hooks: string[] }>;
        apiRoutes: Array<{ method: string; path: string; handler: string }>;
        dependencies: string[];
        comments: string[];
        todos: string[];
    } {
        const lines = content.split('\n');
        const result = {
            path: filePath,
            language,
            lines: lines.length,
            imports: [] as string[],
            exports: [] as string[],
            classes: [] as Array<{ name: string; extends?: string; implements?: string[]; methods: string[]; properties: string[] }>,
            functions: [] as Array<{ name: string; params: string; returnType?: string; isAsync: boolean; isExported: boolean }>,
            interfaces: [] as Array<{ name: string; properties: string[] }>,
            types: [] as Array<{ name: string; definition: string }>,
            constants: [] as Array<{ name: string; type?: string; value?: string }>,
            reactComponents: [] as Array<{ name: string; props?: string[]; hooks: string[] }>,
            apiRoutes: [] as Array<{ method: string; path: string; handler: string }>,
            dependencies: [] as string[],
            comments: [] as string[],
            todos: [] as string[]
        };

        // === IMPORTS ===
        const importMatches = content.match(/^import\s+(?:(?:\{[^}]+\}|[\w*]+)\s+from\s+)?['"]([^'"]+)['"]/gm) || [];
        result.imports = importMatches.map(imp => {
            const fromMatch = imp.match(/from\s+['"]([^'"]+)['"]/);
            return fromMatch ? fromMatch[1] : imp.replace(/^import\s+['"]/, '').replace(/['"]$/, '');
        });

        // === EXPORTS ===
        const exportMatches = content.match(/^export\s+(?:default\s+)?(?:async\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/gm) || [];
        result.exports = exportMatches.map(exp => {
            const nameMatch = exp.match(/(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/);
            return nameMatch ? nameMatch[1] : exp;
        });

        // === CLASSES (with detailed analysis) ===
        const classRegex = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?\s*\{/g;
        let classMatch;
        while ((classMatch = classRegex.exec(content)) !== null) {
            const className = classMatch[1];
            const extendsClass = classMatch[2];
            const implementsStr = classMatch[3]?.trim();
            const implements_ = implementsStr ? implementsStr.split(',').map(i => i.trim()) : [];
            
            // Find class body and extract methods/properties
            const classStart = classMatch.index + classMatch[0].length;
            let braceCount = 1;
            let classEnd = classStart;
            for (let i = classStart; i < content.length && braceCount > 0; i++) {
                if (content[i] === '{') braceCount++;
                else if (content[i] === '}') braceCount--;
                classEnd = i;
            }
            const classBody = content.substring(classStart, classEnd);
            
            // Extract methods
            const methodMatches = classBody.match(/(?:public|private|protected)?\s*(?:async\s+)?(?:static\s+)?(\w+)\s*\([^)]*\)/g) || [];
            const methods = methodMatches.map(m => m.trim()).filter(m => !m.includes('constructor'));
            
            // Extract properties
            const propMatches = classBody.match(/(?:public|private|protected)?\s*(?:readonly\s+)?(\w+)\s*[?:]?\s*:\s*[^;=]+[;=]/g) || [];
            const properties = propMatches.map(p => p.trim().split(':')[0].trim());
            
            result.classes.push({
                name: className,
                extends: extendsClass,
                implements: implements_,
                methods: methods.slice(0, 20),
                properties: properties.slice(0, 20)
            });
        }

        // === FUNCTIONS ===
        const funcRegex = /(?:export\s+)?(async\s+)?function\s+(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/g;
        let funcMatch;
        while ((funcMatch = funcRegex.exec(content)) !== null) {
            result.functions.push({
                name: funcMatch[2],
                params: funcMatch[3]?.trim() || '',
                returnType: funcMatch[4]?.trim(),
                isAsync: !!funcMatch[1],
                isExported: content.substring(funcMatch.index - 7, funcMatch.index).includes('export')
            });
        }

        // Arrow functions
        const arrowFuncRegex = /(?:export\s+)?const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(async\s+)?\([^)]*\)(?:\s*:\s*[^=]+)?\s*=>/g;
        let arrowMatch;
        while ((arrowMatch = arrowFuncRegex.exec(content)) !== null) {
            result.functions.push({
                name: arrowMatch[1],
                params: '',
                isAsync: !!arrowMatch[2],
                isExported: content.substring(arrowMatch.index - 7, arrowMatch.index).includes('export')
            });
        }

        // === INTERFACES ===
        const interfaceRegex = /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+[^{]+)?\s*\{([^}]+)\}/g;
        let intMatch;
        while ((intMatch = interfaceRegex.exec(content)) !== null) {
            const props = intMatch[2].split(';').map(p => p.trim()).filter(p => p && !p.startsWith('//'));
            result.interfaces.push({
                name: intMatch[1],
                properties: props.slice(0, 15)
            });
        }

        // === TYPES ===
        const typeRegex = /(?:export\s+)?type\s+(\w+)\s*=\s*([^;]+);/g;
        let typeMatch;
        while ((typeMatch = typeRegex.exec(content)) !== null) {
            result.types.push({
                name: typeMatch[1],
                definition: typeMatch[2].trim().substring(0, 200)
            });
        }

        // === CONSTANTS ===
        const constRegex = /(?:export\s+)?const\s+(\w+)(?:\s*:\s*([^=]+))?\s*=\s*([^;]+)/g;
        let constMatch;
        while ((constMatch = constRegex.exec(content)) !== null) {
            // Skip function definitions
            if (constMatch[3].includes('=>') || constMatch[3].includes('function')) continue;
            result.constants.push({
                name: constMatch[1],
                type: constMatch[2]?.trim(),
                value: constMatch[3].trim().substring(0, 100)
            });
        }

        // === REACT COMPONENTS ===
        const componentRegex = /(?:export\s+)?(?:default\s+)?(?:function|const)\s+(\w+).*?(?:React\.FC|FC<|Props|return\s*\(?[\s\n]*<)/gs;
        let compMatch;
        while ((compMatch = componentRegex.exec(content)) !== null) {
            const compName = compMatch[1];
            // Find hooks used in component
            const compStart = compMatch.index;
            const compEnd = Math.min(compStart + 2000, content.length);
            const compBody = content.substring(compStart, compEnd);
            const hooksUsed = compBody.match(/use[A-Z]\w+/g) || [];
            
            result.reactComponents.push({
                name: compName,
                hooks: [...new Set(hooksUsed)]
            });
        }

        // === API ROUTES ===
        const routeRegex = /(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
        let routeMatch;
        while ((routeMatch = routeRegex.exec(content)) !== null) {
            result.apiRoutes.push({
                method: routeMatch[1].toUpperCase(),
                path: routeMatch[2],
                handler: 'inline'
            });
        }

        // Next.js App Router
        const nextRouteMatch = content.match(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS)/);
        if (nextRouteMatch) {
            const routePath = filePath.replace(/.*\/api\//, '/api/').replace(/\/route\.(ts|js)$/, '');
            result.apiRoutes.push({
                method: nextRouteMatch[1],
                path: routePath,
                handler: nextRouteMatch[1]
            });
        }

        // === DEPENDENCIES (from imports) ===
        result.dependencies = result.imports
            .filter(imp => !imp.startsWith('.') && !imp.startsWith('@/'))
            .map(imp => imp.split('/')[0].startsWith('@') ? imp.split('/').slice(0, 2).join('/') : imp.split('/')[0]);

        // === COMMENTS (JSDoc and important comments) ===
        const jsdocMatches = content.match(/\/\*\*[\s\S]*?\*\//g) || [];
        result.comments = jsdocMatches.slice(0, 5).map(c => c.replace(/[\s\n]+/g, ' ').substring(0, 200));

        // === TODOs ===
        const todoMatches = content.match(/(?:\/\/|\/\*)\s*(?:TODO|FIXME|HACK|XXX|NOTE|BUG):\s*([^\n*]+)/gi) || [];
        result.todos = todoMatches.map(t => t.replace(/^(?:\/\/|\/\*)\s*/, '').trim());

        return result;
    }

    /**
     * Génère une représentation textuelle détaillée d'un fichier analysé
     */
    private formatFileAnalysis(analysis: ReturnType<typeof AICompletionService.prototype.analyzeFileInDepth>): string {
        const sections: string[] = [];
        
        sections.push(`### 📄 ${analysis.path}`);
        sections.push(`**Langage:** ${analysis.language} | **Lignes:** ${analysis.lines}`);
        
        if (analysis.exports.length > 0) {
            sections.push(`**Exports:** \`${analysis.exports.join('`, `')}\``);
        }
        
        if (analysis.classes.length > 0) {
            sections.push('\n**Classes:**');
            for (const cls of analysis.classes) {
                let classLine = `- \`class ${cls.name}\``;
                if (cls.extends) classLine += ` extends \`${cls.extends}\``;
                if (cls.implements && cls.implements.length > 0) classLine += ` implements \`${cls.implements.join('`, `')}\``;
                sections.push(classLine);
                if (cls.methods.length > 0) {
                    sections.push(`  - Méthodes: \`${cls.methods.slice(0, 10).join('`, `')}\`${cls.methods.length > 10 ? '...' : ''}`);
                }
                if (cls.properties.length > 0) {
                    sections.push(`  - Propriétés: \`${cls.properties.slice(0, 10).join('`, `')}\`${cls.properties.length > 10 ? '...' : ''}`);
                }
            }
        }
        
        if (analysis.functions.length > 0) {
            sections.push('\n**Fonctions:**');
            for (const func of analysis.functions.slice(0, 15)) {
                let funcLine = `- \`${func.isAsync ? 'async ' : ''}${func.name}(${func.params})\``;
                if (func.returnType) funcLine += ` → \`${func.returnType}\``;
                if (func.isExported) funcLine += ' 📤';
                sections.push(funcLine);
            }
            if (analysis.functions.length > 15) {
                sections.push(`  ... et ${analysis.functions.length - 15} autres fonctions`);
            }
        }
        
        if (analysis.interfaces.length > 0) {
            sections.push('\n**Interfaces:**');
            for (const intf of analysis.interfaces.slice(0, 8)) {
                sections.push(`- \`interface ${intf.name}\` { ${intf.properties.slice(0, 5).join('; ')}${intf.properties.length > 5 ? '...' : ''} }`);
            }
        }
        
        if (analysis.types.length > 0) {
            sections.push('\n**Types:**');
            for (const t of analysis.types.slice(0, 8)) {
                sections.push(`- \`type ${t.name}\` = ${t.definition.substring(0, 80)}${t.definition.length > 80 ? '...' : ''}`);
            }
        }
        
        if (analysis.reactComponents.length > 0) {
            sections.push('\n**Composants React:**');
            for (const comp of analysis.reactComponents) {
                sections.push(`- \`<${comp.name} />\` - Hooks: ${comp.hooks.length > 0 ? comp.hooks.join(', ') : 'aucun'}`);
            }
        }
        
        if (analysis.apiRoutes.length > 0) {
            sections.push('\n**Routes API:**');
            for (const route of analysis.apiRoutes) {
                sections.push(`- \`${route.method} ${route.path}\``);
            }
        }
        
        if (analysis.constants.length > 0) {
            const importantConsts = analysis.constants.filter(c => 
                c.name.toUpperCase() === c.name || // ALL_CAPS
                c.name.includes('CONFIG') ||
                c.name.includes('DEFAULT') ||
                c.name.includes('OPTIONS')
            );
            if (importantConsts.length > 0) {
                sections.push('\n**Constantes importantes:**');
                for (const c of importantConsts.slice(0, 5)) {
                    sections.push(`- \`${c.name}\`${c.type ? `: ${c.type}` : ''} = ${c.value?.substring(0, 50) || '...'}`);
                }
            }
        }
        
        if (analysis.todos.length > 0) {
            sections.push('\n**TODOs/FIXMEs:**');
            for (const todo of analysis.todos.slice(0, 5)) {
                sections.push(`- ⚠️ ${todo}`);
            }
        }
        
        if (analysis.dependencies.length > 0) {
            const externalDeps = [...new Set(analysis.dependencies)];
            if (externalDeps.length > 0) {
                sections.push(`\n**Dépendances externes:** ${externalDeps.slice(0, 10).join(', ')}`);
            }
        }
        
        return sections.join('\n');
    }

    /**
     * Collecte tous les fichiers de code du projet pour analyse approfondie
     * Priorise les fichiers importants et collecte le maximum possible
     */
    private async collectProjectFiles(maxFiles: number = 50): Promise<Array<{ path: string; content: string; language: string }>> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return [];

        // Extensions de code à analyser (ordre de priorité)
        const codeExtensions = [
            // Priorité haute - fichiers principaux
            '.ts', '.tsx', '.js', '.jsx',
            // Frameworks frontend
            '.vue', '.svelte', '.astro',
            // Backend et autres langages
            '.py', '.java', '.go', '.rs', '.rb', '.php',
            '.cs', '.cpp', '.c', '.h', '.hpp',
            // Configs importants
            '.mjs', '.cjs'
        ];

        const excludePatterns = [
            '**/node_modules/**', '**/dist/**', '**/build/**', '**/out/**',
            '**/.git/**', '**/coverage/**', '**/__pycache__/**',
            '**/vendor/**', '**/*.min.js', '**/*.bundle.js',
            '**/package-lock.json', '**/yarn.lock', '**/pnpm-lock.yaml',
            '**/.next/**', '**/.nuxt/**', '**/.svelte-kit/**',
            '**/webview-dist/**', '**/*.d.ts' // Skip declaration files
        ];

        const allFiles: Array<{ path: string; content: string; language: string; priority: number }> = [];
        
        // Collecter TOUS les fichiers d'abord
        for (const ext of codeExtensions) {
            const pattern = `**/*${ext}`;
            const foundFiles = await vscode.workspace.findFiles(pattern, `{${excludePatterns.join(',')}}`, 200);
            
            for (const file of foundFiles) {
                try {
                    const content = await vscode.workspace.fs.readFile(file);
                    const text = Buffer.from(content).toString('utf8');
                    const relativePath = vscode.workspace.asRelativePath(file);
                    
                    // Skip files that are too large (> 80KB) or too small (< 50 bytes)
                    if (text.length > 80000 || text.length < 50) continue;
                    
                    // Skip generated files
                    if (text.includes('// AUTO-GENERATED') || 
                        text.includes('/* AUTO-GENERATED') ||
                        text.includes('// This file is auto-generated')) continue;
                    
                    // Skip mock files (sauf pour les tests)
                    if (relativePath.includes('__mocks__') && !relativePath.includes('.test.')) continue;
                    
                    const language = this.getLanguageFromExtension(ext);
                    
                    // Calculer la priorité du fichier
                    const priority = this.calculateFilePriority(relativePath, text);
                    
                    allFiles.push({
                        path: relativePath,
                        content: text,
                        language,
                        priority
                    });
                } catch {
                    // Skip files that can't be read
                }
            }
        }

        // Trier par priorité (haute priorité d'abord) puis par chemin
        allFiles.sort((a, b) => {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return a.path.localeCompare(b.path);
        });
        
        // Retourner les fichiers les plus importants
        return allFiles.slice(0, maxFiles).map(({ path, content, language }) => ({ path, content, language }));
    }
    
    /**
     * Calcule la priorité d'un fichier pour l'analyse
     */
    private calculateFilePriority(filePath: string, content: string): number {
        let priority = 0;
        const pathLower = filePath.toLowerCase();
        const fileName = filePath.split('/').pop()?.toLowerCase() || '';
        
        // === FICHIERS TRÈS IMPORTANTS (priorité max) ===
        if (fileName === 'extension.ts' || fileName === 'extension.js') priority += 200;
        if (fileName === 'index.ts' || fileName === 'index.tsx' || fileName === 'index.js') priority += 150;
        if (fileName === 'main.ts' || fileName === 'main.tsx' || fileName === 'main.js') priority += 150;
        if (fileName === 'app.ts' || fileName === 'app.tsx' || fileName === 'app.js') priority += 140;
        if (fileName === 'server.ts' || fileName === 'server.js') priority += 140;
        
        // === DOSSIERS IMPORTANTS ===
        if (pathLower.includes('/src/')) priority += 50;
        if (pathLower.includes('/lib/')) priority += 40;
        if (pathLower.includes('/services/')) priority += 80;
        if (pathLower.includes('/api/')) priority += 90;
        if (pathLower.includes('/routes/')) priority += 85;
        if (pathLower.includes('/controllers/')) priority += 80;
        if (pathLower.includes('/models/')) priority += 75;
        if (pathLower.includes('/components/')) priority += 60;
        if (pathLower.includes('/hooks/')) priority += 55;
        if (pathLower.includes('/utils/')) priority += 40;
        if (pathLower.includes('/helpers/')) priority += 40;
        if (pathLower.includes('/store/') || pathLower.includes('/stores/')) priority += 70;
        if (pathLower.includes('/state/')) priority += 65;
        if (pathLower.includes('/providers/')) priority += 60;
        if (pathLower.includes('/context/')) priority += 55;
        if (pathLower.includes('/panels/')) priority += 70;
        
        // === FICHIERS DE TEST (priorité basse mais pas nulle) ===
        if (pathLower.includes('.test.') || pathLower.includes('.spec.') || pathLower.includes('__tests__')) {
            priority = Math.max(priority - 100, 10); // Garder une priorité minimale
        }
        
        // === TYPES ET INTERFACES ===
        if (pathLower.includes('/types/') || pathLower.includes('/interfaces/')) priority += 45;
        if (fileName.includes('types') || fileName.includes('interfaces')) priority += 35;
        
        // === TAILLE DU FICHIER (préférer fichiers moyens) ===
        const lines = content.split('\n').length;
        if (lines >= 100 && lines <= 800) priority += 30; // Fichiers de taille moyenne
        else if (lines >= 50 && lines <= 1500) priority += 15;
        else if (lines > 1500) priority += 5; // Gros fichiers moins prioritaires
        
        // === CONTENU IMPORTANT ===
        // Exports - indique un module important
        const exportCount = (content.match(/^export /gm) || []).length;
        priority += Math.min(exportCount * 3, 30);
        
        // Classes - indique une structure importante
        if (content.includes('export class') || content.includes('export default class')) priority += 25;
        
        // API routes
        if (/\.(get|post|put|delete|patch)\s*\(/i.test(content)) priority += 40;
        
        // React components
        if (/React\.(FC|Component)|useState|useEffect|return\s*\(?\s*</i.test(content)) priority += 20;
        
        // Service patterns
        if (content.includes('Service') || content.includes('@Injectable')) priority += 30;
        
        return priority;
    }

    /**
     * Détermine le langage à partir de l'extension de fichier
     */
    private getLanguageFromExtension(ext: string): string {
        const langMap: Record<string, string> = {
            '.ts': 'typescript', '.tsx': 'typescript',
            '.js': 'javascript', '.jsx': 'javascript',
            '.vue': 'vue', '.svelte': 'svelte',
            '.py': 'python', '.java': 'java',
            '.go': 'go', '.rs': 'rust',
            '.rb': 'ruby', '.php': 'php',
            '.cs': 'csharp', '.cpp': 'cpp', '.c': 'c',
            '.h': 'c', '.hpp': 'cpp'
        };
        return langMap[ext] || 'text';
    }

    /**
     * Génère un résumé du code pour le contexte LLM
     */
    private generateCodeSummary(files: Array<{ path: string; content: string; language: string }>): string {
        const summaryParts: string[] = [];
        
        // Group files by directory
        const filesByDir: Record<string, typeof files> = {};
        for (const file of files) {
            const dir = path.dirname(file.path);
            if (!filesByDir[dir]) filesByDir[dir] = [];
            filesByDir[dir].push(file);
        }
        
        for (const [dir, dirFiles] of Object.entries(filesByDir)) {
            summaryParts.push(`\n### 📁 ${dir}/`);
            for (const file of dirFiles) {
                // Extract key elements from the file
                const fileName = path.basename(file.path);
                const lineCount = file.content.split('\n').length;
                
                // Extract imports, exports, classes, functions
                const imports = (file.content.match(/^import .+$/gm) || []).slice(0, 5);
                const exports = (file.content.match(/^export (default |)(class|function|const|interface|type) \w+/gm) || []);
                const classes = (file.content.match(/^(export )?(abstract )?class \w+/gm) || []);
                const functions = (file.content.match(/^(export )?(async )?(function \w+|const \w+ = (\(|async \())/gm) || []).slice(0, 10);
                
                summaryParts.push(`\n#### ${fileName} (${lineCount} lignes, ${file.language})`);
                
                if (exports.length > 0) {
                    summaryParts.push(`**Exports:** ${exports.join(', ')}`);
                }
                if (classes.length > 0) {
                    summaryParts.push(`**Classes:** ${classes.join(', ')}`);
                }
                if (functions.length > 0) {
                    summaryParts.push(`**Fonctions:** ${functions.slice(0, 5).join(', ')}${functions.length > 5 ? '...' : ''}`);
                }
                if (imports.length > 0) {
                    summaryParts.push(`**Imports clés:** ${imports.slice(0, 3).map(i => i.replace(/^import .+ from ['"](.+)['"].*$/, '$1')).join(', ')}`);
                }
            }
        }
        
        return summaryParts.join('\n');
    }

    /**
     * Effectue une revue de code sur l'ensemble du projet
     */
    public async reviewProject(): Promise<{
        summary: string;
        overallScore: number;
        fileReviews: Array<{
            file: string;
            score: number;
            issues: Array<{ severity: string; message: string; suggestion?: string }>;
        }>;
        recommendations: string[];
        architectureIssues: string[];
        securityConcerns: string[];
    }> {
        const ollamaAvailable = await this.isOllamaAvailable();
        if (!ollamaAvailable) {
            throw new Error('Ollama non disponible pour la revue de projet');
        }

        const model = await this.selectLongContextModel() || await this.selectBestModel();
        if (!model) {
            throw new Error('Aucun modèle disponible');
        }

        // Collect project files
        const files = await this.collectProjectFiles(25);
        if (files.length === 0) {
            throw new Error('Aucun fichier de code trouvé dans le projet');
        }

        // Get workspace analysis for context
        const workspaceAnalysis = await this.workspaceAnalyzer.analyzeWorkspace();
        
        // Build context
        const projectContext = workspaceAnalysis ? `
## Contexte du Projet
- **Nom:** ${workspaceAnalysis.name}
- **Type:** ${workspaceAnalysis.type === 'GAME_2D' ? 'Jeu 2D' : 'Application Web/Mobile'}
- **Stack:** ${workspaceAnalysis.specs.frontendFramework || 'N/A'} / ${workspaceAnalysis.specs.backendFramework || 'N/A'}
- **Fichiers de code:** ${workspaceAnalysis.fileStats.codeFiles}
- **Tests:** ${workspaceAnalysis.fileStats.testFiles} fichiers
` : '';

        // Generate code summary
        const codeSummary = this.generateCodeSummary(files);
        
        // Select key files for detailed review
        const keyFiles = files.slice(0, 10).map(f => `
--- ${f.path} ---
\`\`\`${f.language}
${f.content.slice(0, 3000)}${f.content.length > 3000 ? '\n// ... (tronqué)' : ''}
\`\`\`
`).join('\n');

        const prompt = `Tu es un Lead Developer Senior effectuant une revue de code complète d'un projet.

${projectContext}

## Structure du Projet (${files.length} fichiers analysés)
${codeSummary}

## Code Source Clé
${keyFiles}

---

Effectue une revue de code exhaustive et réponds avec un JSON valide:

\`\`\`json
{
  "summary": "Résumé exécutif de la qualité du code en 3-4 phrases",
  "overallScore": 75,
  "fileReviews": [
    {
      "file": "src/example.ts",
      "score": 80,
      "issues": [
        {"severity": "warning", "message": "Description du problème", "suggestion": "Comment corriger"}
      ]
    }
  ],
  "recommendations": [
    "Amélioration globale 1",
    "Amélioration globale 2"
  ],
  "architectureIssues": [
    "Problème d'architecture détecté"
  ],
  "securityConcerns": [
    "Point de sécurité à vérifier"
  ]
}
\`\`\`

**Critères d'évaluation:**
- Structure et organisation du code
- Patterns et bonnes pratiques
- Gestion des erreurs
- Séparation des responsabilités
- Duplication de code
- Complexité cyclomatique
- Sécurité (injections, XSS, etc.)
- Performance potentielle
- Testabilité

Score: 0-40 = Critique, 41-60 = Amélioration nécessaire, 61-80 = Bon, 81-100 = Excellent`;

        try {
            const response = await this.generateWithOllama(prompt, model, { temperature: 0.3, num_predict: 5000 });
            
            let cleanResponse = response.trim();
            if (cleanResponse.startsWith('```json')) cleanResponse = cleanResponse.slice(7);
            else if (cleanResponse.startsWith('```')) cleanResponse = cleanResponse.slice(3);
            if (cleanResponse.endsWith('```')) cleanResponse = cleanResponse.slice(0, -3);
            
            return JSON.parse(cleanResponse.trim());
        } catch (error) {
            console.error('[AICompletionService] Project review failed:', error);
            return {
                summary: 'Erreur lors de l\'analyse du projet',
                overallScore: 0,
                fileReviews: [],
                recommendations: [],
                architectureIssues: [],
                securityConcerns: []
            };
        }
    }

    /**
     * Génère une explication de l'architecture et de la structure du projet
     */
    public async explainProject(): Promise<{
        overview: string;
        architecture: string;
        components: Array<{ name: string; purpose: string; dependencies: string[] }>;
        dataFlow: string;
        entryPoints: string[];
        keyPatterns: string[];
        suggestions: string[];
    }> {
        const ollamaAvailable = await this.isOllamaAvailable();
        if (!ollamaAvailable) {
            throw new Error('Ollama non disponible');
        }

        const model = await this.selectLongContextModel() || await this.selectBestModel();
        if (!model) {
            throw new Error('Aucun modèle disponible');
        }

        const files = await this.collectProjectFiles(30);
        if (files.length === 0) {
            throw new Error('Aucun fichier de code trouvé');
        }

        const workspaceAnalysis = await this.workspaceAnalyzer.analyzeWorkspace();
        const codeSummary = this.generateCodeSummary(files);
        
        // Include more detailed code for architecture understanding
        const keyFiles = files.slice(0, 8).map(f => `
--- ${f.path} ---
\`\`\`${f.language}
${f.content.slice(0, 4000)}${f.content.length > 4000 ? '\n// ... (tronqué)' : ''}
\`\`\`
`).join('\n');

        const projectInfo = workspaceAnalysis ? `
## Informations Projet
- **Nom:** ${workspaceAnalysis.name}
- **Type:** ${workspaceAnalysis.type}
- **Frontend:** ${workspaceAnalysis.specs.frontendFramework || 'Non détecté'}
- **Backend:** ${workspaceAnalysis.specs.backendFramework || 'Non détecté'}
- **Dépendances:** ${workspaceAnalysis.dependencies.slice(0, 15).join(', ')}
` : '';

        const prompt = `Tu es un Architecte Logiciel Senior. Analyse ce projet et explique son architecture de manière claire et pédagogique.

${projectInfo}

## Structure du Projet
${codeSummary}

## Code Source
${keyFiles}

---

Génère une explication détaillée au format JSON:

\`\`\`json
{
  "overview": "Description générale du projet en 2-3 phrases: objectif, technologies utilisées, complexité",
  "architecture": "Explication détaillée de l'architecture: patterns utilisés, couches, organisation. Minimum 4-5 phrases.",
  "components": [
    {
      "name": "Nom du composant/module",
      "purpose": "Rôle et responsabilité de ce composant",
      "dependencies": ["composant1", "composant2"]
    }
  ],
  "dataFlow": "Explication du flux de données: comment les données circulent dans l'application, de l'entrée à la sortie",
  "entryPoints": ["Point d'entrée principal", "Autre point d'entrée"],
  "keyPatterns": ["Pattern utilisé 1", "Pattern utilisé 2"],
  "suggestions": ["Suggestion d'amélioration architecturale 1", "Suggestion 2"]
}
\`\`\`

Sois précis, pédagogique et actionnable. Identifie les patterns de conception utilisés.`;

        try {
            const response = await this.generateWithOllama(prompt, model, { temperature: 0.4, num_predict: 5000 });
            
            let cleanResponse = response.trim();
            if (cleanResponse.startsWith('```json')) cleanResponse = cleanResponse.slice(7);
            else if (cleanResponse.startsWith('```')) cleanResponse = cleanResponse.slice(3);
            if (cleanResponse.endsWith('```')) cleanResponse = cleanResponse.slice(0, -3);
            
            return JSON.parse(cleanResponse.trim());
        } catch (error) {
            console.error('[AICompletionService] Project explanation failed:', error);
            return {
                overview: 'Erreur lors de l\'analyse',
                architecture: '',
                components: [],
                dataFlow: '',
                entryPoints: [],
                keyPatterns: [],
                suggestions: []
            };
        }
    }

    /**
     * Effectue un audit de sécurité complet du projet
     */
    public async securityAuditProject(): Promise<{
        summary: string;
        riskLevel: 'critical' | 'high' | 'medium' | 'low';
        score: number;
        vulnerabilities: Array<{
            severity: 'critical' | 'high' | 'medium' | 'low';
            type: string;
            file: string;
            description: string;
            recommendation: string;
        }>;
        bestPractices: Array<{ practice: string; status: 'implemented' | 'missing' | 'partial' }>;
        recommendations: string[];
    }> {
        const ollamaAvailable = await this.isOllamaAvailable();
        if (!ollamaAvailable) {
            throw new Error('Ollama non disponible');
        }

        const model = await this.selectLongContextModel() || await this.selectBestModel();
        if (!model) {
            throw new Error('Aucun modèle disponible');
        }

        const files = await this.collectProjectFiles(25);
        if (files.length === 0) {
            throw new Error('Aucun fichier de code trouvé');
        }

        const workspaceAnalysis = await this.workspaceAnalyzer.analyzeWorkspace();
        
        // Focus on security-relevant files
        const securityRelevantFiles = files.filter(f => 
            f.path.includes('auth') || f.path.includes('login') || f.path.includes('api') ||
            f.path.includes('middleware') || f.path.includes('security') ||
            f.path.includes('config') || f.path.includes('env') ||
            f.content.includes('password') || f.content.includes('token') ||
            f.content.includes('secret') || f.content.includes('key') ||
            f.content.includes('database') || f.content.includes('sql') ||
            f.content.includes('exec') || f.content.includes('eval')
        );
        
        const filesToAnalyze = securityRelevantFiles.length > 0 ? securityRelevantFiles : files.slice(0, 15);
        
        const codeForAnalysis = filesToAnalyze.map(f => `
--- ${f.path} ---
\`\`\`${f.language}
${f.content.slice(0, 4000)}${f.content.length > 4000 ? '\n// ... (tronqué)' : ''}
\`\`\`
`).join('\n');

        const projectContext = workspaceAnalysis ? `
## Contexte Projet
- **Type:** ${workspaceAnalysis.type}
- **Stack:** ${workspaceAnalysis.specs.frontendFramework || 'N/A'} / ${workspaceAnalysis.specs.backendFramework || 'N/A'}
- **Dépendances de sécurité:** ${workspaceAnalysis.dependencies.filter(d => 
    /auth|jwt|bcrypt|crypto|helmet|cors|sanitize|validator|passport/.test(d)
).join(', ') || 'Aucune détectée'}
` : '';

        const prompt = `Tu es un Expert en Sécurité Applicative (OWASP). Effectue un audit de sécurité complet de ce projet.

${projectContext}

## Code Source à Analyser
${codeForAnalysis}

---

Effectue un audit de sécurité exhaustif et réponds avec un JSON valide:

\`\`\`json
{
  "summary": "Résumé de l'état de sécurité du projet en 3-4 phrases",
  "riskLevel": "critical|high|medium|low",
  "score": 75,
  "vulnerabilities": [
    {
      "severity": "critical|high|medium|low",
      "type": "Type OWASP (ex: Injection, XSS, CSRF, etc.)",
      "file": "chemin/du/fichier.ts",
      "description": "Description détaillée de la vulnérabilité",
      "recommendation": "Comment corriger cette vulnérabilité"
    }
  ],
  "bestPractices": [
    {"practice": "Validation des entrées", "status": "implemented|missing|partial"},
    {"practice": "Authentification sécurisée", "status": "implemented|missing|partial"},
    {"practice": "Encryption des données sensibles", "status": "implemented|missing|partial"},
    {"practice": "Protection CSRF", "status": "implemented|missing|partial"},
    {"practice": "Headers de sécurité", "status": "implemented|missing|partial"}
  ],
  "recommendations": [
    "Recommandation prioritaire 1",
    "Recommandation prioritaire 2"
  ]
}
\`\`\`

**Vulnérabilités OWASP à rechercher:**
- A01: Broken Access Control
- A02: Cryptographic Failures  
- A03: Injection (SQL, NoSQL, Command, LDAP)
- A04: Insecure Design
- A05: Security Misconfiguration
- A06: Vulnerable Components
- A07: Authentication Failures
- A08: Data Integrity Failures
- A09: Security Logging Failures
- A10: SSRF

Score: 0-40 = Critique, 41-60 = Risqué, 61-80 = Acceptable, 81-100 = Sécurisé`;

        try {
            const response = await this.generateWithOllama(prompt, model, { temperature: 0.2, num_predict: 5000 });
            
            let cleanResponse = response.trim();
            if (cleanResponse.startsWith('```json')) cleanResponse = cleanResponse.slice(7);
            else if (cleanResponse.startsWith('```')) cleanResponse = cleanResponse.slice(3);
            if (cleanResponse.endsWith('```')) cleanResponse = cleanResponse.slice(0, -3);
            
            return JSON.parse(cleanResponse.trim());
        } catch (error) {
            console.error('[AICompletionService] Security audit failed:', error);
            return {
                summary: 'Erreur lors de l\'audit de sécurité',
                riskLevel: 'high',
                score: 0,
                vulnerabilities: [],
                bestPractices: [],
                recommendations: []
            };
        }
    }
}
