// src/pages/stockmind/EstoqueParado.jsx
// Cards de "estoque parado" do Dashboard Inteligente. A métrica é DIAS SEM VENDA OU ENTRADA
// DE COMPRA por produto (o reset de 09/10/2026 apagou as datas de entrada, então não há "tempo
// em estoque"). Os limites de promoção/recarga vêm do backend (parametros), não são
// repetidos aqui.
import React, { useEffect, useState } from 'react';
import { Clock, Wallet, Tag, BatteryCharging, ChevronUp } from 'lucide-react';
import { EstoqueParadoAPI } from '../../services/stockmind';
import { KpiCard, Card, ParadoBadge } from './ui';
import { formatarMoeda, formatarDias, formatarData } from './formatar';

const ORIGENS = {
  venda_producao: 'venda (produção)',
  venda_historico: 'venda (histórico do grupo)',
  entrada: 'entrada/compra',
  entrada_manual: 'entrada/compra',
};
const DICA_ESTIMADA =
  'Data estimada pela última venda da marca e do grupo (o histórico não é por produto): o produto pode estar parado há mais tempo.';
const MAX_SEM_VENDA_LISTADOS = 6;

// Lista que abre ao clicar em cada card (mesmo padrão do "Ver produtos" das Recomendações).
// "valor" = mesma lista da promoção, do maior para o menor valor parado.
const porValor = (a, b) => b.valorParado - a.valorParado || b.dias - a.dias || a.id - b.id;
const LISTAS = {
  promocao: { titulo: 'Produtos para promoção', filtro: () => true },
  recarga: { titulo: 'Produtos para verificação de carga', filtro: (i) => i.recarga },
  valor: { titulo: 'Valor parado por produto (maior primeiro)', filtro: () => true, ordem: porValor },
};

function Origem({ item }) {
  return (
    <span title={item.estimada ? DICA_ESTIMADA : undefined}>
      {ORIGENS[item.origem]} · {formatarData(item.dataReferencia)}
    </span>
  );
}

// "≥ 121 dias" quando a data é estimada (os dias são um piso).
const textoDias = (item) => `${item.estimada ? '≥ ' : ''}${formatarDias(item.dias)}`;

function Acoes({ item }) {
  if (!item.promocao && !item.recarga) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {item.promocao && <ParadoBadge tipo="promocao" />}
      {item.recarga && <ParadoBadge tipo="recarga" />}
    </div>
  );
}

