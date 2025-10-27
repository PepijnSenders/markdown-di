# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [0.9.6] - 2025-10-27

### Changed
- fix: add npm authentication for bun publish ([#8](https://github.com/PepijnSenders/markdown-di/pull/8)) by @PepijnSenders


## [0.9.5] - 2025-10-27

### Changed
- feat: migrate to bun publish and catalogs ([#7](https://github.com/PepijnSenders/markdown-di/pull/7)) by @PepijnSenders


## [0.9.4] - 2025-10-27

### Changed
- feat: support  fields with both hooks and variants API ([#6](https://github.com/PepijnSenders/markdown-di/pull/6)) by @PepijnSenders


## [0.9.3] - 2025-10-27

### Changed
- feat: add support for custom mustache configurations ([#5](https://github.com/PepijnSenders/markdown-di/pull/5)) by @PepijnSenders


## [0.9.2] - 2025-10-26

### Changed
- feat: add CLI package with AJV-based JSON Schema validation ([#4](https://github.com/PepijnSenders/markdown-di/pull/4)) by @PepijnSenders


## [0.9.1] - 2025-10-25

### Changed
- Remove test method and fix CHANGELOG ([#3](https://github.com/PepijnSenders/markdown-di/pull/3)) by @PepijnSenders

## [0.9.0] - 2025-10-25

### Changed
- Add getRegisteredSchemas method ([#2](https://github.com/PepijnSenders/markdown-di/pull/2)) by @PepijnSenders

## [0.8.0] - 2025-10-25

### Added

#### Core Features
- Parser-agnostic dependency injection system for markdown
- Frontmatter-based dependency declarations
- Blueprint references (single file transclusion)
- Reference groups (multiple files with glob support)
- Shorthand syntax `{{sections.intro}}` for blueprint references
- Explicit syntax `{{blueprints.sections.intro}}` (validates but not yet fully implemented)

#### Schema Validation
- Zod-based schema validation for frontmatter
- Programmatic schema registration via `registerSchema()`
- Inline YAML schema definitions in frontmatter
- Schema references in frontmatter with `schema: schema-name`
- CLI schema validation support

#### Validation
- Early validation at parse time
- Reference syntax validation
- Frontmatter structure validation
- Dependency existence checking
- Circular dependency detection
- Detailed error reporting with locations

#### Packages
- `@markdown-di/core` - Parser-agnostic core library
- `@markdown-di/remark` - Remark/unified adapter for AST-based processing
- `@markdown-di/cli` - CLI tool for building and validating markdown projects

#### Testing
- Comprehensive integration test suite (60 tests)
- Snapshot testing with Bun for output verification
- Test coverage for all three packages

#### Developer Experience
- GitHub Actions workflows for testing and publishing
- Automated release scripts
- TypeScript support with full type definitions
- Documentation and examples

### Documentation
- Complete README with usage examples
- Schema validation documentation
- CLI usage documentation
- Architecture overview

## [0.8.0] - 2025-10-25

### Added
- **Variable parsing in partials** - Partials can now have their own frontmatter with variable interpolation
- **Parent variable access** - Partials can access variables from parent document's frontmatter
- **`$parent` syntax** - Use `$parent` to reference parent variable with same key
- **`$parent('key')` syntax** - Use `$parent('key')` to map parent variables to different names
- **Nested partials support** - Partials can include other partials with full context propagation
- **Circular dependency detection** - Automatic detection and prevention of circular dependencies in nested partials
- **Backward compatibility** - Partials without frontmatter continue to work as before

### Changed
- Refactored partial processing to use shared logic with main document processing (DRY principle)
- Improved error messages for missing parent context references

### Fixed
- Snapshot tests now use relative paths for better cross-environment compatibility

## [0.1.0] - 2025-01-25

### Added
- Parser-agnostic dependency injection system for markdown
- Frontmatter-based dependency declarations
- Blueprint references (single file transclusion)
- Reference groups (multiple files with glob support)
- Shorthand syntax `{{sections.intro}}` for blueprint references
- Zod-based schema validation for frontmatter
- Programmatic schema registration via `registerSchema()`
- Early validation at parse time
- Reference syntax validation
- Frontmatter structure validation
- Dependency existence checking
- Circular dependency detection
- Detailed error reporting with locations
- Comprehensive integration test suite
- TypeScript support with full type definitions

## [Unreleased]

### Planned
- AST-based heading level shifting
- Link rewriting for transcluded content
- Watch mode improvements
- VS Code extension
- Additional parser adapters (marked, markdown-it)

[0.9.0]: https://github.com/pepijnsenders/markdown-di/releases/tag/v0.9.0
[0.8.0]: https://github.com/pepijnsenders/markdown-di/releases/tag/v0.8.0
[0.1.0]: https://github.com/pepijnsenders/markdown-di/releases/tag/v0.1.0
