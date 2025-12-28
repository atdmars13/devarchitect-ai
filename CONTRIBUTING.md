# Guide de Contribution

Merci de votre intérêt pour contribuer à DevArchitect AI ! 🚀

> **👋 Note importante**  
> Ce projet est développé et maintenu par **un seul développeur**. C'est ma **première extension VS Code** et mon **premier gros projet open source**.  
> 
> Les **Pull Requests et Issues** sont gérées sur mon temps libre — votre **patience et compréhension** sont grandement appréciées !  
> 
> **Toutes les contributions et suggestions sont les bienvenues** 🙏

## 📋 Table des matières

- [Code de Conduite](#code-de-conduite)
- [Comment Contribuer](#comment-contribuer)
- [Configuration de l'environnement](#configuration-de-lenvironnement)
- [Structure du Projet](#structure-du-projet)
- [Standards de Code](#standards-de-code)
- [Pull Requests](#pull-requests)

## Code de Conduite

Ce projet adhère à un code de conduite. En participant, vous vous engagez à respecter ce code.

- Soyez respectueux et inclusif
- Acceptez les critiques constructives
- Concentrez-vous sur ce qui est le mieux pour la communauté

## Comment Contribuer

### 🐛 Signaler un Bug

1. Vérifiez que le bug n'a pas déjà été signalé dans les [Issues](https://github.com/devarchitect/devarchitect-ai/issues)
2. Créez une nouvelle issue avec le template "Bug Report"
3. Incluez :
   - Description claire du problème
   - Étapes pour reproduire
   - Comportement attendu vs observé
   - Screenshots si applicable
   - Version de VS Code et de l'extension

### 💡 Proposer une Fonctionnalité

1. Ouvrez une issue avec le template "Feature Request"
2. Décrivez le problème que vous essayez de résoudre
3. Proposez votre solution
4. Discutez avec la communauté

### 🔧 Soumettre du Code

1. Fork le repository
2. Créez une branche (`git checkout -b feature/ma-fonctionnalite`)
3. Faites vos modifications
4. Testez votre code
5. Commit (`git commit -m 'feat: ajoute ma fonctionnalité'`)
6. Push (`git push origin feature/ma-fonctionnalite`)
7. Ouvrez une Pull Request

## Configuration de l'environnement

### Prérequis

- Node.js 18+
- npm ou pnpm
- VS Code Insiders (recommandé pour le développement)

### Installation

```bash
# Cloner le repo
git clone https://github.com/devarchitect/devarchitect-ai.git
cd devarchitect-ai/extension

# Installer les dépendances
npm install

# Compiler l'extension
npm run compile

# Lancer les tests
npm test

# Mode watch (recompile automatiquement)
npm run watch
```

### Tester l'extension

1. Ouvrez le projet dans VS Code
2. Appuyez sur `F5` pour lancer l'Extension Development Host
3. L'extension DevArchitect apparaît dans la sidebar

## Structure du Projet

```
devarchitect-ai/
├── extension/                 # Extension VS Code (code principal)
│   ├── src/
│   │   ├── extension.ts       # Point d'entrée
│   │   ├── panels/            # Webview panels (Dashboard)
│   │   ├── providers/         # Sidebar providers
│   │   ├── services/          # Services (AI, Project, Workspace)
│   │   ├── types/             # Types TypeScript
│   │   └── __tests__/         # Tests unitaires (Vitest)
│   └── media/                 # Ressources (FAQ JSON, icônes)
├── projects/                  # Exemples de projets
├── wiki/                      # Documentation
└── .github/                   # Config GitHub
```

## Standards de Code

### Commits Conventionnels

Utilisez le format [Conventional Commits](https://www.conventionalcommits.org/) :

```
type(scope): description

[body optionnel]

[footer optionnel]
```

Types :
- `feat` : Nouvelle fonctionnalité
- `fix` : Correction de bug
- `docs` : Documentation
- `style` : Formatage (pas de changement de logique)
- `refactor` : Refactoring
- `test` : Tests
- `chore` : Maintenance

Exemples :
```
feat(sidebar): ajoute bouton de synchronisation complète
fix(assets): corrige le scan des fichiers PNG
docs(readme): met à jour la documentation d'installation
```

### TypeScript

- Utilisez des types explicites (évitez `any`)
- Documentez les fonctions publiques avec JSDoc
- Suivez les conventions de nommage :
  - `camelCase` pour variables et fonctions
  - `PascalCase` pour classes et interfaces
  - `UPPER_SNAKE_CASE` pour constantes

### React

- Utilisez des composants fonctionnels avec hooks
- Préférez les hooks personnalisés pour la logique réutilisable
- Utilisez Zustand pour le state global

### Tests

```bash
# Lancer les tests
npm test

# Avec couverture
npm run test:coverage
```

## Pull Requests

### Checklist

- [ ] Le code compile sans erreurs
- [ ] Les tests passent
- [ ] La documentation est à jour
- [ ] Le CHANGELOG est mis à jour (si applicable)
- [ ] Les commits suivent les conventions

### Review Process

1. Je review personnellement chaque PR (délai variable selon ma disponibilité)
2. Des modifications peuvent être demandées
3. Une fois approuvée, la PR est merge

> ⏳ **Patience appréciée** : Étant seul sur ce projet, les reviews peuvent prendre quelques jours. Merci de votre compréhension !

---

Merci de contribuer à DevArchitect AI ! 🎉
