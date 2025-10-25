import matter from 'gray-matter';
import { readFileSync } from 'fs';
import type { FrontmatterData, ProcessingContext, DependencyReference, ValidationError } from './types';
import { DependencyResolver, CircularDependencyDetector } from './resolver';

/**
 * Processes markdown content with dependency injection
 */
export class ContentProcessor {
  constructor(
    private resolver: DependencyResolver,
    private circularDetector: CircularDependencyDetector
  ) {}

  async process(content: string, frontmatter: FrontmatterData, context: ProcessingContext): Promise<{
    processedContent: string;
    errors: ValidationError[];
  }> {
    const errors: ValidationError[] = [];

    // Extract all references from content
    const references = this.resolver.extractReferences(content, frontmatter);

    // Check for circular dependencies
    if (context.currentFile) {
      const { dependencies } = this.resolver.resolve(frontmatter);
      const circularErrors = this.circularDetector.detect(context.currentFile, dependencies);
      errors.push(...circularErrors);
    }

    // If in validate mode, return early
    if (context.mode === 'validate') {
      return {
        processedContent: content,
        errors
      };
    }

    // Process replacements
    let processedContent = content;

    // Sort references by position (reverse order) to avoid offset issues
    references.sort((a, b) => b.sourceLine - a.sourceLine || b.sourceColumn - a.sourceColumn);

    for (const reference of references) {
      try {
        const replacement = await this.getReplacementContent(reference, context);
        processedContent = this.replaceReference(
          processedContent,
          reference,
          replacement,
          errors
        );
      } catch (error) {
        errors.push({
          type: 'file',
          message: `Failed to process reference: ${error}`,
          location: `line ${reference.sourceLine}, column ${reference.sourceColumn}`
        });
      }
    }

    return { processedContent, errors };
  }

  private async getReplacementContent(reference: DependencyReference, context: ProcessingContext): Promise<string> {
    if (reference.type === 'blueprint' && reference.key) {
      return this.processBlueprintFile(reference.fullPath, context);
    } else if (reference.type === 'reference') {
      return this.processReferenceFiles(reference.fullPath, context);
    } else {
      // Handle blueprint group
      return reference.fullPath;
    }
  }

  private async processBlueprintFile(filePath: string, context: ProcessingContext): Promise<string> {
    if (context.visitedFiles.has(filePath)) {
      // Already visited file - avoid circular processing
      return readFileSync(filePath, 'utf-8');
    }

    context.visitedFiles.add(filePath);

    try {
      const content = readFileSync(filePath, 'utf-8');

      // Future: Here we could recursively process the file for nested dependencies
      // For now, just return the content as-is

      return content;
    } catch (error) {
      throw new Error(`Failed to read blueprint file ${filePath}: ${error}`);
    } finally {
      context.visitedFiles.delete(filePath);
    }
  }

  private async processReferenceFiles(filesPath: string, context: ProcessingContext): Promise<string> {
    const files = filesPath.split('\n').filter(Boolean);
    const contents: string[] = [];

    for (const filePath of files) {
      if (context.visitedFiles.has(filePath)) {
        continue; // Skip already visited files
      }

      context.visitedFiles.add(filePath);

      try {
        const content = readFileSync(filePath, 'utf-8');
        contents.push(content);
      } catch (error) {
        throw new Error(`Failed to read reference file ${filePath}: ${error}`);
      } finally {
        context.visitedFiles.delete(filePath);
      }
    }

    return contents.join('\n\n');
  }

  private replaceReference(
    content: string,
    reference: DependencyReference,
    replacement: string,
    errors: ValidationError[]
  ): string {
    const lines = content.split('\n');
    const referencePattern = /\{\{([^}]+)\}\}/g;

    // Find and replace the specific reference
    let lineIndex = 0;
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;

      while ((match = referencePattern.exec(line)) !== null) {
        const refPath = match[1].trim();

        // Check if this is the reference we're looking for
        if (this.isMatchingReference(reference, refPath) &&
            i + 1 === reference.sourceLine &&
            match.index === reference.sourceColumn) {

          // Replace the reference
          lines[i] = line.substring(0, match.index) +
                     replacement +
                     line.substring(match.index + match[0].length);

          found = true;
          break;
        }
      }

      if (found) break;
    }

    if (!found) {
      errors.push({
        type: 'reference',
        message: `Could not find reference "{{${this.getReferencePath(reference)}}" to replace`,
        location: `line ${reference.sourceLine}, column ${reference.sourceColumn}`
      });
    }

    return lines.join('\n');
  }

  private isMatchingReference(reference: DependencyReference, refPath: string): boolean {
    const expectedPath = this.getReferencePath(reference);
    return refPath === expectedPath;
  }

  private getReferencePath(reference: DependencyReference): string {
    if (reference.key) {
      // The reference could be in shorthand format (group.key) or full format (blueprints.group.key)
      return `${reference.group}.${reference.key}`;
    } else if (reference.group) {
      return `references.${reference.group}`;
    } else {
      return 'references';
    }
  }
}

/**
 * Handles frontmatter extraction and parsing
 */
export class FrontmatterProcessor {
  extract(content: string): { frontmatter: any; body: string; errors: ValidationError[] } {
    const errors: ValidationError[] = [];

    try {
      // Use gray-matter to extract frontmatter
      const parsed = matter(content);

      if (!parsed.data || Object.keys(parsed.data).length === 0) {
        return {
          frontmatter: {},
          body: content,
          errors: [{
            type: 'frontmatter',
            message: 'No frontmatter found in document',
            location: 'document start'
          }]
        };
      }

      return {
        frontmatter: parsed.data,
        body: parsed.content,
        errors
      };
    } catch (error) {
      errors.push({
        type: 'frontmatter',
        message: `Failed to extract frontmatter: ${error}`,
        location: 'document start'
      });
      return { frontmatter: {}, body: content, errors };
    }
  }

  private parseYaml(yaml: string): any {
    // Simple YAML parser - in a real implementation, use a proper YAML parser
    const result: any = {};
    const lines = yaml.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex).trim();
        let value = trimmed.substring(colonIndex + 1).trim();

        // Remove quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }

        // Handle arrays (basic support)
        if (value.startsWith('- ')) {
          const arrayLines = [value.substring(2).trim()];
          // Continue collecting array items
          let nextLineIndex = lines.indexOf(line) + 1;
          while (nextLineIndex < lines.length && lines[nextLineIndex].trim().startsWith('- ')) {
            arrayLines.push(lines[nextLineIndex].trim().substring(2).trim());
            nextLineIndex++;
          }
          result[key] = arrayLines;
        } else {
          result[key] = value;
        }
      }
    }

    return result;
  }
}