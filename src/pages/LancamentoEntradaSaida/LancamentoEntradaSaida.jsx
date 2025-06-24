import React, { useState, useEffect, useMemo } from 'react';
import './LancamentoEntradaSaida.css';
import { db } from '../../firebase';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

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
    const fetchData = async () => {
      const prodSnap = await getDocs(collection(db, "produtos"));
      setProdutos(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const movSnap = await getDocs(collection(db, "movimentacoes"));
      setMovimentacoes(movSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (lancamento.produtoId) {
      const produtoSelecionado = produtos.find(p => p.id === lancamento.produtoId);
      setValorOriginal(produtoSelecionado ? produtoSelecionado.valorVenda : 0);
    } else {
      setValorOriginal(0);
    }
  }, [lancamento.produtoId, produtos]);

  const custoAtual = useMemo(() => {
    const produto = produtos.find(p => p.id === lancamento.produtoId);
    return produto?.custo ?? null;
  }, [lancamento.produtoId, produtos]);

  const handleChange = e => {
    const { name, value } = e.target;
    setLancamento(prev => ({ ...prev, [name]: value }));
  };

  const calculaEstoqueAtual = produtoId => {
    const produto = produtos.find(p => p.id === produtoId);
    if (!produto) return 0;

    const entradas = movimentacoes
      .filter(m => m.produtoId === produtoId && m.tipo === 'entrada')
      .reduce((sum, m) => sum + m.quantidade, 0);
    const saidas = movimentacoes
      .filter(m => m.produtoId === produtoId && m.tipo === 'saida')
      .reduce((sum, m) => sum + m.quantidade, 0);

    return produto.quantidadeInicial + entradas - saidas;
  };

  const getValorFinal = () => {
    const v = parseFloat(ajusteValor);
    if (isNaN(v)) return valorOriginal;
    return tipoAjuste === 'acrescimo' ? valorOriginal + v : valorOriginal - v;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const { tipo, produtoId, quantidade } = lancamento;

    if (!tipo || !produtoId || !quantidade) {
      alert("Preencha todos os campos.");
      return;
    }

    const q = parseInt(quantidade, 10);
    const estoqueAtual = calculaEstoqueAtual(produtoId);

    if (tipo === 'saida' && q > estoqueAtual) {
      alert(`Não há estoque suficiente! Estoque atual: ${estoqueAtual} unidades.`);
      return;
    }

    if (tipo === 'entrada' && !novoCusto) {
      alert("Informe o novo valor de custo.");
      return;
    }

    try {
      const valorUnitario = getValorFinal();
      const valorTotal = valorUnitario * q;

      await addDoc(collection(db, "movimentacoes"), {
        produtoId,
        tipo,
        quantidade: q,
        valorAplicado: valorUnitario,
        valorTotal, // ✅ novo campo adicionado
        data: new Date()
      });

      if (tipo === 'entrada') {
        await updateDoc(doc(db, 'produtos', produtoId), {
          custo: parseFloat(novoCusto)
        });
      }

      alert("Lançamento registrado com sucesso!");

      setLancamento({ tipo: '', produtoId: '', quantidade: '' });
      setAjusteValor('');
      setTipoAjuste('acrescimo');
      setNovoCusto('');

      const movSnap = await getDocs(collection(db, "movimentacoes"));
      setMovimentacoes(movSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      navigate('/estoque');
    } catch (err) {
      console.error(err);
      alert("Erro ao registrar movimentação.");
    }
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
              {produtos.map(p => (
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
                    ? `Custo atual: R$ ${parseFloat(custoAtual).toFixed(2)}`
                    : 'Digite o novo valor de custo'
                }
                value={novoCusto}
                onChange={e => setNovoCusto(e.target.value)}
                min="0"
                step="0.01"
                required
              />
            </div>
          )}

          {lancamento.tipo === 'saida' && valorOriginal > 0 && (
            <>
              <div className="form-group">
                <label>Valor de Venda Atual</label>
                <input
                  type="text"
                  value={`R$ ${valorOriginal.toFixed(2)}`}
                  disabled
                />
              </div>

              <div className="form-group">
                <label>Ajuste no Valor de Venda</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <select
                    value={tipoAjuste}
                    onChange={e => setTipoAjuste(e.target.value)}
                    style={{ flex: '1' }}
                  >
                    <option value="acrescimo">Acréscimo</option>
                    <option value="desconto">Desconto</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Valor"
                    value={ajusteValor}
                    onChange={e => setAjusteValor(e.target.value)}
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
