// Pedido de Instalação de Som: é o formulário que fecha o valor de uma venda
// com peças + mão de obra. Os testes cobrem as contas (preço por forma de
// pagamento, total, comissão sugerida) e o que é enviado ao servidor.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../src/services/pedidoSom.js', () => ({ PedidoSomAPI: { criar: vi.fn() } }));
vi.mock('../../src/services/comissao.js', () => ({ ComissaoAPI: { getConfig: vi.fn() } }));

import { PedidoSomAPI } from '../../src/services/pedidoSom.js';
import { ComissaoAPI } from '../../src/services/comissao.js';
import { ToastProvider } from '../../src/components/ui/Toast.jsx';
import PedidoSomForm from '../../src/components/PedidoSomForm.jsx';

const AUTOFALANTE = { id: 1, produto: 'Autofalante', modelo: 'A6', valor_vista: 100, valor_parcelado: 120, qtd_inicial: 10 };
const MODULO = { id: 2, produto: 'Modulo', modelo: 'T400', valor_vista: 500, valor_parcelado: 560, qtd_inicial: 3 };

function logar(role) {
  localStorage.setItem('token', 'tk');
  localStorage.setItem('role', role);
  localStorage.setItem('permissoes', JSON.stringify({ linha_som: true, entrada_saida: true }));
}

function renderizar(props = {}) {
  return render(
    <ToastProvider>
      <PedidoSomForm produtos={[AUTOFALANTE, MODULO]} {...props} />
    </ToastProvider>,
  );
}

// Linha do resumo ("rótulo ..... R$ valor") achada pelo rótulo.
const linhaResumo = (rotulo) => screen.getByText(rotulo).parentElement;
const totalDoPedido = () => linhaResumo('Total do pedido');
const totalProdutos = () => linhaResumo(/Total dos produtos/);
// O único <select> do formulário é o da forma de pagamento (o campo de produto
// é um <input> com busca).
const forma = () => document.querySelector('form select');
const botaoLancar = () => screen.getByRole('button', { name: /Lançar Pedido/ });

/** Adiciona um item de produto e escolhe a peça; devolve os campos dele. */
async function adicionarProduto(user, nome) {
  await user.click(screen.getByRole('button', { name: /Adicionar Produto/ }));
  const caixas = screen.getAllByPlaceholderText('Selecione o produto');
  await user.click(caixas[caixas.length - 1]);
  await user.click(screen.getByText(nome));
  const qtds = screen.getAllByPlaceholderText('Qtd');
  const valores = screen.getAllByPlaceholderText('Valor unit.');
  return { qtd: qtds[qtds.length - 1], valor: valores[valores.length - 1] };
}

/** Adiciona um item de serviço já preenchido; devolve os campos dele. */
async function adicionarServico(user, { nome, valor } = {}) {
  await user.click(screen.getByRole('button', { name: /Adicionar Serviço/ }));
  const ultimo = (lista) => lista[lista.length - 1];
  const campos = {
    nome: ultimo(screen.getAllByPlaceholderText(/Nome do serviço/)),
    valor: ultimo(screen.getAllByPlaceholderText('Mão de obra (un.)')),
    pct: ultimo(screen.getAllByPlaceholderText('% Joel')),
  };
  if (nome) await user.type(campos.nome, nome);
  if (valor) await user.type(campos.valor, String(valor));
  return campos;
}

const trocar = async (user, campo, texto) => { await user.clear(campo); await user.type(campo, texto); };

beforeEach(() => {
  vi.resetAllMocks();
  logar('user');
  PedidoSomAPI.criar.mockResolvedValue({ id: 1 });
  ComissaoAPI.getConfig.mockResolvedValue({ percentual_mao_obra: '30', percentual_insulfilme: '25' });
});

describe('PedidoSomForm — preço das peças conforme a forma de pagamento', () => {
  it('a peça entra com o preço à vista, e o total é preço × quantidade', async () => {
    const user = userEvent.setup();
    renderizar();
    const { qtd, valor } = await adicionarProduto(user, 'Autofalante');
    expect(valor).toHaveValue(100);
    await trocar(user, qtd, '2');
    expect(totalProdutos()).toHaveTextContent('à vista');
    expect(totalProdutos()).toHaveTextContent('R$ 200.00');
    expect(totalDoPedido()).toHaveTextContent('R$ 200.00');
  });

  it('escolher Crédito passa a peça para o preço parcelado, e voltar para PIX devolve o à vista', async () => {
    const user = userEvent.setup();
    renderizar();
    const { valor } = await adicionarProduto(user, 'Autofalante');
    await user.selectOptions(forma(), 'Crédito');
    expect(valor).toHaveValue(120);
    expect(totalProdutos()).toHaveTextContent('parcelado');
    expect(totalDoPedido()).toHaveTextContent('R$ 120.00');

    await user.selectOptions(forma(), 'PIX');
    expect(valor).toHaveValue(100);
    expect(totalDoPedido()).toHaveTextContent('R$ 100.00');
  });

  it('preço digitado à mão não é trocado quando a forma de pagamento muda', async () => {
    const user = userEvent.setup();
    renderizar();
    const { valor } = await adicionarProduto(user, 'Autofalante');
    await trocar(user, valor, '90');
    await user.selectOptions(forma(), 'Crédito');
    expect(valor).toHaveValue(90);
    expect(totalDoPedido()).toHaveTextContent('R$ 90.00');
  });

  it('o número de parcelas do crédito não muda o total do pedido', async () => {
    const user = userEvent.setup();
    renderizar();
    await adicionarProduto(user, 'Autofalante');
    await user.selectOptions(forma(), 'Crédito');
    await trocar(user, screen.getByLabelText('Parcelas'), '10');
    expect(screen.getByText('Crédito 10x')).toBeInTheDocument();
    expect(totalDoPedido()).toHaveTextContent('R$ 120.00');
  });
});

