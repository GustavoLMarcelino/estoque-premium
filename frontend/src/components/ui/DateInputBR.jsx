import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { maskDateBR, brToIso, isoToBr } from "../../utils/dateBR";

const baseCls =
  "w-full rounded-lg border border-slate-300 py-2.5 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 disabled:bg-slate-50 disabled:text-slate-400";

/**
 * Campo de data digitável dd/mm/aaaa (sem calendário nativo).
 * `value` e `onChange` trabalham em ISO (yyyy-mm-dd): onChange recebe a data ISO
 * quando o texto forma uma data real, e "" enquanto está incompleto ou inválido.
 * Com `required`, mostra "Obrigatório" (vazio) ou "Data inválida" (10 dígitos que
 * não formam data), no mesmo estilo dos demais campos.
 */
export default function DateInputBR({ label, icon: Icon, value, onChange, required = false, disabled = false, className = "" }) {
  const [text, setText] = useState(() => isoToBr(value));
  const ultimoIso = useRef(value || "");
  const inputRef = useRef(null);
  const caretRef = useRef(null); // posição do cursor a restaurar após reformatar o texto

  // Valor vindo de fora (ex.: carregar garantia para edição): ISO -> dd/mm/aaaa.
  // Ignora o eco do próprio onChange para não reformatar o que o usuário digita.
  useEffect(() => {
    if ((value || "") !== ultimoIso.current) {
      ultimoIso.current = value || "";
      setText(isoToBr(value));
    }
  }, [value]);

  // Posição no texto mascarado logo depois do n-ésimo dígito (fim do texto se n >= total).
  function posAposDigitos(masked, n) {
    if (n <= 0) return 0;
    let vistos = 0;
    for (let k = 0; k < masked.length; k++) {
      if (/\d/.test(masked[k]) && ++vistos === n) return k + 1;
    }
    return masked.length;
  }

  function handleChange(e) {
    const raw = e.target.value;
    let digits = raw.replace(/\D+/g, "");
    let caretDigits = raw.slice(0, e.target.selectionStart ?? raw.length).replace(/\D+/g, "").length;
    // Backspace sobre a "/" não muda os dígitos; sem isto o cursor ficaria preso nela.
    // Apaga o dígito imediatamente antes da barra, que é o que o usuário espera.
    if (e.nativeEvent?.inputType === "deleteContentBackward" && digits === text.replace(/\D+/g, "") && caretDigits > 0) {
      digits = digits.slice(0, caretDigits - 1) + digits.slice(caretDigits);
      caretDigits -= 1;
    }
    const masked = maskDateBR(digits);
    const iso = brToIso(masked);
    caretRef.current = posAposDigitos(masked, Math.min(caretDigits, masked.replace(/\D+/g, "").length));
    setText(masked);
    ultimoIso.current = iso;
    onChange(iso);
  }

  // Reformatar o texto manda o cursor para o fim; devolve para onde o usuário estava editando.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (caretRef.current != null && el && document.activeElement === el) {
      el.setSelectionRange(caretRef.current, caretRef.current);
    }
    caretRef.current = null;
  }, [text]);

  const invalida = text.length === 10 && !value;

  return (
    <div className={className}>
      {label && <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>}
      <div className="relative">
        {Icon && (
          <Icon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        )}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/aaaa"
          maxLength={10}
          value={text}
          onChange={handleChange}
          disabled={disabled}
          className={`${baseCls} ${Icon ? "pl-10" : "pl-3"}`}
        />
      </div>
      {invalida && <p className="mt-1 text-xs text-red-600">Data inválida</p>}
      {required && !invalida && !value && <p className="mt-1 text-xs text-red-600">Obrigatório</p>}
    </div>
  );
}
