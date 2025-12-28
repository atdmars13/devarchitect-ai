import * as vscode from 'vscode';
import * as path from 'path';

export interface DetectedAsset {
    name: string;
    category: 'Sprite' | 'Background' | 'Audio_SFX' | 'Audio_Music' | 'UI_Element' | 'Font' | 'Video' | 'Model3D' | 'Texture' | 'Icon' | 'Data' | 'Other';
    path: string;
    extension: string;
    size?: number;
}

export interface WorkspaceAnalysis {
    name: string;
    type: 'WEB_MOBILE' | 'GAME_2D';
    concept: string;
    elevatorPitch: string;
    targetAudience: string;
    coreFeatures: string[];
    architecture: string;
    teamMembers: string[];
    testCases: string[];
    validationCriteria: string;
    specs: {
        frontendFramework?: string;
        backendFramework?: string;
        gameEngine?: string;
        deploymentTarget?: string;
        genre?: string;
        artStyle?: string;
        targetDevices?: string[];
        supportedLanguages?: string[];
        pwaSupport?: boolean;
        offlineReady?: boolean;
    };
    design: {
        primaryColor?: string;
        secondaryColor?: string;
        uiTheme?: string;
    };
    commands: Array<{
        label: string;
        command: string;
        category: string;
        description?: string;
    }>;
    variables: Array<{
        key: string;
        value: string;
        description?: string;
        source?: string;
    }>;
    assets: DetectedAsset[];
    dependencies: string[];
    devDependencies: string[];
    detectedFiles: {
        hasPackageJson: boolean;
        hasDockerfile: boolean;
        hasReadme: boolean;
        hasTsConfig: boolean;
        hasUnityProject: boolean;
        hasGodotProject: boolean;
        hasPrisma: boolean;
        hasGraphQL: boolean;
        hasTailwind: boolean;
        hasTests: boolean;
        hasCICD: boolean;
        hasVSCodeExtension: boolean;
    };
    suggestedPhases: Array<{
        title: string;
        description: string;
        status: 'backlog' | 'todo' | 'doing' | 'done';
        priority: string;
    }>;
    fileStats: {
        totalFiles: number;
        codeFiles: number;
        testFiles: number;
        componentFiles: number;
    };
}

interface CachedAnalysis {
    analysis: WorkspaceAnalysis;
    timestamp: number;
    workspacePath: string;
}

export class WorkspaceAnalyzerService {
    private static cache: CachedAnalysis | null = null;
    private static readonly CACHE_TTL_MS = 30000; // 30 seconds cache validity

    /**
     * Invalidates the analysis cache. Call this when workspace files change significantly.
     */
    public static invalidateCache(): void {
        WorkspaceAnalyzerService.cache = null;
    }

    /**
     * Checks if cached analysis is still valid
     */
    private isCacheValid(): boolean {
        if (!WorkspaceAnalyzerService.cache) {
            return false;
        }
        
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return false;
        }
        
        const currentPath = workspaceFolders[0].uri.fsPath;
        const now = Date.now();
        
