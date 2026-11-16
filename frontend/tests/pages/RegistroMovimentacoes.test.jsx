// Tela Reg. Movimentação (aba Baterias): lista de vendas, quitação de fiado,
// edição e exclusão de venda. São as ações que mexem com dinheiro e estoque
// depois que a venda já foi lançada.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/services/movimentacoes.js', () => ({
  MovAPI: { listarPagina: vi.fn(), atualizar: vi.fn(), remover: vi.fn() },
}));
vi.mock('../../src/services/estoque.js', () => ({ EstoqueAPI: { listar: vi.fn() } }));
vi.mock('../../src/services/inventario.js', () => ({ InventarioAPI: { ativa: vi.fn() } }));
// A aba Som é outra tela (RegistroSom); aqui só interessa a de Baterias.
vi.mock('../../src/pages/RegistroMovimentacoes/RegistroSom.jsx', () => ({ default: () => <div>registro do Som</div> }));

import { MovAPI } from '../../src/services/movimentacoes.js';
import { EstoqueAPI } from '../../src/services/estoque.js';
import { InventarioAPI } from '../../src/services/inventario.js';
import { ToastProvider } from '../../src/components/ui/Toast.jsx';
import { ConfirmProvider } from '../../src/components/ui/ConfirmDialog.jsx';
import RegistroMovimentacoes from '../../src/pages/RegistroMovimentacoes/RegistroMovimentacoes.jsx';

const venda = (extra = {}) => ({
  id: 10, tipo: 'SAIDA', produto_id: 1, quantidade: 2, valor_final: '300.00',
  vendedor: 'Ismael', forma_pagamento: 'pix', parcelas: null,
  status_pagamento: 'PAGO', cliente_fiado: null, garantia_id: null,
  data_movimentacao: '2026-11-10T15:00:00.000Z',
  estoque: { produto: 'Bateria 60Ah', modelo: 'M60' },
  ...extra,
});
const FIADO = venda({
  id: 11, forma_pagamento: null, status_pagamento: 'FIADO', cliente_fiado: 'João da esquina',
  estoque: { produto: 'Bateria 45Ah', modelo: 'M45' }, produto_id: 2,
});
const ENTRADA = venda({
  id: 12, tipo: 'ENTRADA', vendedor: null, forma_pagamento: null,
  estoque: { produto: 'Bateria 70Ah', modelo: 'M70' }, produto_id: 3,
});
const EMPRESTIMO = venda({
  id: 13, garantia_id: 5, vendedor: null, forma_pagamento: null, motivo: 'Empréstimo garantia #5',
  estoque: { produto: 'Bateria 50Ah', modelo: 'M50' }, produto_id: 4,
});

const pagina = (...linhas) => ({ data: linhas, pages: 1, total: linhas.length });

function logar(role) {
  localStorage.setItem('token', 'tk');
  localStorage.setItem('role', role);
  localStorage.setItem('permissoes', JSON.stringify({ linha_baterias: true, reg_movimentacao: true }));
}

