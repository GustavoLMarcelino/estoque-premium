import React, { useState, useEffect, useMemo } from 'react';
import './LancamentoEntradaSaida.css';
import { useNavigate } from 'react-router-dom';
import { EstoqueAPI } from '../../services/estoque';
import { MovAPI } from '../../services/movimentacoes';

export default function LancamentoEntradaSaida() {
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [lancamento, setLancamento] = useState({
    tipo: '',
    produtoId: '',
    quantidade: ''
  });

  const [valorOriginal, setValorOriginal] = useState(0); // valor de venda atual (unitário) do produto
  const [ajusteValor, setAjusteValor] = useState('');
  const [tipoAjuste, setTipoAjuste] = useState('acrescimo');
  const [novoCusto, setNovoCusto] = useState('');

  const navigate = useNavigate();

  // Helpers numéricos
  const toMoney = (n) => {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(2) : '0.00';
  };
  const toInt = (n, def = 0) => {
    const v = parseInt(n, 10);
    return Number.isFinite(v) && v >= 0 ? v : def;
  };

  // Carrega produtos do backend
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr('');
      try {
        const data = await EstoqueAPI.listar({ q: '' }); // retorna array de itens do backend
        if (!alive) return;
        setProdutos(data || []);
      } catch (e) {
        if (!alive) return;
        console.error('Carregar produtos erro:', e);
        setErr(e?.response?.data?.message || e?.message || 'Falha ao carregar produtos');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Quando escolhe produto, carrega valor de venda atual para base do ajuste
  useEffect(() => {
    if (!lancamento.produtoId) {
      setValorOriginal(0);
      return;
    }
    const p = produtos.find((x) => String(x.id) === String(lancamento.produtoId));
    const venda = Number(p?.valor_venda ?? 0);
    setValorOriginal(Number.isFinite(venda) ? venda : 0);
  }, [lancamento.produtoId, produtos]);

  // custo atual (apenas para placeholder de entrada)
  const custoAtual = useMemo(() => {
    const p = produtos.find((x) => String(x.id) === String(lancamento.produtoId));
    const c = Number(p?.custo ?? 0);
    return Number.isFinite(c) ? c : null;
  }, [lancamento.produtoId, produtos]);

  // estoque atual a partir do backend (em_estoque gerada)
  const estoqueAtual = useMemo(() => {
    const p = produtos.find((x) => String(x.id) === String(lancamento.produtoId));
    if (!p) return 0;
    const em = Number(
      p?.em_estoque ??
      (Number(p?.qtd_inicial ?? 0) + Number(p?.entradas ?? 0) - Number(p?.saidas ?? 0))
    );
    return Number.isFinite(em) ? em : 0;
  }, [lancamento.produtoId, produtos]);

  // valor final unitário para SAÍDA considerando ajuste
  const getValorFinalUnit = () => {
    const base = Number(valorOriginal) || 0;
    const v = Number(ajusteValor);
    if (!Number.isFinite(v)) return base;
    return tipoAjuste === 'acrescimo' ? base + v : base - v;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLancamento((prev) => ({ ...prev, [name]: value }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const { tipo, produtoId, quantidade } = lancamento;

    if (!tipo || !produtoId || !quantidade) {
      alert('Preencha todos os campos.');
      return;
    }

    const q = toInt(quantidade, 0);
    if (q <= 0) {
      alert('Quantidade inválida.');
      return;
    }

    if (tipo === 'saida' && q > estoqueAtual) {
      alert(`Não há estoque suficiente! Estoque atual: ${estoqueAtual} unidades.`);
      return;
    }

    try {
      // Entrada exige informar novo custo (para atualizar produto)
      if (tipo === 'entrada') {
        if (novoCusto === '' || Number(novoCusto) < 0) {
          alert('Informe o novo valor de custo.');
          return;
        }
      }

      // 1) Cria movimentação
      const payloadMov = {
        produto_id: Number(produtoId),
        tipo, // 'entrada' | 'saida'
        quantidade: q,
      };
      if (tipo === 'saida') {
        const unit = getValorFinalUnit();
        payloadMov.valor_final = toMoney(unit); // unitário (opcional, backend aceita null também)
      }
      await MovAPI.criar(payloadMov);

      // 2) Se for ENTRADA, atualiza custo do produto
      if (tipo === 'entrada') {
        await EstoqueAPI.atualizar(Number(produtoId), { custo: toMoney(novoCusto) });
      }

      alert('Lançamento registrado com sucesso!');
      // Reset
      setLancamento({ tipo: '', produtoId: '', quantidade: '' });
      setAjusteValor('');
      setTipoAjuste('acrescimo');
      setNovoCusto('');

      // Volta para o estoque
      navigate('/estoque');
    } catch (e2) {
      console.error('Lançamento erro:', e2);
      alert(e2?.response?.data?.message || e2?.message || 'Falha ao registrar lançamento');
    }
  }

  return (
    <div className="lancamento-page">
      <div className="lancamento-container">
        <h2>Lançamento de Entrada/Saída</h2>

        {err && (
          <div style={{ padding: 10, marginBottom: 10, background: '#ffebee', border: '1px solid #e53935', color: '#b71c1c' }}>
            {err}
          </div>
        )}
        {loading && <div style={{ marginBottom: 10 }}>Carregando produtos…</div>}

        <form className="lancamento-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Tipo *</label>
            <select name="tipo" value={lancamento.tipo} onChange={handleChange} required>
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
              disabled={loading || produtos.length === 0}
            >
              <option value="">Selecione o produto</option>
              {produtos.map((p) => {
                const estoque = Number(
                  p?.em_estoque ??
                  (Number(p?.qtd_inicial ?? 0) + Number(p?.entradas ?? 0) - Number(p?.saidas ?? 0))
                );
                return (
                  <option key={p.id} value={p.id}>
                    {p.produto || p.nome} (Estoque atual: {Number.isFinite(estoque) ? estoque : 0})
                  </option>
                );
              })}
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
                <input type="text" value={`R$ ${Number(valorOriginal).toFixed(2)}`} disabled />
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
                  Valor final unitário: R$ {getValorFinalUnit().toFixed(2)}
                </small>
              </div>
            </>
          )}

          <button type="submit" className="submit-button" disabled={loading || produtos.length === 0}>
            Lançar
          </button>
        </form>
      </div>
    </div>
  );
}
