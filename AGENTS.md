# AGENTS.md - LangBro Extension Development Guide

## Build/Lint/Test Commands
- **Build Chrome extension**: `npm run build:chrome-ext`
- **Build Firefox extension**: `npm run build:ff-ext`
- **Build RxJS bundle**: `npm run build:rxjs`
- **Development build**: `npm run build:dev`
- **Watch mode**: `npm run watch`
- **Run single test**: `node test/dictionary-import.test.js`

## Code Style Guidelines
- **Imports**: Use ES6 modules with named imports from RxJS (`import { BehaviorSubject } from 'rxjs'`)
- **Formatting**: 2-space indentation, consistent spacing
- **Types**: No TypeScript, use descriptive variable names for type clarity
- **Naming**: camelCase for variables/functions, PascalCase for classes, descriptive names
- **Error Handling**: Use try/catch blocks, throw descriptive Error objects
- **Async**: Prefer async/await over promises, handle rejections
- **Comments**: JSDoc-style file headers, minimal inline comments
- **Architecture**: Modular files by responsibility, reactive state with RxJS

## Cursor Rules Integration
- **Modularity**: Organize code by responsibility (utils, models, etc.)
- **Minimalism**: Follow YAGNI, prefer simple solutions
- **Readability**: Descriptive names, concise comments
- **Robustness**: Targeted error handling
- **Efficiency**: Optimize judiciously
- **Settings**: Use reactive `settings` object from settings-store.js
- **Versioning**: Update z_version_nr.txt (+0.0.1) after code changes
- **Building**: Run `node build-ff-ext.js` after code modifications
- **Manifest**: Restart Firefox after manifest.json changes (CRITICAL)</content>
<parameter name="filePath">/home/thomas/langBro_extention/AGENTS.md