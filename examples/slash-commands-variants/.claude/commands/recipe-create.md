---
description: Create a new recipe from ingredients and instructions
allowed-tools: 'Write, Read, Glob'
argument-hint: '[recipe-name]'
model: claude-sonnet-4-5-20250929
---

Review the current request and execute the following prompt:

This command will:
1. Prompt you for the recipe details (ingredients, steps, servings, prep/cook time)
2. Create a new markdown file in the `recipes/` directory
3. Use a standardized recipe template for consistency
4. Validate that all required fields are provided

Example:
```
/recipe-create chocolate-chip-cookies
```

The command will guide you through entering:
- Recipe name and description
- Ingredients list with quantities
- Step-by-step instructions
- Cooking time, temperature, and servings
- Dietary tags (vegetarian, vegan, gluten-free, etc.)

Use the available tools efficiently to complete the task. If you encounter any errors, provide clear feedback to the user.
