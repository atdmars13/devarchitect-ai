import * as vscode from 'vscode';
import * as path from 'path';

export interface DetectedAsset {
    name: string;
    category: 'Sprite' | 'Background' | 'Audio_SFX' | 'Audio_Music' | 'UI_Element' | 'Font' | 'Video' | 'Model3D' | 'Texture' | 'Icon' | 'Data' | 'Other';
    path: string;
    extension: string;
    size?: number;
    lastModified?: string;
}

/**
 * Analyse détaillée du code source - FACTUELLE
 */
export interface CodeAnalysis {
    totalClasses: number;
    totalFunctions: number;
    totalInterfaces: number;
    totalComponents: number;
    totalHooks: number;
    totalLines: number;
    apiEndpoints: ApiEndpoint[];
    detectedPatterns: string[];
    implementedFeatures: ImplementedFeature[];
    todos: TodoItem[];
    complexity: 'low' | 'medium' | 'high';
    imports: ImportAnalysis;
}

export interface ApiEndpoint {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'ALL';
    path: string;
    file: string;
    line: number;
}

export interface ImplementedFeature {
    name: string;
    type: 'component' | 'service' | 'hook' | 'api' | 'store' | 'util' | 'test';
    file: string;
    status: 'complete' | 'partial' | 'stub';
}

export interface TodoItem {
    text: string;
    file: string;
    line: number;
    type: 'TODO' | 'FIXME' | 'HACK' | 'BUG';
}

export interface ImportAnalysis {
    externalPackages: string[];
    internalModules: string[];
    unusedImports: number;
}

/**
 * Critères factuels pour le calcul de progression d'une phase
 */
export interface PhaseProgressCriteria {
    filesRequired: string[];
    patternsRequired: RegExp[];
    dependenciesRequired: string[];
    testsRequired: boolean;
    minFiles: number;
    weight: number;
}

/**
 * Résultat du calcul de progression d'une phase
 */
