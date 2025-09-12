import React, { useState, useEffect, useMemo } from 'react';
import './LancamentoEntradaSaida.css';
import { useNavigate } from 'react-router-dom';

// -------- Helpers de armazenamento local (mock) ----------
const STORAGE = {
  produtos: 'produtos',
  movimentacoes: 'movimentacoes'
};

function loadList(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}
function saveList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}
function updateProdutoCusto(produtoId, novoCusto) {
  const produtos = loadList(STORAGE.produtos);
  const idx = produtos.findIndex((p) => String(p.id) === String(produtoId));
  if (idx >= 0) {
    produtos[idx] = { ...produtos[idx], custo: Number(novoCusto) || 0 };
    saveList(STORAGE.produtos, produtos);
  }
}
function addMovimentacao(m) {
  const list = loadList(STORAGE.movimentacoes);
  list.push({ id: Date.now(), ...m });
  saveList(STORAGE.movimentacoes, list);
  return list;
}

export default function LancamentoEntradaSaida() {
  const [produtos, setProdutos] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);

  const [lancamento, setLancamento] = useState({
    tipo: '',
    produtoId: '',
    quantidade: ''
  });

  const [valorOriginal, setValorOriginal] = useState(0);
  const [ajusteValor, setAjusteValor] = useState('');
  const [tipoAjuste, setTipoAjuste] = useState('acrescimo');
  const [novoCusto, setNovoCusto] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    setProdutos(loadList(STORAGE.produtos));
    setMovimentacoes(loadList(STORAGE.movimentacoes));
  }, []);

  useEffect(() => {
    if (lancamento.produtoId) {
      const produtoSelecionado = produtos.find((p) => String(p.id) === String(lancamento.produtoId));
      setValorOriginal(produtoSelecionado ? Number(produtoSelecionado.valorVenda || 0) : 0);
    } else {
      setValorOriginal(0);
    }
  }, [lancamento.produtoId, produtos]);

  const custoAtual = useMemo(() => {
    const produto = produtos.find((p) => String(p.id) === String(lancamento.produtoId));
    return typeof produto?.custo === 'number' ? produto.custo : null;
  }, [lancamento.produtoId, produtos]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLancamento((prev) => ({ ...prev, [name]: value }));
  };

  const calculaEstoqueAtual = (produtoId) => {
    const produto = produtos.find((p) => String(p.id) === String(produtoId));
    if (!produto) return 0;

    const entradas = movimentacoes
      .filter((m) => String(m.produtoId) === String(produtoId) && m.tipo === 'entrada')
      .reduce((sum, m) => sum + (parseInt(m.quantidade, 10) || 0), 0);

    const saidas = movimentacoes
      .filter((m) => String(m.produtoId) === String(produtoId) && m.tipo === 'saida')
      .reduce((sum, m) => sum + (parseInt(m.quantidade, 10) || 0), 0);

    const qtdInicial = parseInt(produto.quantidadeInicial, 10) || 0;
    return qtdInicial + entradas - saidas;
  };

  const getValorFinal = () => {
    const v = Number(ajusteValor);
    if (!Number.isFinite(v)) return Number(valorOriginal) || 0;
    return tipoAjuste === 'acrescimo' ? (Number(valorOriginal) || 0) + v : (Number(valorOriginal) || 0) - v;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const { tipo, produtoId, quantidade } = lancamento;

    if (!tipo || !produtoId || !quantidade) {
      alert('Preencha todos os campos.');
      return;
    }

    const q = parseInt(quantidade, 10);
    if (!Number.isFinite(q) || q <= 0) {
      alert('Quantidade inválida.');
      return;
    }

    const estoqueAtual = calculaEstoqueAtual(produtoId);

    if (tipo === 'saida' && q > estoqueAtual) {
      alert(`Não há estoque suficiente! Estoque atual: ${estoqueAtual} unidades.`);
      return;
    }

    if (tipo === 'entrada') {
      if (!novoCusto || !(Number(novoCusto) >= 0)) {
        alert('Informe o novo valor de custo.');
        return;
      }
    }

    // Monta a movimentação
    const valorUnitario = tipo === 'saida' ? getValorFinal() : 0; // para entrada, não aplicamos venda aqui
    const valorTotal = tipo === 'saida' ? Number(valorUnitario) * q : 0;

    // Salva movimentação
    addMovimentacao({
      produtoId,
      tipo,
      quantidade: q,
      valorAplicado: tipo === 'saida' ? Number(valorUnitario) : undefined,
      valorTotal: tipo === 'saida' ? Number(valorTotal) : undefined,
      data: new Date().toISOString()
    });

    // Atualiza custo do produto em caso de entrada
    if (tipo === 'entrada') {
      updateProdutoCusto(produtoId, Number(novoCusto));
    }

    // Atualiza estado local após salvar
    setMovimentacoes(loadList(STORAGE.movimentacoes));

    alert('Lançamento registrado com sucesso!');

    // Reset form
    setLancamento({ tipo: '', produtoId: '', quantidade: '' });
    setAjusteValor('');
    setTipoAjuste('acrescimo');
    setNovoCusto('');

    navigate('/estoque');
  };

  return (
    <div className="lancamento-page">
      <div className="lancamento-container">
        <h2>Lançamento de Entrada/Saída</h2>
        <form className="lancamento-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Tipo *</label>
            <select
              name="tipo"
              value={lancamento.tipo}
              onChange={handleChange}
              required
            >
              <option value="">Selecione</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
          </div>

          <div className="form-group">
            <label>Produto *</label>
            <select
              name="produtoId"
              value={lancamento.produtoId}
              onChange={handleChange}
              required
            >
              <option value="">Selecione o produto</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} (Estoque atual: {calculaEstoqueAtual(p.id)})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Quantidade *</label>
            <input
              type="number"
              name="quantidade"
              value={lancamento.quantidade}
              onChange={handleChange}
              placeholder="Digite a quantidade"
              min="1"
              required
            />
          </div>

          {lancamento.tipo === 'entrada' && (
            <div className="form-group">
              <label>Valor de Custo *</label>
              <input
                type="number"
                placeholder={
                  custoAtual !== null
                    ? `Custo atual: R$ ${Number(custoAtual).toFixed(2)}`
                    : 'Digite o novo valor de custo'
                }
                value={novoCusto}
                onChange={(e) => setNovoCusto(e.target.value)}
                min="0"
                step="0.01"
                required
              />
            </div>
          )}

          {lancamento.tipo === 'saida' && Number(valorOriginal) > 0 && (
            <>
              <div className="form-group">
                <label>Valor de Venda Atual</label>
                <input
                  type="text"
                  value={`R$ ${Number(valorOriginal).toFixed(2)}`}
                  disabled
                />
              </div>

              <div className="form-group">
                <label>Ajuste no Valor de Venda</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <select
                    value={tipoAjuste}
                    onChange={(e) => setTipoAjuste(e.target.value)}
                    style={{ flex: '1' }}
                  >
                    <option value="acrescimo">Acréscimo</option>
                    <option value="desconto">Desconto</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Valor"
                    value={ajusteValor}
                    onChange={(e) => setAjusteValor(e.target.value)}
                    style={{ flex: '2' }}
                  />
                </div>
                <small style={{ color: '#000000' }}>
                  Valor final: R$ {getValorFinal().toFixed(2)}
                </small>
              </div>
            </>
          )}

          <button type="submit" className="submit-button">
            Lançar
          </button>
        </form>
      </div>
    </div>
  );
}
