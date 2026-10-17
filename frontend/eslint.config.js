import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

/* Padrão que casa #RGB, #RRGGBB e #RRGGBBAA em literais de string (CA-25.2) */
const HEX_COLOR_PATTERN =
  /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export default defineConfig([
  /* Ignorar artefatos de build */
  globalIgnores(['dist']),

  /* ─── Bloco base: regras recomendadas + plugins React ─────────────────── */
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  /* ─── Bloco 1: proibir fetch fora de src/api/ (CA-01.2) ──────────────── */
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/api/**', '**/*.test.{js,jsx}', '**/*.spec.{js,jsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Use api.js para chamadas de rede. fetch direto só é permitido em src/api/.',
        },
      ],
    },
  },

  /* ─── Bloco 2: proibir hexadecimais em strings JS/JSX (CA-25.2) ─────── */
  /* Cobre src/components/, src/pages/ e src/animations/; exclui testes    */
  {
    files: [
      'src/components/**/*.{js,jsx}',
      'src/pages/**/*.{js,jsx}',
      'src/animations/**/*.{js,jsx}',
    ],
    ignores: ['**/*.test.{js,jsx}', '**/*.spec.{js,jsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=${HEX_COLOR_PATTERN}]`,
          message:
            'Não use valores hexadecimais diretamente. Referencie variáveis CSS (var(--color-...)).',
        },
      ],
    },
  },

  /* ─── Bloco 3: proibir endereços hardcoded em api.js (CA-02.2) ────────── */
  {
    files: ['src/api/api.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/localhost/]',
          message:
            'Não use "localhost" diretamente em api.js. Use VITE_API_BASE_URL.',
        },
        {
          selector: 'Literal[value=/127\\.0\\.0/]',
          message:
            'Não use "127.0.0.x" diretamente em api.js. Use VITE_API_BASE_URL.',
        },
      ],
    },
  },
]);
