import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  // coverage = relatório HTML gerado por npm run test:coverage (não é código nosso)
  { ignores: ['**/dist', '**/coverage'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // argsIgnorePattern: componente recebido por parâmetro ({ icon: Icon })
      // e usado só em JSX, mesmo caso do varsIgnorePattern; e `_next` em
      // handlers do Express, que precisam dos 4 parâmetros.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]' }],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  // Backend roda em Node (process, Buffer, __dirname…), não no navegador.
  {
    files: ['backend/**/*.{js,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['backend/tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
  },
]
