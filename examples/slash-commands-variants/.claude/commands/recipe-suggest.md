---
description: Suggest recipes based on available ingredients
allowed-tools: 'Read, Glob, Grep'
argument-hint: '[ingredient1] [ingredient2] etc'
model: claude-sonnet-4-5-20250929
---

Review the current request and execute the following prompt:

This command will:
1. Take a list of ingredients you have available
2. Search through all recipes in the `recipes/` directory
3. Find recipes that can be made with those ingredients
4. Rank results by how many ingredients match
5. Show what additional ingredients might be needed

Example:
```
/recipe-suggest chicken tomatoes garlic pasta
/recipe-suggest eggs flour milk sugar
```

Results show:
- Recipes that use your ingredients
- Matching percentage
- Missing ingredients (if any)
- Prep and cook time estimates

Use the available tools efficiently to complete the task. If you encounter any errors, provide clear feedback to the user.
