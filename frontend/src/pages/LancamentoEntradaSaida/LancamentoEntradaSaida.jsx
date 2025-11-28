import React, { useState, useEffect, useMemo } from "react";
import "./LancamentoEntradaSaida.css";
import { useNavigate } from "react-router-dom";
import { EstoqueAPI } from "../../services/estoque";
import { MovAPI } from "../../services/movimentacoes";
import { EstoqueSomAPI } from "../../services/estoqueSom";
import { MovSomAPI } from "../../services/movimentacoesSom";
import { ESTOQUE_TIPOS } from "../../services/estoqueTipos";

export default function LancamentoEntradaSaida() {
  const [produtos, setProdutos] = useState([]);
  const [tipoEstoque, setTipoEstoque] = useState(ESTOQUE_TIPOS.BATERIAS);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [lancamento, setLancamento] = useState({
    formaPagamento: "",
    parcelas: 1,
    tipo: "",
    produtoId: "",
    quantidade: "",
  });

  const [valorOriginal, setValorOriginal] = useState(0); // valor de venda atual (unitario)
  const [ajusteValor, setAjusteValor] = useState("");
  const [tipoAjuste, setTipoAjuste] = useState("acrescimo");
  const [novoCusto, setNovoCusto] = useState("");

  const navigate = useNavigate();

  const toMoney = (n) => {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(2) : "0.00";
  };
  const toInt = (n, def = 0) => {
    const v = parseInt(n, 10);
    return Number.isFinite(v) && v >= 0 ? v : def;
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const service = tipoEstoque === ESTOQUE_TIPOS.SOM ? EstoqueSomAPI : EstoqueAPI;
        const data = await service.listar({ q: "" });
        if (!alive) return;
        setProdutos(data || []);
      } catch (e) {
        if (!alive) return;
        console.error("Carregar produtos erro:", e);
        setErr(e?.response?.data?.message || e?.message || "Falha ao carregar produtos");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tipoEstoque]);

  useEffect(() => {
    if (!lancamento.produtoId) {
      setValorOriginal(0);
      return;
    }
    const p = produtos.find((x) => String(x.id) === String(lancamento.produtoId));
    const venda = Number(p?.valor_venda ?? 0);
    setValorOriginal(Number.isFinite(venda) ? venda : 0);
  }, [lancamento.produtoId, produtos]);

  const custoAtual = useMemo(() => {
    const p = produtos.find((x) => String(x.id) === String(lancamento.produtoId));
    const c = Number(p?.custo ?? 0);
    return Number.isFinite(c) ? c : null;
  }, [lancamento.produtoId, produtos]);

  const estoqueAtual = useMemo(() => {
    const p = produtos.find((x) => String(x.id) === String(lancamento.produtoId));
    if (!p) return 0;
    const em = Number(
      p?.em_estoque ??
      (Number(p?.qtd_inicial ?? 0) + Number(p?.entradas ?? 0) - Number(p?.saidas ?? 0))
    );
    return Number.isFinite(em) ? em : 0;
  }, [lancamento.produtoId, produtos]);

  const getValorFinalUnit = () => {
    const base = Number(valorOriginal) || 0;
    const v = Number(ajusteValor);
    if (!Number.isFinite(v)) return base;
    return tipoAjuste === "acrescimo" ? base + v : base - v;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLancamento((prev) => ({ ...prev, [name]: value }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const { tipo, produtoId, quantidade } = lancamento;

    if (!tipo || !produtoId || !quantidade) {
      alert("Preencha todos os campos.");
      return;
    }

    const q = toInt(quantidade, 0);
    if (q <= 0) {
      alert("Quantidade invalida.");
      return;
    }

    if (tipo === "saida" && q > estoqueAtual) {
      alert(`Nao ha estoque suficiente! Estoque atual: ${estoqueAtual} unidades.`);
      return;
    }

    try {
      if (tipo === "entrada") {
        if (novoCusto === "" || Number(novoCusto) < 0) {
          alert("Informe o novo valor de custo.");
          return;
        }
      }

      const movService = tipoEstoque === ESTOQUE_TIPOS.SOM ? MovSomAPI : MovAPI;
      const estoqueService = tipoEstoque === ESTOQUE_TIPOS.SOM ? EstoqueSomAPI : EstoqueAPI;

      const payloadMov = {
        produto_id: Number(produtoId),
        tipo,
        quantidade: q,
      };
      if (tipo === "saida") {
        const unit = getValorFinalUnit();
        payloadMov.valor_final = toMoney(unit);
      }
      const created = await movService.criar(payloadMov);
      try {
        const metaKey = "movPagamentos";
        const store = JSON.parse(localStorage.getItem(metaKey) || "{}");
        if (created && created.id) {
          store[String(created.id)] = {
            forma: lancamento.formaPagamento || "",
            parcelas: Number(lancamento.parcelas || 1),
            unit: getValorFinalUnit(),
          };
          localStorage.setItem(metaKey, JSON.stringify(store));
        }
      } catch {}

      if (tipo === "entrada") {
        await estoqueService.atualizar(Number(produtoId), { custo: toMoney(novoCusto) });
      }

      alert("Lancamento registrado com sucesso!");
      setLancamento({ formaPagamento: "", parcelas: 1, tipo: "", produtoId: "", quantidade: "" });
      setAjusteValor("");
      setTipoAjuste("acrescimo");
      setNovoCusto("");

      navigate(tipoEstoque === ESTOQUE_TIPOS.SOM ? "/estoque-som" : "/estoque");
    } catch (e2) {
      console.error("Lancamento erro:", e2);
      alert(e2?.response?.data?.message || e2?.message || "Falha ao registrar lancamento");
    }
  }

  return (
    <div className="lancamento-page">
      <div className="lancamento-container">
        <h2>Lancamento de Entrada/Saida ({tipoEstoque === ESTOQUE_TIPOS.SOM ? "Som" : "Baterias"})</h2>

        {err && (
          <div style={{ padding: 10, marginBottom: 10, background: "#ffebee", border: "1px solid #e53935", color: "#b71c1c" }}>
            {err}
          </div>
        )}
        {loading && <div style={{ marginBottom: 10 }}>Carregando produtos...</div>}

        <form className="lancamento-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Estoque *</label>
            <select value={tipoEstoque} onChange={(e) => setTipoEstoque(e.target.value)}>
              <option value={ESTOQUE_TIPOS.BATERIAS}>Baterias</option>
              <option value={ESTOQUE_TIPOS.SOM}>Som</option>
            </select>
          </div>

          <div className="form-group">
            <label>Tipo *</label>
            <select name="tipo" value={lancamento.tipo} onChange={handleChange} required>
              <option value="">Selecione</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saida</option>
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

          {lancamento.tipo === "entrada" && (
            <div className="form-group">
              <label>Valor de Custo *</label>
              <input
                type="number"
                placeholder={
                  custoAtual !== null
                    ? `Custo atual: R$ ${Number(custoAtual).toFixed(2)}`
                    : "Digite o novo valor de custo"
                }
                value={novoCusto}
                onChange={(e) => setNovoCusto(e.target.value)}
                min="0"
                step="0.01"
                required
              />
            </div>
          )}

          {lancamento.tipo === "saida" && Number(valorOriginal) > 0 && (
            <>
              <div className="form-group">
                <label>Valor de Venda Atual</label>
                <input type="text" value={`R$ ${Number(valorOriginal).toFixed(2)}`} disabled />
              </div>

              <div className="form-group">
                <label>Ajuste no Valor de Venda</label>
                <div style={{ display: "flex", gap: "10px" }}>
                  <select
                    value={tipoAjuste}
                    onChange={(e) => setTipoAjuste(e.target.value)}
                    style={{ flex: "1" }}
                  >
                    <option value="acrescimo">Acrescimo</option>
                    <option value="desconto">Desconto</option>
                  </select>
                  <input
                    type="number"
                    placeholder="Valor"
                    value={ajusteValor}
                    onChange={(e) => setAjusteValor(e.target.value)}
                    style={{ flex: "2" }}
                  />
                </div>
                <small style={{ color: "#000000" }}>
                  Valor final unitario: R$ {getValorFinalUnit().toFixed(2)}
                </small>
              </div>
            </>
          )}

          {lancamento.tipo === "saida" && (
            <div className="form-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ minWidth: 160 }}>Forma de pagamento</label>
              <select
                value={lancamento.formaPagamento}
                onChange={(e) => setLancamento((prev) => ({ ...prev, formaPagamento: e.target.value }))}
              >
                <option value="">Selecione...</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="pix">Pix</option>
                <option value="debito">Debito</option>
                <option value="credito">Credito</option>
              </select>

              {lancamento.formaPagamento === "credito" && (
                <>
                  <label>Parcelas</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={lancamento.parcelas}
                    onChange={(e) =>
                      setLancamento((prev) => ({
                        ...prev,
                        parcelas: Math.max(1, parseInt(e.target.value || "1", 10)),
                      }))
                    }
                    style={{ width: 100 }}
                  />
                </>
              )}
            </div>
          )}

          <button
            type="submit"
            className="submit-button"
            disabled={loading || produtos.length === 0}
          >
            Lancar
          </button>
        </form>
      </div>
    </div>
  );
}
