import matter from 'gray-matter';
import type { ProcessOptions, ProcessResult, ProcessingContext, ValidationError } from './types';
import { PartialValidator } from './validator';
import { DependencyResolver, CircularDependencyDetector } from './resolver';
import { ContentProcessor, FrontmatterProcessor } from './processor';
import { SchemaValidator } from './schema';
import { z } from 'zod';

/**
 * Main class for markdown dependency injection
 */
export class MarkdownDI {
  private partialValidator = new PartialValidator();
  private frontmatterProcessor = new FrontmatterProcessor();
  private schemaRegistry = new Map<string, z.ZodSchema<any>>();

  /**
   * Register a schema by name
   */
  registerSchema(name: string, schema: z.ZodSchema<any>): void {
    this.schemaRegistry.set(name, schema);
  }

  /**
   * Register schemas from configuration object
   */
  registerSchemas(schemas: Record<string, z.ZodSchema<any>>): void {
    Object.entries(schemas).forEach(([name, schema]) => {
      this.registerSchema(name, schema);
    });
  }

  /**
   * Get a registered schema by name
   */
  getSchema(name: string): z.ZodSchema<any> | undefined {
    return this.schemaRegistry.get(name);
  }

  /**
   * Process markdown content with dependency injection
   */
  async process(options: ProcessOptions): Promise<ProcessResult> {
    const context: ProcessingContext = {
      baseDir: options.baseDir,
      mode: options.mode || 'build',
      visitedFiles: new Set(),
      currentFile: options.currentFile
    };

    // Extract and validate frontmatter
    let { frontmatter, body, errors: frontmatterErrors } = this.frontmatterProcessor.extract(options.content);

    // Combine all errors
    const allErrors: ProcessResult['errors'] = [...frontmatterErrors];

    // Validate against schema if specified in frontmatter
    let validationSchema: z.ZodSchema<any> | null = null;

    if (frontmatter.schema && typeof frontmatter.schema === 'string') {
      const registeredSchema = this.getSchema(frontmatter.schema);

      if (!registeredSchema) {
        allErrors.push({
          type: 'schema',
          message: `Schema "${frontmatter.schema}" not found in registry. Register it with registerSchema() first.`,
          location: 'frontmatter.schema'
        });
      } else {
        const schemaValidator = new SchemaValidator({
          schema: registeredSchema,
          extend: true
        });
        const schemaResult = schemaValidator.validate(frontmatter);

        if (!schemaResult.valid) {
          allErrors.push(...schemaResult.errors);
        } else {
          // Update frontmatter with validated/transformed data
          frontmatter = schemaResult.data;
          validationSchema = registeredSchema;
        }
      }
    }

    // Validate partial syntax in content
    const syntaxValidationErrors = this.partialValidator.validate(body);
    allErrors.push(...syntaxValidationErrors);

    // Validate that injected variables are defined in frontmatter and schema
    const injectionValidationErrors = this.validateInjectionVariables(body, frontmatter, validationSchema || undefined);
    allErrors.push(...injectionValidationErrors);

    // Initialize resolver and detector
    const resolver = new DependencyResolver(context);
    const circularDetector = new CircularDependencyDetector();

    // Process content
    const processor = new ContentProcessor(resolver, circularDetector);
    const { processedContent, errors: processingErrors, dependencies } = await processor.process(
      body,
      frontmatter,
      context
    );
    allErrors.push(...processingErrors);

    // Reassemble the document with processed frontmatter
    let finalContent;
    try {
      finalContent = this.reassembleDocument(frontmatter, processedContent);
    } catch (error) {
      allErrors.push({
        type: 'frontmatter',
        message: `Failed to reassemble document: ${error}`,
        location: 'document'
      });
      finalContent = options.content; // Return original content if reassembly fails
    }

    return {
      content: finalContent,
      frontmatter,
      errors: allErrors,
      dependencies
    };
  }

  /**
   * Validate that partials exist in frontmatter
   * Mustache will handle variable validation naturally during rendering
   */
  private validateInjectionVariables(body: string, frontmatter: any, validationSchema?: z.ZodSchema<any>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Extract all {{partials.xxx}} references and validate they exist
    const referenceRegex = /\{\{partials\.([^}]+)\}\}/g;
    const matches: string[] = [];
    let match;

    while ((match = referenceRegex.exec(body)) !== null) {
      matches.push(match[1].trim());
    }

    // Check each partial reference
    matches.forEach(partialKey => {
      if (!frontmatter.partials || !frontmatter.partials.hasOwnProperty(partialKey)) {
        errors.push({
          type: 'injection',
          message: `Partial '{{partials.${partialKey}}}' is not defined in frontmatter`,
          location: 'content'
        });
      }
    });

    // If there's a validation schema, ensure all required fields are present
    if (validationSchema) {
      try {
        const result = validationSchema.safeParse(frontmatter);
        if (!result.success) {
          result.error.errors.forEach((issue: any) => {
            errors.push({
              type: 'schema',
              message: `Schema validation failed: ${issue.message}`,
              location: issue.path.join('.')
            });
          });
        }
      } catch (error) {
        errors.push({
          type: 'schema',
          message: `Schema validation error: ${error instanceof Error ? error.message : String(error)}`,
          location: 'schema'
        });
      }
    }

    return errors;
  }

  /**
   * Validate markdown content without processing
   */
  async validate(options: Omit<ProcessOptions, 'mode'>): Promise<ProcessResult> {
    return this.process({ ...options, mode: 'validate' });
  }

  /**
   * Reassemble document with frontmatter and processed body
   */
  private reassembleDocument(frontmatter: any, body: string): string {
    // Filter frontmatter based on output-frontmatter field if present
    let outputFrontmatter = frontmatter;

    if (frontmatter['output-frontmatter'] && Array.isArray(frontmatter['output-frontmatter'])) {
      const allowedFields = frontmatter['output-frontmatter'];
      outputFrontmatter = {};

      // Only include fields that are in the output-frontmatter list
      for (const field of allowedFields) {
        // Don't include output-frontmatter itself
        if (field !== 'output-frontmatter' && frontmatter.hasOwnProperty(field)) {
          outputFrontmatter[field] = frontmatter[field];
        }
      }
    }

    return matter.stringify(body, outputFrontmatter);
  }
}

// Export types and classes
export * from './types';
export * from './validator';
export * from './resolver';
export * from './processor';
