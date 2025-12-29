import * as http from 'http';
import * as fs from 'fs';
import * as vscode from 'vscode';

export interface OllamaConfig {
    baseUrl: string;
    preferredModel: string;
    timeout: number;
    enabled: boolean;
}

export interface OllamaResponse {
    model: string;
    response: string;
    done: boolean;
}

export interface ModelCapabilities {
    vision: boolean;          // Supporte l'analyse d'images
    codeGeneration: boolean;  // Optimisé pour le code
    longContext: boolean;     // Contexte > 32k tokens
    reasoning: boolean;       // Capacités de raisonnement avancé
    maxTokens: number;        // Limite de tokens en entrée
}

export interface LLMModelInfo {
    name: string;
    provider: 'mistral' | 'qwen' | 'deepseek' | 'meta' | 'other';
    capabilities: ModelCapabilities;
}

export class AIClientService {
    private static instance: AIClientService;

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

    private fallbackModels = [
        'codestral:latest', 'mistral-large:latest', 'pixtral:12b', 'ministral:8b', 'mistral-nemo:latest',
        'qwen2.5-coder:14b', 'qwen2.5-coder:7b', 'deepseek-coder-v2:16b', 'llama3.2:latest'
    ];

    private constructor() {}

    public static getInstance(): AIClientService {
        if (!AIClientService.instance) {
            AIClientService.instance = new AIClientService();
        }
        return AIClientService.instance;
    }

    /**
     * Récupère la configuration Ollama
     */
    public getOllamaConfig(): OllamaConfig {
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
        if (!config.enabled) return false;

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
     * Liste les modèles disponibles
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
                        resolve(json.models?.map((m: any) => m.name) || []);
                    } catch { resolve([]); }
                });
            });
            req.on('error', () => resolve([]));
            req.end();
        });
    }

    /**
     * Génère une complétion
     */
    public async generate(prompt: string, model: string, options?: { temperature?: number; num_predict?: number }): Promise<string> {
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
                    } catch (e) {
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
     * Génère une complétion avec Vision
     */
    public async generateWithVision(prompt: string, imagePath: string, model?: string): Promise<string> {
        const config = this.getOllamaConfig();
        const visionModel = model || await this.selectVisionModel();

        if (!visionModel) throw new Error('Aucun modèle vision disponible.');

        let imageBase64: string;
        try {
            imageBase64 = fs.readFileSync(imagePath).toString('base64');
        } catch {
            throw new Error(`Impossible de lire l'image: ${imagePath}`);
        }

        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                model: visionModel,
                prompt,
                images: [imageBase64],
                stream: false,
                options: { temperature: 0.5, num_predict: 2000 }
            });

            const req = http.request(`${config.baseUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: config.timeout * 2
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json: OllamaResponse = JSON.parse(data);
                        resolve(json.response || '');
                    } catch { reject(new Error('Invalid response from Ollama Vision')); }
                });
            });

            req.on('error', (e) => reject(e));
            req.on('timeout', () => { req.destroy(); reject(new Error('Timeout Vision')); });
            req.write(postData);
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

        const preferredFound = available.find(m => m.startsWith(config.preferredModel));
        if (preferredFound) return preferredFound;

        for (const preferred of this.fallbackModels) {
            const found = available.find(m => m.startsWith(preferred) || m === preferred.split(':')[0]);
            if (found) return found;
        }

        return available[0];
    }

    /**
     * Sélectionne le meilleur modèle Vision
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
     * Sélectionne le meilleur modèle Long Contexte
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
     * Obtient les infos d'un modèle
     */
    public getModelInfo(modelName: string): LLMModelInfo | undefined {
        return this.modelRegistry.find(m => modelName.startsWith(m.name.split(':')[0]) || m.name === modelName);
    }

    /**
     * Décharge un modèle
     */
    public async unloadModel(modelName?: string): Promise<{ success: boolean; message: string }> {
        const config = this.getOllamaConfig();
        const model = modelName || config.preferredModel;

        return new Promise((resolve) => {
            const postData = JSON.stringify({ model, prompt: '', keep_alive: 0 });
            const req = http.request(`${config.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
                timeout: 5000
            }, (res) => {
                resolve({
                    success: res.statusCode === 200,
                    message: res.statusCode === 200 ? `Modèle ${model} déchargé` : `Erreur ${res.statusCode}`
                });
            });
            req.on('error', (e) => resolve({ success: false, message: e.message }));
            req.write(postData);
            req.end();
        });
    }

    /**
     * Décharge tous les modèles
     */
    public async unloadAllModels(): Promise<{ success: boolean; message: string; unloadedCount: number }> {
        const config = this.getOllamaConfig();

        return new Promise((resolve) => {
            const req = http.request(`${config.baseUrl}/api/ps`, { method: 'GET', timeout: 5000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', async () => {
                    try {
                        const json = JSON.parse(data);
                        const runningModels = json.models?.map((m: any) => m.name) || [];
                        let count = 0;
                        for (const m of runningModels) {
                            await this.unloadModel(m);
                            count++;
                        }
                        resolve({ success: true, message: `${count} modèles déchargés`, unloadedCount: count });
                    } catch { resolve({ success: false, message: 'Erreur lecture modèles', unloadedCount: 0 }); }
                });
            });
            req.on('error', () => resolve({ success: false, message: 'Erreur connexion', unloadedCount: 0 }));
            req.end();
        });
    }

    /**
     * Statut VRAM
     */
    public async getLoadedModels(): Promise<{ models: Array<{ name: string; sizeVram: number }>; totalVram: number }> {
        const config = this.getOllamaConfig();

        return new Promise((resolve) => {
            const req = http.request(`${config.baseUrl}/api/ps`, { method: 'GET', timeout: 5000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        const models = (json.models || []).map((m: any) => ({
                            name: m.name,
                            sizeVram: m.size_vram || 0
                        }));
                        const totalVram = models.reduce((acc: number, m: any) => acc + m.sizeVram, 0);
                        resolve({ models, totalVram });
                    } catch { resolve({ models: [], totalVram: 0 }); }
                });
            });
            req.on('error', () => resolve({ models: [], totalVram: 0 }));
            req.end();
        });
    }
}
