// Período, URL e rótulos do Registro de Movimentação do Som.
//
// Tudo em datas 'YYYY-MM-DD' no fuso de Brasília — o MESMO critério do backend
// (services/registroSom.js), que é quem agrupa por dia. Aritmética de data em
// UTC: sem horário de verão, um dia tem sempre 24h.

const TZ = "America/Sao_Paulo";
const DIA_MS = 24 * 60 * 60 * 1000;
const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const FILTROS = [
  { key: "tudo", label: "Tudo" },
  { key: "pedidos", label: "Pedidos" },
  { key: "entradas", label: "Entradas" },
  { key: "avulsas", label: "Saídas avulsas" },
];

export const ATALHOS = [
  { key: "hoje", label: "Hoje" },
  { key: "7dias", label: "7 dias" },
  { key: "quinzena", label: "Quinzena atual" },
  { key: "mes", label: "Mês atual" },
];

const FILTRO_KEYS = new Set(FILTROS.map((f) => f.key));

/** 'YYYY-MM-DD' do instante `date` em Brasília (padrão: agora). */
export function hojeBRT(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function dataValida(s) {
  if (typeof s !== "string" || !SO_DATA.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function somaDias(ymd, n) {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
}

const ultimoDiaDoMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** { de, ate } de cada atalho, a partir de `hoje`. Quinzena e mês vão até o FIM
 *  do período (não até hoje): é o que fecha com a apuração de comissão. */
export function intervaloDoAtalho(key, hoje) {
  const [y, m, d] = hoje.split("-").map(Number);
  const mm = String(m).padStart(2, "0");
  switch (key) {
    case "hoje":
      return { de: hoje, ate: hoje };
    case "quinzena":
      return d <= 15
        ? { de: `${y}-${mm}-01`, ate: `${y}-${mm}-15` }
        : { de: `${y}-${mm}-16`, ate: `${y}-${mm}-${ultimoDiaDoMes(y, m)}` };
    case "mes":
      return { de: `${y}-${mm}-01`, ate: `${y}-${mm}-${ultimoDiaDoMes(y, m)}` };
    case "7dias":
    default:
      return { de: somaDias(hoje, -6), ate: hoje };
  }
}

/** Qual atalho corresponde ao intervalo, ou "personalizado". */
export function atalhoDoIntervalo(de, ate, hoje) {
  const achado = ATALHOS.find((a) => {
    const i = intervaloDoAtalho(a.key, hoje);
    return i.de === de && i.ate === ate;
  });
  return achado ? achado.key : "personalizado";
}

/** Lê de/ate/filtro da query string. Valor ausente ou inválido cai no padrão
 *  (7 dias até hoje, "tudo"); de > ate é trocado pelo padrão também. */
export function lerPeriodoDaUrl(params, hoje = hojeBRT()) {
  const padrao = intervaloDoAtalho("7dias", hoje);
  let de = params.get("de");
  let ate = params.get("ate");
  if (!dataValida(de) || !dataValida(ate) || de > ate) ({ de, ate } = padrao);
  const f = params.get("filtro");
  return { de, ate, filtro: FILTRO_KEYS.has(f) ? f : "tudo" };
}

/** A URL traz algum parâmetro desta tela? (decide a linha inicial da página) */
export function urlTemPeriodoSom(params) {
  return ["de", "ate", "filtro"].some((k) => params.has(k));
}

/** "Ter, 21/10" */
export function rotuloDia(ymd) {
  const [, m, d] = ymd.split("-");
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return `${SEMANA[dow]}, ${d}/${m}`;
}

/** "21/10/2026" */
export function dataBR(ymd) {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

/** "14:35" em Brasília. */
export function horaBRT(iso) {
  if (!iso) return "—"; // new Date(null) é 1970, e viraria "21:00"
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}
