# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

**🇫🇷 [Version française](CHANGELOG.md)**

## [0.4.0] - 2025-12-28

### ✨ Added
- **Local Mistral AI**: Complete integration with Ollama
  - Code review with quality, security, performance score
  - Targeted refactoring suggestions
  - Pedagogical code explanations (beginner to expert)
  - Automatic unit test generation (Vitest, Jest, Mocha)
  - Security vulnerability detection (XSS, injection, etc.)
  - Vision AI for mockup analysis (llama3.2-vision)
  - VRAM management with model unloading
- **Markdown Reports**: All AI analyses generate reports in `.devarchitect-reports/`
- **10 new AI commands**: checkAIStatus, getAvailableModels, unloadModel, reviewCode, etc.
- **Project template**: `projects/example-template.json` for quick start

### 🔧 Modified
- 67 unit tests passing (Vitest)
- Improved sidebar UI with AI tools panel
- Updated documentation (EN + FR)

### 🗑️ Removed
- Copilot integration (Mistral handles all AI locally)

---

## [0.3.1] - 2025-12-12

### ✨ Added
- **WebView ↔ Extension Types**: New `types/messages.ts` file with complete typing
  - 20+ typed message types for communication
  - Validators for Phase, Asset, Command, Variable, FAQ
  - Better security and TypeScript autocompletion
- **Externalized FAQ**: 200 FAQs moved to `media/faq-database.json`
  - Lazy-load to reduce memory footprint
  - Easier maintenance and contributions
- **Dynamic Ollama Configuration**: AICompletionService uses VS Code settings
  - `devarchitect.ollama.baseUrl`: Server URL
  - `devarchitect.ollama.preferredModel`: Preferred model
  - `devarchitect.ollama.timeout`: Configurable timeout
  - `devarchitect.ollama.enabled`: Enable/disable AI
- **Copilot input validation**: All commands validated before processing
- **New chat commands**: `/analyze`, `/plan`, `/add`, `/sync`, `/status`, `/metrics`, `/health`, `/structure`

### 🔧 Modified
- **Extension package.json**: Added repository, license, Ollama configuration
- **47 unit tests** passing (vs 36 previously)
- **0 lint errors** in the extension

### 🐛 Fixed
- Fixed unused imports in several files
- Improved error handling in validators

---

## [0.3.0] - 2025-12-08

### ✨ Added
- **Full Sync**: New "🔄 Full Sync" button in sidebar
  - Automatic workspace analysis
  - Update ALL project fields in one click
  - Detection: name, type, concept, pitch, audience, features, architecture, specs, design
- **Smart progress analysis**:
  - Automatic sprint progress detection
  - Calculation based on actual files, dependencies, and configurations
  - 20+ phase categories analyzed (Setup, UI, Backend, Tests, CI/CD, etc.)
  - Progress details display for each phase
  - Global statistics: completed, in progress, to do phases
- **Dynamic roadmap generation**:
  - Phases created based on detected technologies
  - Initial statuses based on actual project state
  - Support for Web/Mobile and 2D Game projects
- **Advanced workspace analysis**:
  - Main features detection (coreFeatures)
  - Automatic architecture generation
  - Test case generation
  - Validation criteria generation
  - Design detection (color palette, fonts, CSS framework)
  - File statistics (total, by type)
  - Team detection from package.json and git
- **Extended technology detection**:
  - Prisma, GraphQL, Tailwind CSS
  - Tests (Jest, Vitest, Mocha, Cypress, Playwright)
  - CI/CD (GitHub Actions, GitLab CI, Azure Pipelines)
  - Auth (NextAuth, Passport, Auth0, Clerk)
  - State (Zustand, Redux, Recoil, Jotai)
  - Validation (Zod, Yup, Joi)
- **Improved Whiteboard**:
  - Fullscreen mode with overlay
  - Geometric shapes (rectangle, circle, triangle)
  - Directional arrows
  - Text tool
  - Complete toolbar in fullscreen mode
- **Universal .gitignore function**:
  - 40+ security patterns
  - Python, Node.js, Java, Go support
  - Smart detection of existing patterns

### 🔧 Modified
- **Global asset scan**: Search across entire workspace (`**/*.png`, `**/*.jpg`, etc.)
- Improved WorkspaceAnalyzerService with contextual analysis
- Sync message with detailed statistics

### 🐛 Fixed
- Fixed asset scan not finding files
- Extension now universal (works on any project)

## [0.2.0] - 2024-12-01

### ✨ Added
- Migration to **Zustand** for state management
- Unit tests with **Vitest** (36 tests)
- Animated UI components with **Framer Motion**
- Bidirectional extension ↔ webview synchronization
- Environment variable scanning
- Project asset scanning
- Automatic .gitignore configuration (security)

### 🔧 Modified
- Complete state management refactoring
- Performance improvements

### 🗑️ Removed
- Gemini dependencies (cleanup)

## [0.1.0] - 2024-11-15

### ✨ Added
- Complete planning interface
- Edit mode and tracking mode
- Phase dependency management with cycle detection
- Gantt view for roadmap
- Wiki with integrated knowledge base (100+ articles)
- VS Code extension structure
- Copilot Agent service for integration
- VS Code sidebar with project summary
- VS Code commands for editing via Copilot
- Project export/import in JSON

---

## Change Types

- ✨ **Added** for new features
- 🔧 **Modified** for changes to existing features
- 🗑️ **Removed** for removed features
- 🐛 **Fixed** for bug fixes
- 🔒 **Security** for fixed vulnerabilities
- ⚠️ **Deprecated** for features to be removed soon
