import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        // Test environment
        environment: 'node',
        
        // Include patterns
        include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
        
        // Exclude patterns
        exclude: [
            'node_modules',
            'out',
            'webview-dist',
            'media'
        ],
        
        // Coverage configuration
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            reportsDirectory: './coverage',
            include: ['src/services/**/*.ts'],
            exclude: [
                'src/__tests__/**',
                'src/__mocks__/**',
                'src/types/**',
                '**/*.d.ts'
            ],
            thresholds: {
                // Phase 1: Initial thresholds - will increase progressively
                // Target: 80% coverage
                lines: 25,
                functions: 40,
                branches: 50,
                statements: 25
            }
        },
        
        // Globals for Vitest
        globals: true,
        
        // Timeout for tests
        testTimeout: 30000,
        hookTimeout: 10000,
        
        // Reporter
        reporters: ['verbose'],
        
        // Watch mode
        watch: false,
        
        // Mock clear
        clearMocks: true,
        mockReset: true,
        restoreMocks: true,
        
        // Pool configuration
        pool: 'threads',
        poolOptions: {
            threads: {
                singleThread: true
            }
        }
    },
    
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
            'vscode': path.resolve(__dirname, 'src/__mocks__/vscode.ts')
        }
    }
});
