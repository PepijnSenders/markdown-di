---
description: Convert recipe measurements between metric and imperial
allowed-tools: 'Read, Edit, Write'
argument-hint: '[recipe-file] [metric or imperial]'
model: claude-sonnet-4-5-20250929
---

Review the current request and execute the following prompt:

This command will:
1. Read the specified recipe file
2. Identify all measurements (cups, oz, grams, ml, etc.)
3. Convert between metric and imperial systems
4. Update the recipe file with converted measurements
5. Preserve the original formatting

Example:
```
/recipe-convert recipes/banana-bread.md metric
/recipe-convert recipes/pasta-carbonara.md imperial
```

Conversion supports:
- Volume: cups ↔ ml, tablespoons ↔ ml, etc.
- Weight: oz ↔ grams, pounds ↔ kg
- Temperature: Fahrenheit ↔ Celsius

Use the available tools efficiently to complete the task. If you encounter any errors, provide clear feedback to the user.
