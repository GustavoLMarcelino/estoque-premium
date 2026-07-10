// Select de classe de som (opcional) com opção de cadastrar uma nova sem sair
// da tela — cada classe carrega o valor fixo de mão de obra. Mesmo padrão do
// MarcaSelect, com um campo a mais (valor) na criação inline.
import React, { useEffect, useState } from "react";
import { Layers, Check, Loader2, X } from "lucide-react";
import { ClassesSomAPI } from "../../services/classesSom";
import { useToast } from "../ui/Toast";

const NOVA = "__nova__";
const money = (n) => `R$ ${Number(n || 0).toFixed(2)}`;

export default function ClasseSelect({ value, onChange, className = "" }) {
  const toast = useToast();
  const [classes, setClasses] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      setCarregando(true);
      // Produto só usa classes de Som (Insulfilme não é produto de estoque).
      setClasses(await ClassesSomAPI.listar({ categoria: "SOM" }));
    } catch (e) {
      console.error("Falha ao carregar classes:", e);
      toast.error("Não foi possível carregar as classes.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function salvarNova() {
    const nome = novoNome.trim();
    if (nome.length < 2) { toast.error("Informe o nome da classe (mínimo 2 letras)."); return; }
    if (novoValor === "" || Number(novoValor) < 0 || !Number.isFinite(Number(novoValor))) {
      toast.error("Informe o valor de mão de obra (número ≥ 0)."); return;
    }
    try {
      setSalvando(true);
      const criada = await ClassesSomAPI.criar({ nome, valor_mao_obra: Number(novoValor) });
      setClasses((prev) => [...prev, criada].sort((a, b) => a.nome.localeCompare(b.nome)));
      onChange(criada.id);
      setCriando(false);
      setNovoNome("");
      setNovoValor("");
      toast.success(`Classe "${criada.nome}" cadastrada.`);
    } catch (e) {
      toast.error(e?.response?.data?.message || "Falha ao cadastrar classe.");
    } finally {
      setSalvando(false);
    }
  }

  if (criando) {
    return (
      <div className={`flex flex-wrap gap-2 ${className}`}>
        <input
          autoFocus
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setCriando(false); setNovoNome(""); setNovoValor(""); } }}
          placeholder="Nome da nova classe"
          className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-amber-50 py-2.5 px-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
        />
        <input
          type="number" min="0" step="0.01"
          value={novoValor}
          onChange={(e) => setNovoValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); salvarNova(); }
            if (e.key === "Escape") { setCriando(false); setNovoNome(""); setNovoValor(""); }
          }}
          placeholder="Mão de obra (R$)"
          className="w-32 rounded-lg border border-amber-300 bg-amber-50 py-2.5 px-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
        />
        <button type="button" onClick={salvarNova} disabled={salvando} title="Salvar classe"
          className="flex items-center rounded-lg bg-amber-400 px-3 font-semibold text-slate-900 transition-colors hover:bg-amber-500 disabled:opacity-60">
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        </button>
        <button type="button" onClick={() => { setCriando(false); setNovoNome(""); setNovoValor(""); }} title="Cancelar"
          className="flex items-center rounded-lg border border-slate-300 px-3 text-slate-500 transition-colors hover:bg-slate-50">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <Layers size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <select
        value={value ?? ""}
        onChange={(e) => {
          if (e.target.value === NOVA) { setCriando(true); return; }
          onChange(e.target.value ? Number(e.target.value) : null);
        }}
        disabled={carregando}
        className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-8 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200 disabled:bg-slate-50"
      >
        <option value="">{carregando ? "Carregando classes…" : "Sem classe (opcional)"}</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>{c.nome} · {money(c.valor_mao_obra)}</option>
        ))}
        <option value={NOVA}>+ Cadastrar nova classe</option>
      </select>
    </div>
  );
}
