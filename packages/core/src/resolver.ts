import { globSync } from 'fast-glob';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import type { FrontmatterData, DependencyReference, ProcessingContext, ValidationError } from './types';

/**
 * Resolves dependency references to actual file paths
 */
export class DependencyResolver {
  constructor(private context: ProcessingContext) {}

  resolve(frontmatter: FrontmatterData): { dependencies: string[]; errors: ValidationError[] } {
    const dependencies: string[] = [];
    const errors: ValidationError[] = [];

    // Resolve blueprints
    if (frontmatter.blueprints) {
      for (const [groupName, group] of Object.entries(frontmatter.blueprints)) {
        for (const [key, path] of Object.entries(group)) {
          const resolved = this.resolveBlueprintPath(groupName, key, path);
          if (resolved.error) {
            errors.push(resolved.error);
          } else {
            dependencies.push(resolved.path);
          }
        }
      }
    }

    // Resolve references (with glob support)
    if (frontmatter.references) {
      for (const [groupName, patterns] of Object.entries(frontmatter.references)) {
        patterns.forEach(pattern => {
          const resolved = this.resolveReferencePatterns(groupName, pattern);
          if (resolved.error) {
            errors.push(resolved.error);
          } else {
            dependencies.push(...resolved.paths);
          }
        });
      }
    }

    return { dependencies, errors };
  }

  private resolveBlueprintPath(group: string, key: string, path: string) {
    const fullPath = join(this.context.baseDir, path);

    if (!existsSync(fullPath)) {
      return {
        error: {
          type: 'file' as const,
          message: `Blueprint file not found: ${path}`,
          location: `blueprints.${group}.${key}`
        },
        path: ''
      };
    }

    return { path: fullPath };
  }

  private resolveReferencePatterns(group: string, pattern: string) {
    const errors: ValidationError[] = [];
    const paths: string[] = [];

    try {
      const globPattern = join(this.context.baseDir, pattern);
      const matchedFiles = globSync(globPattern, {
        absolute: true,
        onlyFiles: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
      });

      if (matchedFiles.length === 0) {
        return {
          error: {
            type: 'file' as const,
            message: `No files found matching pattern: ${pattern}`,
            location: `references.${group}`
          },
          paths: []
        };
      }

      // Sort files for consistent processing
      matchedFiles.sort();
      paths.push(...matchedFiles);

      return { paths, errors: [] };
    } catch (error) {
      return {
        error: {
          type: 'file' as const,
          message: `Invalid glob pattern "${pattern}": ${error}`,
          location: `references.${group}`
        },
        paths: []
      };
    }
  }

  /**
   * Extract references from content and resolve them to file paths
   */
  extractReferences(content: string, frontmatter: FrontmatterData): DependencyReference[] {
    const references: DependencyReference[] = [];
    const lines = content.split('\n');
    const referencePattern = /\{\{([^}]+)\}\}/g;

    lines.forEach((line, lineIndex) => {
      let match;
      while ((match = referencePattern.exec(line)) !== null) {
        const reference = match[1].trim();
        const resolved = this.resolveReferenceToPath(reference, frontmatter, lineIndex + 1, match.index);

        if (resolved) {
          references.push(resolved);
        }
      }
    });

    return references;
  }

  private resolveReferenceToPath(
    reference: string,
    frontmatter: FrontmatterData,
    line: number,
    column: number
  ): DependencyReference | null {
    const parts = reference.split('.');

    if (parts.length === 1) {
      // Single part - check if it's a blueprint group
      if (frontmatter.blueprints && frontmatter.blueprints[reference]) {
        return {
          type: 'blueprint',
          group: reference,
          fullPath: this.resolveBlueprintGroup(reference, frontmatter.blueprints[reference]),
          sourceLine: line,
          sourceColumn: column
        };
      }
      return null;
    }

    if (parts.length === 2) {
      const [section, group] = parts;

      if (section === 'references') {
        // references.group - return all files in group
        if (frontmatter.references && frontmatter.references[group]) {
          const files = frontmatter.references[group].map(f => join(this.context.baseDir, f));
          return {
            type: 'reference',
            group,
            fullPath: files.join('\n'),
            sourceLine: line,
            sourceColumn: column
          };
        }
      } else {
        // group.key - assume blueprint
        if (frontmatter.blueprints && frontmatter.blueprints[section]) {
          const blueprintGroup = frontmatter.blueprints[section];
          if (blueprintGroup[group]) {
            return {
              type: 'blueprint',
              group: section,
              key: group,
              fullPath: join(this.context.baseDir, blueprintGroup[group]),
              sourceLine: line,
              sourceColumn: column
            };
          }
        }
      }
    }

    if (parts.length === 3) {
      const [section, group, key] = parts;

      if (section === 'blueprints') {
        if (frontmatter.blueprints && frontmatter.blueprints[group] && frontmatter.blueprints[group][key]) {
          return {
            type: 'blueprint',
            group,
            key,
            fullPath: join(this.context.baseDir, frontmatter.blueprints[group][key]),
            sourceLine: line,
            sourceColumn: column
          };
        }
      }
    }

    return null;
  }

  private resolveBlueprintGroup(groupName: string, group: Record<string, string>): string {
    return Object.values(group)
      .map(path => readFileSync(join(this.context.baseDir, path), 'utf-8'))
      .join('\n\n');
  }
}

/**
 * Detects circular dependencies between files
 */
export class CircularDependencyDetector {
  private dependencyGraph: Map<string, string[]> = new Map();

  detect(filePath: string, dependencies: string[]): ValidationError[] {
    const errors: ValidationError[] = [];

    // Build dependency graph
    this.dependencyGraph.set(filePath, dependencies);

    // Check for cycles
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const [file, deps] of this.dependencyGraph) {
      if (this.hasCycle(file, visited, recursionStack)) {
        const cycle = this.findCycle(file);
        if (cycle.length > 0) {
          errors.push({
            type: 'circular',
            message: `Circular dependency detected: ${cycle.join(' -> ')} -> ${cycle[0]}`,
            location: filePath
          });
        }
      }
    }

    return errors;
  }

  private hasCycle(file: string, visited: Set<string>, recursionStack: Set<string>): boolean {
    if (!visited.has(file)) {
      visited.add(file);
      recursionStack.add(file);

      const dependencies = this.dependencyGraph.get(file) || [];
      for (const dependency of dependencies) {
        if (!visited.has(dependency) && this.hasCycle(dependency, visited, recursionStack)) {
          return true;
        } else if (recursionStack.has(dependency)) {
          return true;
        }
      }
    }

    recursionStack.delete(file);
    return false;
  }

  private findCycle(startFile: string): string[] {
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (file: string): boolean => {
      if (path.includes(file)) {
        const cycleStart = path.indexOf(file);
        return path.slice(cycleStart).concat(file).length > 0;
      }

      if (visited.has(file)) {
        return false;
      }

      visited.add(file);
      path.push(file);

      const dependencies = this.dependencyGraph.get(file) || [];
      for (const dependency of dependencies) {
        if (dfs(dependency)) {
          return true;
        }
      }

      path.pop();
      return false;
    };

    dfs(startFile);
    return path;
  }
}