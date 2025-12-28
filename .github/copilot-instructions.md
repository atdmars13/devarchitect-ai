# DevArchitect AI - Instructions pour l'extension VS Code

## Vue d'ensemble

DevArchitect AI est un outil de planification et suivi de projets intégré à VS Code avec **IA locale Mistral** via Ollama.
L'extension fournit des commandes VS Code pour gérer les projets et interagir avec l'IA locale.

**Modèle recommandé pour RTX 5070 Ti (16 GB):** `mistral-nemo:12b` (~8 GB VRAM, laisse ~8 GB libre)

## Commandes de Gestion VRAM / IA Mistral

```typescript
// Vérifier le statut de l'IA locale
await vscode.commands.executeCommand('devarchitect.checkAIStatus');

// Lister les modèles disponibles
await vscode.commands.executeCommand('devarchitect.getAvailableModels');

// Décharger le modèle actuel de la VRAM
await vscode.commands.executeCommand('devarchitect.unloadModel');

// Décharger tous les modèles (libérer toute la VRAM)
await vscode.commands.executeCommand('devarchitect.unloadAllModels');

// Voir l'utilisation VRAM actuelle
await vscode.commands.executeCommand('devarchitect.getVramStatus');

// Complétion IA du projet (remplir les champs manquants)
await vscode.commands.executeCommand('devarchitect.aiComplete');

// Analyser une image/maquette avec vision IA
await vscode.commands.executeCommand('devarchitect.analyzeImage');
```

## Commandes Code Review & Refactoring

```typescript
// Revue de code complète (score, issues, suggestions)
await vscode.commands.executeCommand('devarchitect.reviewCode', code?, language?, context?);

// Suggestions de refactoring
await vscode.commands.executeCommand('devarchitect.suggestRefactoring', code?, language?, focus?);
// focus: 'performance' | 'readability' | 'security' | 'all'

// Expliquer le code sélectionné
await vscode.commands.executeCommand('devarchitect.explainCode', code?, language?, level?);
// level: 'beginner' | 'intermediate' | 'expert'

// Générer des tests unitaires
await vscode.commands.executeCommand('devarchitect.generateTests', code?, language?, framework?);
// framework: 'vitest', 'jest', 'mocha', etc.

// Détecter les failles de sécurité
await vscode.commands.executeCommand('devarchitect.detectSecurityIssues', code?, language?);
```

## Commandes de Projet

### Informations sur le projet

```typescript
// Obtenir le résumé du projet
await vscode.commands.executeCommand('devarchitect.getProjectSummary');

// Obtenir toutes les données du projet
await vscode.commands.executeCommand('devarchitect.getProjectData');

// Lister les phases de la roadmap
await vscode.commands.executeCommand('devarchitect.getPhases');

// Lister les assets
await vscode.commands.executeCommand('devarchitect.getAssets');
```

### Édition du projet

```typescript
// Mettre à jour un champ du projet (name, concept, targetAudience, etc.)
await vscode.commands.executeCommand('devarchitect.updateField', 'concept', 'Nouvelle description du concept');
await vscode.commands.executeCommand('devarchitect.updateField', 'name', 'Mon Nouveau Projet');
await vscode.commands.executeCommand('devarchitect.updateField', 'targetAudience', 'Développeurs et designers');

// Mise à jour globale de plusieurs champs
await vscode.commands.executeCommand('devarchitect.bulkUpdate', {
  concept: 'Nouveau concept',
  targetAudience: 'Public cible',
  elevatorPitch: 'Pitch en une phrase'
});
```

### Gestion des Phases (Roadmap)

```typescript
// Ajouter une nouvelle phase
await vscode.commands.executeCommand('devarchitect.addPhase', {
  title: 'Développement Backend',
  description: 'Créer l\'API REST et la base de données',
  status: 'todo',        // backlog, todo, doing, review, done
  priority: 'Haute',     // Basse, Moyenne, Haute, Critique
  progress: 0,           // 0-100
  estimatedHours: 40,
  isMilestone: false
});

// Mettre à jour une phase existante (par ID)
await vscode.commands.executeCommand('devarchitect.updatePhase', 'phase-id-123', {
  progress: 50,
  status: 'doing',
  description: 'Mise à jour de la description'
});

// Définir la progression (par ID ou nom de phase)
await vscode.commands.executeCommand('devarchitect.setPhaseProgress', 'Backend', 75);
await vscode.commands.executeCommand('devarchitect.setPhaseProgress', 'phase-id-123', 100);

// Définir le statut
await vscode.commands.executeCommand('devarchitect.setPhaseStatus', 'Backend', 'done');

// Supprimer une phase
await vscode.commands.executeCommand('devarchitect.deletePhase', 'phase-id-123');
```

