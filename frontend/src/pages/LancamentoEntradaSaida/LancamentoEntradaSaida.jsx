import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeftRight, Warehouse, ArrowUpDown, Package, Hash,
  DollarSign, CreditCard, SlidersHorizontal, SendHorizontal,
  Battery, Music, User,
} from "lucide-react";
import { EstoqueAPI } from "../../services/estoque";
import { MovAPI } from "../../services/movimentacoes";
import { EstoqueSomAPI } from "../../services/estoqueSom";
import { MovSomAPI } from "../../services/movimentacoesSom";
import { ESTOQUE_TIPOS } from "../../services/estoqueTipos";
import { useToast } from "../../components/ui/Toast";

export default function LancamentoEntradaSaida() {
  const toast = useToast();
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
    vendedor: "",
  });

  // Vendedor só se aplica às saídas de baterias.
  const exibeVendedor = lancamento.tipo === "saida" && tipoEstoque === ESTOQUE_TIPOS.BATERIAS;

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
      toast.error("Preencha todos os campos.");
      return;
    }

    const q = toInt(quantidade, 0);
    if (q <= 0) {
      toast.error("Quantidade invalida.");
      return;
    }

    if (tipo === "saida" && q > estoqueAtual) {
      toast.error(`Nao ha estoque suficiente! Estoque atual: ${estoqueAtual} unidades.`);
      return;
    }

    if (exibeVendedor && !lancamento.vendedor) {
      toast.error("Selecione o vendedor.");
      return;
    }

    try {
      if (tipo === "entrada") {
        if (novoCusto === "" || Number(novoCusto) < 0) {
          toast.error("Informe o novo valor de custo.");
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
        if (exibeVendedor) payloadMov.vendedor = lancamento.vendedor;
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

      toast.success("Lancamento registrado com sucesso!");
      setLancamento({ formaPagamento: "", parcelas: 1, tipo: "", produtoId: "", quantidade: "", vendedor: "" });
      setAjusteValor("");
      setTipoAjuste("acrescimo");
      setNovoCusto("");

      navigate(tipoEstoque === ESTOQUE_TIPOS.SOM ? "/estoque-som" : "/estoque");
    } catch (e2) {
      console.error("Lancamento erro:", e2);
      toast.error(e2?.response?.data?.message || e2?.message || "Falha ao registrar lancamento");
    }
  }

  // accent do campo "Tipo": verde p/ entrada, vermelho p/ saída
  const tipoAccent =
    lancamento.tipo === "entrada"
      ? { ring: "border-emerald-300 focus:border-emerald-400 focus:ring-emerald-200", icon: "text-emerald-500" }
      : lancamento.tipo === "saida"
      ? { ring: "border-rose-300 focus:border-rose-400 focus:ring-rose-200", icon: "text-rose-500" }
      : { ring: "border-slate-300 focus:border-amber-400 focus:ring-amber-200", icon: "text-slate-400" };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 md:p-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
            <ArrowLeftRight size={24} strokeWidth={2.2} />
          </span>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">
              Lançamento de Entrada/Saída ({tipoEstoque === ESTOQUE_TIPOS.SOM ? "Som" : "Baterias"})
            </h1>
            <p className="text-sm text-slate-500">Registre entradas e saídas do estoque</p>
          </div>
        </div>

        {err && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {err}
          </div>
        )}
        {loading && <div className="mt-4 text-sm text-slate-400">Carregando produtos...</div>}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {/* Estoque - pill toggle */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-600">Estoque *</span>
            <div className="flex gap-2">
              <PillToggle active={tipoEstoque === ESTOQUE_TIPOS.BATERIAS} icon={Battery} label="Baterias"
                onClick={() => setTipoEstoque(ESTOQUE_TIPOS.BATERIAS)} />
              <PillToggle active={tipoEstoque === ESTOQUE_TIPOS.SOM} icon={Music} label="Som"
                onClick={() => setTipoEstoque(ESTOQUE_TIPOS.SOM)} />
            </div>
          </div>

          {/* Tipo */}
          <FieldShell label="Tipo *" icon={ArrowUpDown} iconClass={tipoAccent.icon}>
            <select
              name="tipo" value={lancamento.tipo} onChange={handleChange} required
              className={`w-full appearance-none rounded-lg border bg-white py-2.5 pl-10 pr-3 text-slate-800 outline-none transition focus:ring-2 ${tipoAccent.ring}`}
            >
              <option value="">Selecione</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
          </FieldShell>

          {/* Produto */}
          <FieldShell label="Produto *" icon={Package}>
            <select
              name="produtoId" value={lancamento.produtoId} onChange={handleChange} required
              disabled={loading || produtos.length === 0}
              className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200 disabled:bg-slate-50 disabled:text-slate-400"
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
          </FieldShell>

          {/* Quantidade */}
          <FieldShell label="Quantidade *" icon={Hash}>
            <input
              type="number" name="quantidade" value={lancamento.quantidade} onChange={handleChange}
              placeholder="Digite a quantidade" min="1" required
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            />
          </FieldShell>

          {/* Valor de Custo (entrada) */}
          {lancamento.tipo === "entrada" && (
            <FieldShell label="Valor de Custo *" icon={DollarSign}>
              <input
                type="number"
                placeholder={custoAtual !== null ? `Custo atual: R$ ${Number(custoAtual).toFixed(2)}` : "Digite o novo valor de custo"}
                value={novoCusto} onChange={(e) => setNovoCusto(e.target.value)}
                min="0" step="0.01" required
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
              />
            </FieldShell>
          )}

          {/* Valor de venda + ajuste (saída) */}
          {lancamento.tipo === "saida" && Number(valorOriginal) > 0 && (
            <>
              <FieldShell label="Valor de Venda Atual" icon={DollarSign}>
                <input
                  type="text" value={`R$ ${Number(valorOriginal).toFixed(2)}`} disabled
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-slate-500 outline-none"
                />
              </FieldShell>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-600">Ajuste no Valor de Venda</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <SlidersHorizontal size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                      value={tipoAjuste} onChange={(e) => setTipoAjuste(e.target.value)}
                      className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                    >
                      <option value="acrescimo">Acrescimo</option>
                      <option value="desconto">Desconto</option>
                    </select>
                  </div>
                  <input
                    type="number" placeholder="Valor" value={ajusteValor} onChange={(e) => setAjusteValor(e.target.value)}
                    className="flex-[2] rounded-lg border border-slate-300 px-3 py-2.5 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                  />
                </div>
                <small className="mt-1 block text-slate-500">
                  Valor final unitario: R$ {getValorFinalUnit().toFixed(2)}
                </small>
              </div>
            </>
          )}

          {/* Vendedor (saída de baterias) */}
          {exibeVendedor && (
            <FieldShell label="Vendedor *" icon={User}>
              <select
                value={lancamento.vendedor}
                onChange={(e) => setLancamento((prev) => ({ ...prev, vendedor: e.target.value }))}
                required
                className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
              >
                <option value="">Selecione o vendedor</option>
                <option value="Ismael">Ismael</option>
                <option value="Gustavo">Gustavo</option>
              </select>
            </FieldShell>
          )}

          {/* Forma de pagamento (saída) */}
          {lancamento.tipo === "saida" && (
            <FieldShell label="Forma de pagamento" icon={CreditCard}>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={lancamento.formaPagamento}
                  onChange={(e) => setLancamento((prev) => ({ ...prev, formaPagamento: e.target.value }))}
                  className="flex-1 appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                >
                  <option value="">Selecione...</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="pix">Pix</option>
                  <option value="debito">Debito</option>
                  <option value="credito">Credito</option>
                </select>

                {lancamento.formaPagamento === "credito" && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-600">Parcelas</label>
                    <input
                      type="number" min="1" max="12" value={lancamento.parcelas}
                      onChange={(e) => setLancamento((prev) => ({ ...prev, parcelas: Math.max(1, parseInt(e.target.value || "1", 10)) }))}
                      className="w-20 rounded-lg border border-slate-300 px-3 py-2.5 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                    />
                  </div>
                )}
              </div>
            </FieldShell>
          )}

          <button
            type="submit"
            disabled={loading || produtos.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 py-3 font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <SendHorizontal size={18} strokeWidth={2.2} />
            Lançar
          </button>
        </form>
      </div>
    </div>
  );
}

/* ---------- subcomponentes de UI ---------- */

function FieldShell({ label, icon: Icon, iconClass = "text-slate-400", children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-600">{label}</label>
      <div className="relative">
        <Icon size={18} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`} />
        {children}
      </div>
    </div>
  );
}

function PillToggle({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
        active
          ? "bg-amber-400 text-slate-900 shadow-sm"
          : "border border-amber-300 bg-white text-amber-600 hover:bg-amber-50"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}
