/** @type {import('jest').Config} */
const config = {
  // Limpa mocks automaticamente entre os testes
  clearMocks: true,

  // Coleta de cobertura
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',

  // Ambiente de teste baseado no navegador (React)
  testEnvironment: 'jsdom',

  // Transforma arquivos com JSX, TS, etc.
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest'
  },

  // Ignorar transformações em node_modules
  transformIgnorePatterns: [
    '\\\\node_modules\\\\',
    '\\.pnp\\.[^\\\\]+$'
  ],

  // Mapeia imports de CSS para evitar erro durante testes
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },

  // Arquivo de setup global (TextEncoder, etc.)
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Detecta arquivos de teste
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[tj]s?(x)'
  ],

  // Ignora node_modules
  testPathIgnorePatterns: [
    '\\\\node_modules\\\\'
  ],

  // Extensões de arquivos reconhecidas
  moduleFileExtensions: [
    'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'json', 'node'
  ],

  // Runner padrão do Jest
  runner: 'jest-runner',
  testRunner: 'jest-circus/runner',

  // Diretório raiz
  roots: ['<rootDir>'],

  // Watchman para escutar arquivos
  watchman: true
};

module.exports = config;

