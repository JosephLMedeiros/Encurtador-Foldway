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
  /* Cores só via variáveis CSS (src/styles/theme.css); exclui testes      */
  {
    files: ['src/**/*.{js,jsx}'],
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

  /* ─── Configs de ferramentas (Vite) rodam no Node ─────────────────────── */
  {
    files: ['*.config.js'],
    languageOptions: { globals: globals.node },
  },
]);
