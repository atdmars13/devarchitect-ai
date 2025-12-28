# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

**🇬🇧 [English version](CHANGELOG.en.md)**

## [0.4.0] - 2025-12-28

### ✨ Ajouté
- **IA Locale Mistral** : Intégration complète avec Ollama
  - Revue de code avec score qualité, sécurité, performance
  - Suggestions de refactoring ciblées
  - Explications pédagogiques du code (débutant à expert)
  - Génération automatique de tests unitaires (Vitest, Jest, Mocha)
  - Détection des vulnérabilités sécurité (XSS, injection, etc.)
  - Vision IA pour analyse de maquettes (llama3.2-vision)
  - Gestion VRAM avec déchargement des modèles
- **Rapports Markdown** : Toutes les analyses IA génèrent des rapports dans `.devarchitect-reports/`
- **10 nouvelles commandes IA** : checkAIStatus, getAvailableModels, unloadModel, reviewCode, etc.
- **Template projet** : `projects/example-template.json` pour démarrage rapide

### 🔧 Modifié
- 67 tests unitaires passent (Vitest)
- UI sidebar améliorée avec panneau outils IA
- Documentation mise à jour (EN + FR)

### 🗑️ Supprimé
- Intégration Copilot (Mistral gère toute l'IA en local)

---

## [0.3.1] - 2025-12-12

### ✨ Ajouté
- **Types WebView ↔ Extension** : Nouveau fichier `types/messages.ts` avec typage complet
  - 20+ types de messages typés pour la communication
  - Validators pour Phase, Asset, Command, Variable, FAQ
  - Meilleure sécurité et autocomplétion TypeScript
- **FAQ externalisée** : Base de 200 FAQs déplacée vers `media/faq-database.json`
  - Chargement lazy-load pour réduire l'empreinte mémoire
  - Facilite la maintenance et les contributions
- **Configuration Ollama dynamique** : AICompletionService utilise les settings VS Code
  - `devarchitect.ollama.baseUrl` : URL du serveur
  - `devarchitect.ollama.preferredModel` : Modèle préféré
  - `devarchitect.ollama.timeout` : Timeout configurable
  - `devarchitect.ollama.enabled` : Activer/désactiver l'IA
- **Validation des entrées Copilot** : Toutes les commandes validées avant traitement
- **Nouvelles commandes chat** : `/analyze`, `/plan`, `/add`, `/sync`, `/status`, `/metrics`, `/health`, `/structure`

### 🔧 Modifié
- **package.json extension** : Ajout repository, license, configuration Ollama
- **47 tests unitaires** passent (vs 36 précédemment)
- **0 erreur lint** dans l'extension

### 🐛 Corrigé
- Correction des imports inutilisés dans plusieurs fichiers
- Amélioration de la gestion d'erreurs dans les validateurs

---

## [0.3.0] - 2025-12-08

### ✨ Ajouté
- **Synchronisation Complète** : Nouveau bouton "🔄 Synchronisation Complète" dans la sidebar
  - Analyse automatique du workspace entier
  - Mise à jour de TOUS les champs du projet en un clic
  - Détection : nom, type, concept, pitch, audience, features, architecture, specs, design
- **Analyse de progression intelligente** :
  - Détection automatique de la progression des sprints
  - Calcul basé sur les fichiers, dépendances et configurations réelles
  - 20+ catégories de phases analysées (Setup, UI, Backend, Tests, CI/CD, etc.)
  - Affichage des détails de progression pour chaque phase
  - Statistiques globales : phases terminées, en cours, à faire
- **Génération de roadmap dynamique** :
  - Phases créées en fonction des technologies détectées
  - Statuts initiaux basés sur l'état réel du projet
  - Support des projets Web/Mobile et Jeux 2D
- **Analyse avancée du workspace** :
  - Détection des fonctionnalités principales (coreFeatures)
  - Génération automatique de l'architecture
  - Génération des cas de test
  - Génération des critères de validation
  - Détection du design (palette couleurs, fonts, framework CSS)
  - Statistiques des fichiers (total, par type)
  - Détection équipe depuis package.json et git
- **Détection étendue des technologies** :
  - Prisma, GraphQL, Tailwind CSS
  - Tests (Jest, Vitest, Mocha, Cypress, Playwright)
  - CI/CD (GitHub Actions, GitLab CI, Azure Pipelines)
  - Auth (NextAuth, Passport, Auth0, Clerk)
  - State (Zustand, Redux, Recoil, Jotai)
  - Validation (Zod, Yup, Joi)
- **Whiteboard amélioré** :
  - Mode plein écran avec overlay
  - Formes géométriques (rectangle, cercle, triangle)
  - Flèches directionnelles
  - Outil texte
  - Toolbar complète en mode fullscreen
- **Fonction .gitignore universelle** :
  - 40+ patterns de sécurité
  - Support Python, Node.js, Java, Go
  - Détection intelligente des patterns existants

### 🔧 Modifié
- **Scan d'assets global** : Recherche dans tout le workspace (`**/*.png`, `**/*.jpg`, etc.)
- Amélioration du WorkspaceAnalyzerService avec analyse contextuelle
- Message de synchronisation avec statistiques détaillées

### 🐛 Corrigé
- Correction du scan d'assets qui ne trouvait pas les fichiers
- Extension maintenant universelle (fonctionne sur tout projet)

## [0.2.0] - 2024-12-01

### ✨ Ajouté
- Migration vers **Zustand** pour le state management
- Tests unitaires avec **Vitest** (36 tests)
- Composants UI animés avec **Framer Motion**
- Synchronisation bidirectionnelle extension ↔ webview
- Scan des variables d'environnement
- Scan des assets du projet
- Configuration automatique du .gitignore (sécurité)

### 🔧 Modifié
- Refactoring complet du state management
- Amélioration des performances

### 🗑️ Supprimé
- Dépendances Gemini (nettoyage)

## [0.1.0] - 2024-11-15

### ✨ Ajouté
- Interface de planification complète
- Mode édition et mode suivi
- Gestion des dépendances entre phases avec détection de cycles
- Vue Gantt pour la roadmap
- Wiki avec base de connaissances intégrée (100+ articles)
- Structure pour extension VS Code
- Service Copilot Agent pour l'intégration
- Sidebar VS Code avec résumé du projet
- Commandes VS Code pour l'édition via Copilot
- Export/Import de projets en JSON

---

## Types de changements

- ✨ **Ajouté** pour les nouvelles fonctionnalités
- 🔧 **Modifié** pour les changements dans les fonctionnalités existantes
- 🗑️ **Supprimé** pour les fonctionnalités retirées
- 🐛 **Corrigé** pour les corrections de bugs
- 🔒 **Sécurité** pour les vulnérabilités corrigées
- ⚠️ **Deprecated** pour les fonctionnalités bientôt supprimées
