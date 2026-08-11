import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Zap, Package, DollarSign, AlertTriangle, ShoppingCart, CalendarDays, Inbox, X, CheckCircle2, Battery, Music, Layers, Clock } from 'lucide-react';
import api from '../../services/api';
import { temLinha, temPermissao } from '../../services/auth';
import { EstoqueResumoAPI } from '../../services/estoqueResumo';
import { VendasResumoAPI } from '../../services/vendasResumo';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatCurrency = (v) => currencyFormatter.format(Number.isFinite(v) ? v : 0);

// Rótulo da linha, na chave que a API dos críticos devolve.
const LINHA_LABEL = { baterias: 'Baterias', som: 'Som' };

// Só o que a tabela "Últimas Movimentações" mostra. O valor da saída saiu
// daqui junto com a soma do card "Vendas da Semana": aquele número agora vem
// pronto de /api/vendas-resumo, que tem a definição canônica de receita — e
// com ela o preço de tabela deixa de ser usado como palpite quando
// valor_final é 0, o que fazia empréstimo de garantia entrar como venda.
//
// O nome vem do próprio registro: as duas rotas de movimentação já fazem
// include de estoque { produto, modelo }. O mapa que a Home montava a partir
// do catálogo era desnecessário — e, pior, era paginado: movimentação de
// produto fora das 100 primeiras linhas aparecia como "Produto".
const normalizeMov = (mov) => {
  const tipo = String(mov?.tipo || '').toLowerCase();
  const dataStr = mov?.data_movimentacao || mov?.data || mov?.created_at;
  const data = dataStr ? new Date(dataStr) : null;
  const produto = mov?.estoque?.produto ?? '';
  const modelo = mov?.estoque?.modelo ?? '';
  return {
    tipo: tipo === 'entrada' ? 'entrada' : 'saida',
    nome: [produto, modelo].filter(Boolean).join(' - ') || 'Produto',
    quantidade: Number(mov?.quantidade ?? 0),
    data,
    sortKey: data ? data.getTime() : 0,
  };
};

// Paleta por card (alinhada à marca: âmbar/slate + verde/vermelho/azul).
// Os tokens de carrossel (label/dot/hover/ring) existem em TODAS as cores de
// propósito: o Tailwind só enxerga classe escrita por extenso, então montá-las
// por interpolação não funcionaria — e um card novo que vire carrossel não pode
// depender de alguém lembrar de acrescentar a cor aqui.
const CARD_STYLES = {
  amber: {
    box: 'bg-amber-50 text-amber-600', accent: 'border-l-amber-400',
    label: 'text-amber-600', dot: 'bg-amber-400',
    hover: 'hover:bg-amber-50/40', ring: 'focus-visible:ring-amber-200',
  },
  emerald: {
    box: 'bg-emerald-50 text-emerald-600', accent: 'border-l-emerald-400',
    label: 'text-emerald-600', dot: 'bg-emerald-400',
    hover: 'hover:bg-emerald-50/40', ring: 'focus-visible:ring-emerald-200',
  },
  rose: {
    box: 'bg-rose-50 text-rose-600', accent: 'border-l-rose-400',
    label: 'text-rose-600', dot: 'bg-rose-400',
    hover: 'hover:bg-rose-50/40', ring: 'focus-visible:ring-rose-200',
  },
  sky: {
    box: 'bg-sky-50 text-sky-600', accent: 'border-l-sky-400',
    label: 'text-sky-600', dot: 'bg-sky-400',
    hover: 'hover:bg-sky-50/40', ring: 'focus-visible:ring-sky-200',
  },
};

/** Faces de um resumo { total, baterias, som } — sempre começando no Total.
 *  Linha fora do escopo do usuário vem null da API e simplesmente não vira
 *  face. Com uma linha só, o Total seria idêntico a ela: mostra uma face só e
 *  as bolinhas somem.
 *
 *  Compartilhada pelos dois carrosséis (custo e valor de venda) porque as duas
 *  APIs devolvem o mesmo formato — se um dia divergirem na ordem das faces, é
 *  aqui que se percebe. */
