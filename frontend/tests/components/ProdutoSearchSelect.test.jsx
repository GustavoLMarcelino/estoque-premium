import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProdutoSearchSelect from '../../src/components/ProdutoSearchSelect/ProdutoSearchSelect.jsx';

const produtos = [
  { id: 1, produto: 'Bateria 60Ah', modelo: 'M60', marca: { nome: 'Moura' } },
  { id: 2, produto: 'Bateria 45Ah', modelo: 'M45', marca: { nome: 'Acdelco' } },
  { id: 3, produto: 'Autofalante 6"', modelo: 'AF-6', marca: { nome: 'JBL' } },
  { id: 4, produto: 'Módulo Amplificador', modelo: 'AMP-1', marca: { nome: 'Taramps' } },
];

const caixa = () => screen.getByRole('combobox');
const opcoes = () => screen.queryAllByRole('option');

// Faz o papel do pai: guarda o produto escolhido (modo "select vinculado").
function Vinculado({ onEscolher, ...props }) {
  const [id, setId] = useState(null);
  return (
    <ProdutoSearchSelect
      produtos={produtos}
      value={id}
      onChange={(p) => { setId(p.id); onEscolher?.(p); }}
      placeholder="Selecione o produto"
      {...props}
    />
  );
}

describe('ProdutoSearchSelect — abrir e listar', () => {
  it('começa fechado, com o placeholder', () => {
    render(<Vinculado />);
    expect(caixa()).toHaveAttribute('aria-expanded', 'false');
    expect(caixa()).toHaveAttribute('placeholder', 'Selecione o produto');
    expect(opcoes()).toHaveLength(0);
  });

  it('ao focar, mostra todos os produtos (comportamento do select nativo)', async () => {
    render(<Vinculado />);
    await userEvent.click(caixa());
    expect(opcoes()).toHaveLength(4);
    expect(caixa()).toHaveAttribute('aria-expanded', 'true');
  });

  it('com showAllOnEmpty desligado, só lista depois de digitar (modo Orçamento)', async () => {
    render(<Vinculado showAllOnEmpty={false} />);
    await userEvent.click(caixa());
    expect(opcoes()).toHaveLength(0);
    await userEvent.type(caixa(), 'bat');
    expect(opcoes()).toHaveLength(2);
  });

  it('respeita o limite de resultados', async () => {
    render(<Vinculado maxResults={2} />);
    await userEvent.click(caixa());
    expect(opcoes()).toHaveLength(2);
  });

  it('usa renderOption para desenhar cada linha', async () => {
    render(<Vinculado renderOption={(p) => <span>{`${p.produto} (id ${p.id})`}</span>} />);
    await userEvent.click(caixa());
    expect(screen.getByText('Bateria 60Ah (id 1)')).toBeInTheDocument();
  });
});

describe('ProdutoSearchSelect — busca', () => {
  it('ignora acentos e maiúsculas', async () => {
    render(<Vinculado />);
    await userEvent.type(caixa(), 'MODULO');
    expect(opcoes()).toHaveLength(1);
    expect(opcoes()[0]).toHaveTextContent('Módulo Amplificador');
  });

  it('procura também no modelo e na marca', async () => {
    render(<Vinculado />);
    await userEvent.type(caixa(), 'acdelco');
    expect(opcoes()).toHaveLength(1);
    expect(opcoes()[0]).toHaveTextContent('Bateria 45Ah');
    await userEvent.clear(caixa());
    await userEvent.type(caixa(), 'af-6');
    expect(opcoes()[0]).toHaveTextContent('Autofalante');
  });

  it('sem resultado, mostra a mensagem de vazio', async () => {
    render(<Vinculado emptyText="Nada por aqui." />);
    await userEvent.type(caixa(), 'xyz');
    expect(opcoes()).toHaveLength(0);
    expect(screen.getByText('Nada por aqui.')).toBeInTheDocument();
  });
});

describe('ProdutoSearchSelect — escolher', () => {
  it('clicar numa opção entrega o OBJETO do produto e mostra o rótulo ao fechar', async () => {
    const escolher = vi.fn();
    render(<Vinculado onEscolher={escolher} />);
    await userEvent.click(caixa());
    await userEvent.click(screen.getByRole('button', { name: /Bateria 45Ah/ }));
    expect(escolher).toHaveBeenCalledWith(produtos[1]);
    expect(caixa()).toHaveValue('Bateria 45Ah');
    expect(opcoes()).toHaveLength(0);
  });

  it('no modo "busca e adiciona" (value nulo), o campo limpa depois de escolher', async () => {
    const escolher = vi.fn();
    render(<ProdutoSearchSelect produtos={produtos} value={null} onChange={escolher} />);
    await userEvent.type(caixa(), 'amplif');
    await userEvent.click(screen.getByRole('button', { name: /Módulo Amplificador/ }));
    expect(escolher).toHaveBeenCalledWith(produtos[3]);
    expect(caixa()).toHaveValue('');
  });

  it('o rótulo do produto já selecionado aparece ao carregar (editar um registro)', () => {
    render(<ProdutoSearchSelect produtos={produtos} value="3" onChange={() => {}} />);
    expect(caixa()).toHaveAttribute('placeholder', 'Autofalante 6"');
  });
});

describe('ProdutoSearchSelect — teclado', () => {
  it('seta para baixo abre a lista; Enter escolhe o destacado', async () => {
    const escolher = vi.fn();
    render(<Vinculado onEscolher={escolher} />);
    caixa().focus();
    await userEvent.keyboard('{Escape}{ArrowDown}');
    expect(caixa()).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(escolher).toHaveBeenCalledWith(produtos[1]);
  });

  it('seta para cima volta o destaque, sem passar do primeiro', async () => {
    const escolher = vi.fn();
    render(<Vinculado onEscolher={escolher} />);
    await userEvent.click(caixa());
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{ArrowUp}{ArrowUp}{Enter}');
    expect(escolher).toHaveBeenCalledWith(produtos[0]);
  });

  it('seta para baixo não passa do último', async () => {
    const escolher = vi.fn();
    render(<Vinculado onEscolher={escolher} />);
    await userEvent.click(caixa());
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
    expect(escolher).toHaveBeenCalledWith(produtos[3]);
  });

  it('Enter NÃO envia o formulário em volta', async () => {
    const enviar = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={enviar}>
        <Vinculado />
      </form>,
    );
    await userEvent.click(caixa());
    await userEvent.keyboard('{Enter}');
    expect(enviar).not.toHaveBeenCalled();
  });

  it('Esc fecha a lista e apaga o que foi digitado', async () => {
    render(<Vinculado />);
    await userEvent.type(caixa(), 'bat');
    await userEvent.keyboard('{Escape}');
    expect(opcoes()).toHaveLength(0);
    expect(caixa()).toHaveValue('');
  });
});

describe('ProdutoSearchSelect — fechar e desabilitar', () => {
  it('clicar fora fecha a lista', async () => {
    render(
      <div>
        <Vinculado />
        <button>fora</button>
      </div>,
    );
    await userEvent.click(caixa());
    expect(opcoes()).toHaveLength(4);
    await userEvent.click(screen.getByText('fora'));
    expect(opcoes()).toHaveLength(0);
  });

  it('desabilitado, não abre nem aceita teclas', async () => {
    render(<Vinculado disabled />);
    expect(caixa()).toBeDisabled();
    await userEvent.click(caixa());
    expect(opcoes()).toHaveLength(0);
  });
});
