/**
 * Types pour les messages échangés entre le Webview et l'Extension
 * Assure la cohérence et la sécurité des types dans la communication
 */

import { ProjectData, ProjectFaq } from '../services/ProjectService';

// ============================================
// Messages Webview → Extension
// ============================================

export interface GetProjectMessage {
    type: 'getProject';
}

export interface SaveProjectMessage {
    type: 'saveProject';
    data: ProjectData;
}

export interface GetLibraryMessage {
    type: 'getLibrary';
}

export interface SwitchProjectMessage {
    type: 'switchProject';
    projectId: string;
    data?: { projectId: string }; // Legacy format support
}

export interface DeleteProjectMessage {
    type: 'deleteProject' | 'deleteLibraryProject';
    projectId: string;
    data?: { projectId: string }; // Legacy format support
}

export interface CloseProjectMessage {
    type: 'closeProject';
}

export interface CreateProjectMessage {
    type: 'createProject' | 'createNewProject';
    name: string;
    projectType: 'WEB_MOBILE' | 'GAME_2D';
    data?: { name: string; type: 'WEB_MOBILE' | 'GAME_2D' }; // Legacy format support
}

export interface RequestCompletionMessage {
    type: 'requestCompletion';
    data?: Partial<ProjectData>;
}

export interface GetFaqsMessage {
    type: 'getFaqs';
}

export interface AddFaqToProjectMessage {
    type: 'addFaqToProject';
    faqId: string;
}

export interface AddProjectFaqMessage {
    type: 'addProjectFaq';
    question: string;
    answer: string;
    category?: string;
}

export interface DeleteProjectFaqMessage {
    type: 'deleteProjectFaq';
    faqId: string;
}

export interface ShowInfoMessage {
    type: 'showInfo';
    message: string;
}

export interface ShowErrorMessage {
    type: 'showError';
    message: string;
}

export interface OpenExternalMessage {
    type: 'openExternal';
    url: string;
}

export interface RunCommandMessage {
    type: 'runCommand';
    command: string;
}

export interface OpenDashboardMessage {
    type: 'openDashboard';
}

export interface NewProjectMessage {
    type: 'newProject';
}

export interface ImportProjectMessage {
    type: 'importProject';
}

export interface ScanAssetsMessage {
    type: 'scanAssets';
}

export interface ScanVarsMessage {
    type: 'scanVars';
}

export interface SetupGitignoreMessage {
    type: 'setupGitignore';
}

export interface FullSyncMessage {
    type: 'fullSync';
}

// Messages de gestion VRAM / Modèles IA
export interface UnloadModelMessage {
    type: 'unloadModel';
    modelName?: string;
}

export interface UnloadAllModelsMessage {
    type: 'unloadAllModels';
}

export interface GetVramStatusMessage {
    type: 'getVramStatus';
}

export interface GetAIStatusMessage {
    type: 'getAIStatus';
}

// Messages Code Review & Refactoring (IA Mistral)
export interface ReviewCodeMessage {
    type: 'reviewCode';
    code?: string;
    language?: string;
}

export interface SuggestRefactoringMessage {
    type: 'suggestRefactoring';
    code?: string;
    language?: string;
    focus?: 'performance' | 'readability' | 'security' | 'all';
}

export interface ExplainCodeMessage {
    type: 'explainCode';
    code?: string;
    language?: string;
    level?: 'beginner' | 'intermediate' | 'expert';
}

export interface GenerateTestsMessage {
    type: 'generateTests';
    code?: string;
    language?: string;
    framework?: string;
}

export interface DetectSecurityIssuesMessage {
    type: 'detectSecurityIssues';
    code?: string;
    language?: string;
}

export interface AICompleteProjectMessage {
    type: 'aiCompleteProject';
}

