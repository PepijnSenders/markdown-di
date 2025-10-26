---
allowed-tools: 'Read, Write, Edit, Bash, Grep'
description: >-
  Generate comprehensive unit and integration tests for a specified file or
  module
model: claude-sonnet-4-5-20250929
---

# Command: /generate-tests

## Metadata
- **Category**: testing
- **Priority**: high
- **Version**: 1.0.0
- **Author**: Development Team
- **Last Updated**: 2025-01-26

## Description
Generate comprehensive unit and integration tests for a specified file or module

## Tags
- testing
- unit-tests
- coverage
- TDD

## Usage
```bash
/generate-tests <file-path>
```

## Arguments
- `<file-path>` (required): Path to the source file to generate tests for

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
