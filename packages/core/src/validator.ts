import type { FrontmatterData, ValidationError } from './types';

/**
 * Validates frontmatter structure and content
 */
export class FrontmatterValidator {
  validate(data: any): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check required fields
    if (!data.name || typeof data.name !== 'string') {
      errors.push({
        type: 'frontmatter',
        message: 'Required field "name" is missing or invalid',
        location: 'frontmatter'
      });
    }

    if (!data.description || typeof data.description !== 'string') {
      errors.push({
        type: 'frontmatter',
        message: 'Required field "description" is missing or invalid',
        location: 'frontmatter'
      });
    }

    // Validate blueprints structure
    if (data.blueprints && typeof data.blueprints === 'object') {
      this.validateBlueprints(data.blueprints, errors);
    }

    // Validate references structure
    if (data.references && typeof data.references === 'object') {
      this.validateReferences(data.references, errors);
    }

    return errors;
  }

  private validateBlueprints(blueprints: any, errors: ValidationError[]): void {
    for (const [groupName, group] of Object.entries(blueprints)) {
      if (typeof group !== 'object' || group === null || Array.isArray(group)) {
        errors.push({
          type: 'frontmatter',
          message: `Blueprint group "${groupName}" must be an object`,
          location: `blueprints.${groupName}`
        });
        continue;
      }

      for (const [key, path] of Object.entries(group)) {
        if (typeof path !== 'string') {
          errors.push({
            type: 'frontmatter',
            message: `Blueprint "${groupName}.${key}" path must be a string`,
            location: `blueprints.${groupName}.${key}`
          });
        }
      }
    }
  }

  private validateReferences(references: any, errors: ValidationError[]): void {
    for (const [groupName, files] of Object.entries(references)) {
      if (!Array.isArray(files)) {
        errors.push({
          type: 'frontmatter',
          message: `Reference group "${groupName}" must be an array`,
          location: `references.${groupName}`
        });
        continue;
      }

      files.forEach((file, index) => {
        if (typeof file !== 'string') {
          errors.push({
            type: 'frontmatter',
            message: `Reference "${groupName}[${index}]" path must be a string`,
            location: `references.${groupName}[${index}]`
          });
        }
      });
    }
  }
}

/**
 * Validates reference syntax in markdown content
 */
export class ReferenceValidator {
  validate(content: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const lines = content.split('\n');

    lines.forEach((line, lineIndex) => {
      const matches = this.findReferences(line);
      matches.forEach(match => {
        const error = this.validateReferenceSyntax(match, lineIndex + 1, match.index || 0);
        if (error) {
          errors.push(error);
        }
      });
    });

    return errors;
  }

  private findReferences(text: string): RegExpMatchArray[] {
    const referencePattern = /\{\{([^}]+)\}\}/g;
    const matches: RegExpMatchArray[] = [];
    let match;

    while ((match = referencePattern.exec(text)) !== null) {
      matches.push(match);
    }

    return matches;
  }

  private validateReferenceSyntax(match: RegExpMatchArray, line: number, column: number): ValidationError | null {
    const reference = match[1].trim();

    // Validate overall format
    if (!reference) {
      return {
        type: 'syntax',
        message: 'Empty reference',
        location: `line ${line}, column ${column}`
      };
    }

    // Check for invalid characters
    if (/[{}]/.test(reference)) {
      return {
        type: 'syntax',
        message: `Invalid characters in reference: "${reference}"`,
        location: `line ${line}, column ${column}`
      };
    }

    // Validate reference path
    const parts = reference.split('.');
    if (parts.length === 0 || parts.length > 3) {
      return {
        type: 'syntax',
        message: `Invalid reference format: "${reference}" (expected: {{group.key}} or {{section.group.key}})`,
        location: `line ${line}, column ${column}`
      };
    }

    return null;
  }
}

/**
 * Validates that all references in content exist in frontmatter
 */
export class ReferenceExistenceValidator {
  validate(content: string, frontmatter: FrontmatterData): ValidationError[] {
    const errors: ValidationError[] = [];
    const declaredReferences = this.extractDeclaredReferences(frontmatter);
    const usedReferences = this.extractUsedReferences(content);

    for (const usedRef of usedReferences) {
      if (!this.referenceExists(usedRef, declaredReferences)) {
        errors.push({
          type: 'reference',
          message: `Reference "{{${usedRef.path}}}" is not declared in frontmatter`,
          location: `line ${usedRef.line}, column ${usedRef.column || 0}`
        });
      }
    }

    return errors;
  }

  private extractDeclaredReferences(frontmatter: FrontmatterData) {
    const references: string[] = [];

    // Extract blueprints
    if (frontmatter.blueprints) {
      for (const [group, keys] of Object.entries(frontmatter.blueprints)) {
        for (const key of Object.keys(keys)) {
          references.push(`blueprints.${group}.${key}`);
          references.push(`${group}.${key}`); // shorthand
        }
      }
    }

    // Extract references
    if (frontmatter.references) {
      for (const group of Object.keys(frontmatter.references)) {
        references.push(`references.${group}`);
      }
      references.push('references'); // all references
    }

    return references;
  }

  private extractUsedReferences(content: string) {
    const references: Array<{ path: string; line: number; column: number }> = [];
    const lines = content.split('\n');
    const referencePattern = /\{\{([^}]+)\}\}/g;

    lines.forEach((line, lineIndex) => {
      let match;
      while ((match = referencePattern.exec(line)) !== null) {
        references.push({
          path: match[1].trim(),
          line: lineIndex + 1,
          column: match.index || 0
        });
      }
    });

    return references;
  }

  private referenceExists(usedRef: { path: string }, declaredRefs: string[]): boolean {
    // Exact match
    if (declaredRefs.includes(usedRef.path)) {
      return true;
    }

    // Pattern match for references.* (allows any group)
    if (usedRef.path === 'references.*') {
      return declaredRefs.some(ref => ref.startsWith('references.'));
    }

    return false;
  }
}