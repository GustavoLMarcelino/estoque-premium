import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DateInputBR from '../../src/components/ui/DateInputBR.jsx';

// O campo é controlado em ISO pelo pai; este wrapper faz o papel do pai e
// guarda o último valor emitido para o teste conferir.
function Pai({ inicial = '', onEmitir, ...props }) {
  const [valor, setValor] = useState(inicial);
  return (
    <DateInputBR
      label="Data de compra"
      value={valor}
      onChange={(iso) => { setValor(iso); onEmitir?.(iso); }}
      {...props}
    />
  );
}

const campo = () => screen.getByPlaceholderText('dd/mm/aaaa');

describe('DateInputBR — digitação', () => {
  it('mascara enquanto digita e devolve ISO quando a data fica completa', async () => {
    const emitir = vi.fn();
    render(<Pai onEmitir={emitir} />);
    await userEvent.type(campo(), '21102026');
    expect(campo()).toHaveValue('21/10/2026');
    expect(emitir).toHaveBeenLastCalledWith('2026-10-21');
  });

  it('enquanto a data está incompleta, devolve vazio', async () => {
    const emitir = vi.fn();
    render(<Pai onEmitir={emitir} />);
    await userEvent.type(campo(), '2110');
    expect(campo()).toHaveValue('21/10');
    expect(emitir).toHaveBeenLastCalledWith('');
  });

  it('ignora letras e símbolos digitados', async () => {
    render(<Pai />);
    await userEvent.type(campo(), 'ab2-1x');
    expect(campo()).toHaveValue('21');
  });

  it('não aceita mais de 10 caracteres', async () => {
    render(<Pai />);
    await userEvent.type(campo(), '2110202699');
    expect(campo()).toHaveValue('21/10/2026');
  });
});

describe('DateInputBR — validação visível', () => {
  it('10 caracteres que não formam data real mostram "Data inválida"', async () => {
    render(<Pai />);
    await userEvent.type(campo(), '31022026');
    expect(screen.getByText('Data inválida')).toBeInTheDocument();
  });

  it('data válida não mostra aviso', async () => {
    render(<Pai required />);
    await userEvent.type(campo(), '15032026');
    expect(screen.queryByText('Data inválida')).not.toBeInTheDocument();
    expect(screen.queryByText('Obrigatório')).not.toBeInTheDocument();
  });

  it('com required e vazio, mostra "Obrigatório"', () => {
    render(<Pai required />);
    expect(screen.getByText('Obrigatório')).toBeInTheDocument();
  });

  it('sem required e vazio, não reclama de nada', () => {
    render(<Pai />);
    expect(screen.queryByText('Obrigatório')).not.toBeInTheDocument();
  });
});

describe('DateInputBR — valor vindo de fora', () => {
  it('mostra no formato brasileiro o ISO recebido (editar um registro existente)', () => {
    render(<Pai inicial="2026-10-21" />);
    expect(campo()).toHaveValue('21/10/2026');
  });

  it('quando o pai troca o valor, o texto acompanha', () => {
    const { rerender } = render(<DateInputBR value="2026-01-05" onChange={() => {}} />);
    expect(campo()).toHaveValue('05/01/2026');
    rerender(<DateInputBR value="2027-12-31" onChange={() => {}} />);
    expect(campo()).toHaveValue('31/12/2027');
  });

  it('desabilitado, não aceita digitação', () => {
    render(<Pai disabled />);
    expect(campo()).toBeDisabled();
  });

  it('mostra o rótulo quando informado', () => {
    render(<Pai />);
    expect(screen.getByText('Data de compra')).toBeInTheDocument();
  });
});
