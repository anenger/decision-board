import { tanstackConfig } from '@tanstack/eslint-config'
import { globalIgnores } from 'eslint/config'

export default [
  globalIgnores([
    'convex/_generated/**',
    '.output',
    'dist',
    'node_modules',
    // Plain JS config files aren't in tsconfig, so type-aware rules can't parse them.
    'eslint.config.js',
    'prettier.config.js',
  ]),
  ...tanstackConfig,
]
