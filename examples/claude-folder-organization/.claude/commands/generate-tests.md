Generate comprehensive tests for the specified file or module.

Usage: /generate-tests <file-path>

Process:
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

Example output structure:
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

Target: 90%+ code coverage
