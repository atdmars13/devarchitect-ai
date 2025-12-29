import * as vscode from 'vscode';
import { DependencyGraphService } from '../analysis/DependencyGraphService';
import { AIClientService } from '../ai/AIClientService';
import { ProjectService } from '../ProjectService';

export interface PhaseVerificationResult {
    phaseId: string;
    progress: number; // 0-100
    status: 'todo' | 'doing' | 'review' | 'done';
    evidence: string[]; // List of reasons/files found
    missing: string[]; // List of missing requirements
}

export class ProjectProgressService {
    private graphService: DependencyGraphService;
    private aiClient: AIClientService;
    private projectService: ProjectService;

    constructor(
        graphService: DependencyGraphService,
        projectService: ProjectService
    ) {
        this.graphService = graphService;
        this.projectService = projectService;
        this.aiClient = AIClientService.getInstance();
    }

    /**
     * Analyse la progression réelle des phases du projet
     */
    public async analyzeProgress(): Promise<PhaseVerificationResult[]> {
        // 1. Ensure graph is built
        await this.graphService.buildGraph();

        const project = this.projectService.getCurrentProject();
        if (!project || !project.roadmap) return [];

        const results: PhaseVerificationResult[] = [];

        // 2. Analyze each phase
        for (const phase of project.roadmap) {
            const result = await this.verifyPhase(phase);
            results.push(result);
        }

        return results;
    }

    /**
     * Vérifie une phase spécifique en utilisant l'IA et le Graphe
     */
    private async verifyPhase(phase: any): Promise<PhaseVerificationResult> {
        // 1. Identify relevant files using keywords from title/description
        const keywords = this.extractKeywords(phase.title + ' ' + phase.description);
        let relevantFiles = new Set<string>();

        for (const kw of keywords) {
            const files = this.graphService.findFilesByKeyword(kw);
            files.forEach(f => relevantFiles.add(f));
        }

        // If no files found, verify if it's a setup/config phase
        if (relevantFiles.size === 0) {
            if (keywords.some(k => ['setup', 'init', 'config', 'ci', 'cd', 'docker'].includes(k))) {
                const configFiles = await vscode.workspace.findFiles('{package.json,tsconfig.json,Dockerfile,docker-compose.yml,.github/**/*}');
                configFiles.forEach(f => relevantFiles.add(vscode.workspace.asRelativePath(f)));
            }
        }

        const evidenceFiles = Array.from(relevantFiles).slice(0, 10); // Limit context

        // 2. If no files, it's likely TODO
        if (evidenceFiles.length === 0) {
            return {
                phaseId: phase.id,
                progress: 0,
                status: 'todo',
                evidence: [],
                missing: ['Aucun fichier correspondant trouvé']
            };
        }

        // 3. Read file contents for context
        let codeContext = '';
        for (const file of evidenceFiles) {
            try {
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(this.graphService['workspaceRoot'] + '/' + file)); // Hacky access to root
                codeContext += `\n--- ${file} ---\n${doc.getText().slice(0, 1000)}\n`; // Limit size
            } catch {}
        }

        // 4. Ask LLM to verify
        const prompt = `Tu es un auditeur de projet expert.
Analyse la phase suivante et les extraits de code associés pour déterminer l'avancement RÉEL.

PHASE: "${phase.title}"
DESCRIPTION: "${phase.description}"

CODE ASSOCIÉ (Extraits):
${codeContext}

Réponds uniquement avec ce JSON:
{
  "progress": number, // 0-100
  "status": "todo" | "doing" | "review" | "done",
  "evidence": ["Preuve 1", "Preuve 2"],
  "missing": ["Manque 1", "Manque 2"]
}`;

        try {
            const model = await this.aiClient.selectBestModel();
            if (!model) throw new Error("No model");

            const response = await this.aiClient.generate(prompt, model, { temperature: 0.1 });

            // Parse JSON (robustly)
            const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
            const result = JSON.parse(cleanJson);

            return {
                phaseId: phase.id,
                ...result
            };

        } catch (e) {
            console.error("AI Verification failed", e);
            // Fallback: Estimate based on file existence
            return {
                phaseId: phase.id,
                progress: 10, // Started
                status: 'doing',
                evidence: [`Fichiers détectés: ${evidenceFiles.join(', ')}`],
                missing: ['Vérification IA échouée']
            };
        }
    }

    private extractKeywords(text: string): string[] {
        return text.split(/\s+/)
            .map(w => w.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())
            .filter(w => w.length > 3 && !['with', 'from', 'that', 'this', 'pour', 'avec'].includes(w));
    }
}
