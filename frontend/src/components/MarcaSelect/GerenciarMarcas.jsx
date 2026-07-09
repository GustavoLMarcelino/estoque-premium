// Modal simples de gestão de marcas: listar (inclusive desativadas),
// adicionar e ativar/desativar. Desativar não afeta produtos existentes —
// apenas esconde a marca do dropdown de novos produtos.
import React, { useEffect, useState } from "react";
import { X, Plus, Loader2, Power } from "lucide-react";
import { MarcasAPI } from "../../services/marcas";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";

export default function GerenciarMarcas({ onClose }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [marcas, setMarcas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      setCarregando(true);
      setMarcas(await MarcasAPI.listar({ todas: true }));
    } catch (e) {
      toast.error("Não foi possível carregar as marcas.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function adicionar(e) {
    e.preventDefault();
    const n = nome.trim();
    if (n.length < 2) { toast.error("Informe o nome da marca (mínimo 2 letras)."); return; }
    try {
      setSalvando(true);
      await MarcasAPI.criar(n);
      setNome("");
      toast.success("Marca cadastrada.");
      carregar();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Falha ao cadastrar marca.");
    } finally {
      setSalvando(false);
    }
  }

  async function toggleAtivo(m) {
    // Desativar remove a marca do dropdown de novos produtos — confirma antes.
    // Reativar é inócuo (só traz de volta), então não pede confirmação.
    if (m.ativo) {
      const ok = await confirm({
        title: "Desativar marca",
        message: `Desativar "${m.nome}"? Ela some do dropdown de novos produtos (os existentes não mudam).`,
        confirmLabel: "Desativar",
        cancelLabel: "Cancelar",
      });
      if (!ok) return;
    }
    try {
      await MarcasAPI.atualizar(m.id, { ativo: !m.ativo });
      toast.success(m.ativo ? `"${m.nome}" desativada.` : `"${m.nome}" reativada.`);
      carregar();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Falha ao atualizar marca.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Gerenciar marcas</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={adicionar} className="mt-4 flex gap-2">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nova marca"
            className="w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          />
          <button type="submit" disabled={salvando}
            className="flex items-center gap-1 rounded-lg bg-amber-400 px-4 font-semibold text-slate-900 transition-colors hover:bg-amber-500 disabled:opacity-60">
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Adicionar
          </button>
        </form>

        <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-slate-200">
          {carregando ? (
            <div className="p-4 text-sm text-slate-400">Carregando…</div>
          ) : marcas.length === 0 ? (
            <div className="p-4 text-sm text-slate-400">Nenhuma marca cadastrada.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {marcas.map((m) => (
                <li key={m.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className={`text-sm font-medium ${m.ativo ? "text-slate-700" : "text-slate-400 line-through"}`}>
                    {m.nome}
                  </span>
                  <button
                    onClick={() => toggleAtivo(m)}
                    title={m.ativo ? "Desativar (some do dropdown; produtos existentes não mudam)" : "Reativar"}
                    className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      m.ativo
                        ? "bg-emerald-50 text-emerald-700 hover:bg-rose-50 hover:text-rose-700"
                        : "bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                    }`}
                  >
                    <Power size={12} />
                    {m.ativo ? "Ativa" : "Inativa"}
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
