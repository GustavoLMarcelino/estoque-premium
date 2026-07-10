// Modal de configuração da comissão (no espírito do GerenciarMarcas): edita o
// valor fixo por bateria e o percentual sobre a mão de obra. Apenas admin
// (o backend também exige) — o botão que abre isto só aparece para admin.
import React, { useEffect, useState } from "react";
import { X, Loader2, Save } from "lucide-react";
import { ComissaoAPI } from "../services/comissao";
import { useToast } from "./ui/Toast";

export default function GerenciarComissao({ onClose, onSaved }) {
  const toast = useToast();
  const [valorBateria, setValorBateria] = useState("");
  const [percentual, setPercentual] = useState("");
  const [percentualInsulf, setPercentualInsulf] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    ComissaoAPI.getConfig()
      .then((cfg) => {
        setValorBateria(String(Number(cfg.valor_bateria)));
        setPercentual(String(Number(cfg.percentual_mao_obra)));
        setPercentualInsulf(String(Number(cfg.percentual_insulfilme)));
      })
      .catch(() => toast.error("Não foi possível carregar a configuração."))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function salvar(e) {
    e.preventDefault();
    const vb = Number(valorBateria);
    const pc = Number(percentual);
    const pi = Number(percentualInsulf);
    if (!(vb >= 0)) { toast.error("Valor por bateria inválido."); return; }
    if (!(pc >= 0 && pc <= 100)) { toast.error("Percentual de Som deve ficar entre 0 e 100."); return; }
    if (!(pi >= 0 && pi <= 100)) { toast.error("Percentual de Insulfilme deve ficar entre 0 e 100."); return; }
    try {
      setSalvando(true);
      await ComissaoAPI.salvarConfig({ valor_bateria: vb, percentual_mao_obra: pc, percentual_insulfilme: pi });
      toast.success("Configuração de comissão salva.");
      onSaved?.();
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Falha ao salvar configuração.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Configurar comissão</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {carregando ? (
          <div className="p-4 text-sm text-slate-400">Carregando…</div>
        ) : (
          <form onSubmit={salvar} className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Valor por bateria (R$)</label>
              <input
                type="number" min="0" step="0.01" value={valorBateria}
                onChange={(e) => setValorBateria(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
              />
              <small className="mt-1 block text-slate-500">Comissão fixa por bateria vendida (Gustavo e Ismael).</small>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">% sobre mão de obra — Som</label>
              <input
                type="number" min="0" max="100" step="0.01" value={percentual}
                onChange={(e) => setPercentual(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
              />
              <small className="mt-1 block text-slate-500">Comissão do Joel sobre a mão de obra de Som.</small>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">% sobre Insulfilme</label>
              <input
                type="number" min="0" max="100" step="0.01" value={percentualInsulf}
                onChange={(e) => setPercentualInsulf(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
              />
              <small className="mt-1 block text-slate-500">Comissão do Joel sobre serviços de Insulfilme.</small>
            </div>

            <button
              type="submit" disabled={salvando}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 py-3 font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-500 disabled:opacity-60"
            >
              {salvando ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              Salvar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