### Gestion des Assets

```typescript
// Ajouter un asset
await vscode.commands.executeCommand('devarchitect.addAsset', {
  name: 'Logo Principal',
  category: 'UI_Element',  // Sprite, Background, Audio_SFX, Audio_Music, UI_Element, Script, Mockup, Wireframe, etc.
  status: 'Concept',       // Concept, Brouillon, Polissage, QA Testing, Approuvé, Final, Implémenté, Obsolète
  priority: 'Haute',
  notes: 'Version vectorielle nécessaire'
});
```

### Gestion des Commandes (Dev Tools)

```typescript
// Ajouter une commande utile
await vscode.commands.executeCommand('devarchitect.addCommand', {
  label: 'Build Production',
  command: 'npm run build:prod',
  category: 'Build'  // Build, Git, Deploy, Test, Other
});
```

### Gestion des Variables d'environnement

```typescript
// Ajouter une variable
await vscode.commands.executeCommand('devarchitect.addVariable', 'API_URL', 'https://api.example.com');
await vscode.commands.executeCommand('devarchitect.addVariable', 'DATABASE_URL', 'postgresql://...');
```

### Gestion des FAQs

```typescript
// Ajouter une FAQ
await vscode.commands.executeCommand('devarchitect.addFaq', {
  question: 'Comment déployer en production ?',
  answer: 'Utiliser la commande npm run deploy après avoir configuré les variables.',
  category: 'Déploiement'
});
```

## Configuration Ollama recommandée

Dans les paramètres VS Code (`settings.json`) :

```json
{
  "devarchitect.ollama.preferredModel": "mistral-nemo:12b",
  "devarchitect.ollama.baseUrl": "http://127.0.0.1:11434",
  "devarchitect.ollama.timeout": 120000,
  "devarchitect.ollama.enabled": true,
  "devarchitect.ai.enableVision": true,
  "devarchitect.ai.visionModel": "llama3.2-vision:11b"
}
```

## Modèles Mistral AI recommandés

| Modèle | VRAM | Usage |
|--------|------|-------|
| `mistral-nemo:12b` | ~8 GB | ⭐ Recommandé - Équilibré |
| `ministral:8b` | ~5 GB | Rapide et léger |
| `mistral:7b` | ~4 GB | Ultra léger |
| `llama3.2-vision:11b` | ~8 GB | Vision + Multimodal |
| `minicpm-v` | ~6 GB | Vision léger |

## Structure du Projet DevArchitect

```typescript
interface ProjectData {
  id: string;
  name: string;
  type: 'WEB_MOBILE' | 'GAME_2D';
  status: string;
  lastUpdated: string;
  concept: string;
  elevatorPitch: string;
  targetAudience: string;
  history: string;
  budget: string;
  targetLaunchDate: string;
  monetizationModel: string;
  competitors: string[];
  coreFeatures: string[];
  teamMembers: string[];
  roadmap: DevBlock[];
  assets: ProjectAsset[];
  commands: ProjectCommand[];
  variables: ProjectVariable[];
  faqs: ProjectFaq[];
  specs: TechnicalSpecs;
  design: DesignSpecs;
  architecture: string;
  gameMechanics: string;      // Pour GAME_2D
  validationCriteria: string;
  testCases: string[];
  mode: 'EDIT' | 'TRACKING';
}
```

## Bonnes pratiques

1. **Toujours vérifier l'état actuel** avant de faire des modifications :
   ```typescript
   const project = await vscode.commands.executeCommand('devarchitect.getProjectData');
   ```

2. **Libérer la VRAM après utilisation** :
   ```typescript
   // Après une session de travail intensive avec l'IA
   await vscode.commands.executeCommand('devarchitect.unloadAllModels');
   ```

3. **Utiliser bulkUpdate pour plusieurs modifications** :
   ```typescript
   await vscode.commands.executeCommand('devarchitect.bulkUpdate', {
     concept: '...',
     targetAudience: '...',
     elevatorPitch: '...'
   });
   ```

4. **Les phases peuvent être identifiées par ID ou par titre** :
   ```typescript
   await vscode.commands.executeCommand('devarchitect.setPhaseProgress', 'Design UI', 100);
   ```

5. **Le projet est automatiquement sauvegardé** après chaque modification.

## Notes

- L'UI de DevArchitect se met à jour automatiquement après chaque modification
- Les modifications sont persistées dans le stockage global de VS Code
- Le projet peut être exporté/importé en JSON
- **Important:** Utilisez le bouton "🧠 IA Mistral" dans le sidebar pour libérer la VRAM quand l'IA n'est plus nécessaire
