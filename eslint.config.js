import { tanstackConfig } from '@tanstack/eslint-config'
import { globalIgnores } from 'eslint/config'

export default [
  globalIgnores([
    'convex/_generated/**',
    '.output',
    'dist',
    'node_modules',
    // Plain JS outside tsconfig, which the typed rules can't parse.
    'eslint.config.js',
    'prettier.config.js',
  ]),
  ...tanstackConfig,
]
