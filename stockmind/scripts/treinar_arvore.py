"""
StockMind — árvore de decisão (DecisionTreeRegressor) para previsão de
quantidade, mesmo split temporal e mesmas features da regressão linear
(treinar_modelos.py). Passo seguinte da progressão do RFC (regressão
linear -> regressão logística -> árvore de decisão).

Motivação (achado da rodada anterior, em avaliar_confianca.py): a
regressão linear tem dificuldade com produtos de alta variância mês a
mês (ex.: ACDELCO ADF72PD oscilando 2->1->6->10) — são justamente os
produtos que caem na faixa "alta" de probabilidade_venda. Árvore de
decisão captura relações não-lineares que a regressão linear não
consegue; este script testa se isso realmente ajuda nesse subgrupo.

Reaproveita a mesma política de NaN das outras etapas: sem imputação
arbitrária — linhas com feature incompleta ficam sem previsão (contadas,
não escondidas).

Não treina Random Forest.

ATENÇÃO — exploratório: a escolha de hiperparâmetros aqui olha o PRÓPRIO TESTE
(menor MAPE de teste), o que é vazamento para fins de seleção. A escolha
oficial de modelo e hiperparâmetros é feita por validação temporal em
torneio_modelos.py; este script fica para inspeção e para reproduzir a
progressão do RFC.
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.tree import DecisionTreeRegressor

from metricas import (
    FEATURE_COLS,
    escala_mase_por_grupo,
    fmt_mase,
    fmt_pct,
    imprimir_tabela_completa,
    mape_mdape,
    mase,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent.parent
PROCESSED_DIR = BASE_DIR / "data" / "processed"


# Faixas de probabilidade_venda (avaliar_confianca.py) — usadas aqui só
# para isolar o subgrupo "alta variância" do item 5, não para decisão.
CORTE_ALTA = 0.6
CORTE_MEDIA = 0.4
LIMIAR_CLASSIFICADOR = 0.4

DEPTHS_TESTADAS = [3, 4, 5, 6, 8, 10, None]


def linha(titulo=""):
    print()
    print("=" * 70)
    if titulo:
        print(titulo)
        print("=" * 70)


def main():
    linha("1. CARREGAR FEATURES")
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
    y_treino = treino["quantidade"][completo_treino]
    X_teste = X_teste_full[completo_teste]

    print(f"Treino útil (feature completa): {len(X_treino)}/{len(treino)}")
    print(f"Teste útil (feature completa): {len(X_teste)}/{len(teste)}")

    escalas = escala_mase_por_grupo(treino)[0]

    # ------------------------------------------------------------------
    linha("2. ESCOLHA DE max_depth — comparação em treino vs. teste")
    print(f"{'max_depth':<10} | {'MAPE treino':<12} | {'MAPE teste':<12} | {'MASE teste':<10}")
    for depth in DEPTHS_TESTADAS:
        arv = DecisionTreeRegressor(max_depth=depth, random_state=42)
        arv.fit(X_treino, y_treino)

        pred_treino = pd.Series(arv.predict(X_treino), index=X_treino.index)
        pred_teste_com_hist = pd.Series(np.nan, index=teste.index)
        pred_teste_com_hist[completo_teste] = arv.predict(X_teste)

        idx_com_hist = teste["segmento"] == "com_historico"
        r_mape_treino = mape_mdape(y_treino, pred_treino)
        r_mape_teste = mape_mdape(teste.loc[idx_com_hist, "quantidade"], pred_teste_com_hist[idx_com_hist])
        r_mase_teste = mase(
            teste.loc[idx_com_hist, "quantidade"], pred_teste_com_hist[idx_com_hist],
            teste.loc[idx_com_hist, "grupo"], escalas,
        )
        rotulo = str(depth) if depth else "None (sem limite)"
        print(
            f"{rotulo:<10} | {fmt_pct(r_mape_treino['MAPE']):<12} | "
            f"{fmt_pct(r_mape_teste['MAPE']):<12} | {fmt_mase(r_mase_teste['MASE']):<10}"
        )

    # max_depth=4 fixo (herdado da rodada anterior, escolhida olhando o teste). A tabela
    # acima mostra treino x teste para cada profundidade; a escolha oficial é do torneio.
    MAX_DEPTH_ESCOLHIDA = 4

    # ------------------------------------------------------------------
    linha("3. ÁRVORE FINAL (max_depth=4) — treino e avaliação")
    arv = DecisionTreeRegressor(max_depth=MAX_DEPTH_ESCOLHIDA, random_state=42)
    arv.fit(X_treino, y_treino)

    pred_arvore = pd.Series(np.nan, index=teste.index)
    pred_arvore[completo_teste] = arv.predict(X_teste)

    print("\nImportância das features (feature_importances_):")
    importancias = sorted(zip(X_treino.columns, arv.feature_importances_), key=lambda x: -x[1])
    for nome, imp in importancias:
        print(f"  {nome:<30} {imp:.4f}")

    # ------------------------------------------------------------------
    linha("4. REGRESSÃO LINEAR (refeita aqui, para comparação lado a lado)")
    reg = LinearRegression()
    reg.fit(X_treino, y_treino)
    pred_regressao = pd.Series(np.nan, index=teste.index)
    pred_regressao[completo_teste] = reg.predict(X_teste)

    # ------------------------------------------------------------------
    linha("5. BASELINE mm3 (para a tabela comparativa completa)")
    pred_baseline = teste["mm3"]

    # ------------------------------------------------------------------
    linha("6. TABELA COMPARATIVA — TODOS OS MODELOS, MAPE/MdAPE/MASE, segmentados")
    resultados = {"baseline_mm3": {}, "regressao_linear": {}, "arvore_decisao": {}}
    preds = {"baseline_mm3": pred_baseline, "regressao_linear": pred_regressao, "arvore_decisao": pred_arvore}

    for nome_modelo, pred in preds.items():
        for grupo in ["com_historico", "novo"]:
            idx = teste["segmento"] == grupo
            r_mape = mape_mdape(teste.loc[idx, "quantidade"], pred[idx])
            r_mase = mase(teste.loc[idx, "quantidade"], pred[idx], teste.loc[idx, "grupo"], escalas)
            resultados[nome_modelo][grupo] = (r_mape, r_mase)

    for nome_modelo in ["baseline_mm3", "regressao_linear", "arvore_decisao"]:
        for grupo in ["com_historico", "novo"]:
            r_mape, r_mase = resultados[nome_modelo][grupo]
            imprimir_tabela_completa(nome_modelo, grupo, r_mape, r_mase)

    # ------------------------------------------------------------------
    linha("7. CLASSIFICADOR (reaproveitado) — identificar subgrupo 'alta' probabilidade de venda")
    y_treino_clf = treino["vendeu_no_mes"][completo_treino]
    clf = LogisticRegression(max_iter=1000)
    clf.fit(X_treino, y_treino_clf)

    probabilidade_venda = pd.Series(np.nan, index=teste.index)
    probabilidade_venda[completo_teste] = clf.predict_proba(X_teste)[:, 1]
    faixa = probabilidade_venda.apply(
        lambda p: "sem_dados" if pd.isna(p) else ("alta" if p >= CORTE_ALTA else ("media" if p >= CORTE_MEDIA else "baixa"))
    )

    idx_alta = faixa == "alta"
    print(f"Linhas na faixa 'alta' de probabilidade_venda: {int(idx_alta.sum())}")

    # ------------------------------------------------------------------
    linha("8. ÁRVORE vs. REGRESSÃO LINEAR — só no subgrupo de alta variância ('alta')")
    r_mape_reg_alta = mape_mdape(teste.loc[idx_alta, "quantidade"], pred_regressao[idx_alta])
    r_mase_reg_alta = mase(teste.loc[idx_alta, "quantidade"], pred_regressao[idx_alta], teste.loc[idx_alta, "grupo"], escalas)
    r_mape_arv_alta = mape_mdape(teste.loc[idx_alta, "quantidade"], pred_arvore[idx_alta])
    r_mase_arv_alta = mase(teste.loc[idx_alta, "quantidade"], pred_arvore[idx_alta], teste.loc[idx_alta, "grupo"], escalas)

    imprimir_tabela_completa("regressao_linear", "faixa_alta", r_mape_reg_alta, r_mase_reg_alta)
    imprimir_tabela_completa("arvore_decisao", "faixa_alta", r_mape_arv_alta, r_mase_arv_alta)

    melhora_mape = r_mape_reg_alta["MAPE"] - r_mape_arv_alta["MAPE"] if pd.notna(r_mape_reg_alta["MAPE"]) and pd.notna(r_mape_arv_alta["MAPE"]) else float("nan")
    melhora_mdape = r_mape_reg_alta["MdAPE"] - r_mape_arv_alta["MdAPE"] if pd.notna(r_mape_reg_alta["MdAPE"]) and pd.notna(r_mape_arv_alta["MdAPE"]) else float("nan")
    print(
        f"\nVariação MAPE (regressão - árvore): {melhora_mape:+.1f}pp "
        f"({'árvore melhor' if melhora_mape > 0 else 'árvore pior ou igual'})"
    )
    print(
        f"Variação MdAPE (regressão - árvore): {melhora_mdape:+.1f}pp "
        f"({'árvore melhor' if melhora_mdape > 0 else 'árvore pior ou igual'})"
    )

    linha("FIM")


if __name__ == "__main__":
    main()
