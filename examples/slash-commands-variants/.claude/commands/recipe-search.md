---
description: Search for recipes by ingredient or cuisine type
allowed-tools: 'Grep, Glob, Read'
argument-hint: '[search-query]'
model: claude-sonnet-4-5-20250929
---

Review the current request and execute the following prompt:

This command will:
1. Search through all recipe files in the `recipes/` directory
2. Match recipes by ingredients, cuisine type, or keywords
3. Display matching recipes with preview information
4. Allow you to open specific recipes for more details

Example searches:
```
/recipe-search chicken
/recipe-search italian
/recipe-search vegetarian pasta
```

Search supports:
- Ingredient names
- Cuisine types
- Dietary restrictions
- Recipe names

Use the available tools efficiently to complete the task. If you encounter any errors, provide clear feedback to the user.