describe('PedidoSomForm — mão de obra, total e comissão', () => {
  it('o total do pedido é a soma das peças com a mão de obra', async () => {
    const user = userEvent.setup();
    renderizar();
    const { qtd } = await adicionarProduto(user, 'Autofalante');
    await trocar(user, qtd, '2');
    await adicionarServico(user, { nome: 'Instalação', valor: 150 });

    expect(totalProdutos()).toHaveTextContent('R$ 200.00');
    expect(linhaResumo('Mão de obra (soma dos itens)')).toHaveTextContent('R$ 150.00');
    expect(totalDoPedido()).toHaveTextContent('R$ 350.00');
  });

  it('serviço com "Insulfilme" no nome sugere 25% de comissão; os outros sugerem 30%', async () => {
    const user = userEvent.setup();
    renderizar();
    const instalacao = await adicionarServico(user, { nome: 'Instalação de alarme' });
    const insulfilme = await adicionarServico(user, { nome: 'Insulfilme traseiro' });
    expect(instalacao.pct).toHaveValue(30);
    expect(insulfilme.pct).toHaveValue(25);
  });

  it('% de comissão alterada à mão não volta para a sugestão quando o serviço é renomeado', async () => {
    const user = userEvent.setup();
    renderizar();
    const servico = await adicionarServico(user, { nome: 'Instalação' });
    await trocar(user, servico.pct, '40');
    await user.type(servico.nome, ' e Insulfilme');
    expect(servico.pct).toHaveValue(40);
  });

  it('admin vê a comissão do Joel no resumo, calculada com a % de cada serviço', async () => {
    logar('admin');
    const user = userEvent.setup();
    renderizar();
    await adicionarServico(user, { nome: 'Instalação', valor: 200 });   // 30% = 60
    await adicionarServico(user, { nome: 'Insulfilme', valor: 100 });   // 25% = 25
    expect(linhaResumo('Comissão Joel')).toHaveTextContent('R$ 85.00');
    expect(totalDoPedido()).toHaveTextContent('R$ 300.00');
  });

  it('usuário comum não vê a linha de comissão no resumo nem consulta a configuração de comissão', async () => {
    const user = userEvent.setup();
    renderizar();
    await adicionarServico(user, { nome: 'Instalação', valor: 200 });
    expect(screen.queryByText('Comissão Joel')).not.toBeInTheDocument();
    expect(ComissaoAPI.getConfig).not.toHaveBeenCalled();
    // A mão de obra ele vê: precisa dela para fechar o valor com o cliente.
    expect(linhaResumo('Mão de obra (soma dos itens)')).toHaveTextContent('R$ 200.00');
  });

  it('para o admin, a % sugerida vem da configuração de comissão', async () => {
    logar('admin');
    ComissaoAPI.getConfig.mockResolvedValue({ percentual_mao_obra: '35', percentual_insulfilme: '20' });
    const user = userEvent.setup();
    renderizar();
    await waitFor(() => expect(ComissaoAPI.getConfig).toHaveBeenCalled());
    const instalacao = await adicionarServico(user, { nome: 'Instalação' });
    const insulfilme = await adicionarServico(user, { nome: 'Insulfilme' });
    expect(instalacao.pct).toHaveValue(35);
    expect(insulfilme.pct).toHaveValue(20);
  });
});