        return (
            WorkspaceAnalyzerService.cache.workspacePath === currentPath &&
            (now - WorkspaceAnalyzerService.cache.timestamp) < WorkspaceAnalyzerService.CACHE_TTL_MS
        );
    }
    
    /**
     * Analyse le workspace actuel et retourne des informations structurées
     */
    public async analyzeWorkspace(): Promise<WorkspaceAnalysis | null> {
        // Check cache first
        if (this.isCacheValid()) {
            console.log('[WorkspaceAnalyzer] Returning cached analysis');
            return WorkspaceAnalyzerService.cache!.analysis;
        }
        
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return null;
            }

            const rootPath = workspaceFolders[0].uri.fsPath;
            const rootName = workspaceFolders[0].name;

            // Détection des fichiers clés
            const detectedFiles = await this.detectProjectFiles(rootPath);
            
            // Déterminer le type de projet
            const projectType = this.detectProjectType(detectedFiles);
            
            // Analyser package.json si présent
            const packageInfo = await this.analyzePackageJson(rootPath);
            
            // Analyser README si présent
            const readmeInfo = await this.analyzeReadme(rootPath);
            
            // Analyser les fichiers .env
            const envVariables = await this.analyzeEnvFiles(rootPath);
            
            // Scanner les assets (images, audio, etc.)
            const assets = await this.scanAssets(rootPath);
            
            // Détecter le framework/stack
            const specs = await this.detectStack(rootPath, packageInfo, detectedFiles);
            
            // Générer les commandes suggérées
            const commands = this.generateCommands(packageInfo, detectedFiles, projectType);

            // Analyser les statistiques de fichiers
            const fileStats = await this.analyzeFileStats(rootPath);
            
            // Générer les phases suggérées (avec analyse détaillée)
            const suggestedPhases = this.generatePhases(projectType, specs, detectedFiles, packageInfo, fileStats);

            // Générer les informations supplémentaires
            const coreFeatures = this.detectCoreFeatures(packageInfo, specs, detectedFiles);
            const architecture = this.generateArchitectureDescription(specs, detectedFiles, packageInfo);
            const testCases = this.generateTestCases(projectType, specs, detectedFiles);
            const validationCriteria = this.generateValidationCriteria(projectType, specs);
            const targetAudience = this.detectTargetAudience(projectType, packageInfo);
            const elevatorPitch = this.generateElevatorPitch(packageInfo?.name || rootName, projectType, specs);
            const design = this.detectDesign(packageInfo);

            const analysis: WorkspaceAnalysis = {
                name: packageInfo?.name || rootName,
                type: projectType,
                concept: readmeInfo?.description || packageInfo?.description || '',
                elevatorPitch,
                targetAudience,
                coreFeatures,
                architecture,
                teamMembers: packageInfo?.author ? [packageInfo.author] : [],
                testCases,
                validationCriteria,
                specs,
                design,
                commands,
                variables: envVariables,
                assets,
                dependencies: packageInfo?.dependencies || [],
                devDependencies: packageInfo?.devDependencies || [],
                detectedFiles,
                suggestedPhases,
                fileStats
            };
            
            // Cache the result
            WorkspaceAnalyzerService.cache = {
                analysis,
                timestamp: Date.now(),
                workspacePath: rootPath
            };
            
            console.log('[WorkspaceAnalyzer] Analysis cached');
            return analysis;
        } catch (error) {
            console.error('[WorkspaceAnalyzer] Error analyzing workspace:', error);
            void vscode.window.showErrorMessage(`Erreur d'analyse du workspace: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }

    private async detectProjectFiles(rootPath: string): Promise<WorkspaceAnalysis['detectedFiles']> {
        const checkFile = async (filename: string): Promise<boolean> => {
            try {
                const uri = vscode.Uri.file(path.join(rootPath, filename));
                await vscode.workspace.fs.stat(uri);
                return true;
            } catch {
                return false;
            }
        };

        const checkPattern = async (pattern: string): Promise<boolean> => {
            const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 1);
            return files.length > 0;
        };

        return {
            hasPackageJson: await checkFile('package.json'),
            hasDockerfile: await checkFile('Dockerfile') || await checkFile('docker-compose.yml'),
            hasReadme: await checkFile('README.md') || await checkFile('readme.md'),
            hasTsConfig: await checkFile('tsconfig.json'),
            hasUnityProject: await checkPattern('**/*.unity') || await checkFile('ProjectSettings/ProjectSettings.asset'),
            hasGodotProject: await checkPattern('**/*.godot') || await checkFile('project.godot'),
            hasPrisma: await checkFile('prisma/schema.prisma') || await checkPattern('**/schema.prisma'),
            hasGraphQL: await checkPattern('**/*.graphql') || await checkPattern('**/*.gql'),
            hasTailwind: await checkFile('tailwind.config.js') || await checkFile('tailwind.config.ts'),
            hasTests: await checkPattern('**/*.test.{ts,tsx,js,jsx}') || await checkPattern('**/*.spec.{ts,tsx,js,jsx}'),
            hasCICD: await checkFile('.github/workflows') || await checkFile('.gitlab-ci.yml') || await checkFile('azure-pipelines.yml'),
            hasVSCodeExtension: await checkFile('extension/package.json') || await checkPattern('**/extension.ts')
        };
    }

    private detectProjectType(detectedFiles: WorkspaceAnalysis['detectedFiles']): 'WEB_MOBILE' | 'GAME_2D' {
        if (detectedFiles.hasUnityProject || detectedFiles.hasGodotProject) {
            return 'GAME_2D';
        }
        return 'WEB_MOBILE';
    }

    private async analyzePackageJson(rootPath: string): Promise<{
        name: string;
        description: string;
        scripts: Record<string, string>;
        dependencies: string[];
        devDependencies: string[];
        author?: string;
        keywords?: string[];
        version?: string;
        license?: string;
    } | null> {
        try {
            const uri = vscode.Uri.file(path.join(rootPath, 'package.json'));
            const content = await vscode.workspace.fs.readFile(uri);
            const pkg = JSON.parse(content.toString());

            // Extraire l'auteur (peut être string ou objet)
            let author: string | undefined;
            if (typeof pkg.author === 'string') {
                author = pkg.author;
            } else if (pkg.author?.name) {
                author = pkg.author.name;
            }

            return {
                name: pkg.name || '',
                description: pkg.description || '',
                scripts: pkg.scripts || {},
                dependencies: Object.keys(pkg.dependencies || {}),
                devDependencies: Object.keys(pkg.devDependencies || {}),
                author,
                keywords: pkg.keywords || [],
                version: pkg.version,
                license: pkg.license
            };
        } catch {
            return null;
        }
    }

    private async analyzeReadme(rootPath: string): Promise<{ description: string } | null> {
        try {
            const possibleNames = ['README.md', 'readme.md', 'Readme.md'];
            
            for (const name of possibleNames) {
                try {
                    const uri = vscode.Uri.file(path.join(rootPath, name));
                    const content = await vscode.workspace.fs.readFile(uri);
                    const text = content.toString();
                    
                    // Extraire la première section significative (après le titre)
                    const lines = text.split('\n');
                    let description = '';
                    let foundTitle = false;
                    
                    for (const line of lines) {
                        if (line.startsWith('#')) {
                            if (foundTitle) break; // Deuxième titre, on arrête
                            foundTitle = true;
                            continue;
                        }
                        if (foundTitle && line.trim()) {
                            description += line.trim() + ' ';
                            if (description.length > 300) break;
                        }
                    }
                    
                    return { description: description.trim() };
                } catch {
                    continue;
                }
            }
            return null;
        } catch {
            return null;
        }
    }

    private async analyzeEnvFiles(rootPath: string): Promise<WorkspaceAnalysis['variables']> {
        const variables: WorkspaceAnalysis['variables'] = [];
        const seenKeys = new Set<string>();
        
        // Liste de tous les fichiers .env possibles (ordre de priorité)
        const envFiles = [
            '.env',
            '.env.local',
            '.env.development',
            '.env.development.local',
            '.env.production',
            '.env.production.local',
            '.env.test',
            '.env.example',
            '.env.sample',
            '.env.template'
        ];
        
        for (const envFile of envFiles) {
            try {
                const uri = vscode.Uri.file(path.join(rootPath, envFile));
                const content = await vscode.workspace.fs.readFile(uri);
                const lines = content.toString().split('\n');
                let lastComment = '';
                
                for (const line of lines) {
                    const trimmed = line.trim();
                    
                    // Capturer les commentaires comme description
                    if (trimmed.startsWith('#')) {
                        lastComment = trimmed.substring(1).trim();
                        continue;
                    }
                    
                    if (trimmed) {
                        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
                        if (match && !seenKeys.has(match[1])) {
                            seenKeys.add(match[1]);
                            // Masquer les valeurs sensibles
                            let value = match[2] || '';
                            const isSecret = /secret|password|key|token|api/i.test(match[1]);
                            if (isSecret && value.length > 0) {
                                value = '***masked***';
                            }
                            variables.push({
                                key: match[1],
                                value,
                                description: lastComment || undefined,
                                source: envFile
                            });
                            lastComment = '';
                        }
                    }
                }
            } catch {
                continue;
            }
        }
        
        return variables;
    }

    /**
     * Scanne le workspace pour détecter les assets (images, audio, fonts, etc.)
     * Utilise une pagination pour gérer les gros projets (limite augmentée à 1000 par pattern)
     */
    private async scanAssets(rootPath: string): Promise<DetectedAsset[]> {
        const assets: DetectedAsset[] = [];
        const MAX_FILES_PER_PATTERN = 1000; // Augmenté pour les gros projets
        const MAX_TOTAL_ASSETS = 5000; // Limite totale pour éviter les problèmes de mémoire
        
        // Patterns pour différents types d'assets (recherche globale + dossiers spécifiques)
        const assetPatterns: Array<{ pattern: string; category: DetectedAsset['category'] }> = [
            // Images - recherche globale par extension
            { pattern: '**/*.png', category: 'Sprite' },
            { pattern: '**/*.jpg', category: 'Sprite' },
            { pattern: '**/*.jpeg', category: 'Sprite' },
            { pattern: '**/*.gif', category: 'Sprite' },
            { pattern: '**/*.webp', category: 'Sprite' },
            { pattern: '**/*.svg', category: 'Icon' },
            { pattern: '**/*.ico', category: 'Icon' },
            // Audio
            { pattern: '**/*.mp3', category: 'Audio_SFX' },
            { pattern: '**/*.wav', category: 'Audio_SFX' },
            { pattern: '**/*.ogg', category: 'Audio_SFX' },
            { pattern: '**/*.flac', category: 'Audio_Music' },
            { pattern: '**/*.m4a', category: 'Audio_Music' },
            // Fonts
            { pattern: '**/*.ttf', category: 'Font' },
            { pattern: '**/*.otf', category: 'Font' },
            { pattern: '**/*.woff', category: 'Font' },
            { pattern: '**/*.woff2', category: 'Font' },
            // Video
            { pattern: '**/*.mp4', category: 'Video' },
            { pattern: '**/*.webm', category: 'Video' },
            // 3D Models
            { pattern: '**/*.gltf', category: 'Model3D' },
            { pattern: '**/*.glb', category: 'Model3D' },
            { pattern: '**/*.obj', category: 'Model3D' },
            { pattern: '**/*.fbx', category: 'Model3D' }
        ];

        // Dossiers à exclure (très exhaustif)
        const excludePattern = '**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/out/**,**/.next/**,**/.nuxt/**,**/coverage/**,**/__pycache__/**,**/venv/**,**/extension/out/**,**/extension/media/**,**/webview-dist/**,**/.vscode/**';

        for (const { pattern, category } of assetPatterns) {
            // Vérifier si on a atteint la limite totale
            if (assets.length >= MAX_TOTAL_ASSETS) {
                console.log(`Asset scan limit reached (${MAX_TOTAL_ASSETS}). Stopping scan.`);
                break;
            }
            
            try {
                const files = await vscode.workspace.findFiles(pattern, excludePattern, MAX_FILES_PER_PATTERN);
                
                for (const file of files) {
                    const relativePath = path.relative(rootPath, file.fsPath);
                    const fileName = path.basename(file.fsPath);
                    const ext = path.extname(file.fsPath).toLowerCase();
                    
                    // Déterminer la vraie catégorie basée sur le chemin
                    let finalCategory = category;
                    const lowerPath = relativePath.toLowerCase();
                    
                    if (lowerPath.includes('background') || lowerPath.includes('/bg/') || lowerPath.includes('\\bg\\')) {
                        finalCategory = 'Background';
                    } else if (lowerPath.includes('music') || lowerPath.includes('soundtrack') || lowerPath.includes('ost')) {
                        finalCategory = 'Audio_Music';
                    } else if (lowerPath.includes('sfx') || lowerPath.includes('sound') || lowerPath.includes('effect')) {
                        finalCategory = 'Audio_SFX';
                    } else if (lowerPath.includes('ui') || lowerPath.includes('button') || lowerPath.includes('interface') || lowerPath.includes('menu')) {
                        finalCategory = 'UI_Element';
                    } else if (lowerPath.includes('sprite') || lowerPath.includes('character') || lowerPath.includes('enemy') || lowerPath.includes('player')) {
                        finalCategory = 'Sprite';
                    } else if (lowerPath.includes('icon')) {
                        finalCategory = 'Icon';
                    } else if (lowerPath.includes('texture')) {
                        finalCategory = 'Texture';
                    } else if (lowerPath.includes('font')) {
                        finalCategory = 'Font';
                    }
                    
                    // Éviter les doublons
                    if (!assets.find(a => a.path === relativePath)) {
                        assets.push({
                            name: fileName,
                            category: finalCategory,
                            path: relativePath,
                            extension: ext
                        });
                    }
                }
            } catch (error) {
                console.error(`Error scanning assets with pattern ${pattern}:`, error);
            }
        }

        // Trier par catégorie puis par nom
        return assets.sort((a, b) => {
            if (a.category !== b.category) return a.category.localeCompare(b.category);
            return a.name.localeCompare(b.name);
        });
    }

    private async detectStack(
        rootPath: string,
        packageInfo: any,
        detectedFiles: WorkspaceAnalysis['detectedFiles']
    ): Promise<WorkspaceAnalysis['specs']> {
        const specs: WorkspaceAnalysis['specs'] = {};
        
        if (!packageInfo) {
            if (detectedFiles.hasUnityProject) {
                specs.gameEngine = 'Unity';
            } else if (detectedFiles.hasGodotProject) {
                specs.gameEngine = 'Godot';
            }
            return specs;
        }

        const allDeps = [...(packageInfo.dependencies || []), ...(packageInfo.devDependencies || [])];

        // Frontend Detection
        if (allDeps.includes('react') || allDeps.includes('react-dom')) {
            specs.frontendFramework = 'React';
            if (allDeps.includes('next')) specs.frontendFramework = 'Next.js';
            if (allDeps.includes('gatsby')) specs.frontendFramework = 'Gatsby';
        } else if (allDeps.includes('vue')) {
            specs.frontendFramework = 'Vue.js';
            if (allDeps.includes('nuxt')) specs.frontendFramework = 'Nuxt.js';
        } else if (allDeps.includes('@angular/core')) {
            specs.frontendFramework = 'Angular';
        } else if (allDeps.includes('svelte')) {
            specs.frontendFramework = 'Svelte';
        }

        // Backend Detection
        if (allDeps.includes('express')) {
            specs.backendFramework = 'Express.js';
        } else if (allDeps.includes('fastify')) {
            specs.backendFramework = 'Fastify';
        } else if (allDeps.includes('nestjs') || allDeps.includes('@nestjs/core')) {
            specs.backendFramework = 'NestJS';
        } else if (allDeps.includes('hono')) {
            specs.backendFramework = 'Hono';
        }

        // Game Engine Detection
        if (allDeps.includes('phaser')) {
            specs.gameEngine = 'Phaser';
        } else if (allDeps.includes('pixi.js') || allDeps.includes('pixijs')) {
            specs.gameEngine = 'PixiJS';
        }

        // Deployment Detection
        if (allDeps.includes('vercel') || packageInfo.scripts?.deploy?.includes('vercel')) {
            specs.deploymentTarget = 'Vercel';
        } else if (allDeps.includes('netlify-cli')) {
            specs.deploymentTarget = 'Netlify';
        } else if (detectedFiles.hasDockerfile) {
            specs.deploymentTarget = 'Docker';
        }

        return specs;
    }

    private generateCommands(
        packageInfo: any,
        detectedFiles: WorkspaceAnalysis['detectedFiles'],
        _projectType: 'WEB_MOBILE' | 'GAME_2D'
    ): WorkspaceAnalysis['commands'] {
        const commands: WorkspaceAnalysis['commands'] = [];

        // Commandes depuis package.json scripts
        if (packageInfo?.scripts) {
            const scriptCategories: Record<string, string> = {
                'dev': 'Build',
                'start': 'Build',
                'build': 'Build',
                'test': 'Test',
                'lint': 'Test',
                'deploy': 'Deploy',
                'docker': 'Docker'
            };

            for (const [scriptName, scriptCmd] of Object.entries(packageInfo.scripts)) {
                const category = Object.entries(scriptCategories).find(([key]) => 
                    scriptName.toLowerCase().includes(key)
                )?.[1] || 'Other';

                commands.push({
                    label: scriptName,
                    command: `npm run ${scriptName}`,
                    category,
                    description: `Script: ${scriptCmd}`
                });
            }
        }

        // Commandes Git standard
        commands.push(
            { label: 'Git Status', command: 'git status', category: 'Git', description: 'Voir l\'état du repo' },
            { label: 'Git Pull', command: 'git pull', category: 'Git', description: 'Récupérer les changements' },
            { label: 'Git Push', command: 'git push', category: 'Git', description: 'Pousser les changements' }
        );

        // Docker si détecté
        if (detectedFiles.hasDockerfile) {
            commands.push(
                { label: 'Docker Build', command: 'docker build -t app .', category: 'Docker', description: 'Construire l\'image' },
                { label: 'Docker Run', command: 'docker run -p 3000:3000 app', category: 'Docker', description: 'Lancer le container' }
            );
        }

        return commands;
    }

    private generatePhases(
        projectType: 'WEB_MOBILE' | 'GAME_2D',
        specs: WorkspaceAnalysis['specs'],
        detectedFiles?: WorkspaceAnalysis['detectedFiles'],
        packageInfo?: any,
        _fileStats?: WorkspaceAnalysis['fileStats']
    ): WorkspaceAnalysis['suggestedPhases'] {
        const phases: WorkspaceAnalysis['suggestedPhases'] = [];
        const allDeps = [...(packageInfo?.dependencies || []), ...(packageInfo?.devDependencies || [])];

        if (projectType === 'GAME_2D') {
            return [
                { title: 'Game Design Document', description: 'Définition des mécaniques, règles et progression', status: 'todo', priority: 'Critique' },
                { title: 'Prototype Core Loop', description: 'Implémentation de la boucle de gameplay principale', status: 'todo', priority: 'Haute' },
                { title: 'Art & Assets', description: 'Création des sprites, animations et effets visuels', status: 'todo', priority: 'Haute' },
                { title: 'Audio & SFX', description: 'Musique et effets sonores', status: 'todo', priority: 'Moyenne' },
                { title: 'Polish & Juice', description: 'Animations, particules, feedback visuel', status: 'todo', priority: 'Moyenne' },
                { title: 'Testing & QA', description: 'Tests de gameplay, équilibrage, bugs', status: 'todo', priority: 'Haute' },
                { title: 'Release', description: 'Publication sur stores/plateformes', status: 'todo', priority: 'Critique' }
            ];
        }

        // VS Code Extension + Webview project (common in this repo)
        if (detectedFiles?.hasVSCodeExtension) {
            const usesVite = allDeps.some(d => /vite/.test(d)) || (packageInfo?.scripts && Object.values(packageInfo.scripts).some((s: any) => String(s).includes('vite')));
            const usesReact = allDeps.some(d => /react/.test(d));
            const uiStack = [usesReact ? 'React' : null, usesVite ? 'Vite' : null, detectedFiles.hasTailwind ? 'Tailwind' : null].filter(Boolean).join(' + ');

            return [
                {
                    title: 'Contrats Webview ↔ Extension',
                    description: `Définir/valider les types de messages (getProject/saveProject/fullSync/etc), versionner le protocole, et garantir la compatibilité sidebar/panel.`,
                    status: 'todo',
                    priority: 'Critique'
                },
                {
                    title: 'Stockage & Synchronisation',
                    description: `Unifier la persistance (globalState VS Code, export/import JSON), éviter boucles d’update, gérer “no active project”, et ajouter une synchronisation complète fiable (roadmap + champs).`,
                    status: 'todo',
                    priority: 'Critique'
                },
                {
                    title: 'UI Webview (Dashboard)',
                    description: `Améliorer l’expérience de planification: édition complète des champs, gestion roadmap détaillée (priorité, estimations, dépendances), et vues Tracking. Stack détectée: ${uiStack || 'N/A'}.`,
                    status: 'todo',
                    priority: 'Haute'
                },
                {
                    title: 'Int�gration IA Locale (Mistral/Ollama)',
                    description: `S’assurer que @devarchitect peut modifier le projet via /sync, /plan, /add, et que les commandes VS Code exposées couvrent 100% des besoins (bulkUpdate, phases, assets, variables, fullSync).`,
                    status: 'todo',
                    priority: 'Haute'
                },
                {
                    title: 'Analyse Workspace (Qualité du signal)',
                    description: `Améliorer WorkspaceAnalyzer: détection stack multi-module, scan assets/vars, génération de roadmap plus fine, et mise à jour de la progression basée sur stats/tests/CI.`,
                    status: 'todo',
                    priority: 'Moyenne'
                },
                {
                    title: 'Qualité, Packaging & Release',
                    description: `Maintenir tests + lint, build webview, packaging VSIX, préparation marketplace (README/CHANGELOG, repository field, versions).`,
                    status: 'todo',
                    priority: 'Haute'
                }
            ];
        }

        // Phase 1: Setup - toujours présente (statut initial: todo, sera calculé par analyzePhaseProgress)
        phases.push({
            title: 'Setup & Configuration',
            description: `Initialisation du projet${specs.frontendFramework ? ` ${specs.frontendFramework}` : ''}, configuration linting/prettier, hooks, scripts build/test, et CI de base.`,
            status: 'todo',
            priority: 'Critique'
        });

        // Phase 2: Architecture & Base
        phases.push({
            title: 'Architecture & Structure',
            description: 'Définition de l\'architecture, structure des dossiers, patterns (composants, services, stores)',
            status: 'todo',
            priority: 'Critique'
        });

        // Phase 3: UI/UX Design
        phases.push({
            title: 'Design System & UI',
            description: `Composants UI de base${detectedFiles?.hasTailwind ? ' avec Tailwind CSS' : ''}, thème, couleurs, typographie`,
            status: 'todo',
            priority: 'Haute'
        });

        // Phase 4: Backend/API - si applicable
        if (specs.backendFramework || allDeps.some(d => /express|fastify|nest|koa|hono/.test(d))) {
            phases.push({
                title: 'Backend API',
                description: `Développement des endpoints API ${specs.backendFramework || 'REST'}, validation, erreurs`,
                status: 'todo',
                priority: 'Haute'
            });
        }

        // Phase 5: Database - si applicable
        if (detectedFiles?.hasPrisma || allDeps.some(d => /prisma|typeorm|mongoose|sequelize|drizzle/.test(d))) {
            phases.push({
                title: 'Base de données',
                description: 'Modèles de données, migrations, seeds, relations',
                status: 'todo',
                priority: 'Haute'
            });
        }

        // Phase 6: Auth - si applicable
        if (allDeps.some(d => /next-auth|passport|auth0|clerk|supabase|firebase/.test(d))) {
            phases.push({
                title: 'Authentification',
                description: 'Système de connexion, sessions, JWT, OAuth providers',
                status: 'todo',
                priority: 'Critique'
            });
        }

        // Phase 7: State Management - si applicable
        if (allDeps.some(d => /zustand|redux|recoil|jotai|mobx|pinia|vuex/.test(d))) {
            phases.push({
                title: 'Gestion d\'état',
                description: 'Stores, actions, synchronisation état global/local',
                status: 'todo',
                priority: 'Moyenne'
            });
        }

        // Phase 8: Features principales
        phases.push({
            title: 'Fonctionnalités Core',
            description: 'Développement des fonctionnalités principales de l\'application',
            status: 'todo',
            priority: 'Haute'
        });

        // Phase 9: Tests
        phases.push({
            title: 'Tests & Qualité',
            description: `Tests unitaires${allDeps.some(d => /cypress|playwright/.test(d)) ? ', E2E' : ''}, couverture code, linting`,
            status: 'todo',
            priority: 'Haute'
        });

        // Phase 10: Documentation
        phases.push({
            title: 'Documentation',
            description: 'README, API docs, guides utilisateur, commentaires code',
            status: 'todo',
            priority: 'Moyenne'
        });

        // Phase 11: CI/CD
        phases.push({
            title: 'CI/CD & DevOps',
            description: `Pipeline CI/CD${detectedFiles?.hasDockerfile ? ', Docker' : ''}, déploiement automatisé`,
            status: 'todo',
            priority: 'Haute'
        });

        // Phase 12: Déploiement
        phases.push({
            title: 'Déploiement Production',
            description: `Mise en production ${specs.deploymentTarget || ''}, monitoring, logs`,
            status: 'todo',
            priority: 'Critique'
        });

        return phases;
    }

    /**
     * Analyse les statistiques de fichiers du projet
     */
    private async analyzeFileStats(_rootPath: string): Promise<WorkspaceAnalysis['fileStats']> {
        const excludePattern = '**/node_modules/**,**/.git/**,**/dist/**,**/build/**';
        
        const allFiles = await vscode.workspace.findFiles('**/*', excludePattern, 5000);
        const codeFiles = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx,py,java,cs,go,rs}', excludePattern, 5000);
        const testFiles = await vscode.workspace.findFiles('**/*.{test,spec}.{ts,tsx,js,jsx}', excludePattern, 1000);
        const componentFiles = await vscode.workspace.findFiles('**/components/**/*.{tsx,jsx,vue,svelte}', excludePattern, 1000);

        return {
            totalFiles: allFiles.length,
            codeFiles: codeFiles.length,
            testFiles: testFiles.length,
            componentFiles: componentFiles.length
        };
    }

    /**
     * Détecte les fonctionnalités principales du projet
     */
    private detectCoreFeatures(
        packageInfo: any,
        specs: WorkspaceAnalysis['specs'],
        detectedFiles: WorkspaceAnalysis['detectedFiles']
    ): string[] {
        const features: string[] = [];
        const allDeps = [...(packageInfo?.dependencies || []), ...(packageInfo?.devDependencies || [])];

        // Frontend features
        if (specs.frontendFramework) {
            features.push(`Interface ${specs.frontendFramework}`);
        }

        // Backend features
        if (specs.backendFramework) {
            features.push(`API ${specs.backendFramework}`);
        }

        // Database
        if (detectedFiles.hasPrisma || allDeps.some(d => /prisma|typeorm|sequelize|mongoose|knex/.test(d))) {
            features.push('Base de données avec ORM');
        }

        // Auth
        if (allDeps.some(d => /next-auth|passport|auth0|clerk|supabase/.test(d))) {
            features.push('Système d\'authentification');
        }

        // State management
        if (allDeps.some(d => /zustand|redux|recoil|jotai|mobx|pinia|vuex/.test(d))) {
            features.push('Gestion d\'état avancée');
        }

        // API/Data fetching
        if (allDeps.some(d => /tanstack|react-query|swr|axios|trpc/.test(d))) {
            features.push('Fetching de données optimisé');
        }

        // GraphQL
        if (detectedFiles.hasGraphQL || allDeps.some(d => /graphql|apollo/.test(d))) {
            features.push('API GraphQL');
        }

        // Styling
        if (detectedFiles.hasTailwind) {
            features.push('UI avec Tailwind CSS');
        } else if (allDeps.some(d => /styled-components|emotion|sass/.test(d))) {
            features.push('Styling CSS-in-JS');
        }

        // Testing
        if (detectedFiles.hasTests) {
            features.push('Tests automatisés');
        }

        // CI/CD
        if (detectedFiles.hasCICD) {
            features.push('Pipeline CI/CD');
        }

        // Docker
        if (detectedFiles.hasDockerfile) {
            features.push('Containerisation Docker');
        }

        // TypeScript
        if (detectedFiles.hasTsConfig) {
            features.push('TypeScript');
        }

        // Realtime
        if (allDeps.some(d => /socket\.io|ws|pusher|ably/.test(d))) {
            features.push('Communication temps réel');
        }

        // Forms
        if (allDeps.some(d => /react-hook-form|formik|zod|yup/.test(d))) {
            features.push('Formulaires avec validation');
        }

        return features;
    }

    /**
     * Génère une description de l'architecture
     */
    private generateArchitectureDescription(
        specs: WorkspaceAnalysis['specs'],
        detectedFiles: WorkspaceAnalysis['detectedFiles'],
        packageInfo: any
    ): string {
        const parts: string[] = [];
        const allDeps = [...(packageInfo?.dependencies || []), ...(packageInfo?.devDependencies || [])];

        // Frontend
        if (specs.frontendFramework) {
            if (specs.frontendFramework === 'Next.js') {
                parts.push('Architecture Next.js avec SSR/SSG');
            } else {
                parts.push(`Frontend ${specs.frontendFramework} SPA`);
            }
        }

        // Backend
        if (specs.backendFramework) {
            parts.push(`Backend ${specs.backendFramework} API REST`);
        }

        // Database layer
        if (detectedFiles.hasPrisma) {
            parts.push('Couche données avec Prisma ORM');
        } else if (allDeps.some(d => /mongoose/.test(d))) {
            parts.push('Base MongoDB avec Mongoose');
        } else if (allDeps.some(d => /typeorm/.test(d))) {
            parts.push('Base SQL avec TypeORM');
        }

        // Monorepo
        if (allDeps.includes('turbo') || allDeps.includes('lerna') || allDeps.includes('nx')) {
            parts.push('Structure Monorepo');
        }

        // Microservices
        if (allDeps.some(d => /microservices|grpc|kafka/.test(d))) {
            parts.push('Architecture Microservices');
        }

        if (parts.length === 0) {
            return specs.frontendFramework 
                ? `Application ${specs.frontendFramework} moderne`
                : 'Application web standard';
        }

        return parts.join(' + ');
    }

    /**
     * Génère des cas de test suggérés
     */
    private generateTestCases(
        projectType: 'WEB_MOBILE' | 'GAME_2D',
        specs: WorkspaceAnalysis['specs'],
        detectedFiles: WorkspaceAnalysis['detectedFiles']
    ): string[] {
        if (projectType === 'GAME_2D') {
            return [
                'Gameplay principal fonctionne sans crash',
                'Contrôles réactifs sur toutes les plateformes cibles',
                'Physique et collisions correctes',
                'Audio et musique fonctionnent',
                'Sauvegarde/Chargement des données',
                'Performance stable (60 FPS)',
                'UI/Menus navigables',
                'Pas de fuite mémoire en jeu prolongé'
            ];
        }

        const tests: string[] = [
            'Chargement initial < 3 secondes',
            'Navigation entre pages fluide',
            'Formulaires valident correctement les entrées',
            'Gestion des erreurs avec messages clairs'
        ];

        if (detectedFiles.hasTests) {
            tests.push('Couverture de tests > 80%');
        }

        if (specs.backendFramework) {
            tests.push('API répond en < 200ms');
            tests.push('Endpoints protégés correctement');
        }

        tests.push(
            'Interface responsive (mobile/desktop)',
            'Accessibilité WCAG 2.1 AA',
            'SEO meta tags présents',
            'Pas de console errors en production'
        );

        return tests;
    }

    /**
     * Génère les critères de validation
     */
    private generateValidationCriteria(
        projectType: 'WEB_MOBILE' | 'GAME_2D',
        specs: WorkspaceAnalysis['specs']
    ): string {
        if (projectType === 'GAME_2D') {
            return 'Performance stable 60 FPS, contrôles réactifs, 0 bug bloquant, gameplay testé et équilibré, build fonctionnel sur toutes les plateformes cibles';
        }

        const criteria: string[] = [
            'Temps de chargement < 3s',
            'Score Lighthouse > 90',
            'Accessibilité AA',
            'Tests > 80% couverture',
            '0 vulnérabilité critique'
        ];

        if (specs.backendFramework) {
            criteria.push('API documentée OpenAPI');
        }

        return criteria.join(', ');
    }

    /**
     * Détecte l'audience cible
     */
    private detectTargetAudience(
        projectType: 'WEB_MOBILE' | 'GAME_2D',
        packageInfo: any
    ): string {
        if (projectType === 'GAME_2D') {
            return 'Joueurs casual et mid-core, 16-35 ans, mobile et desktop';
        }

        const keywords = (packageInfo?.keywords || []).join(' ').toLowerCase();
        const name = (packageInfo?.name || '').toLowerCase();

        if (keywords.includes('enterprise') || keywords.includes('business') || name.includes('admin')) {
            return 'Professionnels et entreprises (B2B)';
        }
        if (keywords.includes('ecommerce') || keywords.includes('shop')) {
            return 'Consommateurs e-commerce (B2C)';
        }
        if (keywords.includes('saas')) {
            return 'Utilisateurs SaaS, PME et startups';
        }

        return 'Utilisateurs web/mobile, grand public et professionnels';
    }

    /**
     * Génère un elevator pitch
     */
    private generateElevatorPitch(
        name: string,
        projectType: 'WEB_MOBILE' | 'GAME_2D',
        specs: WorkspaceAnalysis['specs']
    ): string {
        const cleanName = name.replace(/-/g, ' ').replace(/^@\w+\//, '');

        if (projectType === 'GAME_2D') {
            return `${cleanName} - Un jeu ${specs.genre || '2D'} captivant qui offre une expérience unique et addictive.`;
        }

        if (specs.frontendFramework) {
            return `${cleanName} - Une application ${specs.frontendFramework} moderne offrant une expérience utilisateur fluide et intuitive.`;
        }

        return `${cleanName} - Une solution innovante qui répond aux besoins de ses utilisateurs avec simplicité et efficacité.`;
    }

    /**
     * Détecte les paramètres de design
     */
    private detectDesign(packageInfo: any): WorkspaceAnalysis['design'] {
        const allDeps = [...(packageInfo?.dependencies || []), ...(packageInfo?.devDependencies || [])];

        let uiTheme = 'Minimalist';
        
        if (allDeps.some(d => /tailwind/.test(d))) {
            uiTheme = 'Minimalist';
        } else if (allDeps.some(d => /material|mui/.test(d))) {
            uiTheme = 'Material';
        } else if (allDeps.some(d => /chakra/.test(d))) {
            uiTheme = 'Flat';
        } else if (allDeps.some(d => /antd|ant-design/.test(d))) {
            uiTheme = 'Flat';
        } else if (allDeps.some(d => /bootstrap/.test(d))) {
            uiTheme = 'Flat';
        }

        return {
            primaryColor: '#3b82f6', // blue-500
            secondaryColor: '#8b5cf6', // violet-500
            uiTheme
        };
    }
}


