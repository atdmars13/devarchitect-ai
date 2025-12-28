# Changelog - Extension VS Code

## [0.4.0] - 2025-12-27

### 🧠 Intégration IA Locale Mistral

- **Modèle recommandé** : `mistral-nemo:12b` (~8 GB VRAM) pour RTX 5070 Ti
- **Modèles Vision** : `llama3.2-vision:11b` et `minicpm-v` pour l'analyse d'images
- **Gestion VRAM** : Déchargement des modèles pour libérer la mémoire GPU

### 🔍 Nouvelles Fonctionnalités Code Review

- `devarchitect.reviewCode` - Revue de code avec score qualité (0-100)
- `devarchitect.suggestRefactoring` - Suggestions de refactoring ciblées
- `devarchitect.explainCode` - Explication pédagogique (débutant/intermédiaire/expert)
- `devarchitect.generateTests` - Génération de tests unitaires (Vitest, Jest, Mocha)
- `devarchitect.detectSecurityIssues` - Détection des vulnérabilités de sécurité

### 📱 Panel IA Mistral (Sidebar)

- Bouton **"🧠 IA Mistral"** ouvre un panneau complet avec :
  - ✨ Compléter Projet (IA)
  - 🔍 Review Code
  - 🔧 Refactor
  - 📖 Expliquer
  - 🧪 Générer Tests
  - 🔐 Analyse Sécurité
  - ⚡ Libérer VRAM

### 🔄 Synchronisation Complète Améliorée

- Appelle automatiquement l'IA Mistral pour compléter les champs vides
- Affiche 🧠 si l'IA a été utilisée

### 💬 Nouvelles Commandes Chat Copilot

- `/review` - Revue de code avec analyse qualité/sécurité/performance
- `/refactor` - Suggestions de refactoring
- `/explain` - Explication détaillée du code
- `/security` - Détection des vulnérabilités
- `/tests` - Génération de tests unitaires

### 🛠️ Améliorations Techniques

- Remplacement de Pixtral (non disponible) par `llama3.2-vision:11b`
- Ajout de `minicpm-v` comme alternative vision légère
- Types de messages étendus pour les actions IA
- Handlers de résultats IA dans le webview

---

## [0.3.1] - 2025-12-12

### Nouvelles Fonctionnalités

- **Types WebView ↔ Extension** (`types/messages.ts`)
  - 20+ types de messages typés
  - Validators : `validatePhaseInput`, `validateAssetInput`, `validateCommandInput`, `validateVariableInput`, `validateFaqInput`
  - Interfaces TypeScript complètes

- **FAQ Base de Données Externe** (`media/faq-database.json`)
  - 200 FAQs externalisées en JSON
  - Chargement lazy-load
  - Réduit l'empreinte mémoire

- **Configuration Ollama Dynamique**
  - Settings : `baseUrl`, `preferredModel`, `timeout`, `enabled`
  - AICompletionService lit la config VS Code en temps réel

- **Nouvelles Commandes Chat Participant**
  - `/analyze` - Analyser le workspace
  - `/plan` - Voir le planning
  - `/add` - Ajouter phase/asset/commande
  - `/sync` - Synchronisation complète
  - `/status` - État du projet
  - `/metrics` - Métriques détaillées
  - `/health` - Santé des dépendances
  - `/structure` - Structure du code

### Améliorations

- Validation des entrées dans toutes les commandes Copilot
- 0 erreur lint
- package.json : repository + license ajoutés

---

## [0.3.0] - 2025-12-08

### Nouvelles Commandes

- `devarchitect.fullSync` - Synchronisation complète du projet depuis le workspace

### Améliorations

#### WorkspaceAnalyzerService
- Nouvelle analyse des fonctionnalités principales (`coreFeatures`)
- Génération automatique de l'architecture
- Génération des cas de test
- Génération des critères de validation
- Détection du design (palette, fonts, framework CSS)
- Statistiques des fichiers
- Détection étendue : Prisma, GraphQL, Tailwind, Tests, CI/CD

#### CopilotAgentService
- Nouvelle commande `fullSync` pour mise à jour complète
- Mise à jour de tous les champs : nom, type, concept, pitch, audience, features, architecture, specs, design, équipe, commandes, variables, assets, roadmap

#### SidebarProvider
- Nouveau bouton "🔄 Synchronisation Complète"
- Style gradient violet/bleu

### Corrections

- Scan d'assets global (`**/*.png` au lieu de dossiers spécifiques)

## [0.2.0] - 2024-12-01

### Nouvelles Commandes

- `devarchitect.scanVariables` - Scanner les variables d'environnement
- `devarchitect.scanAssets` - Scanner les assets du workspace
- `devarchitect.setupGitignore` - Configurer .gitignore pour la sécurité

### Améliorations

- Synchronisation bidirectionnelle avec le webview
- Détection des technologies et frameworks
- Analyse du package.json

## [0.1.0] - 2024-11-15

### Première Version

- Extension VS Code complète
- Sidebar avec résumé du projet
- Panel principal avec dashboard
- Commandes Copilot Agent
- Import/Export JSON