function montarFaces(dados) {
  const linhas = [
    dados.baterias && { key: 'baterias', label: 'Baterias', icon: Battery, ...dados.baterias },
    dados.som && { key: 'som', label: 'Som', icon: Music, ...dados.som },
  ].filter(Boolean);
  if (linhas.length <= 1) {
    return linhas.length ? linhas : [{ key: 'total', label: 'Total geral', icon: Layers, ...dados.total }];
  }
  return [{ key: 'total', label: 'Total geral', icon: Layers, ...dados.total }, ...linhas];
}

export default function Home() {
  const [criticos, setCriticos] = useState(null);
  const [criticosModalOpen, setCriticosModalOpen] = useState(false);
  const [ultimasMov, setUltimasMov] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const verBaterias = temLinha('baterias');
  const verSom = temLinha('som');
  // Custo imobilizado é dado sensível: sem ver_custo a Home nem chama a API
  // (que também responde 403 — o gate de verdade é server-side).
  const [verCusto] = useState(() => temPermissao('ver_custo'));
  const [custoEstoque, setCustoEstoque] = useState(null);
  // Valor de venda imobilizado: sem gate de ver_custo (preço não é sensível),
  // por isso busca sempre. O escopo de linha é resolvido no servidor.
  const [vendaEstoque, setVendaEstoque] = useState(null);
  // null = ainda carregando (o card mostra '—'); 0 é uma semana sem vendas.
  const [vendasSemana, setVendasSemana] = useState(null);

  useEffect(() => {
    if (!verCusto) return undefined;
    let cancel = false;
    EstoqueResumoAPI.custo()
      .then((d) => { if (!cancel) setCustoEstoque(d); })
      .catch((e) => { console.error('Custo do estoque erro:', e); });
    return () => { cancel = true; };
  }, [verCusto]);

  useEffect(() => {
    let cancel = false;
    EstoqueResumoAPI.venda()
      .then((d) => { if (!cancel) setVendaEstoque(d); })
      .catch((e) => { console.error('Valor de venda do estoque erro:', e); });
    return () => { cancel = true; };
  }, []);

  // Críticos: contagem e lista filtradas no servidor. Filtrar no cliente
  // dependia do catálogo inteiro, que vinha cortado em 100 — 3 produtos de Som
  // abaixo do mínimo não existiam para a Home.
  useEffect(() => {
    let cancel = false;
    EstoqueResumoAPI.criticos()
      .then((d) => { if (!cancel) setCriticos(d); })
      .catch((e) => { console.error('Produtos críticos erro:', e); });
    return () => { cancel = true; };
  }, []);

  // Vendas da semana: janela móvel de 7×24h, recortada NO SERVIDOR pela
  // definição canônica de receita (/vendas-resumo). Mandar os dois lados como
  // instante ISO tira o fuso da conta — não há "dia" a interpretar aqui, ao
  // contrário do corte por data pura que a rota também aceita.
  useEffect(() => {
    let cancel = false;
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    VendasResumoAPI.resumo({ from, to })
      // Guarda o bloco inteiro, e não só vendasBrutas: a segunda face do card
      // (o que ainda não entrou no caixa) sai do mesmo request.
      .then((d) => { if (!cancel) setVendasSemana(d?.total ?? null); })
      .catch((e) => { console.error('Vendas da semana erro:', e); });
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    let cancel = false;
    async function loadDashboard() {
      setLoading(true);
      setErrorMsg('');
      try {
        // Só as movimentações: o catálogo inteiro não é mais baixado aqui.
        // Produtos, Valor Total e Críticos vêm somados/filtrados do servidor,
        // e o nome do produto já vem em cada movimentação.
        //
        // Escopo de linha: só busca a linha que o usuário opera. Sem isto, um
        // usuário baterias-only tomaria 403 no /movimentacoes-som e o
        // Promise.all inteiro rejeitaria — a Home morreria.
        const vazio = { data: { data: [] } };
        const [movResp, movSomResp] = await Promise.all([
          verBaterias ? api.get('/movimentacoes', { params: { pageSize: 20 } }) : Promise.resolve(vazio),
          verSom ? api.get('/movimentacoes-som', { params: { pageSize: 20 } }) : Promise.resolve(vazio),
        ]);

        const movsB = Array.isArray(movResp?.data?.data) ? movResp.data.data : [];
        const movsS = Array.isArray(movSomResp?.data?.data) ? movSomResp.data.data : [];

        // 20 por linha para escolher as 8 mais recentes das duas juntas — aqui
        // o teto é inofensivo: é uma amostra do topo, não uma conta.
        const ultimas = [...movsB, ...movsS]
          .map(normalizeMov)
          .filter((m) => m.data)
          .sort((a, b) => b.sortKey - a.sortKey)
          .slice(0, 8)
          .map((m) => ({ ...m, dataFmt: m.data.toLocaleDateString('pt-BR') }));

        if (cancel) return;
        setUltimasMov(ultimas);
      } catch (e) {
        if (cancel) return;
        console.error('Dashboard Home erro:', e);
        setErrorMsg(e?.response?.data?.message || e?.message || 'Falha ao carregar dashboard');
      } finally {
        if (!cancel) setLoading(false);
      }
    }

    loadDashboard();
    return () => { cancel = true; };
  }, [verBaterias, verSom]);

  // Faces do "Valor Total". Enquanto a API não responde fica null e o card cai
  // no formato simples com '—' — melhor do que exibir R$ 0,00, que é um número
  // errado e indistinguível de estoque zerado.
  const vendaFaces = useMemo(() => (vendaEstoque ? montarFaces(vendaEstoque) : null), [vendaEstoque]);

  // Contagem de produtos: vem do mesmo resumo do Valor Total, que conta o
  // catálogo inteiro. Antes saía do `total` do /api/estoque — este estava
  // certo, mas era o último motivo para baixar a lista paginada aqui.
  const totalProdutos = vendaEstoque?.total?.produtos;
  const qtdCriticos = criticos?.total?.quantidade;

  // Faces de "Vendas da Semana". A segunda só existe quando há fiado no
  // período: sem venda em aberto o card não vira carrossel e continua o de
  // sempre, sem prometer uma navegação que mostraria R$ 0,00.
  const vendasFaces = useMemo(() => {
    if (!vendasSemana) return null;
    const faces = [{
      key: 'faturado', label: 'Faturado', icon: ShoppingCart,
      valor: vendasSemana.vendasBrutas ?? 0,
      nota: `${vendasSemana.qtdVendas ?? 0} ${vendasSemana.qtdVendas === 1 ? 'unidade' : 'unidades'}`,
    }];
    const ar = vendasSemana.aReceber;
    if (ar?.qtd > 0) {
      faces.push({
        key: 'aReceber', label: 'A receber', icon: Clock,
        valor: ar.valor,
        nota: `${ar.qtd} ${ar.qtd === 1 ? 'venda fiado' : 'vendas fiado'} · já no faturado`,
      });
    }
    return faces.length > 1 ? faces : null;
  }, [vendasSemana]);

  const cardsContent = useMemo(() => ([
    {
      label: 'Produtos em Estoque',
      value: totalProdutos == null ? '—' : `${totalProdutos} produtos`,
      icon: Package,
      color: 'amber',
    },
    {
      label: 'Valor Total',
      value: '—',
      icon: DollarSign,
      color: 'emerald',
      faces: vendaFaces,
      ariaPrefixo: 'Valor total do estoque',
    },
    {
      label: 'Produtos Críticos',
      value: qtdCriticos == null ? '—' : `${qtdCriticos} itens`,
      icon: AlertTriangle,
      color: 'rose',
      // Sem dados ainda não há o que abrir — clicar traria um modal vazio que
      // diria "nenhum produto crítico", que é uma afirmação, não um "carregando".
      onClick: qtdCriticos == null ? undefined : () => setCriticosModalOpen(true),
    },
    {
      label: 'Vendas da Semana',
      value: vendasSemana == null ? '—' : formatCurrency(vendasSemana.vendasBrutas ?? 0),
      icon: ShoppingCart,
      color: 'sky',
      faces: vendasFaces,
      ariaPrefixo: 'Vendas da semana',
      renderFace: corpoVendasSemana,
    },
  ]), [totalProdutos, qtdCriticos, vendaFaces, vendasSemana, vendasFaces]);

  return (
    <div className="min-h-screen bg-white p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
          <Zap size={24} strokeWidth={2.2} />
        </span>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Bem-vindo ao Estoque Premium</h1>
          <p className="text-sm text-slate-500">Gerencie seu estoque em tempo real</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cardsContent.map(({ label, value, icon: Icon, color, onClick, faces, ariaPrefixo, renderFace }) => {
          const s = CARD_STYLES[color];
          const clickable = typeof onClick === 'function';

          // Card com faces vira carrossel; sem faces (ou antes da API
          // responder) segue o card simples de sempre.
          if (faces) {
            return (
              <CardCarrossel
                key={label}
                titulo={label}
                ariaPrefixo={ariaPrefixo || label}
                cor={color}
                faces={faces}
                // Cada card diz como desenhar a própria face; o corpo de
                // estoque é só o default histórico (Valor Total).
                renderFace={renderFace || corpoResumoEstoque}
              />
            );
          }

          return (
            <div
              key={label}
              onClick={onClick}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
              className={`rounded-2xl border border-l-4 ${s.accent} border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${
                clickable ? 'cursor-pointer hover:border-rose-300 hover:bg-rose-50/40 focus:outline-none focus:ring-2 focus:ring-rose-200' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.box}`}>
                  <Icon size={20} />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-800">{value}</p>
            </div>
          );
        })}
      </div>

      {/* Custo imobilizado — carrossel de faces (Total → Baterias → Som).
          Só renderiza com ver_custo E dados na mão. */}
      {verCusto && custoEstoque && <CardCustoEstoque dados={custoEstoque} />}

      {/* Últimas Movimentações */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-slate-500" />
            <h2 className="text-base font-semibold text-slate-800">Últimas Movimentações</h2>
          </div>
          {loading && <span className="text-sm text-slate-400">Carregando...</span>}
        </div>

        {errorMsg && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMsg}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Quantidade</th>
                  <th className="px-4 py-3">Data</th>
                </tr>
              </thead>
              <tbody>
                {ultimasMov.map((m, i) => (
                  <tr
                    key={`${m.nome}-${m.sortKey}-${i}`}
                    className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60 transition-colors hover:bg-amber-50/50"
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          m.tipo === 'entrada'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {m.tipo ? m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1) : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{m.nome}</td>
                    <td className="px-4 py-3 text-slate-700">{m.quantidade}</td>
                    <td className="px-4 py-3 text-slate-700">{m.dataFmt}</td>
                  </tr>
                ))}

                {!loading && ultimasMov.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12">
                      <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                        <Inbox size={32} strokeWidth={1.5} />
                        <span className="text-sm">Sem movimentações recentes</span>
                      </div>
                    </td>
                  </tr>
                )}

                {loading && ultimasMov.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-400">
                      Carregando dados...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {criticosModalOpen && (
        <CriticosModal itens={criticos?.total?.itens ?? []} onClose={() => setCriticosModalOpen(false)} />
      )}
    </div>
  );
}

