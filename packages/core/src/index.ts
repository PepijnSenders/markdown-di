import matter from "gray-matter";
import { ContentProcessor, FrontmatterProcessor } from "./processor";
import { CircularDependencyDetector, DependencyResolver } from "./resolver";
import { SchemaValidator } from "./schema";
import { AjvSchemaValidator } from "./ajv-schema";
import { ConfigLoader } from "./config-loader";
import type {
  FrontmatterData,
  ProcessingContext,
  ProcessOptions,
  ProcessResult,
} from "./types";
import { deepMerge, generateFileId } from "./utils";
import { PartialValidator } from "./validator";
import { z } from "zod";

/**
 * Main class for markdown dependency injection
 */
export class MarkdownDI {
  private partialValidator = new PartialValidator();
  private frontmatterProcessor = new FrontmatterProcessor();
  private schemaRegistry = new Map<string, z.ZodObject<any>>();
  private ajvValidator = new AjvSchemaValidator();
  private configLoader = new ConfigLoader();

  /**
   * Register a schema by name (Zod - deprecated)
   * @deprecated Use loadConfigSchemas() with JSON Schema instead
   */
  registerSchema(name: string, schema: z.ZodObject<any>): void {
    this.schemaRegistry.set(name, schema);
  }

  /**
   * Register schemas from configuration object (Zod - deprecated)
   * @deprecated Use loadConfigSchemas() with JSON Schema instead
   */
  registerSchemas(schemas: Record<string, z.ZodObject<any>>): void {
    Object.entries(schemas).forEach(([name, schema]) => {
      this.registerSchema(name, schema);
    });
  }

  /**
   * Get a registered schema by name (Zod - deprecated)
   * @deprecated Use AJV schemas instead
   */
  getSchema(name: string): z.ZodObject<any> | undefined {
    return this.schemaRegistry.get(name);
  }

  /**
   * Load schemas from JSON Schema config file
   * This is the recommended way to use schema validation
   * @param configPath - Optional explicit path to config file
   * @param startDir - Directory to start searching for config (defaults to cwd)
   */
  loadConfigSchemas(configPath?: string, startDir?: string): void {
    const dir = startDir || process.cwd();
    const config = this.configLoader.loadConfigAuto(dir, configPath);

    if (!config) {
      throw new Error(
        'No config file found. Create .markdown-di.json with schemas.'
      );
    }

    this.ajvValidator.loadSchemas(config.schemas);
  }

  /**
   * Register JSON Schema directly (programmatic API)
   */
  registerJsonSchema(name: string, jsonSchema: any): void {
    this.ajvValidator.registerSchema(name, jsonSchema);
  }

  /**
   * Register multiple JSON Schemas (programmatic API)
   */
  registerJsonSchemas(schemas: Record<string, any>): void {
    this.ajvValidator.loadSchemas(schemas);
  }

