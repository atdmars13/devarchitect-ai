# DevArchitect AI

🚀 **Extension VS Code pour la planification et le suivi de projets** avec IA locale Mistral/Ollama.

[![Version](https://img.shields.io/badge/version-0.4.0-blue.svg)](https://github.com/devarchitect/devarchitect-ai)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-green.svg)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/license-MIT-orange.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-67%20passed-brightgreen.svg)](extension/src/__tests__/)
[![Ollama](https://img.shields.io/badge/Ollama-Mistral-purple.svg)](https://ollama.com)

> **👋 Note du développeur**  
> C'est ma **première extension VS Code** et mon **premier gros projet open source** publié.  
> Je développe et maintiens ce projet **seul** — votre **patience et compréhension** sont grandement appréciées !  
> **Contributions et suggestions bienvenues** 🙏

## ✨ Nouveautés v0.4.0 - IA Locale Mistral

- 🧠 **IA Locale** : Intégration complète avec Ollama (Mistral Nemo 12B recommandé)
- 🔍 **Code Review** : Analyse de code avec score qualité, sécurité, performance
- 🔧 **Refactoring** : Suggestions de refactoring ciblées par l'IA
- 📖 **Explication Code** : Explications pédagogiques (débutant à expert)
- 🧪 **Génération Tests** : Tests unitaires automatiques (Vitest, Jest, Mocha)
- 🔐 **Analyse Sécurité** : Détection des vulnérabilités (XSS, injection, etc.)
- 🖼️ **Vision IA** : Analyse de maquettes avec `llama3.2-vision:11b`
- ⚡ **Gestion VRAM** : Déchargement des modèles pour libérer la mémoire GPU

### Modèles Ollama Recommandés (RTX 5070 Ti - 16 GB)

| Modèle | VRAM | Usage |
|--------|------|-------|
| `mistral-nemo:12b` | ~8 GB | ⭐ Recommandé - Code/Complétion |
| `llama3.2-vision:11b` | ~8 GB | Vision + Multimodal |
| `minicpm-v` | ~6 GB | Vision léger |

## ✨ Nouveautés v0.3.1

- 🔐 **Types sécurisés** : Communication WebView ↔ Extension entièrement typée
- 📚 **FAQ externe** : 200 articles chargés en lazy-load depuis JSON
- ⚙️ **Ollama configurable** : URL, modèle, timeout via settings VS Code
- ✅ **Validation robuste** : Toutes les entrées Copilot validées
- 🤖 **8 commandes chat** : `/analyze`, `/plan`, `/add`, `/sync`, `/status`, `/metrics`, `/health`, `/structure`

## ✨ Nouveautés v0.3.0

- 🔄 **Synchronisation Complète** : Analyse automatique du workspace pour mettre à jour TOUS les champs du projet
- 🖼️ **Scan d'Assets Global** : Détection des assets dans tout le workspace (PNG, JPG, SVG, MP3, etc.)
- 🎨 **Whiteboard Fullscreen** : Mode plein écran avec formes géométriques, flèches et texte
- 📊 **Analyse avancée** : Détection architecture, design, tests, CI/CD, équipe

## Fonctionnalités

### 📋 Planification de Projet
- **Vision & Concept** : Définissez votre pitch, concept et audience cible
- **Spécifications Techniques** : Stack tech, moteur de jeu, conformité (GDPR, etc.)
- **Design & Style** : Palette de couleurs, typographie, direction artistique

### 🗓️ Roadmap & Gestion des Phases
- Vue **Liste** et **Gantt** pour la planification
- Gestion des **dépendances** entre phases (avec détection de cycles)
- Suivi de **progression** en temps réel
- Support des **jalons** (milestones)

### 🎨 Gestion des Assets
- **Scan automatique** de tous les assets du workspace
- Catégorisation (Sprites, UI, Audio, Mockups, etc.)
- Workflow de statuts (Concept → Final → Implémenté)
- Liaison avec les phases de développement

### 🛠️ Outils de Développement
- Commandes utiles (npm, git, docker, etc.)
- **Scan des variables d'environnement** (.env, docker-compose, etc.)
- Wiki intégré avec **base de connaissances dev** (100+ articles)
- Configuration automatique du **.gitignore** pour la sécurité

### 🎨 Whiteboard
- Canvas de dessin libre avec outils (crayon, formes, flèches, texte)
- Mode **plein écran** pour plus d'espace de travail
- Export et sauvegarde des dessins

### 🤖 Intégration Copilot Agent
- Communication bidirectionnelle VS Code ↔ Webview
- Édition du projet via commandes naturelles
- **Synchronisation complète** en un clic
- Contexte projet automatique pour Copilot Chat

---

## Installation

### Extension VS Code

```bash
cd extension

# Installer les dépendances
npm install

# Compiler l'extension
npm run compile

# Exécuter les tests
npm test

# Packager l'extension (.vsix)
npm run package
```

### Installation de l'extension

1. Packager : `npm run package` dans le dossier `extension/`
2. Installer le `.vsix` dans VS Code : `Extensions` → `...` → `Install from VSIX`

---

## Structure du Projet

```
devarchitect-ai/
├── extension/              # Extension VS Code
│   ├── package.json        # Manifest de l'extension
│   ├── src/
│   │   ├── extension.ts    # Point d'entrée
│   │   ├── panels/         # Panneau Dashboard
│   │   ├── providers/      # Sidebar Provider
│   │   ├── services/       # Services (AI, Project, Workspace)
│   │   ├── types/          # Types TypeScript
│   │   └── __tests__/      # Tests unitaires (Vitest)
│   └── media/              # Ressources (FAQ JSON)
├── projects/               # Exemples de projets
├── wiki/                   # Documentation wiki
├── .github/                # Config GitHub & instructions Copilot
└── README.md
```

---

## Utilisation avec l'IA Mistral

### IA Locale via Ollama

L'extension utilise Mistral via Ollama pour l'analyse et la complétion automatique des projets :

- **Analyse de code** - Revue automatique, suggestions de refactoring
- **Complétion projet** - Remplissage automatique des champs manquants
- **Analyse d'images** - Vision IA pour maquettes (llama3.2-vision)
- **Génération de tests** - Tests unitaires automatiques
- **Détection sécurité** - Analyse des vulnérabilités

### Commandes disponibles

| Commande | Description |
|----------|-------------|
| `devarchitect.checkAIStatus` | Vérifier le statut de l'IA locale |
| `devarchitect.getAvailableModels` | Lister les modèles disponibles |
| `devarchitect.unloadModel` | Décharger le modèle actuel de la VRAM |
| `devarchitect.unloadAllModels` | Libérer toute la VRAM |
| `devarchitect.aiComplete` | Complétion IA du projet |
| `devarchitect.reviewCode` | Revue de code IA |
| `devarchitect.suggestRefactoring` | Suggestions de refactoring |
| `devarchitect.generateTests` | Générer des tests unitaires |

---

## Wiki & Base de Connaissances

L'onglet **Wiki** contient :

1. **FAQ Projet** : Documentation spécifique à votre projet
2. **Base Dev** : 100+ articles couvrant :
   - VS Code (extensions, débogage, snippets)
   - Développement Web (React, Angular, Vue, APIs)
   - Développement Mobile (React Native, Flutter)
   - Unity & Jeux 2D
   - Méthodologies (Agile, Scrum, Kanban)
   - Git & CI/CD
   - Clean Code & TDD
   - DevOps (Docker, Kubernetes, Serverless)

---

## Types de Projets Supportés

### 🌐 Application Web/Mobile
- Catégories : E-Commerce, Social, SaaS, Productivity...
- Stack : React, Vue, Angular, Node, Django...
- Déploiement : Vercel, AWS, Firebase, App Store...

### 🎮 Jeu 2D
- Moteurs : Unity, Godot, Phaser, Defold
- Genres : RPG, Platformer, Puzzle, Arcade...
- Styles : Pixel Art, Vector, Hand Drawn...

---

## Contribution

Les contributions sont les bienvenues ! 

1. Fork le projet
2. Créez une branche (`git checkout -b feature/amazing-feature`)
3. Commit vos changements (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing-feature`)
5. Ouvrez une Pull Request

---

## Licence

MIT License

---

## Changelog

Voir [CHANGELOG.md](CHANGELOG.md) pour l'historique complet des versions.
