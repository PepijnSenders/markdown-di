import type { FrontmatterData, ValidationError } from './types';

/**
 * Validates partial syntax in markdown content
 */
export class PartialValidator {
  validate(content: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = content.split('\n');

    lines.forEach((line, lineIndex) => {
      const matches = this.findPartials(line);
      matches.forEach(match => {
        const error = this.validatePartialSyntax(match, lineIndex + 1, match.index || 0);
        if (error) {
          errors.push(error);
        }
      });
    });

    return errors;
  }

  private findPartials(text: string): RegExpMatchArray[] {
    const partialPattern = /\{\{([^}]+)\}\}/g;
    const matches: RegExpMatchArray[] = [];
    let match;

    while ((match = partialPattern.exec(text)) !== null) {
      matches.push(match);
    }

    return matches;
  }

  private validatePartialSyntax(match: RegExpMatchArray, line: number, column: number): ValidationError | null {
    const partial = match[1].trim();

    // Validate overall format
    if (!partial) {
      return {
        type: 'syntax',
        message: 'Empty partial reference',
        location: `line ${line}, column ${column}`
      };
    }

    // Check for invalid characters
    if (/[{}]/.test(partial)) {
      return {
        type: 'syntax',
        message: `Invalid characters in partial reference: "${partial}"`,
        location: `line ${line}, column ${column}`
      };
    }

    return null;
  }
}