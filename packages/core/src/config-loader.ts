import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface MarkdownDIConfig {
  schemas: Record<string, any> // JSON Schema objects
}

/**
 * Loads configuration files for markdown-di
 * Supports auto-discovery by walking up directories
 */
export class ConfigLoader {
  private static readonly CONFIG_NAMES = [
    '.markdown-di.json',
    '.markdown-di.schemas.json',
    'markdown-di.config.json',
  ]

  /**
   * Find config file by walking up directories (like .git, .prettierrc)
   * @param startDir - Directory to start searching from
   * @returns Path to config file or null if not found
   */
  findConfig(startDir: string): string | null {
    let currentDir = startDir
    const root = dirname(currentDir) === currentDir // Reached filesystem root

    while (!root) {
      for (const name of ConfigLoader.CONFIG_NAMES) {
        const configPath = join(currentDir, name)
        if (existsSync(configPath)) {
          return configPath
        }
      }

      const parentDir = dirname(currentDir)
      if (parentDir === currentDir) break // Reached root
      currentDir = parentDir
    }

    return null
  }

  /**
   * Load and parse config file
   * @param configPath - Path to config file
   * @returns Parsed config object
   */
  loadConfig(configPath: string): MarkdownDIConfig {
    if (!existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`)
    }

    const content = readFileSync(configPath, 'utf-8')

    try {
      const parsed = JSON.parse(content)

      // Validate basic structure
      if (!parsed.schemas || typeof parsed.schemas !== 'object') {
        throw new Error('Config must have a "schemas" object')
      }

      return parsed as MarkdownDIConfig
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(`Invalid JSON in config file: ${err.message}`)
      }
      throw err
    }
  }

  /**
   * Load config with auto-discovery
   * @param startDir - Directory to start searching from
   * @param explicitPath - Optional explicit config path (overrides auto-discovery)
   * @returns Config object or null if not found
   */
  loadConfigAuto(startDir: string, explicitPath?: string): MarkdownDIConfig | null {
    const configPath = explicitPath || this.findConfig(startDir)

    if (!configPath) {
      return null
    }

    return this.loadConfig(configPath)
  }
}
