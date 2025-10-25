import type { Plugin } from 'unified';
import type { Root } from 'mdast';
import { MarkdownDI } from '@markdown-di/core';

export interface RemarkMarkdownDIOptions {
  baseDir: string;
  /**
   * Enable heading level adjustments during transclusion
   */
  headingShift?: boolean;
  /**
   * Enable link rewriting for transcluded content
   */
  linkRewrite?: boolean;
  /**
   * Processing mode: 'validate' or 'build'
   */
  mode?: 'validate' | 'build';
}

/**
 * Remark plugin for markdown dependency injection with AST-based transformations
 */
export const remarkMarkdownDI: Plugin<[RemarkMarkdownDIOptions?], Root> = (options?: RemarkMarkdownDIOptions) => {
  const mdi = new MarkdownDI();

  return async (tree, file) => {
    const baseDir = options?.baseDir || process.cwd();

    const result = await mdi.process({
      content: file.value as string,
      baseDir,
      currentFile: file.path,
      mode: options?.mode
    });

    // Update the file with processed content
    file.value = result.content;

    // Store processing metadata
    file.data = {
      ...file.data,
      markdownDI: {
        frontmatter: result.frontmatter,
        dependencies: result.dependencies,
        errors: result.errors
      }
    };

    if (result.errors.length > 0) {
      const errorMessages = result.errors
        .map(error => `${error.type}: ${error.message} at ${error.location}`)
        .join('\n');
      file.messages.push({
        name: 'warning',
        message: `Markdown DI processing errors:\n${errorMessages}`
      } as any);
    }

    // Future: AST-level transformations for heading shifting and link rewriting
    if (options?.headingShift || options?.linkRewrite) {
      // TODO: Implement AST transformations
      // This would require parsing the transcluded content and manipulating the AST
    }
  };
};

export default remarkMarkdownDI;