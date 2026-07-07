// Orçamento de som automotivo — calculadora em tempo real para o cliente.
// NÃO persiste nada: não cria movimentação, não baixa estoque, não grava no
// banco. Só lê os produtos do Estoque Som para puxar preços.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator, Search, Trash2, Plus, Minus, CreditCard, Banknote,
  Wrench, Eraser, PackageOpen,
} from "lucide-react";
import { EstoqueSomAPI } from "../../services/estoqueSom";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { calcularOrcamento, precoUnitario } from "../../utils/orcamento";

const money = (n) => `R$ ${Number(n || 0).toFixed(2)}`;

/** Preços do produto no Estoque Som (fallback: valor_venda espelha o à vista).
 * O valor_vista armazenado é a MESMA fonte da Tabela de Preços — o orçamento
 * à vista fica idêntico ao que o cliente vê nas outras telas. */
const precoCheio = (p) => Number(p?.valor_parcelado ?? p?.valor_venda ?? 0);
const precoAVista = (p) => Number(p?.valor_vista ?? p?.valor_venda ?? 0);

export default function Orcamento() {
  const confirm = useConfirm();

  // catálogo (carregado uma vez; busca filtra localmente)
  const [produtos, setProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  // orçamento em montagem
  const [itens, setItens] = useState([]); // [{ id, nome, precoParcelado, precoVista, qtd }]
  const [maoDeObra, setMaoDeObra] = useState("");
  const [modo, setModo] = useState("parcelado"); // 'parcelado' | 'vista'

  // busca
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    EstoqueSomAPI.listar()
      .then((data) => setProdutos(data ?? []))
      .catch((e) => {
        console.error("Orçamento: falha ao carregar Estoque Som:", e);
        setErro(e?.response?.data?.message || "Não foi possível carregar os produtos do Estoque Som.");
      })
      .finally(() => setCarregando(false));
  }, []);

  // fecha o dropdown ao clicar fora
  useEffect(() => {
    const fecha = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", fecha);
    return () => document.removeEventListener("mousedown", fecha);
  }, []);

  const resultados = useMemo(() => {
    const f = busca.trim().toLowerCase();
    if (!f) return [];
    return produtos
      .filter((p) =>
        String(p.produto || "").toLowerCase().includes(f) ||
        String(p.modelo || "").toLowerCase().includes(f) ||
        String(p.marca?.nome || "").toLowerCase().includes(f))
      .slice(0, 8);
  }, [produtos, busca]);

  function adicionar(p) {
    setItens((prev) => {
      const existente = prev.find((it) => it.id === p.id);
      if (existente) {
        return prev.map((it) => (it.id === p.id ? { ...it, qtd: it.qtd + 1 } : it));
      }
      const nome = [p.produto, p.modelo].filter(Boolean).join(" — ");
      return [...prev, { id: p.id, nome, precoParcelado: precoCheio(p), precoVista: precoAVista(p), qtd: 1 }];
    });
    setBusca("");
    setAberto(false);
  }

  const mudarQtd = (id, delta) =>
    setItens((prev) =>
      prev.map((it) => (it.id === id ? { ...it, qtd: Math.max(1, it.qtd + delta) } : it)));
  const remover = (id) => setItens((prev) => prev.filter((it) => it.id !== id));

  async function limpar() {
    if (!itens.length && !maoDeObra) return;
    const ok = await confirm({
      title: "Limpar orçamento",
      message: "Remover todos os itens e a mão de obra deste orçamento?",
      confirmLabel: "Limpar",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    setItens([]);
    setMaoDeObra("");
    setModo("parcelado");
  }

  const r = calcularOrcamento(itens, maoDeObra, modo);

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
              <Calculator size={24} strokeWidth={2.2} />
            </span>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-800">Orçamento — Som</h1>
              <p className="text-sm text-slate-500">Calculadora de orçamento. Nada é registrado no estoque.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={limpar}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
          >
            <Eraser size={16} />
            Limpar orçamento
          </button>
        </div>

        {erro && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{erro}</div>
        )}

        {/* Busca de produtos */}
        <div ref={boxRef} className="relative mt-6">
          <label className="mb-1 block text-sm font-semibold text-slate-700">Adicionar item do Estoque Som</label>
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setAberto(true); }}
              onFocus={() => setAberto(true)}
              placeholder={carregando ? "Carregando produtos…" : "Buscar por produto, modelo ou marca…"}
              disabled={carregando}
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 disabled:bg-slate-50"
            />
          </div>
          {aberto && resultados.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              {resultados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => adicionar(p)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-amber-50"
                  >
                    <span className="text-slate-700">
                      {[p.produto, p.modelo].filter(Boolean).join(" — ")}
                      {p.marca?.nome ? <span className="ml-2 text-xs text-slate-400">{p.marca.nome}</span> : null}
                    </span>
                    <span className="font-semibold text-slate-800">{money(precoCheio(p))}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {aberto && busca.trim() && !carregando && resultados.length === 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400 shadow-lg">
              Nenhum produto encontrado.
            </div>
          )}
        </div>

        {/* Toggle Parcelado / À Vista */}
        <div className="mt-6">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Forma de pagamento (itens)</span>
          <div className="grid grid-cols-2 gap-3">
            <ModoBtn
              active={modo === "parcelado"}
              icon={CreditCard}
              titulo="Parcelado"
              subtitulo="Preço cheio dos itens"
              onClick={() => setModo("parcelado")}
            />
            <ModoBtn
              active={modo === "vista"}
              icon={Banknote}
              titulo="À Vista"
              subtitulo="Preço à vista da tabela"
              onClick={() => setModo("vista")}
            />
          </div>
        </div>

        {/* Lista de itens */}
        <div className="mt-6 overflow-hidden rounded-xl ring-1 ring-slate-200">
          {itens.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-slate-400">
              <PackageOpen size={28} />
              <p className="text-sm">Nenhum item no orçamento. Busque um produto acima para começar.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {itens.map((it) => (
                <li key={it.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-700">{it.nome}</p>
                    <p className="text-xs text-slate-500">
                      {money(precoUnitario(it, modo))} un.
                      {modo === "vista" && it.precoVista !== it.precoParcelado && (
                        <span className="ml-1 text-slate-400 line-through">{money(it.precoParcelado)}</span>
                      )}
                    </p>
                  </div>

                  {/* stepper de quantidade */}
                  <div className="flex items-center gap-1 rounded-lg border border-slate-200">
                    <button type="button" onClick={() => mudarQtd(it.id, -1)} aria-label="Diminuir quantidade"
                      className="px-2 py-1.5 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                      disabled={it.qtd <= 1}>
                      <Minus size={14} />
                    </button>
                    <span className="min-w-[2rem] text-center text-sm font-bold text-slate-700">{it.qtd}</span>
                    <button type="button" onClick={() => mudarQtd(it.id, 1)} aria-label="Aumentar quantidade"
                      className="px-2 py-1.5 text-slate-500 transition-colors hover:bg-slate-50">
                      <Plus size={14} />
                    </button>
                  </div>

                  <span className="w-24 text-right text-sm font-bold text-slate-800">
                    {money(precoUnitario(it, modo) * it.qtd)}
                  </span>

                  <button type="button" onClick={() => remover(it.id)} aria-label={`Remover ${it.nome}`}
                    className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600">
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Mão de obra */}
        <div className="mt-6">
          <label htmlFor="maoDeObra" className="mb-1 block text-sm font-semibold text-slate-700">
            Mão de obra <span className="font-normal text-slate-400">(sem desconto)</span>
          </label>
          <div className="relative">
            <Wrench size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="maoDeObra"
              type="number" min="0" step="0.01"
              value={maoDeObra}
              onChange={(e) => setMaoDeObra(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            />
          </div>
        </div>

        {/* Resumo */}
        <div className="mt-6 rounded-xl bg-slate-800 p-5 text-white">
          <Linha rotulo={`Itens (${modo === "vista" ? "à vista" : "parcelado"})`} valor={money(r.subtotalItens)} />
          {modo === "vista" && r.desconto > 0 && (
            <Linha rotulo="Desconto à vista" valor={`−${money(r.desconto)}`} destaque="text-emerald-400" />
          )}
          {modo === "vista" && r.desconto > 0 && (
            <Linha rotulo="Itens com desconto" valor={money(r.totalItens)} />
          )}
          <Linha rotulo="Mão de obra" valor={money(r.maoDeObra)} />
          <div className="mt-3 flex items-center justify-between border-t border-white/15 pt-3">
            <span className="text-base font-bold">Total</span>
            <span className="text-2xl font-extrabold text-[#FFC400]">{money(r.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- subcomponentes ---------- */

function ModoBtn({ active, icon: Icon, titulo, subtitulo, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors ${
        active
          ? "border-amber-400 bg-amber-50"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}`}>
        <Icon size={18} />
      </span>
      <span>
        <span className={`block text-sm font-bold ${active ? "text-amber-700" : "text-slate-600"}`}>{titulo}</span>
        <span className="block text-xs text-slate-400">{subtitulo}</span>
      </span>
    </button>
  );
}

function Linha({ rotulo, valor, destaque = "" }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span className="text-white/70">{rotulo}</span>
      <span className={`font-semibold ${destaque}`}>{valor}</span>
    </div>
  );
}
