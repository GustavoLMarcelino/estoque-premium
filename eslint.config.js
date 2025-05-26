import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist'] },

  // ✅ Bloco para arquivos comuns (JSX, React)
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.jest,
      },
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
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },

  // ✅ Bloco para babel.config.js com ambiente Node
  {
    files: ['babel.config.js'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },

  // ✅ Bloco para jest.setup.js com acesso ao "global"
  {
    files: ['jest.setup.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  }
]
