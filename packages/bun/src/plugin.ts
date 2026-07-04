import { plugin } from 'bun'
import { markdownDiLoader } from './loader'

// Side-effect entrypoint: registers the .md loader with the Bun runtime.
// Add to bunfig.toml:  preload = ["@markdown-di/bun/plugin"]
plugin(markdownDiLoader)
