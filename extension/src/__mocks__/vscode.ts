/**
 * VS Code Mock Module
 * 
 * This file provides mocks for the VS Code API.
 * It's used to replace the 'vscode' module in tests.
 */

import { vi } from 'vitest';

// ============================================================================
// Mock Types
// ============================================================================

export interface MockExtensionContext {
    globalState: MockMemento;
    workspaceState: MockMemento;
    extensionPath: string;
    extensionUri: MockUri;
    subscriptions: { dispose: () => void }[];
    asAbsolutePath: (relativePath: string) => string;
}

export interface MockMemento {
    get: <T>(key: string, defaultValue?: T) => T | undefined;
    update: (key: string, value: unknown) => Promise<void>;
    keys: () => readonly string[];
    _store: Record<string, unknown>;
}

export interface MockUri {
    fsPath: string;
    scheme: string;
    authority: string;
    path: string;
    query: string;
    fragment: string;
    with: (change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }) => MockUri;
    toString: () => string;
}

// ============================================================================
// Mock Factories
// ============================================================================

export function createMockMemento(): MockMemento {
    const store: Record<string, unknown> = {};
    return {
        get: vi.fn(<T>(key: string, defaultValue?: T): T | undefined => {
            return (store[key] as T) ?? defaultValue;
        }),
        update: vi.fn((key: string, value: unknown): Promise<void> => {
            if (value === undefined) {
                delete store[key];
            } else {
                store[key] = value;
            }
            return Promise.resolve();
        }),
        keys: vi.fn(() => Object.keys(store)),
        _store: store
    };
}

export function createMockUri(path: string): MockUri {
    return {
        fsPath: path,
        scheme: 'file',
        authority: '',
        path,
        query: '',
        fragment: '',
        with: vi.fn((change) => createMockUri(change.path || path)),
        toString: vi.fn(() => `file://${path}`)
    };
}

export function createMockExtensionContext(extensionPath = '/test/extension'): MockExtensionContext {
    return {
        globalState: createMockMemento(),
        workspaceState: createMockMemento(),
        extensionPath,
        extensionUri: createMockUri(extensionPath),
        subscriptions: [],
        asAbsolutePath: vi.fn((relativePath: string) => `${extensionPath}/${relativePath}`)
    };
}

// ============================================================================
// VS Code Mock Object
// ============================================================================

const createEventEmitter = <T>() => {
    const listeners: Set<(e: T) => void> = new Set();
    return {
        event: vi.fn((listener: (e: T) => void) => {
            listeners.add(listener);
            return { dispose: () => listeners.delete(listener) };
        }),
        fire: vi.fn((data: T) => {
            listeners.forEach(listener => listener(data));
        }),
        dispose: vi.fn(() => listeners.clear())
    };
};

// Main VS Code mock object
export const Uri = {
    file: vi.fn((path: string) => createMockUri(path)),
    parse: vi.fn((value: string) => createMockUri(value)),
    joinPath: vi.fn((uri: MockUri, ...pathSegments: string[]) => 
        createMockUri(`${uri.fsPath}/${pathSegments.join('/')}`)
    )
};

export const workspace = {
    workspaceFolders: undefined as { uri: MockUri; name: string; index: number }[] | undefined,
    fs: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        stat: vi.fn(),
        readDirectory: vi.fn(),
        createDirectory: vi.fn(),
        delete: vi.fn()
    },
    findFiles: vi.fn(),
    getConfiguration: vi.fn(() => ({
        get: vi.fn(),
        has: vi.fn(),
        update: vi.fn(),
        inspect: vi.fn()
    })),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    onDidOpenTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    openTextDocument: vi.fn(),
    applyEdit: vi.fn()
};

export const window = {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        append: vi.fn(),
        clear: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn()
    })),
    createWebviewPanel: vi.fn(),
    activeTextEditor: undefined as { document: { getText: () => string; languageId: string; uri: MockUri } } | undefined,
    visibleTextEditors: [],
    onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
    withProgress: vi.fn((options: unknown, task: (progress: { report: () => void }) => unknown) => 
        task({ report: vi.fn() })
    ),
    registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() }))
};

export const commands = {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    executeCommand: vi.fn(),
    getCommands: vi.fn()
};

export const chat = {
    createChatParticipant: vi.fn(() => ({
        dispose: vi.fn(),
        requestHandler: undefined,
        iconPath: undefined
    }))
};

export const lm = {
    selectChatModels: vi.fn(),
    sendChatRequest: vi.fn()
};

// Enums
export const ViewColumn = {
    One: 1,
    Two: 2,
    Three: 3,
    Active: -1,
    Beside: -2
};

export const ProgressLocation = {
    Notification: 15,
    Window: 10,
    SourceControl: 1
};

export const StatusBarAlignment = {
    Left: 1,
    Right: 2
};

// Classes
export const EventEmitter = vi.fn(() => createEventEmitter());

export const CancellationTokenSource = vi.fn(() => ({
    token: { isCancellationRequested: false, onCancellationRequested: vi.fn() },
    cancel: vi.fn(),
    dispose: vi.fn()
}));

export const ThemeIcon = vi.fn((id: string) => ({ id }));

