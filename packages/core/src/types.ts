import type { z } from 'zod';

/**
 * Validation error types
 */
export interface ValidationError {
  type: 'frontmatter' | 'reference' | 'file' | 'circular' | 'syntax' | 'schema' | 'injection';
  message: string;
  location: string;
  details?: any;
}

/**
 * Processing options
 */
export interface ProcessOptions {
  content: string;
  baseDir: string;
  mode?: 'validate' | 'build';
  currentFile?: string;
  /**
   * Schema validation options
   */
  schema?: {
    /**
     * Zod schema for validating frontmatter
     */
    schema?: any; // z.ZodSchema
    /**
     * Whether to extend the default markdown-di schema
     */
    extend?: boolean;
    /**
     * Strict mode - fail on additional properties
     */
    strict?: boolean;
  };
  /**
   * Registered schemas for frontmatter validation
   */
  schemas?: Record<string, z.ZodSchema<any>>;
}

/**
 * Processing result
 */
export interface ProcessResult {
  content: string;
  frontmatter: FrontmatterData;
  errors: ValidationError[];
  dependencies: string[];
}

/**
 * Frontmatter data structure
 */
export interface FrontmatterData {
  name: string;
  description: string;
  blueprints?: Record<string, Record<string, string>>;
  references?: Record<string, string[]>;
  [key: string]: any;
}

/**
 * Dependency reference
 */
export interface DependencyReference {
  type: 'blueprint' | 'reference';
  group: string;
  key?: string;
  fullPath: string;
  sourceLine: number;
  sourceColumn: number;
}

/**
 * Processing context
 */
export interface ProcessingContext {
  baseDir: string;
  mode: 'validate' | 'build';
  visitedFiles: Set<string>;
  currentFile?: string;
}