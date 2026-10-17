/**
 * Verifica que a regra no-restricted-syntax de hexadecimais
 * acusa erro em um trecho JSX com fill="#F2553D" num caminho
 * simulado em src/components/ (CA-25.2, design.md §Testing Strategy).
 */
import { describe, it, expect } from 'vitest';
import { Linter } from 'eslint';

describe('regra ESLint — proibição de hexadecimais em componentes', () => {
  it('acusa erro em fill="#F2553D" num arquivo de src/components/', () => {
    const linter = new Linter({ configType: 'flat' });

    /* Trecho JSX com hexadecimal hardcoded */
    const code = `
      export function Icon() {
        return <svg><circle fill="#F2553D" /></svg>;
      }
    `;

    /* Configura apenas o bloco da regra de hexadecimais,
       sem depender do eslint.config.js do projeto */
    const messages = linter.verify(
      code,
      [
        {
          files: ['src/components/**/*.{js,jsx}'],
          languageOptions: {
            parserOptions: { ecmaFeatures: { jsx: true } },
            ecmaVersion: 2022,
            sourceType: 'module',
          },
          rules: {
            'no-restricted-syntax': [
              'error',
              {
                selector:
                  'Literal[value=/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
                message:
                  'Não use valores hexadecimais diretamente. Referencie variáveis CSS (var(--color-...)).',
              },
            ],
          },
        },
      ],
      /* Caminho simulado dentro de src/components/ para ativar o bloco */
      { filename: 'src/components/Example.jsx' },
    );

    /* Deve haver pelo menos um erro de no-restricted-syntax */
    const hexErrors = messages.filter(
      (m) => m.ruleId === 'no-restricted-syntax',
    );
    expect(hexErrors.length).toBeGreaterThan(0);
    expect(hexErrors[0].message).toContain('var(--color-');
  });

  it('não acusa erro em fill="currentColor"', () => {
    const linter = new Linter({ configType: 'flat' });

    const code = `
      export function Icon() {
        return <svg><circle fill="currentColor" /></svg>;
      }
    `;

    const messages = linter.verify(
      code,
      [
        {
          files: ['src/components/**/*.{js,jsx}'],
          languageOptions: {
            parserOptions: { ecmaFeatures: { jsx: true } },
            ecmaVersion: 2022,
            sourceType: 'module',
          },
          rules: {
            'no-restricted-syntax': [
              'error',
              {
                selector:
                  'Literal[value=/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
                message:
                  'Não use valores hexadecimais diretamente. Referencie variáveis CSS (var(--color-...)).',
              },
            ],
          },
        },
      ],
      { filename: 'src/components/Example.jsx' },
    );

    const hexErrors = messages.filter(
      (m) => m.ruleId === 'no-restricted-syntax',
    );
    expect(hexErrors.length).toBe(0);
  });
});
