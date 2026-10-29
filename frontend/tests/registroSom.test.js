import { describe, it, expect } from 'vitest';
import {
  atalhoDoIntervalo, dataValida, horaBRT, intervaloDoAtalho, lerPeriodoDaUrl,
  rotuloDia, somaDias, urlTemPeriodoSom,
} from '../src/utils/registroSom.js';

describe('registroSom (frontend) — atalhos de período', () => {
  it('Hoje e 7 dias', () => {
    expect(intervaloDoAtalho('hoje', '2026-10-21')).toEqual({ de: '2026-10-21', ate: '2026-10-21' });
    expect(intervaloDoAtalho('7dias', '2026-10-21')).toEqual({ de: '2026-10-15', ate: '2026-10-21' });
    expect(intervaloDoAtalho('7dias', '2026-03-03')).toEqual({ de: '2026-02-25', ate: '2026-03-03' });
  });

  it('Quinzena atual: 1–15 ou 16–fim do mês, inclusive em fevereiro e ano bissexto', () => {
    expect(intervaloDoAtalho('quinzena', '2026-10-15')).toEqual({ de: '2026-10-01', ate: '2026-10-15' });
    expect(intervaloDoAtalho('quinzena', '2026-10-16')).toEqual({ de: '2026-10-16', ate: '2026-10-31' });
    expect(intervaloDoAtalho('quinzena', '2026-02-20')).toEqual({ de: '2026-02-16', ate: '2026-02-28' });
    expect(intervaloDoAtalho('quinzena', '2028-02-20')).toEqual({ de: '2028-02-16', ate: '2028-02-29' });
    expect(intervaloDoAtalho('quinzena', '2026-11-30')).toEqual({ de: '2026-11-16', ate: '2026-11-30' });
  });

  it('Mês atual', () => {
    expect(intervaloDoAtalho('mes', '2026-10-21')).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
    expect(intervaloDoAtalho('mes', '2026-12-05')).toEqual({ de: '2026-12-01', ate: '2026-12-31' });
  });

  it('reconhece o atalho pelo intervalo; fora disso é personalizado', () => {
    expect(atalhoDoIntervalo('2026-10-15', '2026-10-21', '2026-10-21')).toBe('7dias');
    expect(atalhoDoIntervalo('2026-10-21', '2026-10-21', '2026-10-21')).toBe('hoje');
    expect(atalhoDoIntervalo('2026-10-10', '2026-10-12', '2026-10-21')).toBe('personalizado');
  });
});

describe('registroSom (frontend) — URL', () => {
  const hoje = '2026-10-21';
  const u = (qs) => new URLSearchParams(qs);

  it('lê de, ate e filtro da URL', () => {
    expect(lerPeriodoDaUrl(u('de=2026-10-01&ate=2026-10-15&filtro=pedidos'), hoje))
      .toEqual({ de: '2026-10-01', ate: '2026-10-15', filtro: 'pedidos' });
  });

  it('sem parâmetros ou com lixo cai no padrão (7 dias, tudo)', () => {
    const padrao = { de: '2026-10-15', ate: '2026-10-21', filtro: 'tudo' };
    expect(lerPeriodoDaUrl(u(''), hoje)).toEqual(padrao);
    expect(lerPeriodoDaUrl(u('de=ontem&ate=hoje&filtro=xyz'), hoje)).toEqual(padrao);
    expect(lerPeriodoDaUrl(u('de=2026-10-20&ate=2026-10-10'), hoje)).toEqual(padrao); // de > ate
    expect(lerPeriodoDaUrl(u('de=2026-02-30&ate=2026-03-02'), hoje)).toEqual(padrao); // data inexistente
  });

  it('filtro inválido não derruba um período válido', () => {
    expect(lerPeriodoDaUrl(u('de=2026-10-01&ate=2026-10-02&filtro=xyz'), hoje))
      .toEqual({ de: '2026-10-01', ate: '2026-10-02', filtro: 'tudo' });
  });

  it('urlTemPeriodoSom', () => {
    expect(urlTemPeriodoSom(u(''))).toBe(false);
    expect(urlTemPeriodoSom(u('de=2026-10-01'))).toBe(true);
    expect(urlTemPeriodoSom(u('filtro=avulsas'))).toBe(true);
  });
});

describe('registroSom (frontend) — datas e rótulos', () => {
  it('rotuloDia: dia da semana certo, sem depender do fuso da máquina', () => {
    expect(rotuloDia('2026-10-21')).toBe('Qua, 21/10'); // 21/10/2026 é quarta
    expect(rotuloDia('2026-10-18')).toBe('Dom, 18/10');
    expect(rotuloDia('2026-10-24')).toBe('Sáb, 24/10');
  });

  it('somaDias e dataValida', () => {
    expect(somaDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(somaDias('2026-01-01', -1)).toBe('2025-12-31');
    expect(dataValida('2026-02-29')).toBe(false);
    expect(dataValida('2028-02-29')).toBe(true);
    expect(dataValida('21/10/2026')).toBe(false);
  });

  it('horaBRT mostra a hora de Brasília', () => {
    expect(horaBRT('2026-10-21T02:30:00Z')).toBe('23:30');
    expect(horaBRT('2026-10-21T15:05:00Z')).toBe('12:05');
    expect(horaBRT(null)).toBe('—');
  });
});
