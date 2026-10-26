// Dia de calendário em Brasília — FONTE ÚNICA. Antes havia duas cópias (diaBRT
// em services/registroSom.js e ymdBRT em utils/comissao.js) e o resumo de
// vendas cortava o dia em UTC, então uma venda das 22h30 BRT caía no dia
// seguinte no Dashboard e no dia certo no Registro do Som.
//
// São Paulo é fixo UTC−3 desde 2019 (sem horário de verão): o offset fixo
// constrói instantes exatos e um dia local tem sempre 24h.

export const TZ = 'America/Sao_Paulo';
export const OFFSET_BRT = '-03:00';

const formatadorDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** 'YYYY-MM-DD' do instante `date` no fuso de Brasília. */
export const diaBRT = (date) => formatadorDia.format(date);

/** Instante UTC de 00:00:00.000 (Brasília) do dia `ymd`. */
export const inicioDoDiaBRT = (ymd) => new Date(`${ymd}T00:00:00.000${OFFSET_BRT}`);

/** Instante UTC de 23:59:59.999 (Brasília) do dia `ymd`. */
export const fimDoDiaBRT = (ymd) => new Date(`${ymd}T23:59:59.999${OFFSET_BRT}`);
