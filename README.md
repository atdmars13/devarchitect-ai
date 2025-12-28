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

**🇬🇧 [English version](README.en.md)**

---

## 🎯 Qu'est-ce que DevArchitect AI ?

DevArchitect AI est un outil de **gestion de projet intégré** directement dans VS Code qui vous aide à :

- 📋 **Planifier** vos projets (concept, specs, roadmap)
- 🗓️ **Suivre** la progression avec des phases et milestones
- 🎨 **Gérer** vos assets et ressources
- 🧠 **Analyser** votre code avec l'IA locale (pas d'API externe, 100% privé)
- 📝 **Documenter** avec une base de connaissances intégrée

**Tout reste en local** - vos données ne quittent jamais votre machine.

---

## ✨ Fonctionnalités v0.4.0

### 🧠 IA Locale Mistral

- **Code Review** : Analyse de code avec score qualité, sécurité, performance → génère un rapport Markdown
- **Refactoring** : Suggestions d'amélioration ciblées → rapport MD
- **Explication Code** : Explications pédagogiques (débutant à expert) → rapport MD
- **Génération Tests** : Tests unitaires automatiques (Vitest, Jest, Mocha) → rapport MD
- **Analyse Sécurité** : Détection des vulnérabilités (XSS, injection, etc.) → rapport MD
- **Vision IA** : Analyse de maquettes avec `llama3.2-vision:11b`
- **Gestion VRAM** : Déchargement des modèles pour libérer la mémoire GPU

> Les rapports sont générés dans `.devarchitect-reports/` et s'ouvrent automatiquement.

### Modèles Ollama Recommandés (RTX 5070 Ti - 16 GB)

| Modèle | VRAM | Usage |
|--------|------|-------|
| `mistral-nemo:12b` | ~8 GB | ⭐ Recommandé - Code/Complétion |
| `llama3.2-vision:11b` | ~8 GB | Vision + Multimodal |
| `ministral:8b` | ~5 GB | Rapide et léger |
| `minicpm-v` | ~6 GB | Vision léger |

### 📋 Planification de Projet

- **Vision & Concept** : Pitch, concept, audience cible
- **Spécifications Techniques** : Stack tech, devices, conformité
- **Design & Style** : Palette de couleurs, typographie, direction artistique
- **Roadmap** : Phases, dépendances, progression

### 🎨 Gestion des Assets

- **Scan automatique** du workspace (PNG, JPG, SVG, MP3, etc.)
- Catégorisation (Sprites, UI, Audio, Mockups, etc.)
- Workflow de statuts (Concept → Final → Implémenté)

### 🛠️ Outils de Développement

- Commandes utiles (npm, git, docker)
- Scan des variables d'environnement (.env, docker-compose)
- Wiki avec base de connaissances (100+ articles)
- Configuration automatique du .gitignore

### 🎨 Whiteboard

- Canvas de dessin libre avec outils
- Mode plein écran
- Export et sauvegarde

---

## 🚀 Installation

### Prérequis

1. **VS Code** 1.85+
2. **Node.js** 18+
3. **Ollama** (pour l'IA locale) : https://ollama.com

### Installer Ollama et le modèle recommandé

```bash
# Installer Ollama (Windows/Mac/Linux)
# Puis télécharger le modèle Mistral
ollama pull mistral-nemo:12b

# Optionnel : modèle vision
ollama pull llama3.2-vision:11b
```

### Installer l'extension

```bash
cd extension

# Installer les dépendances
npm install

# Compiler
npm run compile

# Tests (optionnel)
npm test

# Packager (.vsix)
npm run package
```

Puis dans VS Code : `Extensions` → `...` → `Install from VSIX`

---

## 📁 Structure du Projet

```
devarchitect-ai/
├── extension/                 # Extension VS Code
│   ├── package.json           # Manifest
│   ├── src/
│   │   ├── extension.ts       # Point d'entrée + commandes IA
│   │   ├── panels/            # Dashboard Panel
│   │   ├── providers/         # Sidebar Provider
│   │   ├── services/          # AI, Project, Workspace services
│   │   ├── types/             # Types TypeScript
│   │   └── __tests__/         # Tests Vitest (67 tests)
│   └── media/                 # FAQ database (JSON)
├── projects/                  # Projets exemple
│   └── example-template.json  # Template de projet
├── .github/
│   └── copilot-instructions.md
└── README.md
```

---

## 🤖 Commandes IA

| Commande | Description |
|----------|-------------|
| `devarchitect.checkAIStatus` | Vérifier Ollama |
| `devarchitect.getAvailableModels` | Lister les modèles |
| `devarchitect.unloadModel` | Décharger le modèle actuel |
| `devarchitect.unloadAllModels` | Libérer toute la VRAM |
| `devarchitect.aiComplete` | Complétion IA du projet |
| `devarchitect.reviewCode` | Revue de code → rapport MD |
| `devarchitect.suggestRefactoring` | Refactoring → rapport MD |
| `devarchitect.explainCode` | Explication code → rapport MD |
| `devarchitect.generateTests` | Générer tests → rapport MD |
| `devarchitect.detectSecurityIssues` | Analyse sécurité → rapport MD |
| `devarchitect.analyzeImage` | Analyse image (vision) |

---

## 📖 Wiki & Base de Connaissances

L'onglet **Wiki** contient :

- **FAQ Projet** : Documentation spécifique
- **Base Dev** : 100+ articles (VS Code, React, Git, Docker, TDD, etc.)

---

## 🎮 Types de Projets

### 🌐 Web/Mobile
- E-Commerce, SaaS, Social, Productivity
- React, Vue, Angular, Node, Django

### 🎮 Jeu 2D
- Unity, Godot, Phaser, Defold
- RPG, Platformer, Puzzle, Arcade

---

## 🤝 Contribution

Les contributions sont les bienvenues !

1. Fork le projet
2. Créez une branche (`git checkout -b feature/amazing-feature`)
3. Commit (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing-feature`)
5. Ouvrez une Pull Request

---

## 📄 Licence

MIT License - voir [LICENSE](LICENSE)

---

## 📋 Changelog

Voir [CHANGELOG.md](CHANGELOG.md)
