import type { z } from 'zod';

/**
 * Validation error types
 */
export interface ValidationError {
  type: 'frontmatter' | 'partial' | 'file' | 'circular' | 'syntax' | 'schema' | 'injection';
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
  partials?: Record<string, string | string[]>;
  'output-frontmatter'?: string[];
  [key: string]: any;
}

/**
 * Dependency reference
 */
export interface DependencyReference {
  type: 'partial';
  key: string;
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