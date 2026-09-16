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
          className="w-full rounded-[var(--cp-r-lg)] border border-[var(--cp-volt)] bg-[var(--cp-volt)]/10 py-2.5 px-3 text-[var(--cp-ink)] outline-none transition focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40"
        />
        <button type="button" onClick={salvarNova} disabled={salvando} title="Salvar marca"
          className="flex items-center rounded-[var(--cp-r-lg)] border-[length:var(--cp-bw-02)] border-[var(--cp-ink)] bg-[var(--cp-volt)] px-3 font-semibold text-[var(--cp-volt-ink)] transition-colors hover:brightness-105 disabled:opacity-60">
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        </button>
        <button type="button" onClick={() => { setCriando(false); setNovoNome(""); }} title="Cancelar"
          className="flex items-center rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] px-3 text-[var(--cp-text-muted)] transition-colors hover:bg-[var(--cp-panel-alt)]">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <BadgePlus size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cp-text-muted)]" />
      <select
        value={value ?? ""}
        onChange={(e) => {
          if (e.target.value === NOVA) { setCriando(true); return; }
          onChange(e.target.value ? Number(e.target.value) : null);
        }}
        disabled={carregando}
        className="w-full appearance-none rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] py-2.5 pl-10 pr-8 text-[var(--cp-ink)] outline-none transition focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40 disabled:bg-[var(--cp-panel-alt)]"
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