  /**
   * Process markdown content with dependency injection
   */
  async process(options: ProcessOptions): Promise<ProcessResult> {
    const context: ProcessingContext = {
      baseDir: options.baseDir,
      mode: options.mode || "build",
      visitedFiles: new Set(),
      currentFile: options.currentFile,
    };

    // Extract and validate frontmatter
    let {
      frontmatter,
      body,
      errors: frontmatterErrors,
    } = this.frontmatterProcessor.extract(options.content);

    // Combine all errors
    const allErrors: ProcessResult["errors"] = [...frontmatterErrors];

    // Generate and add file ID if currentFile is provided and id doesn't exist
    if (options.currentFile && !frontmatter.id) {
      const fileId = generateFileId(options.currentFile, options.baseDir);
      frontmatter.id = fileId;
    }

    // Detect fields marked as $dynamic
    const dynamicFields: string[] = [];
    for (const [key, value] of Object.entries(frontmatter)) {
      if (value === "$dynamic") {
        dynamicFields.push(key);
      }
    }

    // Execute onBeforeCompile hook if provided
    if (options.onBeforeCompile && options.currentFile) {
      try {
        const hookResult = await options.onBeforeCompile({
          id: frontmatter.id || "",
          filePath: options.currentFile,
          frontmatter: { ...frontmatter },
          baseDir: options.baseDir,
          dynamicFields,
        });

        // Validate that all $dynamic fields are provided by hook
        const missingFields: string[] = [];
        for (const field of dynamicFields) {
          if (!hookResult || !(field in hookResult)) {
            missingFields.push(field);
          }
        }

        if (missingFields.length > 0) {
          allErrors.push({
            type: "schema",
            message: `Hook must provide these $dynamic fields: ${missingFields.join(
              ", "
            )}`,
            location: "onBeforeCompile",
          });
        }

        // Remove $dynamic placeholders before merging
        for (const field of dynamicFields) {
          delete frontmatter[field];
        }

        // Deep merge hook result into frontmatter
        frontmatter = deepMerge(frontmatter, hookResult) as FrontmatterData;
      } catch (error) {
        allErrors.push({
          type: "schema",
          message: `Hook execution failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          location: "onBeforeCompile",
        });
      }
    } else if (dynamicFields.length > 0) {
      // $dynamic fields declared but no hook provided
      allErrors.push({
        type: "schema",
        message: `Fields marked as $dynamic but no onBeforeCompile hook configured: ${dynamicFields.join(
          ", "
        )}`,
        location: "frontmatter",
      });
    }

    // Schema validation - supports both AJV (JSON Schema) and Zod (legacy)
    if (frontmatter.schema) {
      if (typeof frontmatter.schema === "string") {
        // Named schema reference
        // Try AJV first (new way), fallback to Zod (legacy)
        const ajvResult = this.ajvValidator.validate(frontmatter, frontmatter.schema);

        if (!ajvResult.valid) {
          // Check if it's a "not found" error, then try Zod
          const notFound = ajvResult.errors.some(e => e.message.includes('not found'));

          if (notFound) {
            // Try Zod as fallback
            const registeredSchema = this.getSchema(frontmatter.schema);

            if (!registeredSchema) {
              // Neither AJV nor Zod have this schema
              allErrors.push(...ajvResult.errors);
            } else {
              // Use Zod (legacy path)
              const schemaValidator = new SchemaValidator({
                schema: registeredSchema,
                extend: true,
              });
              const schemaResult = schemaValidator.validate(frontmatter);

              if (!schemaResult.valid) {
                allErrors.push(...schemaResult.errors);
              } else {
                // Update frontmatter with validated/transformed data
                frontmatter = schemaResult.data as FrontmatterData;
              }
            }
          } else {
            // AJV validation failed (not a "not found" error)
            allErrors.push(...ajvResult.errors);
          }
        }
      } else if (typeof frontmatter.schema === "object") {
        // Inline JSON Schema object
        const ajvResult = this.ajvValidator.validate(frontmatter, frontmatter.schema);

        if (!ajvResult.valid) {
          allErrors.push(...ajvResult.errors);
        }
      }
    }

    // Validate partial syntax in content
    const syntaxValidationErrors = this.partialValidator.validate(body);
    allErrors.push(...syntaxValidationErrors);

    // Initialize resolver and detector
    const resolver = new DependencyResolver(context);
    const circularDetector = new CircularDependencyDetector();

    // Process content
    const processor = new ContentProcessor(resolver, circularDetector, this.frontmatterProcessor);
    const {
      processedContent,
      errors: processingErrors,
      dependencies,
    } = await processor.process(body, frontmatter, context);
    allErrors.push(...processingErrors);

    // Reassemble the document with processed frontmatter
    let finalContent: string;
    try {
      finalContent = this.reassembleDocument(frontmatter, processedContent);
    } catch (error) {
      allErrors.push({
        type: "frontmatter",
        message: `Failed to reassemble document: ${error}`,
        location: "document",
      });
      finalContent = options.content; // Return original content if reassembly fails
    }

    return {
      content: finalContent,
      frontmatter,
      errors: allErrors,
      dependencies,
    };
  }

  /**
   * Validate markdown content without processing
   */
  async validate(
    options: Omit<ProcessOptions, "mode">
  ): Promise<ProcessResult> {
    return this.process({ ...options, mode: "validate" });
  }

  /**
   * Reassemble document with frontmatter and processed body
   */
  private reassembleDocument(
    frontmatter: FrontmatterData,
    body: string
  ): string {
    // Filter frontmatter based on output-frontmatter field if present
    let outputFrontmatter: FrontmatterData = frontmatter;

    if (
      frontmatter["output-frontmatter"] &&
      Array.isArray(frontmatter["output-frontmatter"])
    ) {
      const allowedFields = frontmatter["output-frontmatter"];
      const filtered: Record<string, unknown> = {};

      // Only include fields that are in the output-frontmatter list
      for (const field of allowedFields) {
        // Don't include output-frontmatter itself
        if (
          field !== "output-frontmatter" &&
          Object.hasOwn(frontmatter, field)
        ) {
          filtered[field] = frontmatter[field];
        }
      }

      outputFrontmatter = filtered as FrontmatterData;
    }

    return matter.stringify(body, outputFrontmatter);
  }
}

export * from "./batch";
export * from "./processor";
export * from "./resolver";
export * from "./ajv-schema";
export * from "./config-loader";
// Export types and classes
export * from "./types";
export * from "./utils";
export * from "./validator";

export { z };