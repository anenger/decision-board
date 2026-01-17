import { tanstackConfig } from '@tanstack/eslint-config'
import { globalIgnores } from 'eslint/config'

export default [globalIgnores(['convex/_generated/**']), ...tanstackConfig]
