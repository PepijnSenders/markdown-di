---
description: Analyze recipe nutrition and suggest healthier alternatives
allowed-tools: 'Read, WebFetch'
argument-hint: '[recipe-file]'
model: claude-sonnet-4-5-20250929
---

Review the current request and execute the following prompt:

This command will:
1. Read the recipe file
2. Analyze ingredients for nutritional content
3. Calculate approximate calories, macros, and key nutrients per serving
4. Suggest healthier ingredient substitutions
5. Flag potential allergens

Example:
```
/recipe-analyze recipes/chocolate-cake.md
```

Analysis includes:
- Estimated nutritional breakdown (calories, protein, carbs, fat)
- Healthier substitution suggestions (e.g., Greek yogurt for sour cream)
- Allergen warnings (dairy, nuts, gluten, etc.)
- Tips for making the recipe healthier

Use the available tools efficiently to complete the task. If you encounter any errors, provide clear feedback to the user.