describe('PedidoSomForm — o que é enviado ao servidor', () => {
  it('pedido no crédito envia peças, serviço, o rótulo "Crédito 3x" e as parcelas', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    renderizar({ onCreated });
    await user.type(screen.getByPlaceholderText('Ex: Honda Civic 2019'), ' Gol 2015 ');
    const { qtd } = await adicionarProduto(user, 'Autofalante');
    await trocar(user, qtd, '2');
    await adicionarServico(user, { nome: 'Instalação', valor: 150 });
    await user.selectOptions(forma(), 'Crédito');
    await trocar(user, screen.getByLabelText('Parcelas'), '3');
    await user.click(botaoLancar());

    await waitFor(() => expect(PedidoSomAPI.criar).toHaveBeenCalled());
    expect(PedidoSomAPI.criar).toHaveBeenCalledWith({
      veiculo: 'Gol 2015',
      forma_pagamento: 'Crédito 3x',
      parcelas: 3,
      itens: [
        { tipo: 'PRODUTO', produto_id: 1, descricao: 'Autofalante - A6', quantidade: 2, valor_unit: 120 },
        { tipo: 'MAO_OBRA', descricao: 'Instalação', quantidade: 1, valor_unit: 150, percentual_comissao: 30 },
      ],
    });
    // Depois de lançar: avisa quem chamou e limpa o formulário.
    expect(await screen.findByText('Pedido lançado com sucesso!')).toBeInTheDocument();
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Nenhum item adicionado ainda.')).toBeInTheDocument();
  });

  it('pedido no PIX envia o preço à vista e não envia parcelas', async () => {
    const user = userEvent.setup();
    renderizar();
    await adicionarProduto(user, 'Modulo');
    await user.selectOptions(forma(), 'PIX');
    await user.click(botaoLancar());

    await waitFor(() => expect(PedidoSomAPI.criar).toHaveBeenCalled());
    const enviado = PedidoSomAPI.criar.mock.calls[0][0];
    expect(enviado.forma_pagamento).toBe('PIX');
    expect(enviado).not.toHaveProperty('parcelas');
    expect(enviado.itens[0]).toMatchObject({ produto_id: 2, valor_unit: 500 });
  });

  it('parcelas acima de 10 são enviadas como 10', async () => {
    const user = userEvent.setup();
    renderizar();
    await adicionarProduto(user, 'Autofalante');
    await user.selectOptions(forma(), 'Crédito');
    await trocar(user, screen.getByLabelText('Parcelas'), '15');
    await user.click(botaoLancar());

    await waitFor(() => expect(PedidoSomAPI.criar).toHaveBeenCalled());
    expect(PedidoSomAPI.criar.mock.calls[0][0]).toMatchObject({ forma_pagamento: 'Crédito 10x', parcelas: 10 });
  });

  it('recusa do servidor aparece para o usuário e os itens continuam na tela', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    PedidoSomAPI.criar.mockRejectedValue({ response: { data: { message: 'Estoque insuficiente de "Autofalante - A6".' } } });
    const user = userEvent.setup();
    renderizar();
    const { valor } = await adicionarProduto(user, 'Autofalante');
    await user.click(botaoLancar());

    expect(await screen.findByText('Estoque insuficiente de "Autofalante - A6".')).toBeInTheDocument();
    expect(valor).toHaveValue(100);
    erro.mockRestore();
  });
});

describe('PedidoSomForm — validações antes de enviar', () => {
  it('sem nenhum item, o botão Lançar Pedido fica travado', () => {
    renderizar();
    expect(botaoLancar()).toBeDisabled();
  });

  it('item de produto sem peça escolhida é barrado e nada é enviado', async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole('button', { name: /Adicionar Produto/ }));
    await user.click(botaoLancar());
    expect(await screen.findByText('Selecione o produto em todos os itens de produto.')).toBeInTheDocument();
    expect(PedidoSomAPI.criar).not.toHaveBeenCalled();
  });

  it('serviço sem valor de mão de obra é barrado e nada é enviado', async () => {
    const user = userEvent.setup();
    renderizar();
    await adicionarServico(user, { nome: 'Instalação' });
    await user.click(botaoLancar());
    expect(await screen.findByText('Informe o valor da mão de obra no serviço.')).toBeInTheDocument();
    expect(PedidoSomAPI.criar).not.toHaveBeenCalled();
  });

  it('serviço sem nome é barrado e nada é enviado', async () => {
    const user = userEvent.setup();
    renderizar();
    await adicionarServico(user, { valor: 100 });
    await user.click(botaoLancar());
    expect(await screen.findByText('Descreva o serviço.')).toBeInTheDocument();
    expect(PedidoSomAPI.criar).not.toHaveBeenCalled();
  });

  it('% de comissão acima de 100 é barrada e nada é enviado', async () => {
    const user = userEvent.setup();
    renderizar();
    const servico = await adicionarServico(user, { nome: 'Instalação', valor: 100 });
    await trocar(user, servico.pct, '150');
    // O campo tem max=100 e o navegador já barra o envio; o submit direto
    // testa a segunda trava, a do próprio formulário.
    fireEvent.submit(document.querySelector('form'));
    expect(await screen.findByText('A % de comissão do serviço deve ficar entre 0 e 100.')).toBeInTheDocument();
    expect(PedidoSomAPI.criar).not.toHaveBeenCalled();
  });
});
