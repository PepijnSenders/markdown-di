import matter from "gray-matter";
import { ContentProcessor, FrontmatterProcessor } from "./processor";
import { CircularDependencyDetector, DependencyResolver } from "./resolver";
import type {
  FrontmatterData,
  ProcessingContext,
  ProcessOptions,
  ProcessResult,
} from "./types";
import { deepMerge, generateFileId } from "./utils";
import { PartialValidator } from "./validator";

/**
 * Main class for markdown dependency injection
 */
export class MarkdownDI {
  private partialValidator = new PartialValidator();
  private frontmatterProcessor = new FrontmatterProcessor();

  /**
   * Internal process method with additional flags
   * @internal - Used by batch processor
   */
  private async _processInternal(
    options: ProcessOptions,
    skipDynamicCheck: boolean = false
  ): Promise<ProcessResult> {
    const context: ProcessingContext = {
      baseDir: options.baseDir,
      mode: options.mode || "build",
      visitedFiles: new Set(),
      currentFile: options.currentFile,
      mustache: options.mustache,
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
    }

    // After hook execution, validate that all $dynamic fields were provided
    // Check that fields which were originally $dynamic now have values
    if (!skipDynamicCheck) {
      const missingDynamic: string[] = [];
      for (const field of dynamicFields) {
        if (!(field in frontmatter) || frontmatter[field] === undefined) {
          missingDynamic.push(field);
        }
      }

      if (missingDynamic.length > 0) {
        allErrors.push({
          type: "schema",
          message: `These $dynamic fields were not provided: ${missingDynamic.join(", ")}. Provide values via onBeforeCompile hook or variants API`,
          location: "frontmatter",
        });
      }
    }

    // Schema validation using custom validateFrontmatter callback
    if (frontmatter.schema && options.validateFrontmatter) {
      const schemaName = typeof frontmatter.schema === "string" ? frontmatter.schema : undefined;
      const validationResult = await options.validateFrontmatter(frontmatter, schemaName);

      if (!validationResult.valid) {
        allErrors.push(...validationResult.errors);
      } else if (validationResult.data) {
        // Update frontmatter with validated/transformed data
        frontmatter = validationResult.data as FrontmatterData;
      }
    }

    // Validate partial syntax in content
    const syntaxValidationErrors = this.partialValidator.validate(body);
    allErrors.push(...syntaxValidationErrors);

    // Initialize resolver and detector
    const resolver = new DependencyResolver(context);
    const circularDetector = new CircularDependencyDetector();

    // Process content
    const processor = new ContentProcessor(
      resolver,
      circularDetector,
      this.frontmatterProcessor,
      context.mustache
    );
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
   * Process markdown content with dependency injection
   */
  async process(options: ProcessOptions): Promise<ProcessResult> {
    return this._processInternal(options, false);
  }

  /**
   * Internal method for batch processor to extract frontmatter without validating $dynamic fields
   * @internal - Only for use by BatchProcessor
   */
  async _processForBatch(options: ProcessOptions): Promise<ProcessResult> {
    return this._processInternal(options, true);
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