# Contributing Guide

Thank you for your interest in contributing to DevArchitect AI! 🚀

> **👋 Important Note**  
> This project is developed and maintained by **a single developer**. This is my **first VS Code extension** and my **first major open source project**.  
> 
> **Pull Requests and Issues** are handled in my spare time — your **patience and understanding** are greatly appreciated!  
> 
> **All contributions and suggestions are welcome** 🙏

**🇫🇷 [Version française](CONTRIBUTING.md)**

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Environment Setup](#environment-setup)
- [Project Structure](#project-structure)
- [Code Standards](#code-standards)
- [Pull Requests](#pull-requests)

## Code of Conduct

This project adheres to a code of conduct. By participating, you agree to uphold this code.

- Be respectful and inclusive
- Accept constructive criticism
- Focus on what is best for the community

## How to Contribute

### 🐛 Report a Bug

1. Check that the bug hasn't already been reported in [Issues](https://github.com/devarchitect/devarchitect-ai/issues)
2. Create a new issue with the "Bug Report" template
3. Include:
   - Clear description of the problem
   - Steps to reproduce
   - Expected vs observed behavior
   - Screenshots if applicable
   - VS Code and extension version

### 💡 Propose a Feature

1. Open an issue with the "Feature Request" template
2. Describe the problem you're trying to solve
3. Propose your solution
4. Discuss with the community

### 🔧 Submit Code

1. Fork the repository
2. Create a branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test your code
5. Commit (`git commit -m 'feat: add my feature'`)
6. Push (`git push origin feature/my-feature`)
7. Open a Pull Request

## Environment Setup

### Prerequisites

- Node.js 18+
- npm or pnpm
- VS Code Insiders (recommended for development)

### Installation

```bash
# Clone the repo
git clone https://github.com/devarchitect/devarchitect-ai.git
cd devarchitect-ai/extension

# Install dependencies
npm install

# Compile the extension
npm run compile

# Run tests
npm test

# Watch mode (auto-recompile)
npm run watch
```

### Testing the Extension

1. Open the project in VS Code
2. Press `F5` to launch the Extension Development Host
3. DevArchitect extension appears in the sidebar

## Project Structure

```
devarchitect-ai/
├── extension/                 # VS Code Extension (main code)
│   ├── src/
│   │   ├── extension.ts       # Entry point
│   │   ├── panels/            # Webview panels (Dashboard)
│   │   ├── providers/         # Sidebar providers
│   │   ├── services/          # Services (AI, Project, Workspace)
│   │   ├── types/             # TypeScript types
│   │   └── __tests__/         # Unit tests (Vitest)
│   └── media/                 # Resources (FAQ JSON, icons)
├── projects/                  # Example projects
├── wiki/                      # Documentation
└── .github/                   # GitHub config
```

## Code Standards

### Conventional Commits

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (no logic changes)
- `refactor`: Refactoring
- `test`: Tests
- `chore`: Maintenance

Examples:
```
feat(sidebar): add full sync button
fix(assets): fix PNG file scanning
docs(readme): update installation documentation
```

### TypeScript

- Use explicit types (avoid `any`)
- Document public functions with JSDoc
- Follow naming conventions:
  - `camelCase` for variables and functions
  - `PascalCase` for classes and interfaces
  - `UPPER_SNAKE_CASE` for constants

### React

- Use functional components with hooks
- Prefer custom hooks for reusable logic
- Use Zustand for global state

### Tests

```bash
# Run tests
npm test

# With coverage
npm run test:coverage
```

## Pull Requests

### Checklist

- [ ] Code compiles without errors
- [ ] Tests pass
- [ ] Documentation is up to date
- [ ] CHANGELOG is updated (if applicable)
- [ ] Commits follow conventions

### Review Process

1. I personally review each PR (timing varies based on my availability)
2. Changes may be requested
3. Once approved, the PR is merged

> ⏳ **Patience appreciated**: Being alone on this project, reviews may take a few days. Thank you for your understanding!

---

Thank you for contributing to DevArchitect AI! 🎉
