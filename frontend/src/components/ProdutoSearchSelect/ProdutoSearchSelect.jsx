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

const ALTURA_MAXIMA_PADRAO = 256; // 16rem — mesmo teto de antes (max-h-64)
const ALTURA_MINIMA = 120; // ~3 linhas — abaixo disso a lista fica inútil

// Teto adequado ao espaço restante da viewport abaixo do campo. Quando o
// campo está perto do rodapé (formulário longo, tela curta), a lista não
// estoura para fora — encolhe até ALTURA_MINIMA e conta com o scroll
// automático (ver useEffect abaixo) para trazer esse resto para a área
// visível, em vez de abrir para cima (flip fica para outra hora).
function alturaMaximaDisponivel(boxEl) {
  const rect = boxEl?.getBoundingClientRect();
  if (!rect) return ALTURA_MAXIMA_PADRAO;
  const margem = 8;
  const espacoAbaixo = window.innerHeight - rect.bottom - margem;
  return Math.min(ALTURA_MAXIMA_PADRAO, Math.max(ALTURA_MINIMA, espacoAbaixo));
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
  const listRef = useRef(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0); // índice destacado (teclado)
  const [alturaMaxLista, setAlturaMaxLista] = useState(ALTURA_MAXIMA_PADRAO);

  // Calcula a altura ANTES de abrir (mesmo evento que dispara setOpen(true)),
  // pra lista já nascer do tamanho certo, sem "flash" encolhendo depois.
  function abrir() {
    setAlturaMaxLista(alturaMaximaDisponivel(boxRef.current));
    setOpen(true);
  }

  // Rola a lista para dentro da área visível assim que ela aparece no DOM —
  // 'nearest' não mexe em nada se já estiver visível.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      listRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

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
      if (!open) { abrir(); return; }
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
        <Icon size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cp-text-muted)]" />
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
        onChange={(e) => { setQuery(e.target.value); abrir(); }}
        onFocus={abrir}
        onKeyDown={onKeyDown}
        className={`w-full rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] py-2.5 ${Icon ? "pl-10" : "pl-3"} pr-3 text-[var(--cp-ink)] outline-none transition placeholder:text-[var(--cp-text-muted)] focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40 disabled:bg-[var(--cp-panel-alt)] disabled:text-[var(--cp-text-muted)]`}
      />

      {open && resultados.length > 0 && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          style={{ maxHeight: alturaMaxLista }}
          className="absolute z-30 mt-1 w-full overflow-auto rounded-[var(--cp-r-lg)] border-[length:var(--cp-bw-12)] border-[var(--cp-ink)] bg-[var(--cp-panel)] shadow-lg"
        >
          {resultados.map((p, i) => (
            <li key={p.id} id={`${listId}-opt-${i}`} role="option" aria-selected={i === hi}>
              <button
                type="button"
                onMouseEnter={() => setHi(i)}
                onClick={() => escolher(p)}
                className={`flex w-full items-center justify-between gap-2 border-b border-[var(--cp-line)] px-4 py-2.5 text-left text-sm transition-colors last:border-b-0 ${
                  i === hi ? "bg-[var(--cp-volt)]/20" : "hover:bg-[var(--cp-panel-alt)]"
                }`}
              >
                {renderOption ? renderOption(p) : <span className="text-[var(--cp-ink)]">{getLabel(p)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && query.trim() && resultados.length === 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-[var(--cp-r-lg)] border-[length:var(--cp-bw-12)] border-[var(--cp-ink)] bg-[var(--cp-panel)] px-4 py-3 text-sm text-[var(--cp-text-muted)] shadow-lg">
          {emptyText}
        </div>
      )}
    </div>
  );
}
