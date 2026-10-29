import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../src/services/estoque.js', () => ({ EstoqueAPI: { listar: vi.fn() } }));
vi.mock('../../src/services/estoqueSom.js', () => ({ EstoqueSomAPI: { listar: vi.fn() } }));
vi.mock('../../src/services/movimentacoes.js', () => ({ MovAPI: { criar: vi.fn() } }));
// Os formulários de Som têm testes próprios; aqui só interessa que a tela os encaixe.
vi.mock('../../src/components/PedidoSomForm.jsx', () => ({ default: () => <div>formulário de pedido de Som</div> }));
vi.mock('../../src/components/EntradaSomForm.jsx', () => ({ default: () => <div>formulário de entrada de Som</div> }));

import { EstoqueAPI } from '../../src/services/estoque.js';
import { EstoqueSomAPI } from '../../src/services/estoqueSom.js';
import { MovAPI } from '../../src/services/movimentacoes.js';
import { ToastProvider } from '../../src/components/ui/Toast.jsx';
import LancamentoEntradaSaida from '../../src/pages/LancamentoEntradaSaida/LancamentoEntradaSaida.jsx';
import { precosMinimos } from '../../src/utils/precos.js';

const BATERIA_60 = {
  id: 1, produto: 'Bateria 60Ah', custo: 200, valor_vista: 300, valor_parcelado: 350,
  qtd_inicial: 10, entradas: 0, saidas: 0,
};
const BATERIA_45 = {
  id: 2, produto: 'Bateria 45Ah', custo: 150, valor_vista: 250, valor_parcelado: 280,
  qtd_inicial: 2, entradas: 1, saidas: 0,
};

function logarComLinhas(...linhas) {
  localStorage.setItem('token', 'tk');
  localStorage.setItem('role', 'user');
  localStorage.setItem('permissoes', JSON.stringify(Object.fromEntries(linhas.map((l) => [`linha_${l}`, true]))));
}

