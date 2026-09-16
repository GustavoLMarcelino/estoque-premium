// Select de marca com opção de cadastrar uma nova sem sair da tela.
// Usado no Cadastro de Produto e no modal de edição do estoque.
import React, { useEffect, useState } from "react";
import { BadgePlus, Check, Loader2, X } from "lucide-react";
import { MarcasAPI } from "../../services/marcas";
import { useToast } from "../ui/Toast";

const NOVA = "__nova__";

export default function MarcaSelect({ value, onChange, className = "" }) {
  const toast = useToast();
  const [marcas, setMarcas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false); // modo "nova marca"
  const [novoNome, setNovoNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      setCarregando(true);
      setMarcas(await MarcasAPI.listar());
    } catch (e) {
      console.error("Falha ao carregar marcas:", e);
      toast.error("Não foi possível carregar as marcas.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function salvarNova() {
    const nome = novoNome.trim();
    if (nome.length < 2) {
      toast.error("Informe o nome da marca (mínimo 2 letras).");
      return;
    }
    try {
      setSalvando(true);
      const criada = await MarcasAPI.criar(nome);
      setMarcas((prev) => [...prev, criada].sort((a, b) => a.nome.localeCompare(b.nome)));
      onChange(criada.id);
      setCriando(false);
      setNovoNome("");
      toast.success(`Marca "${criada.nome}" cadastrada.`);
    } catch (e) {
      toast.error(e?.response?.data?.message || "Falha ao cadastrar marca.");
    } finally {
      setSalvando(false);
    }
  }

  if (criando) {
    return (
      <div className={`flex gap-2 ${className}`}>
        <input
          autoFocus
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); salvarNova(); }
            if (e.key === "Escape") { setCriando(false); setNovoNome(""); }
          }}
          placeholder="Nome da nova marca"
          className="w-full rounded-lg border border-amber-300 bg-amber-50 py-2.5 px-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
        />
        <button type="button" onClick={salvarNova} disabled={salvando} title="Salvar marca"
          className="flex items-center rounded-lg bg-amber-400 px-3 font-semibold text-slate-900 transition-colors hover:bg-amber-500 disabled:opacity-60">
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        </button>
        <button type="button" onClick={() => { setCriando(false); setNovoNome(""); }} title="Cancelar"
          className="flex items-center rounded-lg border border-slate-300 px-3 text-slate-500 transition-colors hover:bg-slate-50">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <BadgePlus size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <select
        value={value ?? ""}
        onChange={(e) => {
          if (e.target.value === NOVA) { setCriando(true); return; }
          onChange(e.target.value ? Number(e.target.value) : null);
        }}
        disabled={carregando}
        className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-8 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200 disabled:bg-slate-50"
      >
        <option value="">{carregando ? "Carregando marcas…" : "Selecione a marca"}</option>
        {marcas.map((m) => (
          <option key={m.id} value={m.id}>{m.nome}</option>
        ))}
        <option value={NOVA}>+ Cadastrar nova marca</option>
      </select>
    </div>
  );
}
