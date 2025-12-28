import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { WorkspaceAnalyzerService, WorkspaceAnalysis } from './WorkspaceAnalyzerService';

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
    
    // Cache pour les résultats d'analyse IA (évite les appels répétés)
    private static analysisCache: Map<string, { result: AICompletionResult; timestamp: number }> = new Map();
    private static readonly ANALYSIS_CACHE_TTL_MS = 300000; // 5 minutes
    
    /**
     * Modèles LLM avec leurs capacités détaillées
     * Ordre de préférence: Mistral AI (vision + code) > Qwen > DeepSeek > Meta
     */
    private modelRegistry: LLMModelInfo[] = [
        // === MISTRAL AI (Priorité maximale) ===
        { name: 'codestral:latest', provider: 'mistral', capabilities: { vision: false, codeGeneration: true, longContext: true, reasoning: true, maxTokens: 32000 } },
        { name: 'codestral:22b', provider: 'mistral', capabilities: { vision: false, codeGeneration: true, longContext: true, reasoning: true, maxTokens: 32000 } },
        { name: 'mistral-large:latest', provider: 'mistral', capabilities: { vision: false, codeGeneration: true, longContext: true, reasoning: true, maxTokens: 128000 } },
        { name: 'mistral-large:123b', provider: 'mistral', capabilities: { vision: false, codeGeneration: true, longContext: true, reasoning: true, maxTokens: 128000 } },
        { name: 'pixtral-large:latest', provider: 'mistral', capabilities: { vision: true, codeGeneration: true, longContext: true, reasoning: true, maxTokens: 128000 } },
        { name: 'pixtral:12b', provider: 'mistral', capabilities: { vision: true, codeGeneration: false, longContext: false, reasoning: false, maxTokens: 32000 } },
        { name: 'ministral:8b', provider: 'mistral', capabilities: { vision: false, codeGeneration: true, longContext: false, reasoning: false, maxTokens: 32000 } },
        { name: 'mistral:latest', provider: 'mistral', capabilities: { vision: false, codeGeneration: true, longContext: false, reasoning: false, maxTokens: 32000 } },
        { name: 'mistral:7b', provider: 'mistral', capabilities: { vision: false, codeGeneration: true, longContext: false, reasoning: false, maxTokens: 32000 } },
        { name: 'mistral-nemo:latest', provider: 'mistral', capabilities: { vision: false, codeGeneration: true, longContext: true, reasoning: true, maxTokens: 128000 } },
        
        // === QWEN (Fallback haute qualité) ===
        { name: 'qwen2.5-coder:32b-instruct-q4_K_M', provider: 'qwen', capabilities: { vision: false, codeGeneration: true, longContext: true, reasoning: true, maxTokens: 32000 } },
        { name: 'qwen2.5-coder:32b', provider: 'qwen', capabilities: { vision: false, codeGeneration: true, longContext: true, reasoning: true, maxTokens: 32000 } },
        { name: 'qwen2.5-coder:14b', provider: 'qwen', capabilities: { vision: false, codeGeneration: true, longContext: false, reasoning: true, maxTokens: 32000 } },
        { name: 'qwen2.5-coder:14b-instruct', provider: 'qwen', capabilities: { vision: false, codeGeneration: true, longContext: false, reasoning: true, maxTokens: 32000 } },
        { name: 'qwen2.5-coder:7b', provider: 'qwen', capabilities: { vision: false, codeGeneration: true, longContext: false, reasoning: false, maxTokens: 32000 } },
        { name: 'qwen2.5-coder', provider: 'qwen', capabilities: { vision: false, codeGeneration: true, longContext: false, reasoning: false, maxTokens: 32000 } },
        { name: 'qwen2.5:72b', provider: 'qwen', capabilities: { vision: false, codeGeneration: true, longContext: true, reasoning: true, maxTokens: 32000 } },
        { name: 'qwen2-vl:7b', provider: 'qwen', capabilities: { vision: true, codeGeneration: false, longContext: false, reasoning: false, maxTokens: 32000 } },
        
        // === DEEPSEEK ===
        { name: 'deepseek-coder-v2:16b', provider: 'deepseek', capabilities: { vision: false, codeGeneration: true, longContext: true, reasoning: true, maxTokens: 128000 } },
        { name: 'deepseek-coder-v2', provider: 'deepseek', capabilities: { vision: false, codeGeneration: true, longContext: false, reasoning: true, maxTokens: 32000 } },
        
        // === META (Fallback) ===
        { name: 'llama3.2:latest', provider: 'meta', capabilities: { vision: false, codeGeneration: false, longContext: false, reasoning: true, maxTokens: 32000 } },
        { name: 'llama3.2-vision:11b', provider: 'meta', capabilities: { vision: true, codeGeneration: false, longContext: false, reasoning: true, maxTokens: 32000 } },
        { name: 'llama3.2-vision:latest', provider: 'meta', capabilities: { vision: true, codeGeneration: false, longContext: false, reasoning: true, maxTokens: 32000 } },
        { name: 'codellama:latest', provider: 'meta', capabilities: { vision: false, codeGeneration: true, longContext: false, reasoning: false, maxTokens: 16000 } },
        
        // === OTHER (Vision models) ===
        { name: 'minicpm-v:latest', provider: 'other', capabilities: { vision: true, codeGeneration: false, longContext: false, reasoning: false, maxTokens: 8000 } },
        { name: 'minicpm-v', provider: 'other', capabilities: { vision: true, codeGeneration: false, longContext: false, reasoning: false, maxTokens: 8000 } },
    ];
    
    // Liste simplifiée pour compatibilité (ordre de préférence)
    private fallbackModels = [
        // Mistral AI - Priorité maximale (code + vision + long context)
        'codestral:latest',
        'codestral:22b',
        'mistral-large:latest',
        'mistral-large:123b',
        'pixtral-large:latest',
        'pixtral:12b',
        'ministral:8b',
        'mistral-nemo:latest',
        'mistral:latest',
        'mistral:7b',
        // Qwen - Excellent pour le code
        'qwen2.5-coder:32b-instruct-q4_K_M',
        'qwen2.5-coder:32b',
        'qwen2.5-coder:14b',
        'qwen2.5-coder:14b-instruct',
        'qwen2.5-coder:7b',
        'qwen2.5-coder',
        'qwen2.5:72b',
        // DeepSeek
        'deepseek-coder-v2:16b',
        'deepseek-coder-v2',
        // Meta Llama
        'llama3.2:latest',
        'codellama:latest'
    ];

    constructor() {
        this.workspaceAnalyzer = new WorkspaceAnalyzerService();
    }

    /**
     * Récupère la configuration Ollama depuis les settings VS Code
     * Modèle par défaut: mistral-nemo:12b - optimisé pour RTX 5070 Ti (16 GB VRAM, ~8 GB utilisé)
     */
    private getOllamaConfig(): OllamaConfig {
        const config = vscode.workspace.getConfiguration('devarchitect.ollama');
        return {
            baseUrl: config.get<string>('baseUrl', 'http://127.0.0.1:11434'),
            preferredModel: config.get<string>('preferredModel', 'mistral-nemo:12b'),
            timeout: config.get<number>('timeout', 120000),
            enabled: config.get<boolean>('enabled', true)
        };
    }

    /**
     * Vérifie si Ollama est disponible
     */
    public async isOllamaAvailable(): Promise<boolean> {
        const config = this.getOllamaConfig();
        
        // Si désactivé par l'utilisateur, retourner false
        if (!config.enabled) {
            return false;
        }
        
        return new Promise((resolve) => {
            const req = http.request(`${config.baseUrl}/api/tags`, { method: 'GET', timeout: 2000 }, (res) => {
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.end();
        });
    }

    /**
     * Liste les modèles disponibles dans Ollama
     */
    public async listModels(): Promise<string[]> {
        const config = this.getOllamaConfig();
        
        return new Promise((resolve) => {
            const req = http.request(`${config.baseUrl}/api/tags`, { method: 'GET' }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        const models = json.models?.map((m: any) => m.name) || [];
                        resolve(models);
                    } catch {
                        resolve([]);
                    }
                });
            });
            req.on('error', () => resolve([]));
            req.end();
        });
    }
    
    /**
     * Décharge un modèle de la VRAM pour libérer la mémoire
     * Utilise l'API Ollama avec keep_alive: 0 pour forcer le déchargement immédiat
     * @param modelName - Nom du modèle à décharger (optionnel, utilise le modèle actuel si non spécifié)
     */
    public async unloadModel(modelName?: string): Promise<{ success: boolean; message: string; freedModel?: string }> {
        const config = this.getOllamaConfig();
        const model = modelName || config.preferredModel;
        
        return new Promise((resolve) => {
            // Envoyer un prompt vide avec keep_alive: 0 pour décharger le modèle
            const postData = JSON.stringify({
                model,
                prompt: '',
                keep_alive: 0  // Force le déchargement immédiat
            });

            const req = http.request(`${config.baseUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: 5000
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        console.log(`[AICompletionService] Model ${model} unloaded from VRAM`);
                        resolve({
                            success: true,
                            message: `Modèle ${model} déchargé de la VRAM`,
                            freedModel: model
                        });
                    } else {
                        resolve({
                            success: false,
                            message: `Impossible de décharger ${model}: ${res.statusCode}`
                        });
                    }
                });
            });

            req.on('error', (e) => {
                resolve({
                    success: false,
                    message: `Erreur lors du déchargement: ${e.message}`
                });
            });
            
            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    message: 'Timeout lors du déchargement'
                });
            });
            
            req.write(postData);
            req.end();
        });
    }
    
    /**
     * Décharge tous les modèles actuellement chargés en VRAM
     */
    public async unloadAllModels(): Promise<{ success: boolean; message: string; unloadedCount: number }> {
        const config = this.getOllamaConfig();
        
        // Récupérer les modèles en cours d'exécution via l'API ps
        return new Promise((resolve) => {
            const req = http.request(`${config.baseUrl}/api/ps`, { method: 'GET', timeout: 5000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', async () => {
                    try {
                        const json = JSON.parse(data);
                        const runningModels: string[] = json.models?.map((m: any) => m.name) || [];
                        
                        if (runningModels.length === 0) {
                            resolve({
                                success: true,
                                message: 'Aucun modèle chargé en VRAM',
                                unloadedCount: 0
                            });
                            return;
                        }
                        
                        // Décharger chaque modèle
                        let unloadedCount = 0;
                        for (const model of runningModels) {
                            const result = await this.unloadModel(model);
                            if (result.success) unloadedCount++;
                        }
                        
                        resolve({
                            success: true,
                            message: `${unloadedCount}/${runningModels.length} modèles déchargés`,
                            unloadedCount
                        });
                    } catch {
                        resolve({
                            success: false,
                            message: 'Impossible de lister les modèles chargés',
                            unloadedCount: 0
                        });
                    }
                });
            });
            req.on('error', () => resolve({ success: false, message: 'Ollama non accessible', unloadedCount: 0 }));
            req.on('timeout', () => { req.destroy(); resolve({ success: false, message: 'Timeout', unloadedCount: 0 }); });
            req.end();
        });
    }
    
    /**
     * Obtient les modèles actuellement chargés en VRAM avec leur utilisation mémoire
     */
    public async getLoadedModels(): Promise<{ models: Array<{ name: string; size: number; sizeVram: number }>; totalVram: number }> {
        const config = this.getOllamaConfig();
        
        return new Promise((resolve) => {
            const req = http.request(`${config.baseUrl}/api/ps`, { method: 'GET', timeout: 5000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        const models = (json.models || []).map((m: any) => ({
                            name: m.name || 'unknown',
                            size: m.size || 0,
                            sizeVram: m.size_vram || 0
                        }));
                        
                        const totalVram = models.reduce((sum: number, m: any) => sum + (m.sizeVram || 0), 0);
                        
                        resolve({ models, totalVram });
                    } catch {
                        resolve({ models: [], totalVram: 0 });
                    }
                });
            });
            req.on('error', () => resolve({ models: [], totalVram: 0 }));
            req.on('timeout', () => { req.destroy(); resolve({ models: [], totalVram: 0 }); });
            req.end();
        });
    }

    /**
     * Sélectionne le meilleur modèle disponible
     */
    public async selectBestModel(): Promise<string | null> {
        const config = this.getOllamaConfig();
        const available = await this.listModels();
        
        if (available.length === 0) return null;

        // D'abord vérifier si le modèle préféré de l'utilisateur est disponible
        const preferredFound = available.find(m => m.startsWith(config.preferredModel));
        if (preferredFound) return preferredFound;

        // Sinon chercher dans l'ordre de préférence des fallbacks
        for (const preferred of this.fallbackModels) {
            const found = available.find(m => m.startsWith(preferred) || m === preferred.split(':')[0]);
            if (found) return found;
        }

        // Sinon prendre le premier disponible
        return available[0];
    }
    
    /**
     * Sélectionne le meilleur modèle avec capacité vision (pour analyse d'images)
     * Priorité: pixtral-large > pixtral > qwen2-vl > llama3.2-vision
     */
    public async selectVisionModel(): Promise<string | null> {
        const available = await this.listModels();
        if (available.length === 0) return null;
        
        const visionModels = this.modelRegistry.filter(m => m.capabilities.vision);
        
        for (const model of visionModels) {
            const found = available.find(m => m.startsWith(model.name.split(':')[0]));
            if (found) return found;
        }
        
        return null;
    }
    
    /**
     * Sélectionne le meilleur modèle avec support long contexte (> 32k tokens)
     * Priorité: mistral-large > mistral-nemo > deepseek-coder-v2 > qwen2.5:72b
     */
    public async selectLongContextModel(): Promise<string | null> {
        const available = await this.listModels();
        if (available.length === 0) return null;
        
        const longCtxModels = this.modelRegistry.filter(m => m.capabilities.longContext);
        
        for (const model of longCtxModels) {
            const found = available.find(m => m.startsWith(model.name.split(':')[0]));
            if (found) return found;
        }
        
        return null;
    }
    
    /**
     * Obtient les informations sur un modèle
     */
    public getModelInfo(modelName: string): LLMModelInfo | undefined {
        return this.modelRegistry.find(m => 
            modelName.startsWith(m.name.split(':')[0]) || m.name === modelName
        );
    }
    
    /**
     * Vérifie si un modèle a une capacité spécifique
     */
    public modelHasCapability(modelName: string, capability: keyof ModelCapabilities): boolean {
        const info = this.getModelInfo(modelName);
        return !!info?.capabilities[capability];
    }

    /**
     * Génère une complétion avec Ollama
     */
    public async generateWithOllama(prompt: string, model: string, options?: { temperature?: number; num_predict?: number }): Promise<string> {
        const config = this.getOllamaConfig();
        
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                model,
                prompt,
                stream: false,
                options: {
                    temperature: options?.temperature ?? 0.7,
                    num_predict: options?.num_predict ?? 4000
                }
            });

            const req = http.request(`${config.baseUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: config.timeout
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json: OllamaResponse = JSON.parse(data);
                        resolve(json.response || '');
                    } catch (_e) {
                        reject(new Error('Invalid response from Ollama'));
                    }
                });
            });

            req.on('error', (e) => reject(e));
            req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
            req.write(postData);
            req.end();
        });
    }
    
    /**
     * Génère une complétion avec une image (modèle vision requis: pixtral, qwen2-vl, llama3.2-vision)
     * Utilise l'API multimodal d'Ollama pour envoyer texte + image
     */
    public async generateWithVision(prompt: string, imagePath: string, model?: string): Promise<string> {
        const config = this.getOllamaConfig();
        
        // Sélectionner un modèle vision si non spécifié
        const visionModel = model || await this.selectVisionModel();
        if (!visionModel) {
            throw new Error('Aucun modèle vision disponible (pixtral, qwen2-vl, llama3.2-vision). Installez-en un avec: ollama pull pixtral:12b');
        }
        
        // Lire et encoder l'image en base64
        let imageBase64: string;
        try {
            const imageBuffer = fs.readFileSync(imagePath);
            imageBase64 = imageBuffer.toString('base64');
        } catch (err) {
            throw new Error(`Impossible de lire l'image: ${imagePath}`);
        }
        
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                model: visionModel,
                prompt,
                images: [imageBase64],
                stream: false,
                options: {
                    temperature: 0.5,
                    num_predict: 2000
                }
            });

            const req = http.request(`${config.baseUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: config.timeout * 2 // Double timeout pour images
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json: OllamaResponse = JSON.parse(data);
                        resolve(json.response || '');
                    } catch (_e) {
                        reject(new Error('Invalid response from Ollama Vision'));
                    }
                });
            });

            req.on('error', (e) => reject(e));
            req.on('timeout', () => { req.destroy(); reject(new Error('Timeout Vision')); });
            req.write(postData);
            req.end();
        });
    }
    
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
            sections.push(`## ANALYSE DU WORKSPACE

### Projet détecté
- **Nom**: ${analysis.name}
- **Type**: ${analysis.type === 'GAME_2D' ? 'Jeu vidéo 2D' : 'Application Web/Mobile'}
- **Description README**: ${analysis.concept || 'Non disponible'}

### Stack Technique
- Framework Frontend: ${analysis.specs.frontendFramework || 'Non détecté'}
- Framework Backend: ${analysis.specs.backendFramework || 'Non détecté'}
- Moteur de jeu: ${analysis.specs.gameEngine || 'N/A'}
- Cible de déploiement: ${analysis.specs.deploymentTarget || 'Non configurée'}
- PWA: ${analysis.specs.pwaSupport ? 'Oui' : 'Non'}

### Dépendances (${analysis.dependencies.length} prod + ${analysis.devDependencies.length} dev)
Production: ${analysis.dependencies.slice(0, 15).join(', ')}${analysis.dependencies.length > 15 ? '...' : ''}
Dev: ${analysis.devDependencies.slice(0, 10).join(', ')}${analysis.devDependencies.length > 10 ? '...' : ''}

### Statistiques du Code
- Fichiers totaux: ${analysis.fileStats.totalFiles}
- Fichiers de code: ${analysis.fileStats.codeFiles}
- Fichiers de test: ${analysis.fileStats.testFiles}
- Composants: ${analysis.fileStats.componentFiles}
- Couverture estimée: ${analysis.fileStats.testFiles > 0 ? Math.round((analysis.fileStats.testFiles / Math.max(1, analysis.fileStats.codeFiles)) * 100) : 0}%

### Fichiers de Configuration Détectés
- package.json: ${analysis.detectedFiles.hasPackageJson ? '✓' : '✗'}
- TypeScript: ${analysis.detectedFiles.hasTsConfig ? '✓' : '✗'}
- Docker: ${analysis.detectedFiles.hasDockerfile ? '✓' : '✗'}
- Prisma/ORM: ${analysis.detectedFiles.hasPrisma ? '✓' : '✗'}
- GraphQL: ${analysis.detectedFiles.hasGraphQL ? '✓' : '✗'}
- Tailwind: ${analysis.detectedFiles.hasTailwind ? '✓' : '✗'}
- Tests: ${analysis.detectedFiles.hasTests ? '✓' : '✗'}
- CI/CD: ${analysis.detectedFiles.hasCICD ? '✓' : '✗'}

### Features Principales Détectées
${analysis.coreFeatures?.length > 0 ? analysis.coreFeatures.map(f => `- ${f}`).join('\n') : '- Aucune feature spécifique détectée'}

### Assets Détectés (${analysis.assets?.length || 0} fichiers)
${analysis.assets?.slice(0, 10).map(a => `- ${a.category}: ${a.name}`).join('\n') || 'Aucun asset détecté'}

### Variables d'Environnement (${analysis.variables?.length || 0})
${analysis.variables?.slice(0, 8).map(v => `- ${v.key}: ${v.description || '(valeur masquée)'}`).join('\n') || 'Aucune variable détectée'}`);
        } else {
            sections.push(`## WORKSPACE
Aucun workspace ouvert ou analyse impossible.`);
        }
        
        // === Section 2: Données du Projet Existant ===
        if (currentProject) {
            const roadmapSummary = currentProject.roadmap?.length > 0
                ? currentProject.roadmap.map((p: any) => `- ${p.title} (${p.status}, ${p.progress}%)`).join('\n')
                : 'Aucune phase définie';
            
            sections.push(`## DONNÉES DU PROJET EXISTANT

### Informations Générales
- Nom: ${currentProject.name || 'Non défini'}
- Type: ${currentProject.type || 'Non défini'}
- Concept: ${currentProject.concept || 'Non défini'}
- Public cible: ${currentProject.targetAudience || 'Non défini'}
- Elevator Pitch: ${currentProject.elevatorPitch || 'Non défini'}

### Roadmap (${currentProject.roadmap?.length || 0} phases)
${roadmapSummary}

### Ressources
- Assets: ${currentProject.assets?.length || 0}
- Commandes: ${currentProject.commands?.length || 0}
- Variables: ${currentProject.variables?.length || 0}
- FAQs: ${currentProject.faqs?.length || 0}`);
        } else {
            sections.push(`## PROJET EXISTANT
Aucun projet actif.`);
        }
        
        return sections.join('\n\n---\n\n');
    }
    
    /**
     * Complétion avec IA (Ollama) - Contexte enrichi
     */
    private async completeWithAI(
        currentProject: any, 
        analysis: WorkspaceAnalysis | null,
        model: string
    ): Promise<AICompletionResult> {
        // Vérifier le cache
        const cacheKey = `complete_${currentProject?.id || 'new'}_${analysis?.name || 'noWorkspace'}`;
        const cached = AICompletionService.analysisCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < AICompletionService.ANALYSIS_CACHE_TTL_MS) {
            console.log('[AICompletionService] Returning cached completion result');
            return cached.result;
        }
        
        // Construire le contexte enrichi
        const enrichedContext = this.buildEnrichedContext(currentProject, analysis);
        
        // Adapter les instructions au modèle
        const modelInfo = this.getModelInfo(model);
        const isAdvancedModel = modelInfo?.capabilities.reasoning ?? false;
        
        const prompt = `Tu es un expert en gestion de projet de développement logiciel et en architecture technique.

${enrichedContext}

---

## TA MISSION

${isAdvancedModel ? `Analyse en profondeur les informations ci-dessus. Identifie:
1. Les forces et faiblesses du projet
2. Les risques techniques potentiels
3. Les opportunités d'amélioration
4. Les phases manquantes dans la roadmap

Puis génère` : 'Génère'} une fiche projet complète au format JSON avec les champs suivants.
**IMPORTANT**: Ne remplis que les champs qui sont vides ou manquants dans le projet existant.

\`\`\`json
{
  "name": "Nom du projet (si manquant)",
  "concept": "Description détaillée du concept, objectifs et valeur ajoutée (2-4 phrases)",
  "elevatorPitch": "Pitch accrocheur en une phrase maximum",
  "targetAudience": "Description précise du public cible avec segments",
  "validationCriteria": "Critères de succès mesurables (performance, qualité, UX)",
  "architecture": "Description de l'architecture technique avec patterns utilisés",
  "roadmap": [
    {
      "title": "Nom de la phase",
      "description": "Description détaillée des livrables",
      "priority": "Critique|Haute|Moyenne|Basse",
      "estimatedHours": 40
    }
  ],
  "testCases": ["Cas de test fonctionnel 1", "Cas de test technique 2"],
  "coreFeatures": ["Feature 1", "Feature 2"]
}
\`\`\`

RÈGLES:
- Réponds UNIQUEMENT avec le JSON valide, sans texte avant ou après
- Tous les textes doivent être en français
- Sois précis et actionnable dans les descriptions
- Adapte la roadmap au type de projet (${analysis?.type === 'GAME_2D' ? 'jeu vidéo' : 'application web/mobile'})
- Les estimatedHours doivent être réalistes`;

        const response = await this.generateWithOllama(prompt, model);
        
        // Log pour debug
        console.log(`[AICompletionService] Model used: ${model}, Response length: ${response.length}`);
        
        // Mettre en cache le résultat avant parsing
        
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
            
            // Fusionner avec l'analyse du workspace
            return this.mergeWithAnalysis(parsed, analysis, currentProject);
        } catch (parseError) {
            console.error('Failed to parse AI response:', parseError);
            // Fallback to workspace analysis
            return this.completeFromAnalysis(currentProject, analysis);
        }
    }

    /**
     * Fusionne le résultat IA avec l'analyse du workspace
     */
    private mergeWithAnalysis(
        aiResult: any, 
        analysis: WorkspaceAnalysis | null,
        currentProject: any
    ): AICompletionResult {
        const result: AICompletionResult = {};

        // Priorité: données existantes > IA > analyse workspace

        // Nom
        if (!currentProject?.name?.trim()) {
            result.name = aiResult.name || analysis?.name || 'Nouveau Projet';
        }

        // Concept
        if (!currentProject?.concept?.trim()) {
            result.concept = aiResult.concept || analysis?.concept || '';
        }

        // Elevator Pitch
        if (!currentProject?.elevatorPitch?.trim()) {
            result.elevatorPitch = aiResult.elevatorPitch || '';
        }

        // Target Audience
        if (!currentProject?.targetAudience?.trim()) {
            result.targetAudience = aiResult.targetAudience || '';
        }

        // Type
        result.type = analysis?.type || currentProject?.type || 'WEB_MOBILE';

        // Specs
        result.specs = {
            ...(currentProject?.specs || {}),
            ...(analysis?.specs || {}),
            ...(aiResult.specs || {})
        };

        // Validation Criteria
        if (!currentProject?.validationCriteria?.trim()) {
            result.validationCriteria = aiResult.validationCriteria || '';
        }

        // Architecture
        if (!currentProject?.architecture?.trim()) {
            result.architecture = aiResult.architecture || '';
        }

        // Roadmap (seulement si vide)
        if (!currentProject?.roadmap?.length) {
            const aiRoadmap = aiResult.roadmap || [];
            const analysisRoadmap = analysis?.suggestedPhases || [];
            
            result.roadmap = (aiRoadmap.length > 0 ? aiRoadmap : analysisRoadmap).map((phase: any, i: number) => ({
                id: `gen-${Date.now()}-${i}`,
                title: phase.title,
                description: phase.description || '',
                status: 'todo',
                priority: phase.priority || 'Moyenne',
                progress: 0,
                linkedAssets: [],
                dependencies: []
            }));
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

        // Test Cases
        if (!currentProject?.testCases?.length) {
            result.testCases = aiResult.testCases || [];
        }

        return result;
    }

    /**
     * Complétion depuis l'analyse du workspace uniquement (fallback)
     */
    private completeFromAnalysis(currentProject: any, analysis: WorkspaceAnalysis | null): AICompletionResult {
        if (!analysis) {
            return this.generateDefaultCompletion(currentProject);
        }

        const result: AICompletionResult = {};

        // Utiliser les données de l'analyse
        if (!currentProject?.name?.trim()) {
            result.name = analysis.name;
        }

        if (!currentProject?.concept?.trim()) {
            result.concept = analysis.concept;
        }

        result.type = analysis.type;
        result.specs = { ...(currentProject?.specs || {}), ...analysis.specs };

        if (!currentProject?.roadmap?.length) {
            result.roadmap = analysis.suggestedPhases.map((phase, i) => ({
                id: `gen-${Date.now()}-${i}`,
                title: phase.title,
                description: phase.description,
                status: phase.status,
                priority: phase.priority,
                progress: 0,
                linkedAssets: [],
                dependencies: []
            }));
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

        // Générer le reste
        const isGame = analysis.type === 'GAME_2D';
        
        if (!currentProject?.elevatorPitch?.trim()) {
            result.elevatorPitch = isGame
                ? `${analysis.name} - Un jeu captivant qui combine gameplay addictif et style visuel unique.`
                : `${analysis.name} - Une application moderne offrant une expérience utilisateur fluide.`;
        }

        if (!currentProject?.validationCriteria?.trim()) {
            result.validationCriteria = isGame
                ? 'Performance stable 60 FPS, contrôles réactifs, 0 bug bloquant'
                : 'Temps de chargement < 3s, score accessibilité AA, tests > 80%';
        }

        if (!currentProject?.testCases?.length) {
            result.testCases = isGame
                ? ['Gameplay principal fonctionne', 'Collisions correctes', 'Audio fonctionne', 'Pas de crash']
                : ['Authentification fonctionne', 'Données sauvegardées', 'Interface responsive', 'Erreurs affichées'];
        }

        return result;
    }

    /**
     * Génère une complétion par défaut sans workspace
     */
    private generateDefaultCompletion(currentProject: any): AICompletionResult {
        const isGame = currentProject?.type === 'GAME_2D';
        
        return {
            concept: isGame
                ? 'Un jeu 2D innovant combinant mécaniques addictives et style visuel unique.'
                : 'Une application moderne offrant une expérience utilisateur fluide et intuitive.',
            elevatorPitch: isGame
                ? 'Le jeu qui réinvente le genre avec une approche fraîche.'
                : 'L\'application qui simplifie votre quotidien.',
            targetAudience: isGame
                ? 'Joueurs casual et mid-core, 18-35 ans'
                : 'Professionnels et particuliers',
            validationCriteria: isGame
                ? 'Performance 60 FPS, contrôles réactifs, 0 bug bloquant'
                : 'Chargement < 3s, accessibilité AA, tests > 80%',
            roadmap: isGame ? [
                { id: `gen-${Date.now()}-1`, title: 'Game Design Document', description: 'Définition des mécaniques', status: 'todo', priority: 'Critique', progress: 0 },
                { id: `gen-${Date.now()}-2`, title: 'Prototype', description: 'Core gameplay', status: 'todo', priority: 'Haute', progress: 0 },
                { id: `gen-${Date.now()}-3`, title: 'Art & Assets', description: 'Visuels et sons', status: 'todo', priority: 'Haute', progress: 0 },
                { id: `gen-${Date.now()}-4`, title: 'Polish', description: 'Finitions', status: 'todo', priority: 'Moyenne', progress: 0 },
                { id: `gen-${Date.now()}-5`, title: 'Release', description: 'Publication', status: 'todo', priority: 'Critique', progress: 0 }
            ] : [
                { id: `gen-${Date.now()}-1`, title: 'Spécifications', description: 'UX et fonctionnalités', status: 'todo', priority: 'Critique', progress: 0 },
                { id: `gen-${Date.now()}-2`, title: 'Backend', description: 'API et BDD', status: 'todo', priority: 'Haute', progress: 0 },
                { id: `gen-${Date.now()}-3`, title: 'Frontend', description: 'Interface', status: 'todo', priority: 'Haute', progress: 0 },
                { id: `gen-${Date.now()}-4`, title: 'Tests', description: 'QA et tests', status: 'todo', priority: 'Haute', progress: 0 },
                { id: `gen-${Date.now()}-5`, title: 'Déploiement', description: 'Mise en prod', status: 'todo', priority: 'Critique', progress: 0 }
            ],
            testCases: isGame
                ? ['Gameplay fonctionne', 'Collisions OK', 'Audio OK', 'Pas de crash']
                : ['Auth fonctionne', 'Données OK', 'Responsive', 'Erreurs claires']
        };
    }
}