async function renderizar() {
  const view = render(
    <ToastProvider>
      <LancamentoEntradaSaida />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Carregando produtos...')).not.toBeInTheDocument());
  return view;
}

// Os <label> da tela não têm htmlFor, então os campos são achados pelo que
// aparece para a pessoa: valor selecionado, placeholder ou texto do botão.
const selectTipo = () => screen.getByDisplayValue('Selecione');
// O placeholder do campo de produto vira o nome do produto escolhido, então ele
// é achado pelo papel: o único <input> com role combobox (os outros são <select>).
const campoProduto = () => document.querySelector('input[role="combobox"]');
const campoParcelas = () => screen.getAllByRole('spinbutton').find((el) => el.getAttribute('max') === '10');
const campoQuantidade = () => screen.getByPlaceholderText('Digite a quantidade');
const botaoLancar = () => screen.getByRole('button', { name: /Lançar/ });
const formulario = (view) => view.container.querySelector('form');

async function escolherProduto(user, nome) {
  await user.click(campoProduto());
  await user.click(screen.getByRole('button', { name: new RegExp(nome) }));
}

beforeEach(() => {
  vi.resetAllMocks();
  logarComLinhas('baterias');
  EstoqueAPI.listar.mockResolvedValue([BATERIA_60, BATERIA_45]);
  EstoqueSomAPI.listar.mockResolvedValue([{ id: 9, produto: 'Autofalante', valor_venda: 100 }]);
  MovAPI.criar.mockResolvedValue({ id: 77 });
});

describe('LancamentoEntradaSaida — carregamento e escopo de linha', () => {
  it('usuário só de Baterias carrega o estoque de baterias, sem o seletor de linha', async () => {
    await renderizar();
    expect(EstoqueAPI.listar).toHaveBeenCalledWith({ q: '' });
    expect(EstoqueSomAPI.listar).not.toHaveBeenCalled();
    expect(screen.getByRole('heading')).toHaveTextContent('(Baterias)');
    expect(screen.queryByRole('button', { name: 'Som' })).not.toBeInTheDocument();
  });

  it('usuário com as duas linhas vê o seletor e pode trocar para Som', async () => {
    logarComLinhas('baterias', 'som');
    const user = userEvent.setup();
    await renderizar();
    await user.click(screen.getByRole('button', { name: 'Som' }));
    await waitFor(() => expect(EstoqueSomAPI.listar).toHaveBeenCalled());
    expect(screen.getByRole('heading')).toHaveTextContent('(Som)');
    expect(screen.getByText('formulário de pedido de Som')).toBeInTheDocument();
  });

  it('no Som, a aba "Entrada de estoque" troca o formulário', async () => {
    logarComLinhas('som');
    const user = userEvent.setup();
    await renderizar();
    expect(screen.getByText('formulário de pedido de Som')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Entrada de estoque' }));
    expect(screen.getByText('formulário de entrada de Som')).toBeInTheDocument();
  });

  it('falha ao carregar produtos mostra o erro e trava o botão Lançar', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    EstoqueAPI.listar.mockRejectedValue({ response: { data: { message: 'Banco fora do ar' } } });
    await renderizar();
    expect(screen.getByText('Banco fora do ar')).toBeInTheDocument();
    expect(botaoLancar()).toBeDisabled();
    erro.mockRestore();
  });
});

describe('LancamentoEntradaSaida — validações antes de enviar', () => {
  it('campos em branco: avisa e não chama a API', async () => {
    const view = await renderizar();
    fireEvent.submit(formulario(view));
    expect(await screen.findByText('Preencha todos os campos.')).toBeInTheDocument();
    expect(MovAPI.criar).not.toHaveBeenCalled();
  });

  it('quantidade zero é inválida', async () => {
    const user = userEvent.setup();
    const view = await renderizar();
    await user.selectOptions(selectTipo(), 'entrada');
    await escolherProduto(user, 'Bateria 60Ah');
    await user.type(campoQuantidade(), '0');
    fireEvent.submit(formulario(view));
    expect(await screen.findByText('Quantidade invalida.')).toBeInTheDocument();
    expect(MovAPI.criar).not.toHaveBeenCalled();
  });

  it('saída maior que o estoque é barrada com o saldo atual na mensagem', async () => {
    const user = userEvent.setup();
    const view = await renderizar();
    await user.selectOptions(selectTipo(), 'saida');
    await escolherProduto(user, 'Bateria 45Ah');
    await user.type(campoQuantidade(), '4');
    await user.selectOptions(screen.getByDisplayValue('Selecione o vendedor'), 'Ismael');
    fireEvent.submit(formulario(view));
    expect(await screen.findByText('Nao ha estoque suficiente! Estoque atual: 3 unidades.')).toBeInTheDocument();
    expect(MovAPI.criar).not.toHaveBeenCalled();
  });

  it('saída de bateria sem vendedor é barrada', async () => {
    const user = userEvent.setup();
    const view = await renderizar();
    await user.selectOptions(selectTipo(), 'saida');
    await escolherProduto(user, 'Bateria 60Ah');
    await user.type(campoQuantidade(), '1');
    fireEvent.submit(formulario(view));
    expect(await screen.findByText('Selecione o vendedor.')).toBeInTheDocument();
    expect(MovAPI.criar).not.toHaveBeenCalled();
  });

  it('o campo de vendedor só existe nas saídas', async () => {
    const user = userEvent.setup();
    await renderizar();
    expect(screen.queryByDisplayValue('Selecione o vendedor')).not.toBeInTheDocument();
    await user.selectOptions(selectTipo(), 'entrada');
    expect(screen.queryByDisplayValue('Selecione o vendedor')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByDisplayValue('Entrada'), 'saida');
    expect(screen.getByDisplayValue('Selecione o vendedor')).toBeInTheDocument();
  });
});

describe('LancamentoEntradaSaida — saída (venda)', () => {
  async function prepararSaida(user, { quantidade = '2' } = {}) {
    const view = await renderizar();
    await user.selectOptions(selectTipo(), 'saida');
    await escolherProduto(user, 'Bateria 60Ah');
    await user.type(campoQuantidade(), quantidade);
    await user.selectOptions(screen.getByDisplayValue('Selecione o vendedor'), 'Ismael');
    return view;
  }

  it('à vista: usa o preço à vista, mostra o total e envia o unitário com duas casas', async () => {
    const user = userEvent.setup();
    await prepararSaida(user);
    await user.selectOptions(screen.getByDisplayValue('Selecione...'), 'pix');

    expect(screen.getByDisplayValue('R$ 300.00')).toBeInTheDocument();
    expect(screen.getByText('Total (2 un.): R$ 600.00')).toBeInTheDocument();

    await user.click(botaoLancar());
    await waitFor(() => expect(MovAPI.criar).toHaveBeenCalledTimes(1));
    expect(MovAPI.criar).toHaveBeenCalledWith({
      produto_id: 1, tipo: 'saida', quantidade: 2,
      valor_final: '300.00', vendedor: 'Ismael', forma_pagamento: 'pix',
    });
    expect(await screen.findByText('Lancamento registrado com sucesso!')).toBeInTheDocument();
  });

  it('crédito: usa o preço parcelado e envia o número de parcelas', async () => {
    const user = userEvent.setup();
    await prepararSaida(user, { quantidade: '1' });
    await user.selectOptions(screen.getByDisplayValue('Selecione...'), 'credito');
    expect(screen.getByDisplayValue('R$ 350.00')).toBeInTheDocument();

    fireEvent.change(campoParcelas(), { target: { value: '3' } });
    await user.click(botaoLancar());

    await waitFor(() => expect(MovAPI.criar).toHaveBeenCalled());
    expect(MovAPI.criar.mock.calls[0][0]).toMatchObject({
      valor_final: '350.00', forma_pagamento: 'credito', parcelas: 3,
    });
  });

  it('parcelas fora de 1–10 são corrigidas ao sair do campo', async () => {
    const user = userEvent.setup();
    await prepararSaida(user, { quantidade: '1' });
    await user.selectOptions(screen.getByDisplayValue('Selecione...'), 'credito');
    const parcelas = campoParcelas();
    fireEvent.change(parcelas, { target: { value: '15' } });
    fireEvent.blur(parcelas);
    expect(parcelas).toHaveValue(10);
  });

  it('desconto e acréscimo ajustam o valor unitário e o total', async () => {
    const user = userEvent.setup();
    await prepararSaida(user);
    await user.selectOptions(screen.getByDisplayValue('Selecione...'), 'dinheiro');
    const valor = screen.getByPlaceholderText('Valor');

    await user.selectOptions(screen.getByDisplayValue('Acrescimo'), 'desconto');
    await user.type(valor, '20');
    expect(screen.getByText('Valor final unitario: R$ 280.00')).toBeInTheDocument();
    expect(screen.getByText('Total (2 un.): R$ 560.00')).toBeInTheDocument();

    await user.click(botaoLancar());
    await waitFor(() => expect(MovAPI.criar).toHaveBeenCalled());
    expect(MovAPI.criar.mock.calls[0][0].valor_final).toBe('280.00');
  });

  it('com 1 unidade, o total não é repetido na tela', async () => {
    const user = userEvent.setup();
    await prepararSaida(user, { quantidade: '1' });
    expect(screen.queryByText(/^Total \(/)).not.toBeInTheDocument();
  });

  it('depois de lançar, limpa a venda mas mantém o tipo e recarrega o estoque', async () => {
    const user = userEvent.setup();
    await prepararSaida(user);
    await user.selectOptions(screen.getByDisplayValue('Selecione...'), 'pix');
    await user.click(botaoLancar());

    await waitFor(() => expect(campoQuantidade()).toHaveValue(null));
    expect(screen.getByDisplayValue('Saída')).toBeInTheDocument();
    expect(campoProduto()).toHaveValue('');
    await waitFor(() => expect(EstoqueAPI.listar).toHaveBeenCalledTimes(2));
  });

  it('erro da API aparece como aviso e a tela mantém o que foi digitado', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    MovAPI.criar.mockRejectedValue({ response: { data: { message: 'Estoque insuficiente no servidor' } } });
    const user = userEvent.setup();
    await prepararSaida(user);
    await user.selectOptions(screen.getByDisplayValue('Selecione...'), 'pix');
    await user.click(botaoLancar());

    expect(await screen.findByText('Estoque insuficiente no servidor')).toBeInTheDocument();
    expect(campoQuantidade()).toHaveValue(2);
    erro.mockRestore();
  });
});

describe('LancamentoEntradaSaida — venda fiado', () => {
  async function prepararFiado(user) {
    const view = await renderizar();
    await user.selectOptions(selectTipo(), 'saida');
    await escolherProduto(user, 'Bateria 60Ah');
    await user.type(campoQuantidade(), '1');
    await user.selectOptions(screen.getByDisplayValue('Selecione o vendedor'), 'Gustavo');
    return view;
  }

  it('marcar fiado desabilita a forma de pagamento, mostra o campo do cliente e usa o preço parcelado', async () => {
    const user = userEvent.setup();
    await prepararFiado(user);
    await user.selectOptions(screen.getByDisplayValue('Selecione...'), 'pix');
    expect(screen.getByDisplayValue('R$ 300.00')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox'));
    const forma = screen.getByDisplayValue('Selecione...');
    expect(forma).toBeDisabled();
    expect(screen.getByDisplayValue('R$ 350.00')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do cliente da venda fiado')).toBeInTheDocument();
  });

  it('fiado sem o nome do cliente é barrado', async () => {
    const user = userEvent.setup();
    const view = await prepararFiado(user);
    await user.click(screen.getByRole('checkbox'));
    fireEvent.submit(formulario(view));
    expect(await screen.findByText('Informe o nome do cliente na venda fiado.')).toBeInTheDocument();
    expect(MovAPI.criar).not.toHaveBeenCalled();
  });

  it('fiado envia status, cliente sem espaços sobrando e nenhuma forma de pagamento', async () => {
    const user = userEvent.setup();
    await prepararFiado(user);
    await user.click(screen.getByRole('checkbox'));
    await user.type(screen.getByLabelText('Nome do cliente da venda fiado'), '  Seu Zé  ');
    await user.click(botaoLancar());

    await waitFor(() => expect(MovAPI.criar).toHaveBeenCalled());
    const payload = MovAPI.criar.mock.calls[0][0];
    expect(payload).toMatchObject({ status_pagamento: 'FIADO', cliente_fiado: 'Seu Zé', valor_final: '350.00' });
    expect(payload).not.toHaveProperty('forma_pagamento');
    expect(payload).not.toHaveProperty('parcelas');
  });

  it('desmarcar fiado apaga o nome digitado (não vaza para uma venda comum)', async () => {
    const user = userEvent.setup();
    await prepararFiado(user);
    await user.click(screen.getByRole('checkbox'));
    await user.type(screen.getByLabelText('Nome do cliente da venda fiado'), 'Dona Maria');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByLabelText('Nome do cliente da venda fiado')).toHaveValue('');
  });
});

describe('LancamentoEntradaSaida — entrada de estoque', () => {
  async function prepararEntrada(user, quantidade = '5') {
    const view = await renderizar();
    await user.selectOptions(selectTipo(), 'entrada');
    await escolherProduto(user, 'Bateria 60Ah');
    await user.type(campoQuantidade(), quantidade);
    return view;
  }

  const campoCusto = () => screen.getByPlaceholderText(/Custo atual: R\$ 200.00/);

  it('entrada simples manda só produto, tipo e quantidade (custo vazio mantém o atual)', async () => {
    const user = userEvent.setup();
    await prepararEntrada(user);
    await user.click(botaoLancar());
    await waitFor(() => expect(MovAPI.criar).toHaveBeenCalled());
    expect(MovAPI.criar).toHaveBeenCalledWith({ produto_id: 1, tipo: 'entrada', quantidade: 5 });
  });

  it('custo novo que mantém a margem entra no mesmo envio, sem painel de bloqueio', async () => {
    const user = userEvent.setup();
    await prepararEntrada(user);
    await user.type(campoCusto(), '210');
    expect(screen.getByText(/Margem com o custo de R\$ 210,00/)).toBeInTheDocument();
    expect(botaoLancar()).toBeEnabled();
    await user.click(botaoLancar());
    await waitFor(() => expect(MovAPI.criar).toHaveBeenCalled());
    expect(MovAPI.criar).toHaveBeenCalledWith({ produto_id: 1, tipo: 'entrada', quantidade: 5, custo: '210.00' });
  });

  it('custo que derruba a margem abaixo do mínimo trava o botão e pede novos preços', async () => {
    const user = userEvent.setup();
    await prepararEntrada(user);
    await user.type(campoCusto(), '300');

    expect(botaoLancar()).toBeDisabled();
    expect(screen.getAllByText(/abaixo do mínimo de 10%/).length).toBe(2);
    expect(screen.getByText(/Nada é gravado enquanto a margem/)).toBeInTheDocument();
    expect(MovAPI.criar).not.toHaveBeenCalled();
  });

  it('digitar preços acima do mínimo libera o envio e manda os preços junto com o custo', async () => {
    const user = userEvent.setup();
    await prepararEntrada(user);
    await user.type(campoCusto(), '300');

    const min = precosMinimos(300);
    await user.type(screen.getByPlaceholderText(/Novo preço à vista/), String(Math.ceil(min.valor_vista) + 1));
    await user.type(screen.getByPlaceholderText(/Novo preço parcelado/), String(Math.ceil(min.valor_parcelado) + 1));

    expect(botaoLancar()).toBeEnabled();
    await user.click(botaoLancar());
    await waitFor(() => expect(MovAPI.criar).toHaveBeenCalled());
    expect(MovAPI.criar.mock.calls[0][0]).toMatchObject({
      tipo: 'entrada', custo: '300.00',
      valor_vista: `${Math.ceil(min.valor_vista) + 1}.00`,
      valor_parcelado: `${Math.ceil(min.valor_parcelado) + 1}.00`,
    });
  });

  it('trocar de produto zera os preços novos digitados, mas mantém o custo', async () => {
    const user = userEvent.setup();
    await prepararEntrada(user);
    await user.type(campoCusto(), '300');
    const precoVista = screen.getByPlaceholderText(/Novo preço à vista/);
    await user.type(precoVista, '999');
    expect(precoVista).toHaveValue(999);

    await escolherProduto(user, 'Bateria 45Ah');

    // o preço pensado para o produto anterior não segue valendo no novo...
    expect(screen.getByPlaceholderText(/Novo preço à vista/)).toHaveValue(null);
    // ...mas o custo digitado continua no campo
    expect(screen.getByPlaceholderText(/Custo atual: R\$ 150.00/)).toHaveValue(300);
  });

  it('custo negativo é recusado', async () => {
    const user = userEvent.setup();
    const view = await prepararEntrada(user);
    await user.type(campoCusto(), '-5');
    fireEvent.submit(formulario(view));
    expect(await screen.findByText('Valor de custo inválido.')).toBeInTheDocument();
    expect(MovAPI.criar).not.toHaveBeenCalled();
  });
});
