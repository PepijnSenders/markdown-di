---
schema: command
name: generate-tests
description: Generate comprehensive unit and integration tests for a specified file or module
category: testing
priority: high
version: 1.0.0
author: Development Team
created: 2025-01-26
updated: 2025-01-26
tags:
  - testing
  - unit-tests
  - coverage
  - TDD
arguments:
  - name: file-path
    description: Path to the source file to generate tests for
    required: true
allowed-tools: Read, Write, Edit, Bash, Grep
model: claude-sonnet-4-5-20250929
output-frontmatter:
  - allowed-tools
  - description
  - model
---

# Command: /{{name}}

## Metadata
- **Category**: {{category}}
- **Priority**: {{priority}}
- **Version**: {{version}}
- **Author**: {{author}}
- **Last Updated**: {{updated}}

## Description
{{description}}

## Tags
{{#tags}}
- {{.}}
{{/tags}}

## Usage
```bash
/{{name}} <file-path>
```

## Arguments
{{#arguments}}
- `<{{name}}>` ({{#required}}required{{/required}}{{^required}}optional{{/required}}): {{description}}
{{/arguments}}

## What it does

1. Read the source file
2. Identify all functions, classes, and methods
3. Create test file with:
   - Unit tests for each function/method
   - Edge cases (null, undefined, empty, boundary values)
   - Error scenarios
   - Integration tests if applicable
4. Use appropriate testing framework (Jest, Vitest, etc.)
5. Follow AAA pattern (Arrange, Act, Assert)
6. Add descriptive test names
7. Mock external dependencies
8. Run tests to verify they pass

## Example

```bash
/generate-tests src/services/user-service.ts
```

## Expected Output

```typescript
describe('UserService', () => {
  describe('createUser', () => {
    it('should create user with valid data', () => {
      // Arrange
      const userData = { name: 'John', email: 'john@example.com' }

      // Act
      const result = userService.createUser(userData)

      // Assert
      expect(result.id).toBeDefined()
      expect(result.name).toBe('John')
    })

    it('should throw error for invalid email', () => {
      const userData = { name: 'John', email: 'invalid' }
      expect(() => userService.createUser(userData)).toThrow()
    })
  })
})
```

## Target
- 90%+ code coverage
- All edge cases covered
- Error scenarios handled
- Clear, descriptive test names
