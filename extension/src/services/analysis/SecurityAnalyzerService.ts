import * as vscode from 'vscode';
import { DependencyGraphService } from './DependencyGraphService';
import { AIClientService } from '../ai/AIClientService';

export interface SecurityIssue {
    severity: 'critical' | 'high' | 'medium' | 'low';
    type: string;
    file: string;
    line?: number;
    description: string;
    recommendation: string;
}

export class SecurityAnalyzerService {
    private graphService: DependencyGraphService;
    private aiClient: AIClientService;

    constructor(graphService: DependencyGraphService) {
        this.graphService = graphService;
        this.aiClient = AIClientService.getInstance();
    }

    /**
     * Effectue un audit ciblé en utilisant le graphe de dépendance
     */
    public async performDeepAudit(): Promise<SecurityIssue[]> {
        await this.graphService.buildGraph();

        // 1. Identify High-Risk Clusters
        const riskFiles = this.identifyRiskHotspots();
        if (riskFiles.length === 0) return [];

        const issues: SecurityIssue[] = [];

        // 2. Audit each high-risk file with context
        // Batching could be added here for performance
        for (const file of riskFiles.slice(0, 10)) { // Limit to top 10 riskiest for now
            const fileIssues = await this.auditFileWithContext(file);
            issues.push(...fileIssues);
        }

        return issues;
    }

    /**
     * Identifie les fichiers sensibles (API, Auth, DB)
     */
    private identifyRiskHotspots(): string[] {
        const keywords = ['auth', 'login', 'security', 'api', 'db', 'database', 'sql', 'query', 'secret', 'token', 'admin'];
        const hotspots = new Set<string>();

        // Find files matching keywords
        for (const kw of keywords) {
            this.graphService.findFilesByKeyword(kw).forEach(f => hotspots.add(f));
        }

        // Add files that import 'crypto', 'jsonwebtoken', etc. (Needs reverse lookup enhancement in GraphService really, but keyword is ok for now)
        // TODO: Enhance GraphService to allow "getDependents of 'jsonwebtoken'"

        return Array.from(hotspots);
    }

    private async auditFileWithContext(file: string): Promise<SecurityIssue[]> {
        try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(this.graphService['workspaceRoot'] + '/' + file)); // Hacky root access
            const code = doc.getText();

            // Get dependencies to see where data comes from (simple context)
            const deps = this.graphService.getDependencies(file);
            const context = `Imports: ${deps.join(', ')}`;

            const prompt = `Tu es un expert en sécurité (OWASP).
Analyse ce fichier critique pour détecter des vulnérabilités (Injection, XSS, Auth bypass, Secrets hardcodés).

FICHIER: ${file}
CONTEXTE: ${context}

CODE:
\`\`\`
${code.slice(0, 3000)}
\`\`\`

Réponds uniquement avec ce JSON:
[
  {
    "severity": "critical" | "high" | "medium" | "low",
    "type": "Type de faille",
    "line": number,
    "description": "Explication courte",
    "recommendation": "Fix proposé"
  }
]
Si aucune faille, renvoie []`;

            const model = await this.aiClient.selectBestModel();
            if (!model) return [];

            const response = await this.aiClient.generate(prompt, model, { temperature: 0.2 });

            const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
            const rawIssues = JSON.parse(cleanJson);

            return rawIssues.map((i: any) => ({
                ...i,
                file: file
            }));

        } catch (e) {
            console.error(`Security audit failed for ${file}`, e);
            return [];
        }
    }
}
