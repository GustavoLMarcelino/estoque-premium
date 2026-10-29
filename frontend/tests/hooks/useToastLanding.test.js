import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { reducer, useToast, toast } from '../../src/pages/Premium/landing/hooks/use-toast.ts';

describe('use-toast da landing — reducer', () => {
  const vazio = { toasts: [] };
  const aviso = (id, extra = {}) => ({ id, title: `aviso ${id}`, open: true, ...extra });

  it('ADD_TOAST adiciona no topo', () => {
    const r = reducer(vazio, { type: 'ADD_TOAST', toast: aviso('1') });
    expect(r.toasts.map((t) => t.id)).toEqual(['1']);
  });

  it('ADD_TOAST respeita o limite de 1 toast: o mais novo substitui o anterior', () => {
    const um = reducer(vazio, { type: 'ADD_TOAST', toast: aviso('1') });
    const dois = reducer(um, { type: 'ADD_TOAST', toast: aviso('2') });
    expect(dois.toasts.map((t) => t.id)).toEqual(['2']);
  });

  it('UPDATE_TOAST altera só o toast do id informado', () => {
    const estado = { toasts: [aviso('1')] };
    const r = reducer(estado, { type: 'UPDATE_TOAST', toast: { id: '1', title: 'novo título' } });
    expect(r.toasts[0]).toMatchObject({ id: '1', title: 'novo título', open: true });
    const intacto = reducer(estado, { type: 'UPDATE_TOAST', toast: { id: '9', title: 'x' } });
    expect(intacto.toasts[0].title).toBe('aviso 1');
  });

  it('DISMISS_TOAST fecha (open=false) sem remover da lista ainda', () => {
    vi.useFakeTimers();
    const r = reducer({ toasts: [aviso('1')] }, { type: 'DISMISS_TOAST', toastId: '1' });
    expect(r.toasts).toHaveLength(1);
    expect(r.toasts[0].open).toBe(false);
    vi.useRealTimers();
  });

  it('DISMISS_TOAST sem id fecha todos', () => {
    vi.useFakeTimers();
    const r = reducer({ toasts: [aviso('1'), aviso('2')] }, { type: 'DISMISS_TOAST' });
    expect(r.toasts.every((t) => t.open === false)).toBe(true);
    vi.useRealTimers();
  });

  it('REMOVE_TOAST remove o id informado; sem id, esvazia a lista', () => {
    const estado = { toasts: [aviso('1'), aviso('2')] };
    expect(reducer(estado, { type: 'REMOVE_TOAST', toastId: '1' }).toasts.map((t) => t.id)).toEqual(['2']);
    expect(reducer(estado, { type: 'REMOVE_TOAST' }).toasts).toEqual([]);
  });
});

describe('use-toast da landing — hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // limpa o estado global do módulo entre os testes
    act(() => { vi.runOnlyPendingTimers(); });
    vi.useRealTimers();
  });

  it('toast() aparece no estado do hook, aberto', () => {
    const { result } = renderHook(() => useToast());
    act(() => { toast({ title: 'Mensagem enviada' }); });
    expect(result.current.toasts[0]).toMatchObject({ title: 'Mensagem enviada', open: true });
  });

  it('dois componentes usando o hook enxergam o mesmo toast', () => {
    const a = renderHook(() => useToast());
    const b = renderHook(() => useToast());
    act(() => { toast({ title: 'compartilhado' }); });
    expect(a.result.current.toasts[0].title).toBe('compartilhado');
    expect(b.result.current.toasts[0].title).toBe('compartilhado');
  });

  it('dismiss() do toast criado fecha ele', () => {
    const { result } = renderHook(() => useToast());
    let criado;
    act(() => { criado = toast({ title: 'fecha logo' }); });
    act(() => { criado.dismiss(); });
    expect(result.current.toasts[0].open).toBe(false);
  });

  it('update() troca o conteúdo do toast já exibido', () => {
    const { result } = renderHook(() => useToast());
    let criado;
    act(() => { criado = toast({ title: 'enviando…' }); });
    act(() => { criado.update({ id: criado.id, title: 'enviado!' }); });
    expect(result.current.toasts[0].title).toBe('enviado!');
  });

  it('o hook expõe dismiss() geral e fechar pelo onOpenChange(false)', () => {
    const { result } = renderHook(() => useToast());
    act(() => { toast({ title: 'um' }); });
    act(() => { result.current.toasts[0].onOpenChange(false); });
    expect(result.current.toasts[0].open).toBe(false);
    act(() => { toast({ title: 'dois' }); });
    act(() => { result.current.dismiss(); });
    expect(result.current.toasts[0].open).toBe(false);
  });

  it('cada toast recebe um id diferente', () => {
    let a; let b;
    act(() => { a = toast({ title: 'a' }); b = toast({ title: 'b' }); });
    expect(a.id).not.toBe(b.id);
  });
});
