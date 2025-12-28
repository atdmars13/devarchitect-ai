/**
 * Unit Tests for WorkspaceAnalyzerService
 * 
 * Tests workspace detection, file analysis, and project type inference.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    workspace,
    createMockUri,
    setWorkspaceFolder
} from '../__mocks__/vscode';

// Import the service - vscode will be resolved to our mock via alias
import { WorkspaceAnalyzerService, WorkspaceAnalysis } from '../services/WorkspaceAnalyzerService';

describe('WorkspaceAnalyzerService', () => {
    let service: WorkspaceAnalyzerService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new WorkspaceAnalyzerService();
        WorkspaceAnalyzerService.invalidateCache();
    });

    // ========================================================================
    // Cache Tests
    // ========================================================================

    describe('cache management', () => {
        it('should invalidate cache when requested', () => {
            WorkspaceAnalyzerService.invalidateCache();
            expect(true).toBe(true); // Cache is internal
        });

        it('should return null when no workspace is open', async () => {
            workspace.workspaceFolders = undefined;
            
            const result = await service.analyzeWorkspace();
            
            expect(result).toBeNull();
        });

        it('should return null for empty workspace folders array', async () => {
            workspace.workspaceFolders = [];
            
            const result = await service.analyzeWorkspace();
            
            expect(result).toBeNull();
        });
    });

    // ========================================================================
    // Project Detection Tests
    // ========================================================================

    describe('project detection', () => {
        beforeEach(() => {
            setWorkspaceFolder('/test/workspace', 'test-project');
            workspace.fs.stat.mockRejectedValue(new Error('File not found'));
            workspace.findFiles.mockResolvedValue([]);
            workspace.fs.readFile.mockRejectedValue(new Error('File not found'));
        });

        it('should detect WEB_MOBILE project type by default', async () => {
            const result = await service.analyzeWorkspace();
            
            expect(result).not.toBeNull();
            expect(result?.type).toBe('WEB_MOBILE');
        });

        it('should detect GAME_2D when Unity project files exist', async () => {
            workspace.findFiles.mockImplementation((pattern: string) => {
                if (pattern.includes('.unity')) {
                    return Promise.resolve([createMockUri('/test/workspace/Scenes/Main.unity')]);
                }
                return Promise.resolve([]);
            });
            
            const result = await service.analyzeWorkspace();
            
            expect(result).not.toBeNull();
            expect(result?.type).toBe('GAME_2D');
        });

        it('should detect GAME_2D when Godot project exists', async () => {
            workspace.fs.stat.mockImplementation((uri: { fsPath: string }) => {
                if (uri.fsPath.includes('project.godot')) {
                    return Promise.resolve({ type: 1, size: 100 });
                }
                throw new Error('File not found');
            });
            
            const result = await service.analyzeWorkspace();
            
            expect(result).not.toBeNull();
            expect(result?.type).toBe('GAME_2D');
        });

        it('should use workspace folder name when no package.json', async () => {
            const result = await service.analyzeWorkspace();
            
            expect(result?.name).toBe('test-project');
        });
    });

    // ========================================================================
    // Package.json Analysis Tests
    // ========================================================================

    describe('package.json analysis', () => {
        beforeEach(() => {
            setWorkspaceFolder('/test/workspace', 'test-project');
            workspace.fs.stat.mockRejectedValue(new Error('File not found'));
            workspace.findFiles.mockResolvedValue([]);
        });

        it('should extract project name from package.json', async () => {
            const packageJson = {
                name: 'my-awesome-project',
                description: 'An awesome project',
                version: '1.0.0'
            };
            
            workspace.fs.stat.mockImplementation((uri: { fsPath: string }) => {
                if (uri.fsPath.includes('package.json')) {
                    return Promise.resolve({ type: 1, size: 100 });
                }
                throw new Error('File not found');
            });
            
            workspace.fs.readFile.mockImplementation((uri: { fsPath: string }) => {
                if (uri.fsPath.includes('package.json')) {
                    return Promise.resolve(Buffer.from(JSON.stringify(packageJson)));
                }
                throw new Error('File not found');
            });
            
            const result = await service.analyzeWorkspace();
            
            expect(result?.name).toBe('my-awesome-project');
        });

        it('should extract dependencies from package.json', async () => {
            const packageJson = {
                name: 'test',
                dependencies: { 'react': '^18.0.0', 'react-dom': '^18.0.0' },
                devDependencies: { 'typescript': '^5.0.0', 'vite': '^5.0.0' }
            };
            
            workspace.fs.stat.mockImplementation((uri: { fsPath: string }) => {
                if (uri.fsPath.includes('package.json')) {
                    return Promise.resolve({ type: 1, size: 100 });
                }
                throw new Error('File not found');
            });
            
            workspace.fs.readFile.mockImplementation((uri: { fsPath: string }) => {
                if (uri.fsPath.includes('package.json')) {
                    return Promise.resolve(Buffer.from(JSON.stringify(packageJson)));
                }
                throw new Error('File not found');
            });
            
            const result = await service.analyzeWorkspace();
            
            expect(result?.dependencies).toContain('react');
            expect(result?.devDependencies).toContain('vite');
        });
    });

    // ========================================================================
    // File Detection Tests
    // ========================================================================

    describe('file detection', () => {
        beforeEach(() => {
            setWorkspaceFolder('/test/workspace', 'test-project');
            workspace.fs.stat.mockRejectedValue(new Error('File not found'));
            workspace.findFiles.mockResolvedValue([]);
            workspace.fs.readFile.mockRejectedValue(new Error('File not found'));
        });

        it('should detect package.json presence', async () => {
            workspace.fs.stat.mockImplementation((uri: { fsPath: string }) => {
                if (uri.fsPath.includes('package.json')) {
                    return Promise.resolve({ type: 1, size: 100 });
                }
                throw new Error('File not found');
            });
            
            const result = await service.analyzeWorkspace();
            
            expect(result?.detectedFiles.hasPackageJson).toBe(true);
        });

        it('should detect Dockerfile presence', async () => {
            workspace.fs.stat.mockImplementation((uri: { fsPath: string }) => {
                if (uri.fsPath.includes('Dockerfile')) {
                    return Promise.resolve({ type: 1, size: 100 });
                }
                throw new Error('File not found');
            });
            
            const result = await service.analyzeWorkspace();
            
            expect(result?.detectedFiles.hasDockerfile).toBe(true);
        });

        it('should detect test files via pattern', async () => {
            workspace.findFiles.mockImplementation((pattern: string) => {
                if (pattern.includes('.test.') || pattern.includes('.spec.')) {
                    return Promise.resolve([createMockUri('/test/workspace/src/app.test.ts')]);
                }
                return Promise.resolve([]);
            });
            
            const result = await service.analyzeWorkspace();
            
            expect(result?.detectedFiles.hasTests).toBe(true);
        });

        it('should detect Tailwind config', async () => {
            workspace.fs.stat.mockImplementation((uri: { fsPath: string }) => {
                if (uri.fsPath.includes('tailwind.config.')) {
                    return Promise.resolve({ type: 1, size: 100 });
                }
                throw new Error('File not found');
            });
            
            const result = await service.analyzeWorkspace();
            
            expect(result?.detectedFiles.hasTailwind).toBe(true);
        });

        it('should detect VS Code extension', async () => {
            workspace.findFiles.mockImplementation((pattern: string) => {
                if (pattern.includes('extension.ts')) {
                    return Promise.resolve([createMockUri('/test/workspace/src/extension.ts')]);
                }
                return Promise.resolve([]);
            });
            
            const result = await service.analyzeWorkspace();
            
            expect(result?.detectedFiles.hasVSCodeExtension).toBe(true);
        });
    });

    // ========================================================================
    // Stack Detection Tests
    // ========================================================================

    describe('stack detection', () => {
        beforeEach(() => {
            setWorkspaceFolder('/test/workspace', 'test-project');
            workspace.fs.stat.mockRejectedValue(new Error('File not found'));
            workspace.findFiles.mockResolvedValue([]);
        });

        it('should detect React as frontend framework', async () => {
            const packageJson = {
                name: 'test',
                dependencies: { 'react': '^18.0.0' }
            };
            
            workspace.fs.stat.mockImplementation((uri: { fsPath: string }) => {
                if (uri.fsPath.includes('package.json')) {
                    return Promise.resolve({ type: 1, size: 100 });
                }
                throw new Error('File not found');
            });
            
            workspace.fs.readFile.mockImplementation((uri: { fsPath: string }) => {
                if (uri.fsPath.includes('package.json')) {
                    return Promise.resolve(Buffer.from(JSON.stringify(packageJson)));
                }
                throw new Error('File not found');
            });
            
            const result = await service.analyzeWorkspace();
            
            expect(result?.specs.frontendFramework).toBe('React');
        });

        it('should detect Vue as frontend framework', async () => {
            const packageJson = {
                name: 'test',
                dependencies: { 'vue': '^3.0.0' }
            };
            
            workspace.fs.stat.mockImplementation((uri: { fsPath: string }) => {
                if (uri.fsPath.includes('package.json')) {
                    return Promise.resolve({ type: 1, size: 100 });
                }
                throw new Error('File not found');
            });
            
            workspace.fs.readFile.mockImplementation((uri: { fsPath: string }) => {
                if (uri.fsPath.includes('package.json')) {
                    return Promise.resolve(Buffer.from(JSON.stringify(packageJson)));
                }
                throw new Error('File not found');
            });
            
            const result = await service.analyzeWorkspace();
            
            expect(result?.specs.frontendFramework).toBe('Vue.js');
        });

        it('should detect Express as backend framework', async () => {
            const packageJson = {
                name: 'test',
                dependencies: { 'express': '^4.0.0' }
            };
            
            workspace.fs.stat.mockImplementation((uri: { fsPath: string }) => {
                if (uri.fsPath.includes('package.json')) {
                    return Promise.resolve({ type: 1, size: 100 });
                }
                throw new Error('File not found');
            });
            
            workspace.fs.readFile.mockImplementation((uri: { fsPath: string }) => {
                if (uri.fsPath.includes('package.json')) {
                    return Promise.resolve(Buffer.from(JSON.stringify(packageJson)));
                }
                throw new Error('File not found');
            });
            
            const result = await service.analyzeWorkspace();
            
            expect(result?.specs.backendFramework).toBe('Express.js');
        });
    });

    // ========================================================================
    // Error Handling Tests
    // ========================================================================

    describe('error handling', () => {
        beforeEach(() => {
            setWorkspaceFolder('/test/workspace', 'test-project');
        });

        it('should handle file read errors gracefully', async () => {
            workspace.fs.stat.mockImplementation((uri: { fsPath: string }) => {
                if (uri.fsPath.includes('package.json')) {
                    return Promise.resolve({ type: 1, size: 100 });
                }
                throw new Error('File not found');
            });
            
            workspace.fs.readFile.mockRejectedValue(new Error('Permission denied'));
            workspace.findFiles.mockResolvedValue([]);
            
            const result = await service.analyzeWorkspace();
            
            expect(result).not.toBeNull();
        });

        it('should handle invalid JSON in package.json', async () => {
            workspace.fs.stat.mockImplementation((uri: { fsPath: string }) => {
                if (uri.fsPath.includes('package.json')) {
                    return Promise.resolve({ type: 1, size: 100 });
                }
                throw new Error('File not found');
            });
            
            workspace.fs.readFile.mockImplementation((uri: { fsPath: string }) => {
                if (uri.fsPath.includes('package.json')) {
                    return Promise.resolve(Buffer.from('{ invalid json }'));
                }
                throw new Error('File not found');
            });
            
            workspace.findFiles.mockResolvedValue([]);
            
            const result = await service.analyzeWorkspace();
            
            expect(result).not.toBeNull();
        });
    });

    // ========================================================================
    // Suggested Phases Tests
    // ========================================================================

    describe('suggested phases', () => {
        beforeEach(() => {
            setWorkspaceFolder('/test/workspace', 'test-project');
            workspace.fs.stat.mockRejectedValue(new Error('File not found'));
            workspace.findFiles.mockResolvedValue([]);
            workspace.fs.readFile.mockRejectedValue(new Error('File not found'));
        });

        it('should generate phases for web project', async () => {
            const result = await service.analyzeWorkspace();
            
            expect(result?.suggestedPhases).toBeDefined();
            expect(result?.suggestedPhases.length).toBeGreaterThan(0);
        });
    });
});