/** Renderiza a tela e espera a primeira carga (a busca tem atraso de 300 ms). */
async function renderizar(primeiroTexto = 'Bateria 60Ah') {
  render(
    <MemoryRouter>
      <ToastProvider>
        <ConfirmProvider>
          <RegistroMovimentacoes />
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
  await screen.findByText(primeiroTexto, {}, { timeout: 3000 });
}

const botaoEditar = (produto) => screen.getByRole('button', { name: `Editar venda de ${produto}` });
const botaoExcluir = (produto) => screen.getByRole('button', { name: `Excluir movimentação de ${produto}` });
const salvar = (user) => user.click(screen.getByRole('button', { name: 'Salvar' }));
// Os <label> do formulário de edição não têm htmlFor: os campos são achados
// pela ordem em que aparecem (Qtd. e Valor unit. são os dois campos numéricos;
// Vendedor, Forma e Parcelas são os três seletores).
const campoQtd = () => screen.getAllByRole('spinbutton')[0];
const seletor = (indice) => screen.getAllByRole('combobox').filter((el) => el.tagName === 'SELECT')[indice];
const seletorVendedor = () => seletor(0);
const seletorForma = () => seletor(1);
const dialogo = () => screen.findByRole('dialog');

beforeEach(() => {
  vi.resetAllMocks();
  logar('admin');
  MovAPI.listarPagina.mockResolvedValue(pagina(venda(), FIADO, ENTRADA, EMPRESTIMO));
  MovAPI.atualizar.mockResolvedValue({});
  MovAPI.remover.mockResolvedValue();
  EstoqueAPI.listar.mockResolvedValue([
    { id: 1, produto: 'Bateria 60Ah', modelo: 'M60', qtd_inicial: 10, entradas: 0, saidas: 2 },
    { id: 2, produto: 'Bateria 45Ah', modelo: 'M45', qtd_inicial: 5, entradas: 0, saidas: 2 },
  ]);
  InventarioAPI.ativa.mockResolvedValue(null);
});

describe('Reg. Movimentação — lista de Baterias', () => {
  it('mostra a forma de pagamento da venda paga e o nome de quem deve na venda fiado', async () => {
    await renderizar();
    expect(screen.getByText('Pix')).toBeInTheDocument();
    expect(screen.getByText('FIADO — João da esquina')).toBeInTheDocument();
    expect(screen.getByText('Compra de produto')).toBeInTheDocument();
  });

  it('usuário comum vê a lista, mas não vê os botões de editar nem de excluir', async () => {
    logar('user');
    await renderizar();
    expect(screen.queryByRole('button', { name: /Editar venda/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Excluir movimentação/ })).not.toBeInTheDocument();
    // E nem carrega o apoio da edição (catálogo e conferência aberta).
    expect(EstoqueAPI.listar).not.toHaveBeenCalled();
  });

  it('só venda pode ser editada: entrada e empréstimo de garantia não têm o botão de editar', async () => {
    await renderizar();
    expect(botaoEditar('Bateria 60Ah')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar venda de Bateria 70Ah' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar venda de Bateria 50Ah' })).not.toBeInTheDocument();
  });

  it('o filtro "Fiados em aberto" pede ao servidor só as vendas fiado', async () => {
    const user = userEvent.setup();
    await renderizar();
    expect(MovAPI.listarPagina).toHaveBeenLastCalledWith(expect.objectContaining({ status_pagamento: undefined }));

    await user.click(screen.getByRole('button', { name: /Fiados em aberto/ }));
    await waitFor(() => expect(MovAPI.listarPagina).toHaveBeenLastCalledWith(
      expect.objectContaining({ status_pagamento: 'FIADO', page: 1 }),
    ), { timeout: 3000 });
  });

  it('erro do servidor ao carregar aparece na tela no lugar da lista', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    MovAPI.listarPagina.mockRejectedValue({ response: { data: { message: 'Você não tem permissão para esta ação.' } } });
    await renderizar('Você não tem permissão para esta ação.');
    expect(screen.getByText('Nenhuma movimentação encontrada.')).toBeInTheDocument();
    erro.mockRestore();
  });
});

