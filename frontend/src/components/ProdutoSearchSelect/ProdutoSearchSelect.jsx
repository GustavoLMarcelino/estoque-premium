// Combobox de produto com busca por digitação. APRESENTACIONAL: recebe a lista
// já filtrada (por estoque/tipo) do pai + value + onChange; não faz fetch nem
// decide o filtro de estoque/tipo. A busca (accent-insensitive, via semAcento)
// acontece DENTRO da lista recebida — mesma normalização do Orçamento/Estoque.
//
// Dois modos, cobertos pela mesma API:
//   - "select vinculado" (Pedido Som, Lançamento): value = id selecionado; o
//     campo mostra o rótulo do produto escolhido quando fechado.
//   - "busca-e-adiciona" (Orçamento): value = null; ao escolher, dispara onChange
//     e limpa o texto (nenhuma seleção persiste).
//
// value/onChange preservam o contrato do <select> nativo que este componente
// substitui: onChange recebe o OBJETO do produto (o pai extrai o id), então
// valor, mão de obra e totais downstream continuam iguais.
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { semAcento } from "../../utils/texto";

// Campos padrão da busca: nome, modelo e marca (os mesmos do Orçamento).
function textoPadrao(p) {
  return [p?.produto, p?.nome, p?.modelo, p?.marca?.nome].filter(Boolean).join(" ");
}

export default function ProdutoSearchSelect({
  produtos = [],
  value = null,
  onChange,
  renderOption,
  getLabel = (p) => p?.produto || p?.nome || "",
  getSearchText = textoPadrao,
  placeholder = "Buscar produto…",
  emptyText = "Nenhum produto encontrado.",
  disabled = false,
  showAllOnEmpty = true, // select nativo mostrava tudo ao abrir; Orçamento não
  maxResults = 50,
  icon: Icon = Search,
  className = "",
  id,
}) {
  const boxRef = useRef(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0); // índice destacado (teclado)

  const selecionado = useMemo(
    () => produtos.find((p) => String(p?.id) === String(value)) ?? null,
    [produtos, value],
  );

  const resultados = useMemo(() => {
    const f = semAcento(query.trim());
    const base = !f
      ? (showAllOnEmpty ? produtos : [])
      : produtos.filter((p) => semAcento(getSearchText(p)).includes(f));
    return base.slice(0, maxResults);
  }, [produtos, query, showAllOnEmpty, getSearchText, maxResults]);

  // fecha ao clicar fora (mesmo padrão do Orçamento original)
  useEffect(() => {
    const fecha = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", fecha);
    return () => document.removeEventListener("mousedown", fecha);
  }, []);

  // lista mudou → volta o destaque para o topo
  useEffect(() => { setHi(0); }, [query, produtos]);

  function escolher(p) {
    if (!p) return;
    onChange?.(p);
    setOpen(false);
    // Sempre limpa o texto digitado. No modo vinculado o rótulo volta a partir
    // do value; no modo busca-e-adiciona (value null) o campo fica vazio.
    setQuery("");
  }

  function onKeyDown(e) {
    if (disabled) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHi((i) => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // NUNCA deixa o Enter submeter o <form> em volta (Pedido/Lançamento).
      if (open && resultados[hi]) { e.preventDefault(); escolher(resultados[hi]); }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  // Fechado com seleção → mostra o rótulo do produto; aberto → mostra a busca.
  const displayValue = open ? query : (selecionado ? getLabel(selecionado) : "");
  const placeholderEff = !open && selecionado ? getLabel(selecionado) : placeholder;

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      {Icon && (
        <Icon size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      )}
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && resultados[hi] ? `${listId}-opt-${hi}` : undefined}
        autoComplete="off"
        value={displayValue}
        disabled={disabled}
        placeholder={placeholderEff}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={`w-full rounded-lg border border-slate-300 py-2.5 ${Icon ? "pl-10" : "pl-3"} pr-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 disabled:bg-slate-50 disabled:text-slate-400`}
      />

      {open && resultados.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {resultados.map((p, i) => (
            <li key={p.id} id={`${listId}-opt-${i}`} role="option" aria-selected={i === hi}>
              <button
                type="button"
                onMouseEnter={() => setHi(i)}
                onClick={() => escolher(p)}
                className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                  i === hi ? "bg-amber-50" : "hover:bg-amber-50"
                }`}
              >
                {renderOption ? renderOption(p) : <span className="text-slate-700">{getLabel(p)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && query.trim() && resultados.length === 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400 shadow-lg">
          {emptyText}
        </div>
      )}
    </div>
  );
}
