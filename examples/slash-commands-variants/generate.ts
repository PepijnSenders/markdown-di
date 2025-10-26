import { BatchProcessor } from '../../packages/core/src/index.js';
import { join } from 'path';

/**
 * Generate slash commands using the variants API
 *
 * This script creates 5 recipe management commands from a single template:
 * - /recipe-create
 * - /recipe-search
 * - /recipe-convert
 * - /recipe-analyze
 * - /recipe-suggest
 */

const processor = new BatchProcessor({
  baseDir: join(__dirname, 'templates'),
  outDir: join(__dirname, '.claude/commands'),

  variants: {
    // The 'recipe-command' id matches the 'id' field in our template
    'recipe-command': {
      // Data for each variant - one object per command
      data: [
        {
          name: 'recipe-create',
          command: 'recipe-create',
          description: 'Create a new recipe from ingredients and instructions',
          'allowed-tools': 'Write, Read, Glob',
          'argument-hint': '[recipe-name]',
          model: 'claude-sonnet-4-5-20250929',
          actionDetails: `This command will:
1. Prompt you for the recipe details (ingredients, steps, servings, prep/cook time)
2. Create a new markdown file in the \`recipes/\` directory
3. Use a standardized recipe template for consistency
4. Validate that all required fields are provided

Example:
\`\`\`
/recipe-create chocolate-chip-cookies
\`\`\`

The command will guide you through entering:
- Recipe name and description
- Ingredients list with quantities
- Step-by-step instructions
- Cooking time, temperature, and servings
- Dietary tags (vegetarian, vegan, gluten-free, etc.)`
        },
        {
          name: 'recipe-search',
          command: 'recipe-search',
          description: 'Search for recipes by ingredient or cuisine type',
          'allowed-tools': 'Grep, Glob, Read',
          'argument-hint': '[search-query]',
          model: 'claude-sonnet-4-5-20250929',
          actionDetails: `This command will:
1. Search through all recipe files in the \`recipes/\` directory
2. Match recipes by ingredients, cuisine type, or keywords
3. Display matching recipes with preview information
4. Allow you to open specific recipes for more details

Example searches:
\`\`\`
/recipe-search chicken
/recipe-search italian
/recipe-search vegetarian pasta
\`\`\`

Search supports:
- Ingredient names
- Cuisine types
- Dietary restrictions
- Recipe names`
        },
        {
          name: 'recipe-convert',
          command: 'recipe-convert',
          description: 'Convert recipe measurements between metric and imperial',
          'allowed-tools': 'Read, Edit, Write',
          'argument-hint': '[recipe-file] [metric or imperial]',
          model: 'claude-sonnet-4-5-20250929',
          actionDetails: `This command will:
1. Read the specified recipe file
2. Identify all measurements (cups, oz, grams, ml, etc.)
3. Convert between metric and imperial systems
4. Update the recipe file with converted measurements
5. Preserve the original formatting

Example:
\`\`\`
/recipe-convert recipes/banana-bread.md metric
/recipe-convert recipes/pasta-carbonara.md imperial
\`\`\`

Conversion supports:
- Volume: cups ↔ ml, tablespoons ↔ ml, etc.
- Weight: oz ↔ grams, pounds ↔ kg
- Temperature: Fahrenheit ↔ Celsius`
        },
        {
          name: 'recipe-analyze',
          command: 'recipe-analyze',
          description: 'Analyze recipe nutrition and suggest healthier alternatives',
          'allowed-tools': 'Read, WebFetch',
          'argument-hint': '[recipe-file]',
          model: 'claude-sonnet-4-5-20250929',
          actionDetails: `This command will:
1. Read the recipe file
2. Analyze ingredients for nutritional content
3. Calculate approximate calories, macros, and key nutrients per serving
4. Suggest healthier ingredient substitutions
5. Flag potential allergens

Example:
\`\`\`
/recipe-analyze recipes/chocolate-cake.md
\`\`\`

Analysis includes:
- Estimated nutritional breakdown (calories, protein, carbs, fat)
- Healthier substitution suggestions (e.g., Greek yogurt for sour cream)
- Allergen warnings (dairy, nuts, gluten, etc.)
- Tips for making the recipe healthier`
        },
        {
          name: 'recipe-suggest',
          command: 'recipe-suggest',
          description: 'Suggest recipes based on available ingredients',
          'allowed-tools': 'Read, Glob, Grep',
          'argument-hint': '[ingredient1] [ingredient2] etc',
          model: 'claude-sonnet-4-5-20250929',
          actionDetails: `This command will:
1. Take a list of ingredients you have available
2. Search through all recipes in the \`recipes/\` directory
3. Find recipes that can be made with those ingredients
4. Rank results by how many ingredients match
5. Show what additional ingredients might be needed

Example:
\`\`\`
/recipe-suggest chicken tomatoes garlic pasta
/recipe-suggest eggs flour milk sugar
\`\`\`

Results show:
- Recipes that use your ingredients
- Matching percentage
- Missing ingredients (if any)
- Prep and cook time estimates`
        }
      ],

      // Generate output filename based on command name
      getOutputPath: (_context, data, _index) => {
        return `${data.command}.md`;
      }
    }
  }
});

// Run the processor
async function main() {
  console.log('🚀 Generating recipe slash commands...\n');

  const result = await processor.process();

  if (!result.success) {
    console.error(`\n❌ Found ${result.totalErrors} errors:`);

    for (const file of result.files) {
      if (file.errors.length > 0) {
        console.error(`\n${file.file}:`);
        for (const error of file.errors) {
          console.error(`  [${error.type}] ${error.message}`);
        }
      }
    }

    process.exit(1);
  }

  console.log(`\n✅ Success! Generated ${result.changedFiles} command files:`);
  for (const file of result.files) {
    if (file.changed) {
      console.log(`   - ${file.file}`);
    }
  }

  console.log('\n📂 Commands available in .claude/commands/');
}

main().catch(console.error);
