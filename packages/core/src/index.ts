import matter from "gray-matter";
import { ContentProcessor, FrontmatterProcessor } from "./processor";
import { CircularDependencyDetector, DependencyResolver } from "./resolver";
import { SchemaValidator } from "./schema";
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

  /**
   * Register a schema by name
   */
  registerSchema(name: string, schema: z.ZodObject<any>): void {
    this.schemaRegistry.set(name, schema);
  }

  /**
   * Register schemas from configuration object
   */
  registerSchemas(schemas: Record<string, z.ZodObject<any>>): void {
    Object.entries(schemas).forEach(([name, schema]) => {
      this.registerSchema(name, schema);
    });
  }

  /**
   * Get a registered schema by name
   */
  getSchema(name: string): z.ZodObject<any> | undefined {
    return this.schemaRegistry.get(name);
  }

  /**
   * Get all registered schema names
   */
  getRegisteredSchemas(): string[] {
    return Array.from(this.schemaRegistry.keys());
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

    if (frontmatter.schema && typeof frontmatter.schema === "string") {
      const registeredSchema = this.getSchema(frontmatter.schema);

      if (!registeredSchema) {
        allErrors.push({
          type: "schema",
          message: `Schema "${frontmatter.schema}" not found in registry. Register it with registerSchema() first.`,
          location: "frontmatter.schema",
        });
      } else {
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
// Export types and classes
export * from "./types";
export * from "./utils";
export * from "./validator";

export { z };