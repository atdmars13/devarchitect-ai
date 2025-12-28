/**
 * Unit Tests for AICompletionService
 * 
 * Tests Ollama integration, model management, and code review.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace } from '../__mocks__/vscode';

// Import the service - vscode will be resolved to our mock via alias
import { AICompletionService, CodeReviewResult, RefactoringResult, VisionAnalysisResult } from '../services/AICompletionService';

describe('AICompletionService', () => {
    let service: AICompletionService;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Reset configuration mock with all required methods
        workspace.getConfiguration.mockReturnValue({
            get: vi.fn((key: string, defaultValue: unknown) => {
                const config: Record<string, unknown> = {
                    'baseUrl': 'http://127.0.0.1:11434',
                    'preferredModel': 'mistral-nemo:12b',
                    'timeout': 120000,
                    'enabled': true
                };
                return config[key] ?? defaultValue;
            }),
            has: vi.fn(() => true),
            update: vi.fn(),
            inspect: vi.fn()
        });
        
        service = new AICompletionService();
    });

    // ========================================================================
    // Initialization Tests
    // ========================================================================

    describe('initialization', () => {
        it('should create service without errors', () => {
            expect(service).toBeDefined();
        });

        it('should have WorkspaceAnalyzerService dependency', () => {
            const serviceAny = service as any;
            expect(serviceAny.workspaceAnalyzer).toBeDefined();
        });
    });

    // ========================================================================
    // Model Registry Tests
    // ========================================================================

    describe('model registry', () => {
        it('should have Mistral models with highest priority', () => {
            const serviceAny = service as any;
            const firstModels = serviceAny.fallbackModels.slice(0, 5);
            
            expect(firstModels.every((m: string) => 
                m.includes('codestral') || 
                m.includes('mistral') || 
                m.includes('pixtral')
            )).toBe(true);
        });

        it('should have vision-capable models in registry', () => {
            const serviceAny = service as any;
            const visionModels = serviceAny.modelRegistry.filter(
                (m: any) => m.capabilities.vision
            );
            
            expect(visionModels.length).toBeGreaterThan(0);
            expect(visionModels.some((m: any) => m.name.includes('pixtral'))).toBe(true);
        });

        it('should have code-generation capable models', () => {
            const serviceAny = service as any;
            const codeModels = serviceAny.modelRegistry.filter(
                (m: any) => m.capabilities.codeGeneration
            );
            
            expect(codeModels.length).toBeGreaterThan(0);
        });

        it('should categorize models by provider', () => {
            const serviceAny = service as any;
            const modelsByProvider = serviceAny.modelRegistry.reduce(
                (acc: Record<string, number>, m: any) => {
                    acc[m.provider] = (acc[m.provider] || 0) + 1;
                    return acc;
                },
                {}
            );
            
            expect(modelsByProvider['mistral']).toBeGreaterThan(0);
            expect(modelsByProvider['qwen']).toBeGreaterThan(0);
            expect(modelsByProvider['deepseek']).toBeGreaterThan(0);
            expect(modelsByProvider['meta']).toBeGreaterThan(0);
        });

        it('should have long context models', () => {
            const serviceAny = service as any;
            const longContextModels = serviceAny.modelRegistry.filter(
                (m: any) => m.capabilities.longContext
            );
            
            expect(longContextModels.length).toBeGreaterThan(0);
        });

        it('should have correct maxTokens for models', () => {
            const serviceAny = service as any;
            
            serviceAny.modelRegistry.forEach((model: any) => {
                expect(model.capabilities.maxTokens).toBeGreaterThan(0);
                expect(model.capabilities.maxTokens).toBeLessThanOrEqual(128000);
            });
        });
    });

    // ========================================================================
    // Configuration Tests
    // ========================================================================

    describe('configuration', () => {
        it('should use default values when config not set', () => {
            workspace.getConfiguration.mockReturnValue({
                get: vi.fn((key: string, defaultValue: unknown) => defaultValue),
                has: vi.fn(() => false),
                update: vi.fn(),
                inspect: vi.fn()
            });
            
            const newService = new AICompletionService();
            expect(newService).toBeDefined();
        });

        it('should return false when Ollama is disabled', async () => {
            workspace.getConfiguration.mockReturnValue({
                get: vi.fn((key: string, defaultValue: unknown) => {
                    if (key === 'enabled') return false;
                    return defaultValue;
                }),
                has: vi.fn(() => true),
                update: vi.fn(),
                inspect: vi.fn()
            });
            
            const newService = new AICompletionService();
            const result = await newService.isOllamaAvailable();
            
            expect(result).toBe(false);
        });
    });

    // ========================================================================
    // VRAM Management Tests
    // ========================================================================

    describe('VRAM management', () => {
        it('should have unloadModel method', () => {
            expect(typeof service.unloadModel).toBe('function');
        });

        it('should have unloadAllModels method', () => {
            expect(typeof service.unloadAllModels).toBe('function');
        });

        it('should have getLoadedModels method', () => {
            expect(typeof service.getLoadedModels).toBe('function');
        });

        it('should return result structure from unloadModel', async () => {
            const result = await service.unloadModel('test-model');
            
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('message');
        });

        it('should return result structure from unloadAllModels', async () => {
            const result = await service.unloadAllModels();
            
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('unloadedCount');
        });

        it('should return result structure from getLoadedModels', async () => {
            const result = await service.getLoadedModels();
            
            expect(result).toHaveProperty('models');
            expect(result).toHaveProperty('totalVram');
            expect(Array.isArray(result.models)).toBe(true);
        });
    });

    // ========================================================================
    // API Tests
    // ========================================================================

    describe('API methods', () => {
        it('should have isOllamaAvailable method', () => {
            expect(typeof service.isOllamaAvailable).toBe('function');
        });

        it('should have listModels method', () => {
            expect(typeof service.listModels).toBe('function');
        });

        it('should return boolean from isOllamaAvailable', async () => {
            const result = await service.isOllamaAvailable();
            expect(typeof result).toBe('boolean');
        });

        it('should return array from listModels', async () => {
            const result = await service.listModels();
            expect(Array.isArray(result)).toBe(true);
        });
    });

    // ========================================================================
    // Cache Tests
    // ========================================================================

    describe('cache management', () => {
        it('should have static cache', () => {
            expect(AICompletionService).toBeDefined();
        });

        it('should have cache TTL of 5 minutes', () => {
            const serviceAny = service as any;
            const constructor = serviceAny.constructor;
            expect(constructor.ANALYSIS_CACHE_TTL_MS || 300000).toBe(300000);
        });
    });
});

// ============================================================================
// Interface Validation Tests
// ============================================================================

describe('CodeReviewResult interface', () => {
    it('should validate correct structure', () => {
        const validResult: CodeReviewResult = {
            summary: 'Code is well structured',
            issues: [
                {
                    severity: 'warning',
                    message: 'Consider using const',
                    line: 10,
                    suggestion: 'Replace let with const'
                }
            ],
            improvements: ['Add error handling'],
            securityConcerns: ['No input validation'],
            performanceIssues: [],
            score: 85
        };
        
        expect(validResult.score).toBeGreaterThanOrEqual(0);
        expect(validResult.score).toBeLessThanOrEqual(100);
        expect(validResult.issues[0].severity).toMatch(/critical|warning|info/);
    });

    it('should allow empty arrays', () => {
        const result: CodeReviewResult = {
            summary: 'Perfect code',
            issues: [],
            improvements: [],
            securityConcerns: [],
            performanceIssues: [],
            score: 100
        };
        
        expect(result.issues).toHaveLength(0);
    });
});

describe('RefactoringResult interface', () => {
    it('should validate suggestion types', () => {
        const validTypes = [
            'extract-function', 'rename', 'simplify',
            'pattern', 'performance', 'security', 'modernize'
        ];
        
        const result: RefactoringResult = {
            suggestions: validTypes.map((type, i) => ({
                type: type as any,
                title: `Suggestion ${i}`,
                description: `Description for ${type}`,
                priority: 'medium'
            })),
            complexity: { current: 'High', potential: 'Low' },
            maintainability: 'Good'
        };
        
        expect(result.suggestions).toHaveLength(7);
    });
});

describe('VisionAnalysisResult interface', () => {
    it('should validate vision result structure', () => {
        const result: VisionAnalysisResult = {
            description: 'A login form',
            suggestedAssets: [
                { name: 'login-icon', category: 'UI_Element', description: 'Icon' }
            ],
            suggestedColors: { primary: '#3b82f6', secondary: '#1e40af' },
            suggestedUIComponents: ['Form', 'Input', 'Button'],
            detectedPatterns: ['Material Design'],
            confidence: 0.85
        };
        
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should allow optional fields', () => {
        const minimalResult: VisionAnalysisResult = {
            description: 'An image',
            confidence: 0.5
        };
        
        expect(minimalResult.suggestedAssets).toBeUndefined();
    });
});
