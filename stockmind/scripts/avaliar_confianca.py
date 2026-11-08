"""
StockMind — pipeline reformulado: SEM decisão automática.

Para cada produto x mês do teste, produz DOIS números lado a lado:
  - quantidade_prevista: saída da regressão linear já treinada, com
    clip em 0 (sem negativo), mas NUNCA zerada por causa do
    classificador.
  - probabilidade_venda: saída do classificador (regressão logística),
    categorizada em faixa_probabilidade_venda (alta/média/baixa) — um
    SINAL de apoio à decisão, não um portão que trava a previsão.

IMPORTANTE — nomenclatura (não confundir com "nível de confiança" do
RFC): faixa_probabilidade_venda mede a PROPENSÃO de o produto vender
no mês (é a mesma pergunta binária do classificador, só em faixas em
vez de 0/1). NÃO mede a precisão da quantidade prevista. Isso é um
achado empírico, documentado no relatório da rodada anterior: a faixa
a faixa "alta" tinha o PIOR MAPE das três (não o melhor) — grupos de
alta propensão de venda também têm maior volume/variância mês a mês, o
que infla erro percentual mesmo com previsão numericamente razoável
(a leitura é recalculada a cada execução, no fim da saída). O
"nível de confiança preditiva" que o RFC define (RF08/FA-2 — histórico
suficiente ou limitado) é outra coisa: é a segmentação com_histórico /
novo, documentada em treinar_modelos.py. Os dois conceitos não se
sobrepõem e não devem ser chamados pelo mesmo nome.

Isso substitui o antigo "modelo_duas_etapas" de treinar_modelos.py, que
usava o classificador para zerar a previsão quando ele dizia "não
vende" — abordagem abandonada porque todo falso negativo do
classificador virava um erro de 100% garantido. Aqui a decisão final é
sempre do gestor: o sistema mostra os dois números, não escolhe por ele.

Reaproveita a mesma regressão linear e o mesmo classificador (regressão
logística) treinados em treinar_modelos.py — refeitos aqui com o mesmo
método, já que os scripts não persistem modelo treinado em disco.

Passo 1: gera os dois números e mostra a distribuição das faixas de
probabilidade de venda. Passo 2 (aprovado pelo usuário): avalia a
regressão com a faixa de probabilidade de venda como corte adicional
(MAPE/MdAPE/MASE por faixa), avalia o classificador separadamente como
classificador binário, e junta os dois ângulos na tabela final do
relatório.
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import confusion_matrix

from metricas import (
    FEATURE_COLS,
    escala_mase_por_grupo,
    fmt_mase,
    fmt_pct,
    mape_mdape,
    mase,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent.parent
PROCESSED_DIR = BASE_DIR / "data" / "processed"


# Cortes de faixa_probabilidade_venda (aprovados pelo usuário):
#   alta  >= 0.6
#   media  0.4 a 0.6
#   baixa < 0.4
# O corte baixa/média (0.4) coincide de propósito com o limiar de
# recall escolhido em explorar_limiar.py: probabilidade abaixo disso é
# a região em que o classificador tunado chamaria de "não vende".
CORTE_ALTA = 0.6
CORTE_MEDIA = 0.4

# Limiar de decisão do classificador quando avaliado como classificador
# binário (seção 5) — mesmo valor validado em explorar_limiar.py.
LIMIAR_CLASSIFICADOR = 0.4


def linha(titulo=""):
    print()
    print("=" * 70)
    if titulo:
        print(titulo)
        print("=" * 70)


def faixa_probabilidade_venda(proba):
    """Categoriza probabilidade_venda em alta/média/baixa/sem_dados.

    Mede propensão de venda, não precisão da quantidade prevista —
    ver nota no docstring do módulo."""
    if pd.isna(proba):
        return "sem_dados"
    if proba >= CORTE_ALTA:
        return "alta"
    if proba >= CORTE_MEDIA:
        return "media"
    return "baixa"


def main():
    linha("1. CARREGAR FEATURES E TREINAR OS DOIS MODELOS")
    treino = pd.read_csv(PROCESSED_DIR / "features_treino.csv", parse_dates=["mes"])
    teste = pd.read_csv(PROCESSED_DIR / "features_teste.csv", parse_dates=["mes"])

    grupos_treino = set(treino["grupo"].unique())
    teste["segmento"] = teste["grupo"].apply(
        lambda p: "novo" if p not in grupos_treino else "com_historico"
    )
    treino["vendeu_no_mes"] = (treino["quantidade"] > 0).astype(int)


    X_treino_full = treino[FEATURE_COLS]
    X_teste_full = teste[FEATURE_COLS]

    completo_treino = X_treino_full.notna().all(axis=1)
    completo_teste = X_teste_full.notna().all(axis=1)

    X_treino = X_treino_full[completo_treino]
    y_treino_qtd = treino["quantidade"][completo_treino]
    y_treino_clf = treino["vendeu_no_mes"][completo_treino]

    reg = LinearRegression()
    reg.fit(X_treino, y_treino_qtd)

    clf = LogisticRegression(max_iter=1000)
    clf.fit(X_treino, y_treino_clf)

    print(f"Teste: {len(teste)} linhas (produto x mês)")
    print(f"Linhas sem feature completa (nem regressão nem classificador rodam): {(~completo_teste).sum()}/{len(teste)}")

    # ------------------------------------------------------------------
    linha("2. QUANTIDADE_PREVISTA e PROBABILIDADE_VENDA (sem portão)")
    quantidade_prevista = pd.Series(np.nan, index=teste.index)
    quantidade_prevista[completo_teste] = reg.predict(X_teste_full[completo_teste]).clip(min=0)

    probabilidade_venda = pd.Series(np.nan, index=teste.index)
    probabilidade_venda[completo_teste] = clf.predict_proba(X_teste_full[completo_teste])[:, 1]

    teste["quantidade_prevista"] = quantidade_prevista
    teste["probabilidade_venda"] = probabilidade_venda
    teste["faixa_probabilidade_venda"] = probabilidade_venda.apply(faixa_probabilidade_venda)

    print(
        "Confirmação: quantidade_prevista nunca é zerada por causa do "
        "classificador — só recebe clip(min=0) para não entregar previsão negativa."
    )
    print(
        f"Cortes de faixa_probabilidade_venda: alta >= {CORTE_ALTA} | "
        f"media {CORTE_MEDIA}-{CORTE_ALTA} | baixa < {CORTE_MEDIA} | "
        "sem_dados = feature incompleta (nem classificador nem regressão têm o que prever)"
    )

    # ------------------------------------------------------------------
    linha("3. DISTRIBUIÇÃO DAS FAIXAS DE PROBABILIDADE DE VENDA (teste completo)")
    dist_total = teste["faixa_probabilidade_venda"].value_counts()
    dist_pct = (dist_total / len(teste) * 100).round(1)
    for faixa in ["alta", "media", "baixa", "sem_dados"]:
        n = int(dist_total.get(faixa, 0))
        pct = dist_pct.get(faixa, 0.0)
        print(f"  {faixa:<12} {n:>4} linhas  ({pct}%)")

    linha("3b. DISTRIBUIÇÃO POR SEGMENTO (com_histórico vs. novo)")
    tabela_seg = teste.groupby(["segmento", "faixa_probabilidade_venda"]).size().unstack(fill_value=0)
    for faixa in ["alta", "media", "baixa", "sem_dados"]:
        if faixa not in tabela_seg.columns:
            tabela_seg[faixa] = 0
    tabela_seg = tabela_seg[["alta", "media", "baixa", "sem_dados"]]
    print(tabela_seg.to_string())

    linha("3c. CRUZAMENTO: faixa_probabilidade_venda x quantidade real = 0 (para intuição)")
    cruzamento = teste[teste["faixa_probabilidade_venda"] != "sem_dados"].groupby("faixa_probabilidade_venda")["quantidade"].apply(
        lambda s: pd.Series({"n": len(s), "atual_zero": int((s == 0).sum()), "atual_zero_pct": round((s == 0).mean() * 100, 1)})
    ).unstack()
    print(cruzamento.reindex(["alta", "media", "baixa"]).to_string())

    # ------------------------------------------------------------------
    linha("4. REGRESSÃO — MAPE / MdAPE / MASE por faixa de probabilidade de venda")
    print(
        "Corte por faixa_probabilidade_venda — mede propensão de venda, NÃO é "
        "o 'nível de confiança preditiva' do RFC (esse é com_histórico/novo, "
        "ver treinar_modelos.py). 'novo' não tem nenhuma linha com feature "
        "completa, então não existe faixa alta/média/baixa nesse grupo; todas "
        "as faixas abaixo são dentro de com_histórico."
    )
    escalas = escala_mase_por_grupo(treino)[0]

    resultados_por_faixa = {}
    for faixa in ["alta", "media", "baixa"]:
        sub = teste[teste["faixa_probabilidade_venda"] == faixa]
        r_mape = mape_mdape(sub["quantidade"], sub["quantidade_prevista"])
        r_mase = mase(sub["quantidade"], sub["quantidade_prevista"], sub["grupo"], escalas)
        resultados_por_faixa[faixa] = (r_mape, r_mase)
        print(
            f"\n[{faixa}] n_total={len(sub)} | "
            f"MAPE={fmt_pct(r_mape['MAPE'])} (n_usado={r_mape['n_usado']}, atual_zero={r_mape['n_atual_zero']}) | "
            f"MdAPE={fmt_pct(r_mape['MdAPE'])} (n_usado={r_mape['n_usado']}) | "
            f"MASE={fmt_mase(r_mase['MASE'])} (n_usado={r_mase['n_usado']})"
        )

    # também a regressão inteira (baseline de comparação, sem corte por faixa)
    r_mape_geral = mape_mdape(
        teste.loc[teste["segmento"] == "com_historico", "quantidade"],
        teste.loc[teste["segmento"] == "com_historico", "quantidade_prevista"],
    )
    r_mase_geral = mase(
        teste.loc[teste["segmento"] == "com_historico", "quantidade"],
        teste.loc[teste["segmento"] == "com_historico", "quantidade_prevista"],
        teste.loc[teste["segmento"] == "com_historico", "grupo"],
        escalas,
    )
    print(
        f"\n[todas as faixas juntas, com_histórico] MAPE={fmt_pct(r_mape_geral['MAPE'])} "
        f"(n_usado={r_mape_geral['n_usado']}) | MdAPE={fmt_pct(r_mape_geral['MdAPE'])} | "
        f"MASE={fmt_mase(r_mase_geral['MASE'])} (n_usado={r_mase_geral['n_usado']})"
    )

    # ------------------------------------------------------------------
    linha("5. CLASSIFICADOR — avaliado separadamente, como classificador binário")
    teste["vendeu_no_mes"] = (teste["quantidade"] > 0).astype(int)
    pred_vendeu = pd.Series(np.nan, index=teste.index)
    pred_vendeu[completo_teste] = (probabilidade_venda[completo_teste] >= LIMIAR_CLASSIFICADOR).astype(int)

    for grupo in ["com_historico", "novo"]:
        idx = (teste["segmento"] == grupo) & completo_teste
        n_avaliavel = int(idx.sum())
        n_grupo = int((teste["segmento"] == grupo).sum())
        print(f"\n[{grupo}] linhas avaliáveis (feature completa): {n_avaliavel}/{n_grupo}")
        if n_avaliavel == 0:
            print("  Sem nenhuma linha com feature completa neste grupo — classificador não avaliável.")
            continue

        y_real = teste.loc[idx, "vendeu_no_mes"]
        y_pred = pred_vendeu[idx].astype(int)

        tn, fp, fn, tp = confusion_matrix(y_real, y_pred, labels=[0, 1]).ravel()
        acuracia = (tp + tn) / (tp + tn + fp + fn)
        precisao = tp / (tp + fp) if (tp + fp) else float("nan")
        recall = tp / (tp + fn) if (tp + fn) else float("nan")

        print("  Matriz de confusão [real x previsto] — linhas=real, colunas=previsto:")
        print("                 previsto=não_vende  previsto=vende")
        print(f"  real=não_vende        {tn:>6}              {fp:>6}")
        print(f"  real=vende            {fn:>6}              {tp:>6}")
        print(f"  Acurácia:  {acuracia*100:.1f}%")
        print(f"  Precisão (classe 'vende'): {precisao*100:.1f}%")
        print(
            f"  >>> RECALL (classe 'vende'): {recall*100:.1f}% <<<  "
            f"— falsos negativos = {fn}/{tp+fn}. Erro caro: risco de ruptura de estoque."
        )

    # ------------------------------------------------------------------
    linha("6. TABELA FINAL — faixa de probabilidade de venda | n | MAPE | MdAPE | MASE")
    print(f"{'faixa':<10} | {'n':<6} | {'MAPE':<12} | {'MdAPE':<12} | {'MASE':<8}")
    for faixa in ["alta", "media", "baixa"]:
        r_mape, r_mase = resultados_por_faixa[faixa]
        print(
            f"{faixa:<10} | {r_mape['n_total']:<6} | "
            f"{fmt_pct(r_mape['MAPE']):<12} | {fmt_pct(r_mape['MdAPE']):<12} | {fmt_mase(r_mase['MASE']):<8}"
        )
    print(
        f"{'(todas)':<10} | {r_mape_geral['n_total']:<6} | "
        f"{fmt_pct(r_mape_geral['MAPE']):<12} | {fmt_pct(r_mape_geral['MdAPE']):<12} | {fmt_mase(r_mase_geral['MASE']):<8}"
    )

    mape_alta, mape_baixa = resultados_por_faixa["alta"][0]["MAPE"], resultados_por_faixa["baixa"][0]["MAPE"]
    if pd.notna(mape_alta) and pd.notna(mape_baixa):
        print(
            f"\nLeitura (calculada nesta rodada): MAPE da faixa 'alta' = {mape_alta:.1f}% e da 'baixa' = {mape_baixa:.1f}%. "
            + (
                "'alta' tem erro MENOR: a probabilidade de venda também serve como proxy de precisão."
                if mape_alta < mape_baixa
                else "'alta' NÃO tem erro menor: probabilidade de venda responde 'esse grupo vende esse mês', "
                "não 'o número previsto é preciso'."
            )
        )

    linha("FIM")


if __name__ == "__main__":
    main()
