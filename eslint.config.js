import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    // Fichiers de config exécutés par Node (et non par le navigateur)
    files: ['*.config.js', 'scripts/**/*.mjs', 'api/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^[A-Z_]',
          // Composants passés en props/paramètres (ex. `({ Icon }) => <Icon />`) :
          // ESLint seul ne voit pas l'usage en JSX.
          argsIgnorePattern: '^[A-Z_]',
          // Motif « omettre des champs » : const { secret, ...rest } = obj
          ignoreRestSiblings: true,
        },
      ],
    },
  },
])
