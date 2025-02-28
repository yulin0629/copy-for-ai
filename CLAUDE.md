# Development Guidelines for Copy-For-AI

## Build Commands
- `npm run compile` - Build the extension (lint, type-check, bundle)
- `npm run watch` - Watch mode for development with auto-rebuild
- `npm run check-types` - Run TypeScript type checking
- `npm run lint` - Run ESLint for code style checks
- `npm run test` - Run all tests
- `npm run package` - Package for production
- `npm run watch:esbuild` - Watch only esbuild changes
- `npm run watch:tsc` - Watch only TypeScript type checking

## Code Style Guidelines
- **Naming**: camelCase for variables/functions, PascalCase for classes/types/interfaces
- **Imports**: Sort imports, group by external/internal, no unused imports
- **Types**: Always use explicit TypeScript types, prefer interfaces for object types
- **Error Handling**: Use try/catch blocks with specific error messages
- **Documentation**: Use JSDoc comments for public APIs and complex functions
- **Formatting**: Use 4-space indentation, semicolons required
- **Strings**: Use single quotes for strings
- **Language**: Write comments in Traditional Chinese (zh-TW)
- **Variables**: Favor const over let, avoid var
- **Functions**: Prefer small, focused functions with descriptive names
- **Extension UI**: Any user-facing text should be in Traditional Chinese (zh-TW)