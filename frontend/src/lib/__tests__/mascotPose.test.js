/**
 * Testes de resolvePose
 * CA-31.2 (pose correta por estado) e CA-31.3 (prioridade com condições simultâneas)
 */
import { describe, it, expect } from 'vitest';
import { resolvePose } from '../mascotPose.js';

/* Estado base limpo para evitar repetição */
const base = {
  submitStatus: 'idle',
  listLoading: false,
  listError: null,
  links: [{ shortCode: 'abc' }],
};

describe('resolvePose — CA-31.2 — pose correta por estado', () => {
  it('submitStatus=loading → loading (independente dos outros campos)', () => {
    expect(resolvePose({ ...base, submitStatus: 'loading', listError: 'falha', links: [] }))
      .toBe('loading');
  });

  it('submitStatus=error → error', () => {
    expect(resolvePose({ ...base, submitStatus: 'error' })).toBe('error');
  });

  it('listError definido → error (mesmo com submitStatus=idle)', () => {
    expect(resolvePose({ ...base, listError: 'Falha ao carregar' })).toBe('error');
  });

  it('submitStatus=success com listError=null → success', () => {
    expect(resolvePose({ ...base, submitStatus: 'success', listError: null })).toBe('success');
  });

  it('listLoading=false, links=[], sem erro → empty', () => {
    expect(resolvePose({ ...base, listLoading: false, links: [], listError: null }))
      .toBe('empty');
  });

  it('listLoading=true, links=[], sem erro → welcome (não empty)', () => {
    expect(resolvePose({ ...base, listLoading: true, links: [], listError: null }))
      .toBe('welcome');
  });

  it('estado padrão (lista com itens, sem erro) → welcome', () => {
    expect(resolvePose(base)).toBe('welcome');
  });
});

describe('resolvePose — CA-31.3 — prioridade com condições simultâneas', () => {
  it('submitStatus=loading + listError → loading prevalece', () => {
    expect(resolvePose({ ...base, submitStatus: 'loading', listError: 'err' }))
      .toBe('loading');
  });

  it('submitStatus=loading + links=[] → loading prevalece sobre empty', () => {
    expect(resolvePose({ ...base, submitStatus: 'loading', links: [] }))
      .toBe('loading');
  });

  it('submitStatus=error + listError → error (ambos redundantes, pose error)', () => {
    expect(resolvePose({ ...base, submitStatus: 'error', listError: 'err' }))
      .toBe('error');
  });

  it('listError + links=[] → error prevalece sobre empty', () => {
    expect(resolvePose({ ...base, listError: 'err', links: [], listLoading: false }))
      .toBe('error');
  });

  it('submitStatus=success + listError → error prevalece sobre success', () => {
    expect(resolvePose({ ...base, submitStatus: 'success', listError: 'err' }))
      .toBe('error');
  });

  it('submitStatus=success + links=[] + listLoading=false → success prevalece sobre empty', () => {
    expect(resolvePose({ ...base, submitStatus: 'success', links: [], listLoading: false }))
      .toBe('success');
  });
});
