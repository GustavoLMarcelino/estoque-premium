import React from "react";
import { Trash2, CreditCard } from "lucide-react";
import ProdutoSearchSelect from "../../components/ProdutoSearchSelect/ProdutoSearchSelect";
import { rotuloFormaSom, clampParcelas } from "../../utils/precos";
import { sugerirPercentual } from "../../utils/comissaoItem";
import { fmtBRL as fmtMoney } from "../../utils/moeda";

/* Formulário de edição de PEDIDO de Som (cabeçalho, serviços e produtos).
 * Separado do Registro para o RegistroSom usar sem arrastar o resto da tela;
 * o conteúdo é o mesmo que morava em RegistroMovimentacoes. */

/** Patch do nome do serviço: re-sugere a % SÓ enquanto o usuário não a tocou.
 *  Item que já existe chega com pctTocado=true (tem % gravada), então renomear
 *  um serviço antigo nunca mexe na comissão dele. */
function nomeServicoPatch(s, descricao) {
  if (s.pctTocado) return { descricao };
  return { descricao, percentual_comissao: String(sugerirPercentual(descricao)) };
}

export default function FormEdicaoPedido({ edicao, setEdicao, produtosSom, inventarioAtivo, salvando, onSalvar }) {
  const credito = edicao.formaBase === "Crédito";
  const set = (patch) => setEdicao((prev) => ({ ...prev, ...patch }));

  // Qualquer mexida nos serviços/produtos marca o form como "sujo": só então o
  // salvamento manda itens e dispara a reagregação no servidor.
  const setServicos = (servicos) => set({ servicos, servicosDirty: true });
  const patchServico = (i, patch) =>
    setServicos(edicao.servicos.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  // produtosDirty = vai reescrever itens e ESTOQUE. maoObraProdutosDirty mexe só
  // no valor legado, sem tocar em estoque — dois caminhos, duas flags.
  const setProdutos = (produtos) => set({ produtos, produtosDirty: true });
  const patchProduto = (i, patch) =>
    setProdutos(edicao.produtos.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const patchMaoObraProduto = (i, patch) =>
    set({
      produtos: edicao.produtos.map((p, j) => (j === i ? { ...p, ...patch } : p)),
      maoObraProdutosDirty: true,
    });

  const estoqueDe = (p) => Number(
    p?.em_estoque ?? (Number(p?.qtd_inicial ?? 0) + Number(p?.entradas ?? 0) - Number(p?.saidas ?? 0)),
  ) || 0;
  // Preço de item NOVO: mesma base do PedidoSomForm (crédito usa o parcelado).
  const precoDoCatalogo = (p) => (credito
    ? Number(p?.valor_parcelado ?? p?.valor_venda ?? 0)
    : Number(p?.valor_vista ?? p?.valor_venda ?? 0)) || 0;

  // Prévia: soma da mão de obra e a comissão que ela gera, item × a SUA %.
  // Sem separar por categoria — ela deixou de existir em 17/08/2026.
  const previa = edicao.servicos.reduce((acc, s) => {
    const valor = (Number(s.mao_obra_unit) || 0) * (Number(s.quantidade) || 0);
    acc.total += valor;
    acc.comissao += (valor * (Number(s.percentual_comissao) || 0)) / 100;
    return acc;
  }, { total: 0, comissao: 0 });

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
    >
      <p className="text-sm font-semibold text-slate-700">Editar pedido</p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Veículo</span>
          <input
            type="text"
            value={edicao.veiculo}
            onChange={(e) => set({ veiculo: e.target.value })}
            placeholder="Ex.: Gol 2015"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Forma de pagamento</span>
          <div className="relative">
            <CreditCard size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={edicao.formaBase}
              onChange={(e) => set({ formaBase: e.target.value })}
              className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            >
              <option value="">Selecione...</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Débito">Débito</option>
              <option value="Crédito">Crédito</option>
              <option value="PIX">PIX</option>
            </select>
          </div>
        </label>
      </div>

      {credito && (
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor={`parcelas-edicao-${edicao.id}`} className="text-sm text-slate-600">Parcelas</label>
          <input
            id={`parcelas-edicao-${edicao.id}`}
            type="number" min="1" max="10" value={edicao.parcelas}
            onChange={(e) => set({ parcelas: e.target.value })}
            onBlur={() => set({ parcelas: clampParcelas(edicao.parcelas) })}
            className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          />
          <span className="text-sm font-medium text-slate-500">
            {rotuloFormaSom("Crédito", clampParcelas(edicao.parcelas))}
          </span>
        </div>
      )}

      {/* ── Serviços e mão de obra (Fase C2) ── */}
      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-700">Serviços e mão de obra</span>
          <button
            type="button"
            onClick={() => setServicos([...edicao.servicos, {
              key: `n${Date.now()}`, descricao: "", quantidade: 1, mao_obra_unit: "",
              percentual_comissao: "", pctTocado: false,
            }])}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-white"
          >
            + Serviço
          </button>
        </div>

        {edicao.servicos.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">Nenhum serviço — o pedido fica só com os produtos.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {edicao.servicos.map((s, i) => (
              <li key={s.key} className="rounded-lg border border-slate-200 bg-white p-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_5.5rem_auto]">
                  <input
                    type="text" placeholder="Nome do serviço"
                    value={s.descricao}
                    onChange={(e) => patchServico(i, nomeServicoPatch(s, e.target.value))}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400"
                  />
                  <input
                    type="number" min="1" aria-label="Quantidade"
                    value={s.quantidade}
                    onChange={(e) => patchServico(i, { quantidade: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-amber-400"
                  />
                  <input
                    type="number" min="0" step="0.01" placeholder="Mão de obra"
                    value={s.mao_obra_unit}
                    onChange={(e) => patchServico(i, { mao_obra_unit: e.target.value })}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400"
                  />
                  <input
                    type="number" min="0" max="100" step="0.01" placeholder="% Joel"
                    aria-label="Percentual de comissão"
                    value={s.percentual_comissao}
                    onChange={(e) => patchServico(i, { percentual_comissao: e.target.value, pctTocado: true })}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => setServicos(edicao.servicos.filter((_, j) => j !== i))}
                    aria-label="Remover serviço"
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Total do item: {fmtMoney((Number(s.mao_obra_unit) || 0) * (Number(s.quantidade) || 0))}
                  {` · Joel ${Number(s.percentual_comissao) || 0}%`}
                </p>
              </li>
            ))}
          </ul>
        )}

        {/* Prévia — só as SOMAS. O número final vem da resposta do servidor:
            duplicar a fórmula da comissão aqui seria criar uma segunda verdade. */}
        <div className="mt-2 rounded-lg bg-white p-2 text-xs text-slate-600">
          <div>Mão de obra dos serviços: <strong>{fmtMoney(previa.total)}</strong></div>
          <div className="text-slate-400">Comissão do Joel (prévia): {fmtMoney(previa.comissao)}</div>
          <div className="mt-1 text-slate-400">
            A comissão do Joel e o total do pedido são recalculados no servidor ao salvar.
          </div>
        </div>
      </div>

      {/* ── Produtos (Fase D) — o único bloco que mexe em ESTOQUE ── */}
      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-700">Produtos</span>
          <button
            type="button"
            onClick={() => setProdutos([...edicao.produtos, {
              key: `np${Date.now()}`, item_id: null, produto_id: "", descricao: "",
              quantidade: 1, quantidadeOriginal: 0, valor_unit: "", mao_obra_unit: "",
            }])}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-white"
          >
            + Produto
          </button>
        </div>

        {edicao.produtos.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">Nenhum produto — o pedido fica só com os serviços.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {edicao.produtos.map((prod, i) => {
              const cat = produtosSom.find((x) => String(x.id) === String(prod.produto_id));
              const emEstoque = cat ? estoqueDe(cat) : null;
              // As unidades DESTE item voltam ao estoque antes da nova baixa —
              // sem mostrar isso, um produto zerado parece impedir qualquer
              // aumento, quando na verdade dá para chegar ao que já estava aqui.
              const efetivo = emEstoque == null ? null : emEstoque + prod.quantidadeOriginal;
              return (
                <li key={prod.key} className="rounded-lg border border-slate-200 bg-white p-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.6fr)_4.5rem_7rem_auto]">
                    <ProdutoSearchSelect
                      produtos={produtosSom}
                      value={prod.produto_id}
                      onChange={(p) => patchProduto(i, {
                        produto_id: p ? String(p.id) : "",
                        descricao: [p?.produto, p?.modelo].filter(Boolean).join(" - "),
                        // Produto novo entra com o preço do catálogo; item que já
                        // existia mantém o valor gravado (não reprecifica).
                        ...(prod.item_id ? {} : { valor_unit: String(precoDoCatalogo(p)) }),
                      })}
                      placeholder={prod.descricao || "Buscar produto…"}
                      showAllOnEmpty={false}
                      maxResults={8}
                      renderOption={(p) => (
                        <>
                          <span className="text-slate-700">{[p.produto, p.modelo].filter(Boolean).join(" — ")}</span>
                          <span className="text-xs text-slate-400">Estoque: {estoqueDe(p)}</span>
                        </>
                      )}
                    />
                    <input
                      type="number" min="1" aria-label="Quantidade"
                      value={prod.quantidade}
                      onChange={(e) => patchProduto(i, { quantidade: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-amber-400"
                    />
                    <input
                      type="number" min="0" step="0.01" placeholder="Valor un."
                      value={prod.valor_unit}
                      onChange={(e) => patchProduto(i, { valor_unit: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => setProdutos(edicao.produtos.filter((_, j) => j !== i))}
                      aria-label="Remover produto"
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Total do item: {fmtMoney((Number(prod.valor_unit) || 0) * (Number(prod.quantidade) || 0))}
                    {efetivo != null && (
                      <>
                        {" · "}pode ir até <strong className="text-slate-500">{efetivo}</strong> un.
                        {prod.quantidadeOriginal > 0 && ` (estoque ${emEstoque} + ${prod.quantidadeOriginal} deste item, que voltam antes)`}
                      </>
                    )}
                  </p>
                  {prod.item_id && prod.mao_obra_unit !== "" && !edicao.produtosDirty && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      Mão de obra (legado)
                      <input
                        type="number" min="0" step="0.01"
                        value={prod.mao_obra_unit}
                        onChange={(e) => patchMaoObraProduto(i, { mao_obra_unit: e.target.value })}
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-800 outline-none focus:border-amber-400"
                      />
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {edicao.produtosDirty && (
          <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            Mexer nos produtos ALTERA O ESTOQUE: as unidades atuais deste pedido voltam e as novas são baixadas.
          </p>
        )}
      </div>

      {inventarioAtivo && edicao.produtosDirty && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Há um inventário de Som em andamento; esta alteração pode gerar divergência na contagem.
        </p>
      )}

      {edicao.periodoFechado && (edicao.servicosDirty || edicao.maoObraProdutosDirty || edicao.produtosDirty) && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Este pedido é de uma quinzena já apurada. A alteração NÃO muda a comissão que já foi paga —
          o pedido passará a divergir daquela apuração.
        </p>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Editar itens muda o total do pedido, a receita e a taxa no dashboard, e a mão de obra muda também
        a comissão. Preços não são recalculados sozinhos: o valor da época é mantido, e só produto novo
        entra com o preço do catálogo. A forma de pagamento registra como o cliente pagou, sem re-precificar.
        A data do pedido não é editável.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onSalvar}
          disabled={salvando}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {salvando ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={() => setEdicao(null)}
          disabled={salvando}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-white disabled:opacity-70"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