// Union type de tous les messages Webview → Extension
export type WebviewToExtensionMessage =
    | GetProjectMessage
    | SaveProjectMessage
    | GetLibraryMessage
    | SwitchProjectMessage
    | DeleteProjectMessage
    | CloseProjectMessage
    | CreateProjectMessage
    | RequestCompletionMessage
    | GetFaqsMessage
    | AddFaqToProjectMessage
    | AddProjectFaqMessage
    | DeleteProjectFaqMessage
    | ShowInfoMessage
    | ShowErrorMessage
    | OpenExternalMessage
    | RunCommandMessage
    | OpenDashboardMessage
    | NewProjectMessage
    | ImportProjectMessage
    | ScanAssetsMessage
    | ScanVarsMessage
    | SetupGitignoreMessage
    | FullSyncMessage
    | UnloadModelMessage
    | UnloadAllModelsMessage
    | GetVramStatusMessage
    | GetAIStatusMessage
    | ReviewCodeMessage
    | SuggestRefactoringMessage
    | ExplainCodeMessage
    | GenerateTestsMessage
    | DetectSecurityIssuesMessage
    | AICompleteProjectMessage;

// ============================================
// Messages Extension → Webview
// ============================================

export interface ProjectDataMessage {
    type: 'projectData' | 'projectUpdate';
    data: ProjectData | null;
}

export interface LibraryDataMessage {
    type: 'libraryData' | 'libraryUpdate';
    data: LibraryEntry[];
    currentProjectId?: string;
}

export interface FaqsUpdateMessage {
    type: 'faqsUpdate';
    projectFaqs: ProjectFaq[];
    devFaqs: ProjectFaq[];
}

export interface CompletionResultMessage {
    type: 'completionResult';
    data: Partial<ProjectData>;
    error?: string;
}

export interface CompletionProgressMessage {
    type: 'completionProgress';
    status: 'analyzing' | 'generating' | 'complete' | 'error';
    message?: string;
}

// Union type de tous les messages Extension → Webview
export type ExtensionToWebviewMessage =
    | ProjectDataMessage
    | LibraryDataMessage
    | FaqsUpdateMessage
    | CompletionResultMessage
    | CompletionProgressMessage;

// ============================================
// Types auxiliaires
// ============================================

export interface LibraryEntry {
    id: string;
    name: string;
    type: 'WEB_MOBILE' | 'GAME_2D';
    lastUpdated: string;
    progress?: number;
    phasesCount?: number;
}

// ============================================
// Type guards pour validation runtime
// ============================================

export function isWebviewMessage(message: unknown): message is WebviewToExtensionMessage {
    return typeof message === 'object' && message !== null && 'type' in message;
}

export function hasType(message: unknown, type: string): boolean {
    return isWebviewMessage(message) && message.type === type;
}

// ============================================
// Validation des données d'entrée
// ============================================

export interface PhaseInput {
    title: string;
    description?: string;
    status?: 'backlog' | 'todo' | 'doing' | 'review' | 'done';
    priority?: 'Basse' | 'Moyenne' | 'Haute' | 'Critique';
    progress?: number;
    estimatedHours?: number;
    isMilestone?: boolean;
}

export interface AssetInput {
    name: string;
    category?: string;
    status?: string;
    priority?: string;
    path?: string;
    notes?: string;
}

export interface CommandInput {
    label: string;
    command: string;
    category?: string;
    description?: string;
}

export interface VariableInput {
    key: string;
    value: string;
    description?: string;
    source?: string;
}

export interface FaqInput {
    question: string;
    answer: string;
    category?: string;
}

// ============================================
// Validateurs simples (sans dépendance externe)
// ============================================