// Tabela (desktop) + cartões empilhados (mobile): mesmo formato no Top 5 e nas listas dos cards.
function ListaProdutos({ itens }) {
  return (
    <>
      {/* Desktop: tabela */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-slate-400">
              <th className="pb-2 pr-3 font-semibold">Produto</th>
              <th className="pb-2 pr-3 font-semibold">Estoque</th>
              <th className="pb-2 pr-3 font-semibold">Dias sem venda</th>
              <th className="pb-2 pr-3 font-semibold">Valor parado</th>
              <th className="pb-2 pr-3 font-semibold">Origem da data</th>
              <th className="pb-2 font-semibold">Sugestão</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {itens.map((i) => (
              <tr key={i.id}>
                <td className="py-2.5 pr-3 font-medium text-slate-700">{i.produto}</td>
                <td className="py-2.5 pr-3 text-slate-600">{i.estoque}</td>
                <td className="py-2.5 pr-3 text-slate-600">{textoDias(i)}</td>
                <td className="py-2.5 pr-3 text-slate-600">{formatarMoeda(i.valorParado)}</td>
                <td className="py-2.5 pr-3 text-slate-500"><Origem item={i} /></td>
                <td className="py-2.5"><Acoes item={i} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards empilhados */}
      <ul className="space-y-3 md:hidden">
        {itens.map((i) => (
          <li key={i.id} className="rounded-xl border border-slate-200 p-3">
            <p className="font-medium text-slate-700">{i.produto}</p>
            <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-slate-500">
              <dt>Estoque</dt>
              <dd className="text-right text-slate-700">{i.estoque}</dd>
              <dt>Dias sem venda</dt>
              <dd className="text-right text-slate-700">{textoDias(i)}</dd>
              <dt>Valor parado</dt>
              <dd className="text-right text-slate-700">{formatarMoeda(i.valorParado)}</dd>
              <dt>Origem da data</dt>
              <dd className="text-right text-slate-700"><Origem item={i} /></dd>
            </dl>
            {(i.promocao || i.recarga) && (
              <div className="mt-2">
                <Acoes item={i} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export default function EstoqueParado() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(false);
  const [aberta, setAberta] = useState(null);

  useEffect(() => {
    EstoqueParadoAPI.get()
      .then(setDados)
      .catch(() => setErro(true));
  }, []);

  if (erro) {
    return (
      <section className="mt-5" aria-label="Estoque parado">
        <div className="rounded-2xl bg-white p-5 text-sm text-slate-500 ring-1 ring-slate-200">
          Não foi possível carregar o estoque parado agora.
        </div>
      </section>
    );
  }
  if (!dados) {
    return (
      <section className="mt-5" aria-label="Estoque parado">
        <div className="rounded-2xl bg-white p-5 text-sm text-slate-400 ring-1 ring-slate-200">Carregando estoque parado…</div>
      </section>
    );
  }

  const { resumo, top, semVendaRegistrada, parametros } = dados;
  const { limitePromocaoDias, limiteRecargaDias } = parametros;
  const alternar = (chave) => setAberta((atual) => (atual === chave ? null : chave));
  const lista = aberta ? (dados.parados ?? []).filter(LISTAS[aberta].filtro).sort(LISTAS[aberta].ordem) : [];

  return (
    <section className="mt-5" aria-label="Estoque parado">
      <h2 className="text-base font-semibold text-slate-700">Estoque parado</h2>
      <p className="mb-3 text-xs text-slate-400">
        Dias desde a venda ou a entrada de compra mais recente de cada produto com estoque.
        Clique nos cards de valor parado, promoção e verificação de carga para ver os produtos.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Tempo médio sem venda"
          value={resumo.tempoMedioDias == null ? '—' : formatarDias(resumo.tempoMedioDias)}
          hint={resumo.tempoMedianoDias == null ? undefined : `mediana ${formatarDias(resumo.tempoMedianoDias)} · ${resumo.skusComData} produtos com data`}
          icon={Clock}
          ring="bg-sky-50 text-sky-600"
        />
        <KpiCard
          label={`Valor parado (> ${limitePromocaoDias} dias)`}
          value={formatarMoeda(resumo.valorParado)}
          hint={
            resumo.skusParados
              ? `${resumo.skusParados} produtos · média de ${formatarMoeda(resumo.valorMedioParado)} por produto`
              : 'nenhum produto acima do limite'
          }
          icon={Wallet}
          ring="bg-amber-50 text-amber-600"
          accent="text-amber-600"
          onClick={resumo.skusParados ? () => alternar('valor') : undefined}
          ativo={aberta === 'valor'}
        />
        <KpiCard
          label="Produtos para promoção"
          value={resumo.skusPromocao}
          hint="clique para ver a lista"
          icon={Tag}
          ring="bg-rose-50 text-rose-600"
          onClick={resumo.skusPromocao ? () => alternar('promocao') : undefined}
          ativo={aberta === 'promocao'}
        />
        <KpiCard
          label="Verificação de carga"
          value={resumo.skusRecarga}
          hint={`produtos parados há mais de ${limiteRecargaDias} dias`}
          icon={BatteryCharging}
          ring="bg-sky-50 text-sky-600"
          onClick={resumo.skusRecarga ? () => alternar('recarga') : undefined}
          ativo={aberta === 'recarga'}
        />
      </div>

      {aberta && (
        <Card title={`${LISTAS[aberta].titulo} (${lista.length})`} className="mt-4">
          <ListaProdutos itens={lista} />
          <button
            type="button"
            onClick={() => setAberta(null)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700"
          >
            Fechar lista <ChevronUp size={14} />
          </button>
        </Card>
      )}

      <Card title="Baterias paradas há mais tempo (top 5)" className="mt-4">
        {top.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum produto com estoque e data conhecida.</p>
        ) : (
          <>
            <ListaProdutos itens={top} />
          </>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Compra recente conta como entrada: bateria nova não aparece como parada. “≥” marca data estimada pelo histórico da marca e do grupo.
        </p>
      </Card>

      {semVendaRegistrada.skus > 0 && (
        <Card title="Sem venda registrada" className="mt-4">
          <p className="text-sm text-slate-600">Sem venda desde mar/2022 ou produto novo.</p>
          <p className="mt-1 text-sm text-slate-700">
            <strong>{semVendaRegistrada.skus}</strong> {semVendaRegistrada.skus === 1 ? 'produto' : 'produtos'} ·{' '}
            {semVendaRegistrada.unidades} un. · {formatarMoeda(semVendaRegistrada.valor)}
            <span className="text-slate-400"> (fora das contagens acima)</span>
          </p>
          <ul className="mt-2 space-y-1 text-xs text-slate-500">
            {semVendaRegistrada.itens.slice(0, MAX_SEM_VENDA_LISTADOS).map((i) => (
              <li key={i.id} className="flex justify-between gap-3">
                <span>{i.produto}</span>
                <span className="shrink-0">{i.estoque} un. · {formatarMoeda(i.valor)}</span>
              </li>
            ))}
            {semVendaRegistrada.itens.length > MAX_SEM_VENDA_LISTADOS && (
              <li>+ {semVendaRegistrada.itens.length - MAX_SEM_VENDA_LISTADOS} outros</li>
            )}
          </ul>
        </Card>
      )}
    </section>
  );
}
