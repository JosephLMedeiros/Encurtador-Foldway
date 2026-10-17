/**
 * Verificações de acessibilidade automatizadas — CopyButton
 * CA-30.1, CA-30.2 — rótulos e aria-live (vitest-axe)
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { CopyButton } from '../CopyButton.jsx';

Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
});

describe('CA-30.1 / CA-30.2 — CopyButton sem violações axe', () => {
  it('estado inicial não tem violações de acessibilidade', async () => {
    const { container } = render(
      <CopyButton url="https://short.ly/abc" label="Copiar link curto" />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
