import * as vscode from 'vscode';
import * as path from 'path';

export interface FileNode {
    path: string;       // Relative path
    absPath: string;    // Absolute path
    imports: string[];  // List of paths imported by this file
    importedBy: string[]; // List of paths that import this file
    type: 'source' | 'test' | 'config' | 'style' | 'asset' | 'other';
}

export class DependencyGraphService {
    private graph: Map<string, FileNode> = new Map();
    public workspaceRoot: string = '';
    private tsConfigAliases: Record<string, string[]> = {};

    constructor() {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
    }

    /**
     * Construit le graphe de dépendance complet du workspace
     */
    public async buildGraph(): Promise<void> {
        this.graph.clear();
        await this.loadTsConfig();

        // Scan all relevant files
        const files = await vscode.workspace.findFiles(
            '**/*.{ts,tsx,js,jsx,vue,svelte,css,scss,less}',
            '**/node_modules/**,**/dist/**,**/build/**,**/.git/**'
        );

        // First pass: Create nodes
        for (const file of files) {
            const relativePath = vscode.workspace.asRelativePath(file);
            this.graph.set(relativePath, {
                path: relativePath,
                absPath: file.fsPath,
                imports: [],
                importedBy: [],
                type: this.determineFileType(relativePath)
            });
        }

        // Second pass: Parse imports and link nodes
        for (const [relPath, node] of this.graph.entries()) {
            await this.parseImports(node);
        }

        console.log(`[DependencyGraph] Built graph with ${this.graph.size} nodes`);
    }

    /**
     * Charge les alias depuis tsconfig.json
     */
    private async loadTsConfig(): Promise<void> {
        try {
            const tsconfigs = await vscode.workspace.findFiles('tsconfig.json', '**/node_modules/**', 1);
            if (tsconfigs.length > 0) {
                const doc = await vscode.workspace.openTextDocument(tsconfigs[0]);
                const content = JSON.parse(doc.getText()); // Note: JSON.parse might fail with comments

                if (content.compilerOptions && content.compilerOptions.paths) {
                    this.tsConfigAliases = content.compilerOptions.paths;
                }
            }
        } catch (e) {
            console.warn('[DependencyGraph] Failed to load tsconfig aliases', e);
        }
    }

    /**
     * Parse les imports d'un fichier et met à jour le graphe
     */
    private async parseImports(node: FileNode): Promise<void> {
        try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(node.absPath));
            const content = doc.getText();

            // Regex pour capturer les imports (static et dynamic)
            const importRegex = /(?:import\s+(?:[\w*\s{},]*\s+from\s+)?|require\s*\(\s*)['"]([^'"]+)['"]/g;
            const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
            const cssImportRegex = /@import\s+['"]([^'"]+)['"]/g;

            const extract = (regex: RegExp) => {
                let match;
                while ((match = regex.exec(content)) !== null) {
                    const importPath = match[1];
                    this.resolveImport(node, importPath);
                }
            };

            extract(importRegex);
            extract(dynamicImportRegex);
            extract(cssImportRegex);

        } catch (error) {
            // Ignore errors for unreadable files
        }
    }

    /**
     * Résout un chemin d'import vers un nœud du graphe
     */
    private resolveImport(sourceNode: FileNode, importPath: string): void {
        // Ignorer les modules externes (node_modules)
        if (!importPath.startsWith('.') && !importPath.startsWith('/') && !Object.keys(this.tsConfigAliases).some(alias => importPath.startsWith(alias.replace('/*', '')))) {
            return;
        }

        let resolvedPath: string | null = null;

        // 1. Handle TSConfig Aliases (e.g., "@/components/...")
        for (const [alias, paths] of Object.entries(this.tsConfigAliases)) {
            const aliasPrefix = alias.replace('/*', '');
            if (importPath.startsWith(aliasPrefix)) {
                // Try to resolve using the alias paths
                for (const targetPath of paths) {
                    const cleanTarget = targetPath.replace('/*', '');
                    const potentialRelPath = importPath.replace(aliasPrefix, cleanTarget);
                    resolvedPath = this.findFile(potentialRelPath);
                    if (resolvedPath) break;
                }
            }
            if (resolvedPath) break;
        }

        // 2. Handle Relative Paths
        if (!resolvedPath) {
            if (importPath.startsWith('.')) {
                const sourceDir = path.dirname(sourceNode.path);
                const absoluteTarget = path.join(this.workspaceRoot, sourceDir, importPath);
                const potentialRelPath = path.relative(this.workspaceRoot, absoluteTarget).replace(/\\/g, '/');
                resolvedPath = this.findFile(potentialRelPath);
            }
        }

        // 3. Link nodes if resolved
        if (resolvedPath && this.graph.has(resolvedPath)) {
            sourceNode.imports.push(resolvedPath);
            const targetNode = this.graph.get(resolvedPath);
            targetNode?.importedBy.push(sourceNode.path);
        }
    }

    /**
     * Tente de trouver un fichier existant avec extensions courantes
     */
    private findFile(basePath: string): string | null {
        const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.css', '.scss', '/index.ts', '/index.js'];

        // Normaliser le chemin
        if (basePath.startsWith('./')) basePath = basePath.substring(2);

        for (const ext of extensions) {
            const pathWithExt = basePath + ext;
            if (this.graph.has(pathWithExt)) {
                return pathWithExt;
            }
        }
        return null;
    }

    private determineFileType(filePath: string): FileNode['type'] {
        if (filePath.includes('.test.') || filePath.includes('.spec.') || filePath.includes('__tests__')) return 'test';
        if (filePath.endsWith('.config.js') || filePath.endsWith('.config.ts') || filePath.endsWith('.json')) return 'config';
        if (filePath.endsWith('.css') || filePath.endsWith('.scss') || filePath.endsWith('.less')) return 'style';
        if (/\.(png|jpg|jpeg|gif|svg)$/.test(filePath)) return 'asset';
        if (/\.(ts|tsx|js|jsx|vue|svelte)$/.test(filePath)) return 'source';
        return 'other';
    }

    /**
     * Retourne les dépendances directes d'un fichier
     */
    public getDependencies(filePath: string): string[] {
        return this.graph.get(filePath)?.imports || [];
    }

    /**
     * Retourne les fichiers qui dépendent de celui-ci (Reverse dependencies)
     */
    public getDependents(filePath: string): string[] {
        return this.graph.get(filePath)?.importedBy || [];
    }

    /**
     * Récupère un "cluster" de fichiers liés (dépendances + dépendants proches)
     * Utile pour donner du contexte à l'IA
     */
    public getCluster(filePath: string, depth: number = 1): string[] {
        const cluster = new Set<string>();
        const queue: { path: string; d: number }[] = [{ path: filePath, d: 0 }];

        while (queue.length > 0) {
            const { path, d } = queue.shift()!;
            if (cluster.has(path)) continue;
            cluster.add(path);

            if (d < depth) {
                const node = this.graph.get(path);
                if (node) {
                    node.imports.forEach(p => queue.push({ path: p, d: d + 1 }));
                    node.importedBy.forEach(p => queue.push({ path: p, d: d + 1 }));
                }
            }
        }

        return Array.from(cluster);
    }

    /**
     * Trouve les fichiers correspondant à un pattern/mot-clé
     * Utile pour trouver "AuthService" ou "LoginComponent"
     */
    public findFilesByKeyword(keyword: string): string[] {
        const results: string[] = [];
        const lowerKeyword = keyword.toLowerCase();

        for (const [path, _] of this.graph.entries()) {
            if (path.toLowerCase().includes(lowerKeyword)) {
                results.push(path);
            }
        }
        return results;
    }
}