export function validatePhaseInput(data: unknown): { valid: boolean; error?: string; data?: PhaseInput } {
    if (typeof data !== 'object' || data === null) {
        return { valid: false, error: 'Phase data must be an object' };
    }
    
    const obj = data as Record<string, unknown>;
    
    if (typeof obj.title !== 'string' || obj.title.trim().length === 0) {
        return { valid: false, error: 'Phase title is required and must be a non-empty string' };
    }
    
    const validStatuses = ['backlog', 'todo', 'doing', 'review', 'done'];
    if (obj.status !== undefined && !validStatuses.includes(obj.status as string)) {
        return { valid: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` };
    }
    
    const validPriorities = ['Basse', 'Moyenne', 'Haute', 'Critique'];
    if (obj.priority !== undefined && !validPriorities.includes(obj.priority as string)) {
        return { valid: false, error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` };
    }
    
    if (obj.progress !== undefined) {
        const progress = Number(obj.progress);
        if (isNaN(progress) || progress < 0 || progress > 100) {
            return { valid: false, error: 'Progress must be a number between 0 and 100' };
        }
    }
    
    return {
        valid: true,
        data: {
            title: obj.title as string,
            description: typeof obj.description === 'string' ? obj.description : undefined,
            status: obj.status as PhaseInput['status'],
            priority: obj.priority as PhaseInput['priority'],
            progress: obj.progress !== undefined ? Number(obj.progress) : undefined,
            estimatedHours: typeof obj.estimatedHours === 'number' ? obj.estimatedHours : undefined,
            isMilestone: typeof obj.isMilestone === 'boolean' ? obj.isMilestone : undefined
        }
    };
}

export function validateAssetInput(data: unknown): { valid: boolean; error?: string; data?: AssetInput } {
    if (typeof data !== 'object' || data === null) {
        return { valid: false, error: 'Asset data must be an object' };
    }
    
    const obj = data as Record<string, unknown>;
    
    if (typeof obj.name !== 'string' || obj.name.trim().length === 0) {
        return { valid: false, error: 'Asset name is required and must be a non-empty string' };
    }
    
    return {
        valid: true,
        data: {
            name: obj.name as string,
            category: typeof obj.category === 'string' ? obj.category : undefined,
            status: typeof obj.status === 'string' ? obj.status : undefined,
            priority: typeof obj.priority === 'string' ? obj.priority : undefined,
            path: typeof obj.path === 'string' ? obj.path : undefined,
            notes: typeof obj.notes === 'string' ? obj.notes : undefined
        }
    };
}

export function validateCommandInput(data: unknown): { valid: boolean; error?: string; data?: CommandInput } {
    if (typeof data !== 'object' || data === null) {
        return { valid: false, error: 'Command data must be an object' };
    }
    
    const obj = data as Record<string, unknown>;
    
    if (typeof obj.label !== 'string' || obj.label.trim().length === 0) {
        return { valid: false, error: 'Command label is required' };
    }
    
    if (typeof obj.command !== 'string' || obj.command.trim().length === 0) {
        return { valid: false, error: 'Command string is required' };
    }
    
    return {
        valid: true,
        data: {
            label: obj.label as string,
            command: obj.command as string,
            category: typeof obj.category === 'string' ? obj.category : 'Other',
            description: typeof obj.description === 'string' ? obj.description : undefined
        }
    };
}

export function validateVariableInput(data: unknown): { valid: boolean; error?: string; data?: VariableInput } {
    if (typeof data !== 'object' || data === null) {
        return { valid: false, error: 'Variable data must be an object' };
    }
    
    const obj = data as Record<string, unknown>;
    
    if (typeof obj.key !== 'string' || obj.key.trim().length === 0) {
        return { valid: false, error: 'Variable key is required' };
    }
    
    return {
        valid: true,
        data: {
            key: obj.key as string,
            value: typeof obj.value === 'string' ? obj.value : '',
            description: typeof obj.description === 'string' ? obj.description : undefined,
            source: typeof obj.source === 'string' ? obj.source : undefined
        }
    };
}

export function validateFaqInput(data: unknown): { valid: boolean; error?: string; data?: FaqInput } {
    if (typeof data !== 'object' || data === null) {
        return { valid: false, error: 'FAQ data must be an object' };
    }
    
    const obj = data as Record<string, unknown>;
    
    if (typeof obj.question !== 'string' || obj.question.trim().length === 0) {
        return { valid: false, error: 'FAQ question is required' };
    }
    
    if (typeof obj.answer !== 'string' || obj.answer.trim().length === 0) {
        return { valid: false, error: 'FAQ answer is required' };
    }
    
    return {
        valid: true,
        data: {
            question: obj.question as string,
            answer: obj.answer as string,
            category: typeof obj.category === 'string' ? obj.category : undefined
        }
    };
}
