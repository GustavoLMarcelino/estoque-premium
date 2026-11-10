// src/pages/stockmind/EstoqueParado.jsx
// Cards de "estoque parado" do Dashboard Inteligente. A métrica é DIAS SEM VENDA OU ENTRADA
// DE COMPRA por SKU (o reset de 09/10/2026 apagou as datas de entrada, então não há "tempo
// em estoque"). Os limites de promoção/recarga vêm do backend (parametros), não são
// repetidos aqui.
import React, { useEffect, useState } from 'react';
import { Clock, Wallet, Tag } from 'lucide-react';
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
  'Data estimada pela última venda da marca e do grupo (o histórico não é por SKU): o SKU pode estar parado há mais tempo.';
const MAX_SEM_VENDA_LISTADOS = 6;

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

export default function EstoqueParado() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(false);

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

  return (
    <section className="mt-5" aria-label="Estoque parado">
      <h2 className="text-base font-semibold text-slate-700">Estoque parado</h2>
      <p className="mb-3 text-xs text-slate-400">
        Dias desde a venda ou a entrada de compra mais recente de cada SKU com estoque.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Tempo médio sem venda"
          value={resumo.tempoMedioDias == null ? '—' : formatarDias(resumo.tempoMedioDias)}
          hint={resumo.tempoMedianoDias == null ? undefined : `mediana ${formatarDias(resumo.tempoMedianoDias)} · ${resumo.skusComData} SKUs com data`}
          icon={Clock}
          ring="bg-sky-50 text-sky-600"
        />
        <KpiCard
          label={`Valor parado (> ${limitePromocaoDias} dias)`}
          value={formatarMoeda(resumo.valorParado)}
          hint={
            resumo.skusParados
              ? `${resumo.skusParados} SKUs · média de ${formatarMoeda(resumo.valorMedioParado)} por SKU`
              : 'nenhum SKU acima do limite'
          }
          icon={Wallet}
          ring="bg-amber-50 text-amber-600"
          accent="text-amber-600"
        />
        <KpiCard
          label="SKUs para promoção"
          value={resumo.skusPromocao}
          hint={`${resumo.skusRecarga} também pedem verificação de carga (> ${limiteRecargaDias} dias)`}
          icon={Tag}
          ring="bg-rose-50 text-rose-600"
        />
      </div>

      <Card title="Baterias paradas há mais tempo (top 5)" className="mt-4">
        {top.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum SKU com estoque e data conhecida.</p>
        ) : (
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
                  {top.map((i) => (
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
              {top.map((i) => (
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
        )}
        <p className="mt-3 text-xs text-slate-400">
          Compra recente conta como entrada: bateria nova não aparece como parada. “≥” marca data estimada pelo histórico da marca e do grupo.
        </p>
      </Card>

      {semVendaRegistrada.skus > 0 && (
        <Card title="Sem venda registrada" className="mt-4">
          <p className="text-sm text-slate-600">Sem venda desde mar/2022 ou produto novo.</p>
          <p className="mt-1 text-sm text-slate-700">
            <strong>{semVendaRegistrada.skus}</strong> {semVendaRegistrada.skus === 1 ? 'SKU' : 'SKUs'} ·{' '}
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
