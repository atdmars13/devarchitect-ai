# DevArchitect AI

🚀 **VS Code Extension for project planning and tracking** with local Mistral/Ollama AI.

[![Version](https://img.shields.io/badge/version-0.4.1-blue.svg)](https://github.com/devarchitect/devarchitect-ai)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-green.svg)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/license-MIT-orange.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-67%20passed-brightgreen.svg)](extension/src/__tests__/)
[![Ollama](https://img.shields.io/badge/Ollama-Mistral-purple.svg)](https://ollama.com)

> **👋 Developer's Note**  
> This is my **first VS Code extension** and my **first major open source project**.  
> I develop and maintain this project **alone** — your **patience and understanding** are greatly appreciated!  
> **Contributions and suggestions welcome** 🙏

**🇫🇷 [Version française](README.md)**

---

## 🎯 What is DevArchitect AI?

DevArchitect AI is a **project management tool integrated** directly into VS Code that helps you:

- 📋 **Plan** your projects (concept, specs, roadmap)
- 🗓️ **Track** progress with phases and milestones
- 🎨 **Manage** your assets and resources
- 🧠 **Analyze** your code with local AI (no external API, 100% private)
- 📝 **Document** with an integrated knowledge base

**Everything stays local** - your data never leaves your machine.

---

## ✨ Features v0.4.1

### 🔬 Deep Code Analysis (NEW)

- **Real file reading**: AI now reads and analyzes actual content of each workspace file
- **Structural extraction**: Classes, methods, functions, interfaces, types, constants
- **Component detection**: React components with hooks, API routes (Express, Next.js)
- **Smart prioritization**: 50 files analyzed, sorted by importance
- **Data schemas**: GraphQL, Prisma, SQL migrations
- **Maximum precision**: Temperature 0.3, 10000 output tokens

### 🧠 Local Mistral AI

- **Code Review**: Code analysis with quality, security, performance score → generates Markdown report
- **Refactoring**: Targeted improvement suggestions → MD report
- **Code Explanation**: Educational explanations (beginner to expert) → MD report
- **Test Generation**: Automatic unit tests (Vitest, Jest, Mocha) → MD report
- **Security Analysis**: Vulnerability detection (XSS, injection, etc.) → MD report
- **Vision AI**: Mockup analysis with `llama3.2-vision:11b`
- **VRAM Management**: Unload models to free GPU memory

> Reports are generated in `.devarchitect-reports/` and open automatically.

### Recommended Ollama Models (RTX 5070 Ti - 16 GB)

| Model | VRAM | Usage |
|-------|------|-------|
| `mistral-nemo:12b` | ~8 GB | ⭐ Recommended - Code/Completion |
| `llama3.2-vision:11b` | ~8 GB | Vision + Multimodal |
| `ministral:8b` | ~5 GB | Fast and lightweight |
| `minicpm-v` | ~6 GB | Lightweight vision |

### 📋 Project Planning

- **Vision & Concept**: Pitch, concept, target audience
- **Technical Specifications**: Tech stack, devices, compliance
- **Design & Style**: Color palette, typography, art direction
- **Roadmap**: Phases, dependencies, progress

### 🎨 Asset Management

- **Automatic scanning** of workspace (PNG, JPG, SVG, MP3, etc.)
- Categorization (Sprites, UI, Audio, Mockups, etc.)
- Status workflow (Concept → Final → Implemented)

### 🛠️ Development Tools

- Useful commands (npm, git, docker)
- Environment variable scanning (.env, docker-compose)
- Wiki with knowledge base (100+ articles)
- Automatic .gitignore configuration

### 🎨 Whiteboard

- Free drawing canvas with tools
- Fullscreen mode
- Export and save

---

## 🚀 Installation

### Prerequisites

1. **VS Code** 1.85+
2. **Node.js** 18+
3. **Ollama** (for local AI): https://ollama.com

### Install Ollama and the recommended model

```bash
# Install Ollama (Windows/Mac/Linux)
# Then download the Mistral model
ollama pull mistral-nemo:12b

# Optional: vision model
ollama pull llama3.2-vision:11b
```

### Install the extension

```bash
cd extension

# Install dependencies
npm install

# Compile
npm run compile

# Tests (optional)
npm test

# Package (.vsix)
npm run package
```

Then in VS Code: `Extensions` → `...` → `Install from VSIX`

---

## 📁 Project Structure

```
devarchitect-ai/
├── extension/                 # VS Code Extension
│   ├── package.json           # Manifest
│   ├── src/
│   │   ├── extension.ts       # Entry point + AI commands
│   │   ├── panels/            # Dashboard Panel
│   │   ├── providers/         # Sidebar Provider
│   │   ├── services/          # AI, Project, Workspace services
│   │   ├── types/             # TypeScript types
│   │   └── __tests__/         # Vitest tests (67 tests)
│   └── media/                 # FAQ database (JSON)
├── projects/                  # Example projects
│   └── example-template.json  # Project template
├── .github/
│   └── copilot-instructions.md
└── README.md
```

---

## 🤖 AI Commands

| Command | Description |
|---------|-------------|
| `devarchitect.checkAIStatus` | Check Ollama status |
| `devarchitect.getAvailableModels` | List available models |
| `devarchitect.unloadModel` | Unload current model |
| `devarchitect.unloadAllModels` | Free all VRAM |
| `devarchitect.aiComplete` | AI project completion |
| `devarchitect.reviewCode` | Code review → MD report |
| `devarchitect.suggestRefactoring` | Refactoring → MD report |
| `devarchitect.explainCode` | Code explanation → MD report |
| `devarchitect.generateTests` | Generate tests → MD report |
| `devarchitect.detectSecurityIssues` | Security analysis → MD report |
| `devarchitect.analyzeImage` | Image analysis (vision) |

---

## 📖 Wiki & Knowledge Base

The **Wiki** tab contains:

- **Project FAQ**: Project-specific documentation
- **Dev Base**: 100+ articles (VS Code, React, Git, Docker, TDD, etc.)

---

## 🎮 Project Types

### 🌐 Web/Mobile
- E-Commerce, SaaS, Social, Productivity
- React, Vue, Angular, Node, Django

### 🎮 2D Game
- Unity, Godot, Phaser, Defold
- RPG, Platformer, Puzzle, Arcade

---

## 🤝 Contributing

Contributions are welcome!

1. Fork the project
2. Create a branch (`git checkout -b feature/amazing-feature`)
3. Commit (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE)

---

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md)