describe('Reg. Movimentação — quitar venda fiado', () => {
  it('dar baixa no fiado envia o status PAGO junto com a forma de pagamento', async () => {
    const user = userEvent.setup();
    await renderizar();
    await user.click(botaoEditar('Bateria 45Ah'));
    await user.click(screen.getByRole('checkbox', { name: /Cliente pagou/ }));
    await user.selectOptions(seletorForma(), 'pix');
    await salvar(user);

    await waitFor(() => expect(MovAPI.atualizar).toHaveBeenCalled());
    expect(MovAPI.atualizar).toHaveBeenCalledWith(11, { forma_pagamento: 'pix', status_pagamento: 'PAGO' });
    expect(await screen.findByText('Venda atualizada.')).toBeInTheDocument();
  });

  it('dar baixa no fiado sem dizer a forma de pagamento é barrado e nada é enviado', async () => {
    const user = userEvent.setup();
    await renderizar();
    await user.click(botaoEditar('Bateria 45Ah'));
    await user.click(screen.getByRole('checkbox', { name: /Cliente pagou/ }));
    await salvar(user);

    expect(await screen.findByText('Informe a forma de pagamento para dar baixa nesta venda fiado.')).toBeInTheDocument();
    expect(MovAPI.atualizar).not.toHaveBeenCalled();
  });

  it('venda que continua fiado não pode ser salva sem o nome do cliente', async () => {
    const user = userEvent.setup();
    await renderizar();
    await user.click(botaoEditar('Bateria 45Ah'));
    await user.clear(screen.getByPlaceholderText('Nome de quem está devendo'));
    await salvar(user);

    expect(await screen.findByText('Informe o nome do cliente desta venda fiado.')).toBeInTheDocument();
    expect(MovAPI.atualizar).not.toHaveBeenCalled();
  });

  it('corrigir o nome de quem deve envia só o nome novo', async () => {
    const user = userEvent.setup();
    await renderizar();
    await user.click(botaoEditar('Bateria 45Ah'));
    const campo = screen.getByPlaceholderText('Nome de quem está devendo');
    await user.clear(campo);
    await user.type(campo, 'João Silva');
    await salvar(user);

    await waitFor(() => expect(MovAPI.atualizar).toHaveBeenCalled());
    expect(MovAPI.atualizar).toHaveBeenCalledWith(11, { cliente_fiado: 'João Silva' });
  });
});