/* ===== Carrossel de faces (estilo cartão de banco) ===== */

/** Card que alterna entre faces (Total → Baterias → Som) por clique, swipe,
 *  bolinhas ou teclado. Só a MECÂNICA mora aqui; o corpo de cada face vem de
 *  fora por renderFace, e a cor por `cor` (chave de CARD_STYLES).
 *
 *  Nasceu dentro do card de custo imobilizado e saiu quando o KPI "Valor Total"
 *  precisou do mesmo comportamento: duas cópias da mesma mecânica divergiriam
 *  na primeira correção de swipe que só uma delas recebesse. */
function CardCarrossel({ titulo, faces, cor, ariaPrefixo, renderFace }) {
  const s = CARD_STYLES[cor];

  // Sempre abre no Total: o índice nasce em 0 e nada o persiste entre visitas.
  const [atual, setAtual] = useState(0);
  const face = faces[Math.min(atual, faces.length - 1)];
  const Icon = face.icon;

  // Com uma face só não há para onde navegar: nada de clique nem de cursor
  // pointer prometendo uma interação que não existe.
  const navegavel = faces.length > 1;
  const avancar = () => setAtual((i) => (i + 1) % faces.length);

  // Toque: swipe horizontal alterna a face, como no app do banco. Sem libs e
  // sem breakpoint novo — só handlers de touch no mesmo card.
  const toqueX = React.useRef(null);
  // Depois de um swipe válido o navegador ainda dispara um click sintetizado —
  // que cairia no onClick do card e avançaria DE NOVO, pulando duas faces. A
  // flag faz o próximo click ser engolido. É zerada no touchstart porque nem
  // todo navegador emite esse click: sem isso, um navegador que o suprime
  // deixaria a flag presa e comeria o clique seguinte, esse legítimo.
  const ignorarProximoClique = React.useRef(false);

  const onTouchStart = (e) => {
    toqueX.current = e.touches[0].clientX;
    ignorarProximoClique.current = false;
  };
  const onTouchEnd = (e) => {
    if (toqueX.current == null) return;
    const dx = e.changedTouches[0].clientX - toqueX.current;
    toqueX.current = null;
    if (Math.abs(dx) < 40) return; // toque curto = clique comum, deixa passar
    ignorarProximoClique.current = true;
    setAtual((i) => (dx < 0 ? (i + 1) % faces.length : (i - 1 + faces.length) % faces.length));
  };

  const onClickCard = () => {
    if (ignorarProximoClique.current) {
      ignorarProximoClique.current = false;
      return;
    }
    avancar();
  };

  // CONVENÇÃO deste card: o clique no corpo avança a face, então TODO elemento
  // interativo interno (as bolinhas hoje; um botão/link amanhã) precisa parar a
  // propagação — senão a ação dele dispararia a troca junto. Use este handler.
  const naoPropagar = (e) => e.stopPropagation();

  return (
    /* O clique fica na caixa (vale em qualquer ponto do card, inclusive nas
       sobras ao redor das bolinhas); o papel de botão para teclado/leitor de
       tela fica no conteúdo. Separar os dois evita interativo dentro de
       interativo — as bolinhas são <button> de verdade e ficam de fora. */
    <div
      onClick={navegavel ? onClickCard : undefined}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className={`flex flex-col rounded-2xl border border-l-4 ${s.accent} border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${
        navegavel ? `cursor-pointer ${s.hover}` : ''
      }`}
    >
      {/* focus-visible, não focus: com `focus` o clique do mouse deixava um
          anel preso no conteúdo, lido como um segundo retângulo dentro do
          card. Assim o realce só aparece na navegação por teclado. */}
      <div
        role={navegavel ? 'button' : undefined}
        tabIndex={navegavel ? 0 : undefined}
        aria-label={navegavel ? `${ariaPrefixo}: ${face.label}. Ativar para ver a próxima linha.` : undefined}
        onKeyDown={navegavel ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); avancar(); }
        } : undefined}
        className={`flex-1 ${navegavel ? `rounded-xl focus:outline-none focus-visible:ring-2 ${s.ring}` : ''}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-500">{titulo}</p>
            <p className={`mt-0.5 text-xs font-semibold uppercase tracking-wide ${s.label}`}>{face.label}</p>
          </div>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.box}`}>
            <Icon size={20} />
          </span>
        </div>

        {renderFace(face)}
      </div>

      {/* O espaçamento continua sendo MARGEM (não padding do container das
          bolinhas): esta faixa de 1rem pertence ao card, onde clicar avança a
          face. Virá-la padding daqui a entregaria ao naoPropagar e mataria o
          clique numa tira que sempre funcionou. Quem empurra as bolinhas para
          o rodapé quando o card estica é o flex-1 do conteúdo acima. */}
      {navegavel && (
        <div className="mt-4 flex items-center justify-center gap-2" onClick={naoPropagar}>
          {faces.map((f, i) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setAtual(i)}
              aria-label={`Ver ${f.label}`}
              aria-current={i === atual}
              className={`h-2 rounded-full transition-all ${
                i === atual ? `w-6 ${s.dot}` : 'w-2 bg-slate-300 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ===== Custo imobilizado no estoque ===== */

/** Corpo das faces dos dois carrosséis de estoque: o valor e a contagem de
 *  unidades/produtos daquela linha. Idêntico nos dois — o que muda é a conta
 *  que o servidor fez (custo ou preço de venda), não a forma de mostrar. */
/** Corpo das faces de "Vendas da Semana": o valor e uma nota curta. Separado
 *  de corpoResumoEstoque porque a face de venda não tem unidades/produtos — os
 *  campos daquele renderer sairiam undefined. */
const corpoVendasSemana = (face) => (
  <>
    <p className="mt-3 text-2xl font-bold text-slate-800">{formatCurrency(face.valor)}</p>
    <p className="mt-1 text-xs text-slate-500">{face.nota}</p>
  </>
);

const corpoResumoEstoque = (face) => (
  <>
    <p className="mt-3 text-2xl font-bold text-slate-800">{formatCurrency(face.valor)}</p>
    <p className="mt-1 text-xs text-slate-500">
      {face.itens} {face.itens === 1 ? 'unidade' : 'unidades'} · {face.produtos}{' '}
      {face.produtos === 1 ? 'produto' : 'produtos'}
    </p>
  </>
);

function CardCustoEstoque({ dados }) {
  const faces = useMemo(() => montarFaces(dados), [dados]);
  return (
    <div className="mt-6">
      <CardCarrossel
        titulo="Custo imobilizado no estoque"
        ariaPrefixo="Custo imobilizado"
        cor="amber"
        faces={faces}
        renderFace={corpoResumoEstoque}
      />
    </div>
  );
}

/* ===== Modal de Produtos Críticos ===== */
function CriticosModal({ itens, onClose }) {
  // Agrupa por linha mantendo a ordem: Baterias, depois Som. A chave `linha`
  // vem da própria API, então a tela não precisa saber de onde cada item veio.
  const grupos = useMemo(() => {
    return ['baterias', 'som']
      .map((linha) => ({
        linha,
        label: LINHA_LABEL[linha],
        itens: itens.filter((i) => i.linha === linha),
      }))
      .filter((g) => g.itens.length > 0);
  }, [itens]);

  const vazio = itens.length === 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[9990] flex items-start justify-center bg-slate-900/60 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <AlertTriangle size={20} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Produtos Críticos</h2>
              <p className="text-sm text-slate-500">Produtos abaixo da quantidade mínima</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-5">
          {vazio ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
                <CheckCircle2 size={36} strokeWidth={1.8} />
              </span>
              <p className="text-sm font-medium text-slate-600">Nenhum produto crítico no momento</p>
            </div>
          ) : (
            grupos.map((g) => (
              <div key={g.linha} className="mb-5 last:mb-0">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</span>
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-semibold text-rose-600">{g.itens.length}</span>
                </div>
                <ul className="space-y-2">
                  {g.itens.map((it) => (
                    <li
                      key={`${it.linha}-${it.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-l-4 border-slate-200 border-l-rose-500 bg-white px-4 py-3 shadow-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">{it.produto || '—'}</p>
                        <p className="truncate text-xs text-slate-500">Modelo: {it.modelo || '—'}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-4 text-right">
                        <div>
                          <span className="block text-[11px] uppercase text-slate-400">Em estoque</span>
                          <span className="text-base font-bold text-rose-600">{it.em_estoque}</span>
                        </div>
                        <div>
                          <span className="block text-[11px] uppercase text-slate-400">Mínimo</span>
                          <span className="text-base font-semibold text-slate-600">{it.qtd_minima}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
