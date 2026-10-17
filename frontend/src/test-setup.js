/* Configuração global dos testes — importada pelo Vitest antes de cada arquivo */

/*
 * Com globals: true no vite.config.js, o Vitest injeta expect, describe, it etc.
 * globalmente antes de executar este arquivo, permitindo que jest-dom os use.
 */
import '@testing-library/jest-dom';

/* Registra os matchers de acessibilidade (ex.: toHaveNoViolations) */
import * as axeMatchers from 'vitest-axe/matchers';
import { expect } from 'vitest';
expect.extend(axeMatchers);