describe('Reg. Movimentação — editar venda', () => {
  it('mudar a quantidade envia a quantidade nova e o valor unitário da venda', async () => {
    const user = userEvent.setup();
    await renderizar();
    await user.click(botaoEditar('Bateria 60Ah'));
    // 8 em estoque + 2 desta venda, que voltam antes da nova baixa.
    expect(screen.getByText(/Disponível: 10 un\./)).toBeInTheDocument();
    await user.clear(campoQtd());
    await user.type(campoQtd(), '3');
    await salvar(user);

    await waitFor(() => expect(MovAPI.atualizar).toHaveBeenCalled());
    expect(MovAPI.atualizar).toHaveBeenCalledWith(10, { quantidade: 3, valor_final: 300, forma_pagamento: 'pix' });
  });

  it('quantidade zero é barrada na tela e nada é enviado', async () => {
    const user = userEvent.setup();
    await renderizar();
    await user.click(botaoEditar('Bateria 60Ah'));
    await user.clear(campoQtd());
    await user.type(campoQtd(), '0');
    await salvar(user);

    expect(await screen.findByText('Quantidade deve ser um inteiro maior que zero.')).toBeInTheDocument();
    expect(MovAPI.atualizar).not.toHaveBeenCalled();
  });

  it('trocar o vendedor envia o vendedor novo, e a lista não oferece tirar o vendedor da venda', async () => {
    const user = userEvent.setup();
    await renderizar();
    await user.click(botaoEditar('Bateria 60Ah'));
    expect(within(seletorVendedor()).queryByRole('option', { name: '—' })).not.toBeInTheDocument();
    await user.selectOptions(seletorVendedor(), 'Gustavo');
    await salvar(user);

    await waitFor(() => expect(MovAPI.atualizar).toHaveBeenCalled());
    expect(MovAPI.atualizar).toHaveBeenCalledWith(10, { vendedor: 'Gustavo', forma_pagamento: 'pix' });
  });

  it('venda de quinzena já fechada pede confirmação, e cancelar não salva nada', async () => {
    MovAPI.listarPagina.mockResolvedValue(pagina(venda({ periodo_fechado: true })));
    const user = userEvent.setup();
    await renderizar();
    await user.click(botaoEditar('Bateria 60Ah'));
    await user.selectOptions(seletorVendedor(), 'Gustavo');
    await salvar(user);

    const aviso = await dialogo();
    expect(within(aviso).getByText('Quinzena de comissão já fechada')).toBeInTheDocument();
    expect(within(aviso).getByText(/já foi apurada e paga a Ismael/)).toBeInTheDocument();
    await user.click(within(aviso).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(MovAPI.atualizar).not.toHaveBeenCalled();
  });

  it('com conferência de estoque aberta, mudar a quantidade pede confirmação antes de salvar', async () => {
    InventarioAPI.ativa.mockResolvedValue({ id: 1, status: 'EM_ANDAMENTO' });
    const user = userEvent.setup();
    await renderizar();
    await user.click(botaoEditar('Bateria 60Ah'));
    await user.clear(campoQtd());
    await user.type(campoQtd(), '1');
    await salvar(user);

    const aviso = await dialogo();
    expect(within(aviso).getByText('Inventário em andamento')).toBeInTheDocument();
    expect(MovAPI.atualizar).not.toHaveBeenCalled();
    await user.click(within(aviso).getByRole('button', { name: 'Editar mesmo assim' }));

    await waitFor(() => expect(MovAPI.atualizar).toHaveBeenCalled());
    expect(MovAPI.atualizar).toHaveBeenCalledWith(10, { quantidade: 1, valor_final: 300, forma_pagamento: 'pix' });
  });

  it('recusa do servidor ao salvar aparece para o usuário e o formulário continua aberto', async () => {
    MovAPI.atualizar.mockRejectedValue({ response: { data: { message: 'Estoque insuficiente de "Bateria 60Ah - M60".' } } });
    const user = userEvent.setup();
    await renderizar();
    await user.click(botaoEditar('Bateria 60Ah'));
    await user.clear(campoQtd());
    await user.type(campoQtd(), '9');
    await salvar(user);

    expect(await screen.findByText('Estoque insuficiente de "Bateria 60Ah - M60".')).toBeInTheDocument();
    expect(screen.getByText('Editar venda')).toBeInTheDocument();
  });
});

describe('Reg. Movimentação — excluir', () => {
  it('excluir venda pede confirmação dizendo que o estoque volta, e só então chama o servidor', async () => {
    const user = userEvent.setup();
    await renderizar();
    const cargasAntes = MovAPI.listarPagina.mock.calls.length;
    await user.click(botaoExcluir('Bateria 60Ah'));

    const aviso = await dialogo();
    expect(within(aviso).getByText('Excluir venda')).toBeInTheDocument();
    expect(within(aviso).getByText(/O estoque será devolvido em 2 un\./)).toBeInTheDocument();
    expect(MovAPI.remover).not.toHaveBeenCalled();
    await user.click(within(aviso).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(MovAPI.remover).toHaveBeenCalledWith(10));
    expect(await screen.findByText('Venda excluída.')).toBeInTheDocument();
    // A lista é recarregada depois da exclusão.
    await waitFor(() => expect(MovAPI.listarPagina.mock.calls.length).toBeGreaterThan(cargasAntes));
  });

  it('cancelar a confirmação não exclui a venda', async () => {
    const user = userEvent.setup();
    await renderizar();
    await user.click(botaoExcluir('Bateria 60Ah'));
    const aviso = await dialogo();
    await user.click(within(aviso).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(MovAPI.remover).not.toHaveBeenCalled();
  });

  it('excluir entrada avisa que o custo e os preços do produto não voltam ao que eram', async () => {
    const user = userEvent.setup();
    await renderizar();
    await user.click(botaoExcluir('Bateria 70Ah'));

    const aviso = await dialogo();
    expect(within(aviso).getByText('Excluir entrada')).toBeInTheDocument();
    expect(within(aviso).getByText(/O estoque será reduzido em 2 un\./)).toBeInTheDocument();
    expect(within(aviso).getByText(/eles NÃO voltam ao que eram/)).toBeInTheDocument();
  });

  it('recusa do servidor ao excluir (empréstimo de garantia) aparece para o usuário', async () => {
    MovAPI.remover.mockRejectedValue({ response: { data: { message: 'Esta movimentação é de empréstimo de garantia, não é uma venda.' } } });
    const user = userEvent.setup();
    await renderizar();
    await user.click(botaoExcluir('Bateria 50Ah'));
    const aviso = await dialogo();
    await user.click(within(aviso).getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByText('Esta movimentação é de empréstimo de garantia, não é uma venda.')).toBeInTheDocument();
  });
});