export const MarkdownString = vi.fn((value?: string) => ({
    value: value || '',
    isTrusted: false,
    supportHtml: false,
    appendText: vi.fn().mockReturnThis(),
    appendMarkdown: vi.fn().mockReturnThis(),
    appendCodeblock: vi.fn().mockReturnThis()
}));

// ============================================================================
// Helper Functions
// ============================================================================

export function setWorkspaceFolder(path: string, name = 'test-workspace'): void {
    workspace.workspaceFolders = [{
        uri: createMockUri(path),
        name,
        index: 0
    }];
}

export function setActiveEditor(content: string, languageId = 'typescript', path = '/test/file.ts'): void {
    window.activeTextEditor = {
        document: {
            getText: () => content,
            languageId,
            uri: createMockUri(path)
        }
    };
}

export function resetMocks(): void {
    workspace.workspaceFolders = undefined;
    window.activeTextEditor = undefined;
    vi.clearAllMocks();
}

// ============================================================================
// Sample Test Data
// ============================================================================

// Type aliases for ProjectData compatibility
type ProjectAsset = { id: string; name: string; category: string; status: string; priority: string; };
type ProjectFaq = { id: string; question: string; answer: string; category?: string; };
type ProjectVariable = { id: string; key: string; value: string; description?: string; source?: string; };

export const sampleProjectData: {
    id: string;
    name: string;
    type: 'WEB_MOBILE' | 'GAME_2D';
    status: string;
    lastUpdated: string;
    concept: string;
    roadmap: Array<{
        id: string;
        title: string;
        description: string;
        status: 'backlog' | 'todo' | 'doing' | 'review' | 'done';
        priority: string;
        progress: number;
    }>;
    assets: ProjectAsset[];
    faqs: ProjectFaq[];
    commands: Array<{ id: string; label: string; command: string; category: string }>;
    variables: ProjectVariable[];
    specs: Record<string, unknown>;
    design: Record<string, unknown>;
    mode: 'EDIT' | 'TRACKING';
} = {
    id: 'test-project-1',
    name: 'Test Project',
    type: 'WEB_MOBILE',
    status: 'PLANNING',
    lastUpdated: new Date().toISOString(),
    concept: 'A test project for unit testing',
    roadmap: [
        {
            id: 'phase-1',
            title: 'Phase 1: Setup',
            description: 'Initial project setup',
            status: 'done',
            priority: 'Haute',
            progress: 100
        },
        {
            id: 'phase-2',
            title: 'Phase 2: Development',
            description: 'Main development',
            status: 'doing',
            priority: 'Haute',
            progress: 50
        }
    ],
    assets: [],
    faqs: [],
    commands: [
        { id: 'cmd-1', label: 'Build', command: 'npm run build', category: 'Build' }
    ],
    variables: [],
    specs: {},
    design: {},
    mode: 'EDIT'
};

export const sampleWorkspaceAnalysis = {
    name: 'test-project',
    type: 'WEB_MOBILE' as const,
    concept: 'A React web application',
    elevatorPitch: 'Modern web app with React',
    targetAudience: 'Developers',
    coreFeatures: ['Authentication', 'Dashboard', 'API Integration'],
    architecture: 'React + TypeScript + Vite',
    teamMembers: [],
    testCases: [],
    validationCriteria: 'All tests pass',
    specs: {
        frontendFramework: 'React',
        targetDevices: ['Desktop', 'Mobile']
    },
    design: {
        primaryColor: '#3b82f6',
        uiTheme: 'Modern'
    },
    commands: [
        { label: 'Dev Server', command: 'npm run dev', category: 'Build' },
        { label: 'Build', command: 'npm run build', category: 'Build' },
        { label: 'Test', command: 'npm test', category: 'Test' }
    ],
    variables: [],
    assets: [],
    dependencies: ['react', 'react-dom'],
    devDependencies: ['vite', 'typescript'],
    detectedFiles: {
        hasPackageJson: true,
        hasDockerfile: false,
        hasReadme: true,
        hasTsConfig: true,
        hasUnityProject: false,
        hasGodotProject: false,
        hasPrisma: false,
        hasGraphQL: false,
        hasTailwind: true,
        hasTests: true,
        hasCICD: false,
        hasVSCodeExtension: false
    },
    suggestedPhases: [],
    fileStats: {
        totalFiles: 50,
        codeFiles: 30,
        testFiles: 10,
        componentFiles: 15
    }
};

export const sampleCodeReviewResult = {
    score: 75,
    issues: [
        {
            type: 'warning' as const,
            line: 10,
            message: 'Consider using optional chaining',
            suggestion: 'Use obj?.property instead of obj && obj.property'
        }
    ],
    strengths: ['Good type safety', 'Clear function names'],
    improvements: ['Add error handling', 'Consider memoization'],
    summary: 'Code is generally well-structured but could use some improvements.'
};

// Default export for vi.mock()
export default {
    Uri,
    workspace,
    window,
    commands,
    chat,
    lm,
    ViewColumn,
    ProgressLocation,
    StatusBarAlignment,
    EventEmitter,
    CancellationTokenSource,
    ThemeIcon,
    MarkdownString
};
