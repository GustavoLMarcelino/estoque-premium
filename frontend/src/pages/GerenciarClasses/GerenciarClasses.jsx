// Gestão das classes de serviço do Estoque Som. Cada classe carrega um valor
// fixo de mão de obra, somado no Orçamento e na Tabela de Preços (aba Som).
// Listar (inclusive desativadas), adicionar, ajustar o valor e ativar/desativar.
// Desativar não afeta produtos existentes — só some do dropdown de novos.
import React, { useEffect, useMemo, useState } from "react";
import { Layers, Plus, Loader2, Power, Check, Pencil } from "lucide-react";
import { ClassesSomAPI } from "../../services/classesSom";
import { useToast } from "../../components/ui/Toast";

const money = (n) => `R$ ${Number(n || 0).toFixed(2)}`;

export default function GerenciarClasses() {
  const toast = useToast();
  const [classes, setClasses] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState("");
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);

  // edição inline do valor de uma classe
  const [editId, setEditId] = useState(null);
  const [editValor, setEditValor] = useState("");

  async function carregar() {
    try {
      setCarregando(true);
      setClasses(await ClassesSomAPI.listar({ todas: true }));
    } catch (e) {
      toast.error("Não foi possível carregar as classes.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const ordenadas = useMemo(
    () => [...classes].sort((a, b) => a.nome.localeCompare(b.nome)),
    [classes],
  );

  async function adicionar(e) {
    e.preventDefault();
    const n = nome.trim();
    if (n.length < 2) { toast.error("Informe o nome da classe (mínimo 2 letras)."); return; }
    if (valor === "" || Number(valor) < 0 || !Number.isFinite(Number(valor))) {
      toast.error("Informe o valor de mão de obra (número ≥ 0)."); return;
    }
    try {
      setSalvando(true);
      await ClassesSomAPI.criar({ nome: n, valor_mao_obra: Number(valor) });
      setNome("");
      setValor("");
      toast.success("Classe cadastrada.");
      carregar();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Falha ao cadastrar classe.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirEdicao(c) {
    setEditId(c.id);
    setEditValor(String(Number(c.valor_mao_obra)));
  }

  async function salvarValor(c) {
    if (editValor === "" || Number(editValor) < 0 || !Number.isFinite(Number(editValor))) {
      toast.error("Valor de mão de obra inválido."); return;
    }
    try {
      await ClassesSomAPI.atualizar(c.id, { valor_mao_obra: Number(editValor) });
      setEditId(null);
      toast.success(`Valor de "${c.nome}" atualizado.`);
      carregar();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Falha ao atualizar valor.");
    }
  }

  async function toggleAtivo(c) {
    try {
      await ClassesSomAPI.atualizar(c.id, { ativo: !c.ativo });
      toast.success(c.ativo ? `"${c.nome}" desativada.` : `"${c.nome}" reativada.`);
      carregar();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Falha ao atualizar classe.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
            <Layers size={24} strokeWidth={2.2} />
          </span>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">Classes do Som</h1>
            <p className="text-sm text-slate-500">
              Cada classe carrega um valor fixo de mão de obra (usado no Orçamento e na Tabela de Preços).
            </p>
          </div>
        </div>

        {/* Adicionar */}
        <form onSubmit={adicionar} className="mt-5 flex flex-wrap gap-2">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nova classe (ex.: Rádio)"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 py-2.5 px-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          />
          <input
            type="number" min="0" step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Mão de obra (R$)"
            className="w-40 rounded-lg border border-slate-300 py-2.5 px-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          />
          <button type="submit" disabled={salvando}
            className="flex items-center gap-1 rounded-lg bg-amber-400 px-4 py-2.5 font-semibold text-slate-900 transition-colors hover:bg-amber-500 disabled:opacity-60">
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Adicionar
          </button>
        </form>

        {/* Lista */}
        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
          {carregando ? (
            <div className="p-4 text-sm text-slate-400">Carregando…</div>
          ) : ordenadas.length === 0 ? (
            <div className="p-4 text-sm text-slate-400">Nenhuma classe cadastrada.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {ordenadas.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className={`min-w-0 flex-1 text-sm font-semibold ${c.ativo ? "text-slate-700" : "text-slate-400 line-through"}`}>
                    {c.nome}
                  </span>

                  {editId === c.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min="0" step="0.01" autoFocus
                        value={editValor}
                        onChange={(e) => setEditValor(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); salvarValor(c); }
                          if (e.key === "Escape") setEditId(null);
                        }}
                        className="w-28 rounded-lg border border-amber-300 bg-amber-50 py-1.5 px-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                      />
                      <button onClick={() => salvarValor(c)} title="Salvar valor"
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-slate-900 hover:bg-amber-500">
                        <Check size={15} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => abrirEdicao(c)} title="Editar valor de mão de obra"
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:border-amber-300 hover:bg-amber-50">
                      {money(c.valor_mao_obra)}
                      <Pencil size={13} className="text-slate-400" />
                    </button>
                  )}

                  <button
                    onClick={() => toggleAtivo(c)}
                    title={c.ativo ? "Desativar (some do dropdown; produtos existentes não mudam)" : "Reativar"}
                    className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      c.ativo
                        ? "bg-emerald-50 text-emerald-700 hover:bg-rose-50 hover:text-rose-700"
                        : "bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                    }`}
                  >
                    <Power size={12} />
                    {c.ativo ? "Ativa" : "Inativa"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