export interface PhaseProgressResult {
    progress: number;
    status: 'backlog' | 'todo' | 'doing' | 'review' | 'done';
    evidence: string[];
    missingItems: string[];
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
        // Nouvelles détections
        cssFramework?: string;
        stateManagement?: string;
        orm?: string;
        testingFramework?: string;
        bundler?: string;
        runtimeEnvironment?: string;
        apiStyle?: string;
        authentication?: string;
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
        // Nouvelles détections
        hasMonorepo: boolean;
        hasStorybook: boolean;
        hasOpenAPI: boolean;
        hasI18n: boolean;
        hasPWA: boolean;
        hasSSR: boolean;
        hasWebpack: boolean;
        hasVite: boolean;
        hasESLint: boolean;
        hasPrettier: boolean;
        hasHusky: boolean;
        hasChangesets: boolean;
        hasEnvExample: boolean;
        hasLicense: boolean;
        hasContributing: boolean;
    };
    suggestedPhases: Array<{
        title: string;
        description: string;
        status: 'backlog' | 'todo' | 'doing' | 'review' | 'done';
        priority: string;
        progress?: number;
        evidence?: string[];
        missingItems?: string[];
    }>;
    fileStats: {
        totalFiles: number;
        codeFiles: number;
        testFiles: number;
        componentFiles: number;
        // Nouvelles stats
        configFiles: number;
        documentationFiles: number;
        styleFiles: number;
    };
    // Nouvelle analyse de code
    codeAnalysis?: CodeAnalysis;
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
            let suggestedPhases = this.generatePhases(projectType, specs, detectedFiles, packageInfo, fileStats);

            // ========== CALCUL FACTUEL DE LA PROGRESSION ==========
            // Mettre à jour les phases avec la progression réelle basée sur l'analyse du code
            suggestedPhases = await this.updatePhasesWithFactualProgress(
                suggestedPhases,
                rootPath,
                detectedFiles,
                packageInfo,
                fileStats
            );

            // Analyser le code en détail pour les métriques
            const codeAnalysis = await this.analyzeCodeDetailed(rootPath);

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
                fileStats,
                codeAnalysis
            };
            
            // Cache the result
            WorkspaceAnalyzerService.cache = {
                analysis,
                timestamp: Date.now(),
                workspacePath: rootPath
            };
            
            console.log('[WorkspaceAnalyzer] Analysis cached with factual progress');
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

        // Détections parallèles pour de meilleures performances
        const [
            hasPackageJson,
            hasDockerfile,
            hasDockerCompose,
            hasReadme,
            hasReadmeLower,
            hasTsConfig,
            hasUnityProject,
            hasGodotProject,
            hasPrisma,
            hasPrismaPattern,
            hasGraphQL,
            hasGql,
            hasTailwindJs,
            hasTailwindTs,
            hasTestsTest,
            hasTestsSpec,
            hasGithubWorkflows,
            hasGitlabCI,
            hasAzurePipelines,
            hasVSCodeExt,
            hasExtensionTs,
            // Nouveaux détecteurs
            hasLernaJson,
            hasPnpmWorkspace,
            hasNxJson,
            hasTurboJson,
            hasStorybookDir,
            hasOpenApiYaml,
            hasSwaggerJson,
            hasI18nDir,
            hasLocalesDir,
            hasManifestJson,
            hasServiceWorker,
            hasNextConfig,
            hasNuxtConfig,
            hasWebpackConfig,
            hasViteConfig,
            hasEslintConfig,
            hasEslintConfigJs,
            hasPrettierConfig,
            hasPrettierRc,
            hasHuskyDir,
            hasChangesetsDir,
            hasEnvExample,
            hasLicense,
            hasContributing,
            hasContributingEn
        ] = await Promise.all([
            checkFile('package.json'),
            checkFile('Dockerfile'),
            checkFile('docker-compose.yml'),
            checkFile('README.md'),
            checkFile('readme.md'),
            checkFile('tsconfig.json'),
            checkPattern('**/*.unity'),
            checkPattern('**/*.godot'),
            checkFile('prisma/schema.prisma'),
            checkPattern('**/schema.prisma'),
            checkPattern('**/*.graphql'),
            checkPattern('**/*.gql'),
            checkFile('tailwind.config.js'),
            checkFile('tailwind.config.ts'),
            checkPattern('**/*.test.{ts,tsx,js,jsx}'),
            checkPattern('**/*.spec.{ts,tsx,js,jsx}'),
            checkFile('.github/workflows'),
            checkFile('.gitlab-ci.yml'),
            checkFile('azure-pipelines.yml'),
            checkFile('extension/package.json'),
            checkPattern('**/extension.ts'),
            // Nouveaux détecteurs
            checkFile('lerna.json'),
            checkFile('pnpm-workspace.yaml'),
            checkFile('nx.json'),
            checkFile('turbo.json'),
            checkFile('.storybook'),
            checkFile('openapi.yaml'),
            checkFile('swagger.json'),
            checkFile('i18n'),
            checkFile('locales'),
            checkFile('manifest.json'),
            checkPattern('**/service-worker.{js,ts}'),
            checkFile('next.config.js'),
            checkFile('nuxt.config.ts'),
            checkFile('webpack.config.js'),
            checkFile('vite.config.ts'),
            checkFile('.eslintrc.json'),
            checkFile('eslint.config.js'),
            checkFile('.prettierrc'),
            checkFile('prettier.config.js'),
            checkFile('.husky'),
            checkFile('.changeset'),
            checkFile('.env.example'),
            checkFile('LICENSE'),
            checkFile('CONTRIBUTING.md'),
            checkFile('CONTRIBUTING.en.md')
        ]);

        return {
            hasPackageJson,
            hasDockerfile: hasDockerfile || hasDockerCompose,
            hasReadme: hasReadme || hasReadmeLower,
            hasTsConfig,
            hasUnityProject: hasUnityProject || await checkFile('ProjectSettings/ProjectSettings.asset'),
            hasGodotProject: hasGodotProject || await checkFile('project.godot'),
            hasPrisma: hasPrisma || hasPrismaPattern,
            hasGraphQL: hasGraphQL || hasGql,
            hasTailwind: hasTailwindJs || hasTailwindTs,
            hasTests: hasTestsTest || hasTestsSpec,
            hasCICD: hasGithubWorkflows || hasGitlabCI || hasAzurePipelines,
            hasVSCodeExtension: hasVSCodeExt || hasExtensionTs,
            // Nouveaux champs
            hasMonorepo: hasLernaJson || hasPnpmWorkspace || hasNxJson || hasTurboJson,
            hasStorybook: hasStorybookDir,
            hasOpenAPI: hasOpenApiYaml || hasSwaggerJson,
            hasI18n: hasI18nDir || hasLocalesDir,
            hasPWA: hasManifestJson || hasServiceWorker,
            hasSSR: hasNextConfig || hasNuxtConfig,
            hasWebpack: hasWebpackConfig,
            hasVite: hasViteConfig,
            hasESLint: hasEslintConfig || hasEslintConfigJs,
            hasPrettier: hasPrettierConfig || hasPrettierRc,
            hasHusky: hasHuskyDir,
            hasChangesets: hasChangesetsDir,
            hasEnvExample: hasEnvExample,
            hasLicense: hasLicense,
            hasContributing: hasContributing || hasContributingEn
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
            if (allDeps.includes('remix')) specs.frontendFramework = 'Remix';
        } else if (allDeps.includes('vue')) {
            specs.frontendFramework = 'Vue.js';
            if (allDeps.includes('nuxt')) specs.frontendFramework = 'Nuxt.js';
        } else if (allDeps.includes('@angular/core')) {
            specs.frontendFramework = 'Angular';
        } else if (allDeps.includes('svelte')) {
            specs.frontendFramework = 'Svelte';
            if (allDeps.includes('@sveltejs/kit')) specs.frontendFramework = 'SvelteKit';
        } else if (allDeps.includes('solid-js')) {
            specs.frontendFramework = 'SolidJS';
        } else if (allDeps.includes('astro')) {
            specs.frontendFramework = 'Astro';
        } else if (allDeps.includes('qwik') || allDeps.includes('@builder.io/qwik')) {
            specs.frontendFramework = 'Qwik';
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
        } else if (allDeps.includes('koa')) {
            specs.backendFramework = 'Koa';
        } else if (allDeps.includes('@trpc/server')) {
            specs.backendFramework = 'tRPC';
        } else if (allDeps.includes('elysia')) {
            specs.backendFramework = 'Elysia';
        }

        // CSS Framework Detection
        if (detectedFiles.hasTailwind) {
            specs.cssFramework = 'Tailwind CSS';
        } else if (allDeps.includes('styled-components')) {
            specs.cssFramework = 'Styled Components';
        } else if (allDeps.includes('@emotion/react') || allDeps.includes('@emotion/styled')) {
            specs.cssFramework = 'Emotion';
        } else if (allDeps.includes('sass') || allDeps.includes('node-sass')) {
            specs.cssFramework = 'Sass/SCSS';
        } else if (allDeps.includes('@chakra-ui/react')) {
            specs.cssFramework = 'Chakra UI';
        } else if (allDeps.includes('@mui/material') || allDeps.includes('@material-ui/core')) {
            specs.cssFramework = 'Material UI';
        } else if (allDeps.includes('antd')) {
            specs.cssFramework = 'Ant Design';
        } else if (allDeps.includes('bootstrap')) {
            specs.cssFramework = 'Bootstrap';
        } else if (allDeps.includes('shadcn') || allDeps.some(d => d.includes('radix-ui'))) {
            specs.cssFramework = 'Radix UI / shadcn';
        }

        // State Management Detection
        if (allDeps.includes('zustand')) {
            specs.stateManagement = 'Zustand';
        } else if (allDeps.includes('@reduxjs/toolkit') || allDeps.includes('redux')) {
            specs.stateManagement = 'Redux';
        } else if (allDeps.includes('recoil')) {
            specs.stateManagement = 'Recoil';
        } else if (allDeps.includes('jotai')) {
            specs.stateManagement = 'Jotai';
        } else if (allDeps.includes('mobx')) {
            specs.stateManagement = 'MobX';
        } else if (allDeps.includes('pinia')) {
            specs.stateManagement = 'Pinia';
        } else if (allDeps.includes('vuex')) {
            specs.stateManagement = 'Vuex';
        } else if (allDeps.includes('xstate')) {
            specs.stateManagement = 'XState';
        }

        // ORM/Database Detection
        if (allDeps.includes('@prisma/client') || detectedFiles.hasPrisma) {
            specs.orm = 'Prisma';
        } else if (allDeps.includes('typeorm')) {
            specs.orm = 'TypeORM';
        } else if (allDeps.includes('sequelize')) {
            specs.orm = 'Sequelize';
        } else if (allDeps.includes('mongoose')) {
            specs.orm = 'Mongoose';
        } else if (allDeps.includes('drizzle-orm')) {
            specs.orm = 'Drizzle';
        } else if (allDeps.includes('knex')) {
            specs.orm = 'Knex';
        } else if (allDeps.includes('@supabase/supabase-js')) {
            specs.orm = 'Supabase';
        }

        // Testing Framework Detection
        if (allDeps.includes('vitest')) {
            specs.testingFramework = 'Vitest';
        } else if (allDeps.includes('jest')) {
            specs.testingFramework = 'Jest';
        } else if (allDeps.includes('mocha')) {
            specs.testingFramework = 'Mocha';
        } else if (allDeps.includes('@playwright/test')) {
            specs.testingFramework = 'Playwright';
        } else if (allDeps.includes('cypress')) {
            specs.testingFramework = 'Cypress';
        }

        // Bundler Detection
        if (detectedFiles.hasVite) {
            specs.bundler = 'Vite';
        } else if (detectedFiles.hasWebpack) {
            specs.bundler = 'Webpack';
        } else if (allDeps.includes('esbuild')) {
            specs.bundler = 'esbuild';
        } else if (allDeps.includes('turbopack')) {
            specs.bundler = 'Turbopack';
        } else if (allDeps.includes('rollup')) {
            specs.bundler = 'Rollup';
        } else if (allDeps.includes('parcel')) {
            specs.bundler = 'Parcel';
        }

        // Runtime Environment Detection
        if (allDeps.includes('bun')) {
            specs.runtimeEnvironment = 'Bun';
        } else if (allDeps.includes('deno')) {
            specs.runtimeEnvironment = 'Deno';
        } else {
            specs.runtimeEnvironment = 'Node.js';
        }

        // API Style Detection
        if (detectedFiles.hasGraphQL || allDeps.includes('graphql') || allDeps.includes('@apollo/server')) {
            specs.apiStyle = 'GraphQL';
        } else if (allDeps.includes('@trpc/server')) {
            specs.apiStyle = 'tRPC';
        } else if (detectedFiles.hasOpenAPI) {
            specs.apiStyle = 'REST (OpenAPI)';
        } else if (allDeps.includes('express') || allDeps.includes('fastify') || allDeps.includes('hono')) {
            specs.apiStyle = 'REST';
        }

        // Authentication Detection
        if (allDeps.includes('next-auth') || allDeps.includes('@auth/core')) {
            specs.authentication = 'NextAuth.js';
        } else if (allDeps.includes('passport')) {
            specs.authentication = 'Passport.js';
        } else if (allDeps.includes('@auth0/auth0-react') || allDeps.includes('auth0')) {
            specs.authentication = 'Auth0';
        } else if (allDeps.includes('@clerk/clerk-sdk-node') || allDeps.includes('@clerk/nextjs')) {
            specs.authentication = 'Clerk';
        } else if (allDeps.includes('firebase') || allDeps.includes('firebase-admin')) {
            specs.authentication = 'Firebase Auth';
        } else if (allDeps.includes('@supabase/supabase-js')) {
            specs.authentication = 'Supabase Auth';
        }

        // Game Engine Detection
        if (allDeps.includes('phaser')) {
            specs.gameEngine = 'Phaser';
        } else if (allDeps.includes('pixi.js') || allDeps.includes('pixijs')) {
            specs.gameEngine = 'PixiJS';
        } else if (allDeps.includes('three')) {
            specs.gameEngine = 'Three.js';
        } else if (allDeps.includes('@babylonjs/core')) {
            specs.gameEngine = 'Babylon.js';
        } else if (allDeps.includes('kaboom')) {
            specs.gameEngine = 'Kaboom.js';
        } else if (allDeps.includes('excalibur')) {
            specs.gameEngine = 'Excalibur';
        }

        // Deployment Detection
        if (allDeps.includes('vercel') || packageInfo.scripts?.deploy?.includes('vercel')) {
            specs.deploymentTarget = 'Vercel';
        } else if (allDeps.includes('netlify-cli')) {
            specs.deploymentTarget = 'Netlify';
        } else if (allDeps.includes('@azure/functions')) {
            specs.deploymentTarget = 'Azure Functions';
        } else if (allDeps.includes('aws-sdk') || allDeps.includes('@aws-sdk/client-lambda')) {
            specs.deploymentTarget = 'AWS';
        } else if (allDeps.includes('firebase-functions')) {
            specs.deploymentTarget = 'Firebase';
        } else if (detectedFiles.hasDockerfile) {
            specs.deploymentTarget = 'Docker';
        }

        // PWA/Offline support
        specs.pwaSupport = detectedFiles.hasPWA;
        specs.offlineReady = allDeps.includes('workbox') || allDeps.includes('workbox-webpack-plugin');

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
        
        // Détection parallèle pour de meilleures performances
        const [allFiles, codeFiles, testFiles, componentFiles, configFiles, docFiles, styleFiles] = await Promise.all([
            vscode.workspace.findFiles('**/*', excludePattern, 5000),
            vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx,py,java,cs,go,rs,rb,php,swift,kt}', excludePattern, 5000),
            vscode.workspace.findFiles('**/*.{test,spec}.{ts,tsx,js,jsx}', excludePattern, 1000),
            vscode.workspace.findFiles('**/components/**/*.{tsx,jsx,vue,svelte}', excludePattern, 1000),
            // Nouvelles détections
            vscode.workspace.findFiles('**/*.{json,yaml,yml,toml,ini,env}', excludePattern, 500),
            vscode.workspace.findFiles('**/*.{md,mdx,txt,rst,adoc}', excludePattern, 500),
            vscode.workspace.findFiles('**/*.{css,scss,sass,less,styl,pcss}', excludePattern, 500)
        ]);

        return {
            totalFiles: allFiles.length,
            codeFiles: codeFiles.length,
            testFiles: testFiles.length,
            componentFiles: componentFiles.length,
            configFiles: configFiles.length,
            documentationFiles: docFiles.length,
            styleFiles: styleFiles.length
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

    // ========================================
    // ANALYSE DE CODE FACTUELLE ET DÉTAILLÉE
    // ========================================

    /**
     * Analyse détaillée du code source - FACTUELLE
     * Scanne les fichiers pour extraire des métriques réelles
     */
    public async analyzeCodeDetailed(rootPath: string): Promise<CodeAnalysis> {
        const analysis: CodeAnalysis = {
            totalClasses: 0,
            totalFunctions: 0,
            totalInterfaces: 0,
            totalComponents: 0,
            totalHooks: 0,
            totalLines: 0,
            apiEndpoints: [],
            detectedPatterns: [],
            implementedFeatures: [],
            todos: [],
            complexity: 'low',
            imports: {
                externalPackages: [],
                internalModules: [],
                unusedImports: 0
            }
        };

        const excludePattern = '**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/out/**';
        
        try {
            // Scanner les fichiers TypeScript/JavaScript
            const codeFiles = await vscode.workspace.findFiles(
                '**/*.{ts,tsx,js,jsx}',
                excludePattern,
                500
            );

            const externalPackages = new Set<string>();
            const internalModules = new Set<string>();

            for (const file of codeFiles) {
                try {
                    const content = await vscode.workspace.fs.readFile(file);
                    const text = content.toString();
                    const lines = text.split('\n');
                    const relativePath = path.relative(rootPath, file.fsPath);

                    analysis.totalLines += lines.length;

                    // Analyser chaque ligne
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        const lineNum = i + 1;

                        // Compter les classes
                        if (/\bclass\s+\w+/.test(line)) {
                            analysis.totalClasses++;
                        }

                        // Compter les fonctions
                        if (/\b(function\s+\w+|const\s+\w+\s*=\s*(async\s*)?\([^)]*\)\s*=>)/.test(line)) {
                            analysis.totalFunctions++;
                        }

                        // Compter les interfaces TypeScript
                        if (/\binterface\s+\w+/.test(line)) {
                            analysis.totalInterfaces++;
                        }

                        // Détecter les composants React
                        if (/export\s+(default\s+)?function\s+\w+.*\(.*\).*{/.test(line) ||
                            /export\s+(default\s+)?const\s+\w+\s*[:=].*React\.FC/.test(line) ||
                            /return\s*\(</.test(line)) {
                            if (!analysis.implementedFeatures.find(f => f.file === relativePath && f.type === 'component')) {
                                const match = line.match(/(?:function|const)\s+(\w+)/);
                                if (match && /^[A-Z]/.test(match[1])) {
                                    analysis.totalComponents++;
                                    analysis.implementedFeatures.push({
                                        name: match[1],
                                        type: 'component',
                                        file: relativePath,
                                        status: 'complete'
                                    });
                                }
                            }
                        }

                        // Détecter les hooks React
                        if (/\buse[A-Z]\w*\s*=\s*\(/.test(line) || /export\s+(function|const)\s+use[A-Z]/.test(line)) {
                            const match = line.match(/\b(use[A-Z]\w*)/);
                            if (match && !analysis.implementedFeatures.find(f => f.name === match[1])) {
                                analysis.totalHooks++;
                                analysis.implementedFeatures.push({
                                    name: match[1],
                                    type: 'hook',
                                    file: relativePath,
                                    status: 'complete'
                                });
                            }
                        }

                        // Détecter les endpoints API (Express, Fastify, etc.)
                        const apiMatch = line.match(/\.(get|post|put|delete|patch|all)\s*\(\s*['"](\/[^'"]*)['"]/i);
                        if (apiMatch) {
                            analysis.apiEndpoints.push({
                                method: apiMatch[1].toUpperCase() as any,
                                path: apiMatch[2],
                                file: relativePath,
                                line: lineNum
                            });
                        }

                        // Détecter les TODO/FIXME/HACK
                        const todoMatch = line.match(/\/\/\s*(TODO|FIXME|HACK|BUG):?\s*(.+)/i);
                        if (todoMatch) {
                            analysis.todos.push({
                                type: todoMatch[1].toUpperCase() as any,
                                text: todoMatch[2].trim(),
                                file: relativePath,
                                line: lineNum
                            });
                        }

                        // Analyser les imports
                        const importMatch = line.match(/import\s+.*from\s+['"]([@\w][^'"]+)['"]/);
                        if (importMatch) {
                            const pkg = importMatch[1];
                            if (pkg.startsWith('.') || pkg.startsWith('@/') || pkg.startsWith('~/')) {
                                internalModules.add(pkg);
                            } else {
                                // Extraire le nom du package (gère @scope/package)
                                const pkgName = pkg.startsWith('@') 
                                    ? pkg.split('/').slice(0, 2).join('/')
                                    : pkg.split('/')[0];
                                externalPackages.add(pkgName);
                            }
                        }
                    }

                    // Détecter les services/stores
                    if (relativePath.includes('service') || relativePath.includes('Service')) {
                        const match = path.basename(relativePath, path.extname(relativePath));
                        analysis.implementedFeatures.push({
                            name: match,
                            type: 'service',
                            file: relativePath,
                            status: 'complete'
                        });
                    }

                    if (relativePath.includes('store') || relativePath.includes('Store')) {
                        const match = path.basename(relativePath, path.extname(relativePath));
                        analysis.implementedFeatures.push({
                            name: match,
                            type: 'store',
                            file: relativePath,
                            status: 'complete'
                        });
                    }

                } catch {
                    // Fichier non lisible, ignorer
                }
            }

            analysis.imports.externalPackages = Array.from(externalPackages);
            analysis.imports.internalModules = Array.from(internalModules);

            // Calculer la complexité
            if (analysis.totalLines > 10000 || analysis.totalClasses > 50) {
                analysis.complexity = 'high';
            } else if (analysis.totalLines > 3000 || analysis.totalClasses > 20) {
                analysis.complexity = 'medium';
            }

            // Détecter les patterns
            analysis.detectedPatterns = this.detectPatterns(analysis);

        } catch (error) {
            console.error('[WorkspaceAnalyzer] Error in code analysis:', error);
        }

        return analysis;
    }

    /**
     * Détecte les patterns architecturaux utilisés
     */
    private detectPatterns(analysis: CodeAnalysis): string[] {
        const patterns: string[] = [];

        if (analysis.implementedFeatures.filter(f => f.type === 'component').length > 5) {
            patterns.push('Component-Based Architecture');
        }

        if (analysis.implementedFeatures.filter(f => f.type === 'service').length > 2) {
            patterns.push('Service Layer Pattern');
        }

        if (analysis.implementedFeatures.filter(f => f.type === 'store').length > 0) {
            patterns.push('State Management (Store)');
        }

        if (analysis.implementedFeatures.filter(f => f.type === 'hook').length > 3) {
            patterns.push('Custom Hooks Pattern');
        }

        if (analysis.apiEndpoints.length > 5) {
            patterns.push('REST API');
        }

        if (analysis.totalInterfaces > 10) {
            patterns.push('TypeScript Interfaces');
        }

        return patterns;
    }

    // ========================================
    // CALCUL DE PROGRESSION FACTUELLE DES PHASES
    // ========================================

    /**
     * Calcule la progression réelle d'une phase basée sur des critères factuels
     */
    public async calculatePhaseProgress(
        phaseName: string,
        rootPath: string,
        detectedFiles: WorkspaceAnalysis['detectedFiles'],
        packageInfo: any,
        fileStats: WorkspaceAnalysis['fileStats'],
        codeAnalysis?: CodeAnalysis
    ): Promise<PhaseProgressResult> {
        const result: PhaseProgressResult = {
            progress: 0,
            status: 'todo',
            evidence: [],
            missingItems: []
        };

        const allDeps = [...(packageInfo?.dependencies || []), ...(packageInfo?.devDependencies || [])];
        const scripts = packageInfo?.scripts || {};
        const phase = phaseName.toLowerCase();

        // ========== SETUP & CONFIGURATION ==========
        if (phase.includes('setup') || phase.includes('config') || phase.includes('initialisation')) {
            let score = 0;
            const maxScore = 100;

            // package.json existe (20 points)
            if (detectedFiles.hasPackageJson) {
                score += 20;
                result.evidence.push('✓ package.json présent');
            } else {
                result.missingItems.push('package.json manquant');
            }

            // TypeScript configuré (15 points)
            if (detectedFiles.hasTsConfig) {
                score += 15;
                result.evidence.push('✓ TypeScript configuré');
            } else {
                result.missingItems.push('Configuration TypeScript manquante');
            }

            // Scripts de build présents (15 points)
            if (scripts.build || scripts.dev || scripts.start) {
                score += 15;
                result.evidence.push('✓ Scripts de build configurés');
            } else {
                result.missingItems.push('Scripts de build manquants');
            }

            // Linting configuré (10 points)
            if (detectedFiles.hasESLint) {
                score += 10;
                result.evidence.push('✓ ESLint configuré');
            } else {
                result.missingItems.push('ESLint non configuré');
            }

            // Prettier configuré (10 points)
            if (detectedFiles.hasPrettier) {
                score += 10;
                result.evidence.push('✓ Prettier configuré');
            } else {
                result.missingItems.push('Prettier non configuré');
            }

            // Git hooks (10 points)
            if (detectedFiles.hasHusky) {
                score += 10;
                result.evidence.push('✓ Git hooks (Husky) configurés');
            }

            // .env.example existe (10 points)
            if (detectedFiles.hasEnvExample) {
                score += 10;
                result.evidence.push('✓ .env.example présent');
            }

            // README existe (10 points)
            if (detectedFiles.hasReadme) {
                score += 10;
                result.evidence.push('✓ README.md présent');
            }

            result.progress = Math.min(100, Math.round((score / maxScore) * 100));
        }

        // ========== ARCHITECTURE & STRUCTURE ==========
        else if (phase.includes('architecture') || phase.includes('structure')) {
            let score = 0;
            
            // Fichiers de code présents (30 points max)
            if (fileStats.codeFiles > 0) {
                const codeScore = Math.min(30, fileStats.codeFiles * 2);
                score += codeScore;
                result.evidence.push(`✓ ${fileStats.codeFiles} fichiers de code`);
            } else {
                result.missingItems.push('Aucun fichier de code');
            }

            // Composants détectés (20 points)
            if (codeAnalysis && codeAnalysis.totalComponents > 0) {
                score += Math.min(20, codeAnalysis.totalComponents * 4);
                result.evidence.push(`✓ ${codeAnalysis.totalComponents} composants`);
            }

            // Services/Stores (20 points)
            if (codeAnalysis) {
                const services = codeAnalysis.implementedFeatures.filter(f => f.type === 'service').length;
                const stores = codeAnalysis.implementedFeatures.filter(f => f.type === 'store').length;
                if (services + stores > 0) {
                    score += Math.min(20, (services + stores) * 5);
                    result.evidence.push(`✓ ${services} services, ${stores} stores`);
                }
            }

            // Interfaces TypeScript (15 points)
            if (codeAnalysis && codeAnalysis.totalInterfaces > 0) {
                score += Math.min(15, codeAnalysis.totalInterfaces * 2);
                result.evidence.push(`✓ ${codeAnalysis.totalInterfaces} interfaces TypeScript`);
            }

            // Structure de dossiers (15 points)
            if (fileStats.componentFiles > 0) {
                score += 15;
                result.evidence.push('✓ Structure de composants organisée');
            }

            result.progress = Math.min(100, score);
        }

        // ========== UI / DESIGN SYSTEM ==========
        else if (phase.includes('design') || phase.includes('ui') || phase.includes('interface')) {
            let score = 0;

            // Framework CSS (25 points)
            if (detectedFiles.hasTailwind) {
                score += 25;
                result.evidence.push('✓ Tailwind CSS configuré');
            } else if (allDeps.some(d => /styled-components|emotion|sass|chakra|material|antd/.test(d))) {
                score += 25;
                result.evidence.push('✓ Framework CSS détecté');
            } else {
                result.missingItems.push('Framework CSS non détecté');
            }

            // Fichiers de style (20 points max)
            if (fileStats.styleFiles > 0) {
                score += Math.min(20, fileStats.styleFiles * 2);
                result.evidence.push(`✓ ${fileStats.styleFiles} fichiers de style`);
            }

            // Composants UI (25 points max)
            if (codeAnalysis) {
                const uiComponents = codeAnalysis.implementedFeatures.filter(f => 
                    f.type === 'component' && 
                    (f.file.includes('component') || f.file.includes('ui') || f.file.includes('common'))
                ).length;
                if (uiComponents > 0) {
                    score += Math.min(25, uiComponents * 5);
                    result.evidence.push(`✓ ${uiComponents} composants UI`);
                }
            }

            // Storybook (15 points)
            if (detectedFiles.hasStorybook) {
                score += 15;
                result.evidence.push('✓ Storybook configuré');
            }

            // Icons/Assets UI (15 points)
            const uiAssets = await this.countFilesMatching(rootPath, '**/icons/**,**/ui/**/*.{svg,png}');
            if (uiAssets > 0) {
                score += 15;
                result.evidence.push(`✓ ${uiAssets} assets UI`);
            }

            result.progress = Math.min(100, score);
        }

        // ========== BACKEND / API ==========
        else if (phase.includes('backend') || phase.includes('api')) {
            let score = 0;

            // Framework backend détecté (25 points)
            if (allDeps.some(d => /express|fastify|nest|koa|hono|trpc/.test(d))) {
                score += 25;
                result.evidence.push('✓ Framework backend détecté');
            } else {
                result.missingItems.push('Framework backend non détecté');
            }

            // Endpoints API (30 points max)
            if (codeAnalysis && codeAnalysis.apiEndpoints.length > 0) {
                score += Math.min(30, codeAnalysis.apiEndpoints.length * 5);
                result.evidence.push(`✓ ${codeAnalysis.apiEndpoints.length} endpoints API`);
            } else {
                result.missingItems.push('Aucun endpoint API détecté');
            }

            // OpenAPI/Swagger (15 points)
            if (detectedFiles.hasOpenAPI) {
                score += 15;
                result.evidence.push('✓ Documentation OpenAPI présente');
            }

            // Middleware/Services (15 points)
            if (codeAnalysis) {
                const services = codeAnalysis.implementedFeatures.filter(f => f.type === 'service').length;
                if (services > 0) {
                    score += Math.min(15, services * 5);
                    result.evidence.push(`✓ ${services} services backend`);
                }
            }

            // Validation (zod, joi, yup) (15 points)
            if (allDeps.some(d => /zod|joi|yup|class-validator/.test(d))) {
                score += 15;
                result.evidence.push('✓ Validation de données configurée');
            }

            result.progress = Math.min(100, score);
        }

        // ========== BASE DE DONNÉES ==========
        else if (phase.includes('database') || phase.includes('donnée') || phase.includes('data')) {
            let score = 0;

            // ORM/DB configuré (30 points)
            if (detectedFiles.hasPrisma || allDeps.some(d => /prisma|typeorm|mongoose|sequelize|drizzle|knex/.test(d))) {
                score += 30;
                result.evidence.push('✓ ORM/DB configuré');
            } else {
                result.missingItems.push('ORM/Database non configuré');
            }

            // Schema Prisma ou modèles (30 points)
            const schemaFiles = await this.countFilesMatching(rootPath, '**/{schema.prisma,*.entity.ts,*.model.ts}');
            if (schemaFiles > 0) {
                score += 30;
                result.evidence.push(`✓ ${schemaFiles} fichiers de modèles/schema`);
            }

            // Migrations (20 points)
            const migrationFiles = await this.countFilesMatching(rootPath, '**/migrations/**,**/prisma/migrations/**');
            if (migrationFiles > 0) {
                score += 20;
                result.evidence.push(`✓ ${migrationFiles} migrations`);
            }

            // Seeds (20 points)
            const seedFiles = await this.countFilesMatching(rootPath, '**/*seed*.{ts,js},**/seeds/**');
            if (seedFiles > 0) {
                score += 20;
                result.evidence.push(`✓ ${seedFiles} fichiers de seed`);
            }

            result.progress = Math.min(100, score);
        }

        // ========== TESTS ==========
        else if (phase.includes('test') || phase.includes('qualité')) {
            let score = 0;

            // Framework de test (20 points)
            if (allDeps.some(d => /vitest|jest|mocha|cypress|playwright/.test(d))) {
                score += 20;
                result.evidence.push('✓ Framework de test configuré');
            } else {
                result.missingItems.push('Framework de test non configuré');
            }

            // Fichiers de test (40 points max)
            if (fileStats.testFiles > 0) {
                score += Math.min(40, fileStats.testFiles * 5);
                result.evidence.push(`✓ ${fileStats.testFiles} fichiers de test`);
            } else {
                result.missingItems.push('Aucun fichier de test');
            }

            // Scripts de test (20 points)
            if (scripts.test) {
                score += 20;
                result.evidence.push('✓ Script de test configuré');
            }

            // Coverage (20 points)
            const coverageExists = await this.countFilesMatching(rootPath, '**/coverage/**,**/.nyc_output/**');
            if (coverageExists > 0 || scripts['test:coverage']) {
                score += 20;
                result.evidence.push('✓ Configuration de coverage');
            }

            result.progress = Math.min(100, score);
        }

        // ========== CI/CD ==========
        else if (phase.includes('ci') || phase.includes('cd') || phase.includes('devops') || phase.includes('pipeline')) {
            let score = 0;

            // CI/CD configuré (40 points)
            if (detectedFiles.hasCICD) {
                score += 40;
                result.evidence.push('✓ Pipeline CI/CD configuré');
            } else {
                result.missingItems.push('Pipeline CI/CD non configuré');
            }

            // Docker (30 points)
            if (detectedFiles.hasDockerfile) {
                score += 30;
                result.evidence.push('✓ Dockerfile présent');
            }

            // Docker Compose (15 points)
            const hasCompose = await this.countFilesMatching(rootPath, '**/docker-compose*.yml');
            if (hasCompose > 0) {
                score += 15;
                result.evidence.push('✓ Docker Compose configuré');
            }

            // Scripts de deploy (15 points)
            if (scripts.deploy || scripts.release) {
                score += 15;
                result.evidence.push('✓ Scripts de déploiement');
            }

            result.progress = Math.min(100, score);
        }

        // ========== DOCUMENTATION ==========
        else if (phase.includes('documentation') || phase.includes('doc')) {
            let score = 0;

            // README (30 points)
            if (detectedFiles.hasReadme) {
                score += 30;
                result.evidence.push('✓ README.md présent');
            } else {
                result.missingItems.push('README.md manquant');
            }

            // CONTRIBUTING (20 points)
            if (detectedFiles.hasContributing) {
                score += 20;
                result.evidence.push('✓ CONTRIBUTING.md présent');
            }

            // LICENSE (10 points)
            if (detectedFiles.hasLicense) {
                score += 10;
                result.evidence.push('✓ LICENSE présent');
            }

            // Fichiers de documentation (20 points max)
            if (fileStats.documentationFiles > 2) {
                score += Math.min(20, fileStats.documentationFiles * 2);
                result.evidence.push(`✓ ${fileStats.documentationFiles} fichiers de doc`);
            }

            // Changesets/Changelog (20 points)
            if (detectedFiles.hasChangesets) {
                score += 20;
                result.evidence.push('✓ Changesets configuré');
            } else {
                const hasChangelog = await this.countFilesMatching(rootPath, '**/CHANGELOG.md');
                if (hasChangelog > 0) {
                    score += 15;
                    result.evidence.push('✓ CHANGELOG.md présent');
                }
            }

            result.progress = Math.min(100, score);
        }

        // ========== DÉPLOIEMENT ==========
        else if (phase.includes('deploy') || phase.includes('production') || phase.includes('release')) {
            let score = 0;

            // Configuration de déploiement (30 points)
            if (allDeps.some(d => /vercel|netlify|firebase|aws-sdk|azure/.test(d))) {
                score += 30;
                result.evidence.push('✓ Plateforme de déploiement configurée');
            } else if (detectedFiles.hasDockerfile) {
                score += 25;
                result.evidence.push('✓ Docker prêt pour déploiement');
            }

            // Build de production (30 points)
            if (scripts.build) {
                score += 30;
                result.evidence.push('✓ Script de build production');
            } else {
                result.missingItems.push('Script de build manquant');
            }

            // Variables d'environnement (20 points)
            if (detectedFiles.hasEnvExample) {
                score += 20;
                result.evidence.push('✓ Variables d\'env documentées');
            }

            // CI/CD pour deploy (20 points)
            if (detectedFiles.hasCICD) {
                score += 20;
                result.evidence.push('✓ CI/CD pour déploiement auto');
            }

            result.progress = Math.min(100, score);
        }

        // ========== PHASE GÉNÉRIQUE ==========
        else {
            // Pour les phases non reconnues, estimer à partir des fichiers
            result.progress = Math.min(50, fileStats.codeFiles);
            result.evidence.push(`${fileStats.codeFiles} fichiers de code détectés`);
        }

        // Déterminer le statut basé sur la progression
        if (result.progress >= 90) {
            result.status = 'done';
        } else if (result.progress >= 60) {
            result.status = 'review';
        } else if (result.progress >= 20) {
            result.status = 'doing';
        } else if (result.progress > 0) {
            result.status = 'todo';
        } else {
            result.status = 'backlog';
        }

        return result;
    }

    /**
     * Helper: Compte les fichiers correspondant à un pattern
     */
    private async countFilesMatching(rootPath: string, pattern: string): Promise<number> {
        try {
            const files = await vscode.workspace.findFiles(
                pattern,
                '**/node_modules/**,**/.git/**',
                100
            );
            return files.length;
        } catch {
            return 0;
        }
    }

    /**
     * Met à jour les phases avec la progression factuelle
     */
    public async updatePhasesWithFactualProgress(
        phases: WorkspaceAnalysis['suggestedPhases'],
        rootPath: string,
        detectedFiles: WorkspaceAnalysis['detectedFiles'],
        packageInfo: any,
        fileStats: WorkspaceAnalysis['fileStats']
    ): Promise<WorkspaceAnalysis['suggestedPhases']> {
        // Analyser le code une seule fois
        const codeAnalysis = await this.analyzeCodeDetailed(rootPath);

        const updatedPhases = [];

        for (const phase of phases) {
            const progressResult = await this.calculatePhaseProgress(
                phase.title,
                rootPath,
                detectedFiles,
                packageInfo,
                fileStats,
                codeAnalysis
            );

            updatedPhases.push({
                ...phase,
                status: progressResult.status,
                progress: progressResult.progress,
                evidence: progressResult.evidence,
                missingItems: progressResult.missingItems
            });
        }

        return updatedPhases;
    }
}


