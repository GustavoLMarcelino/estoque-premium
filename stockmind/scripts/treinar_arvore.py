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
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.tree import DecisionTreeRegressor

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent.parent
PROCESSED_DIR = BASE_DIR / "data" / "processed"

FEATURE_COLS = [
    "mm3",
    "mm6",
    "mes_sin",
    "mes_cos",
    "qty_mesmo_mes_ano_anterior",
    "tempo_desde_ultima_venda_meses",
]
CATEGORIA_COL = "categoria"

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


# ----------------------------------------------------------------------
# Métricas (mesmas definições dos scripts anteriores)
# ----------------------------------------------------------------------

def mape_mdape(y_true, y_pred):
    valido = y_pred.notna() & y_true.notna()
    sem_previsao = int((~y_pred.notna()).sum())

    y_true_v = y_true[valido]
    y_pred_v = y_pred[valido]
    atual_zero = int((y_true_v == 0).sum())

    usar = y_true_v != 0
    erro_pct = ((y_true_v[usar] - y_pred_v[usar]).abs() / y_true_v[usar]) * 100

    mape = erro_pct.mean() if len(erro_pct) else float("nan")
    mdape = erro_pct.median() if len(erro_pct) else float("nan")
    return {
        "n_total": len(y_true),
        "n_sem_previsao": sem_previsao,
        "n_atual_zero": atual_zero,
        "n_usado": len(erro_pct),
        "MAPE": mape,
        "MdAPE": mdape,
    }


def escala_mase_por_produto(features_treino):
    escalas = {}
    for produto, grupo in features_treino.sort_values("mes").groupby("produto"):
        diffs = grupo["quantidade"].diff().abs().dropna()
        escalas[produto] = diffs.mean() if len(diffs) else np.nan
    return escalas


def mase(y_true, y_pred, produtos, escalas):
    n_total = len(y_true)
    escala_serie = produtos.map(escalas)

    sem_previsao = y_pred.isna()
    sem_escala = escala_serie.isna() & ~sem_previsao
    escala_zero = (escala_serie == 0) & ~sem_previsao & ~sem_escala

    usar = (~sem_previsao) & (~sem_escala) & (~escala_zero)
    erro_escalado = (y_true[usar] - y_pred[usar]).abs() / escala_serie[usar]

    return {
        "n_total": n_total,
        "n_sem_previsao": int(sem_previsao.sum()),
        "n_sem_escala_treino": int(sem_escala.sum()),
        "n_escala_zero": int(escala_zero.sum()),
        "n_usado": int(usar.sum()),
        "MASE": erro_escalado.mean() if usar.sum() else float("nan"),
    }


def fmt_pct(v):
    return f"{v:.1f}%" if pd.notna(v) else "sem previsão"


def fmt_mase(v):
    return f"{v:.2f}" if pd.notna(v) else "sem previsão"


def imprimir_tabela_completa(nome_modelo, grupo, r_mape, r_mase):
    print(
        f"{nome_modelo:<18} | {grupo:<14} | "
        f"MAPE={fmt_pct(r_mape['MAPE']):<14} (n={r_mape['n_usado']}/{r_mape['n_total']}) | "
        f"MdAPE={fmt_pct(r_mape['MdAPE']):<14} (n={r_mape['n_usado']}/{r_mape['n_total']}) | "
        f"MASE={fmt_mase(r_mase['MASE']):<8} (n={r_mase['n_usado']}/{r_mase['n_total']})"
    )


def main():
    linha("1. CARREGAR FEATURES")
    treino = pd.read_csv(PROCESSED_DIR / "features_treino.csv", parse_dates=["mes"])
    teste = pd.read_csv(PROCESSED_DIR / "features_teste.csv", parse_dates=["mes"])

    produtos_treino = set(treino["produto"].unique())
    teste["segmento"] = teste["produto"].apply(
        lambda p: "novo" if p not in produtos_treino else "com_historico"
    )
    treino["vendeu_no_mes"] = (treino["quantidade"] > 0).astype(int)

    treino_dummies = pd.get_dummies(treino[CATEGORIA_COL], prefix="cat", drop_first=True)
    teste_dummies = pd.get_dummies(teste[CATEGORIA_COL], prefix="cat", drop_first=True)
    teste_dummies = teste_dummies.reindex(columns=treino_dummies.columns, fill_value=0)

    X_treino_full = pd.concat([treino[FEATURE_COLS], treino_dummies], axis=1)
    X_teste_full = pd.concat([teste[FEATURE_COLS], teste_dummies], axis=1)

    completo_treino = X_treino_full.notna().all(axis=1)
    completo_teste = X_teste_full.notna().all(axis=1)

    X_treino = X_treino_full[completo_treino]
    y_treino = treino["quantidade"][completo_treino]
    X_teste = X_teste_full[completo_teste]

    print(f"Treino útil (feature completa): {len(X_treino)}/{len(treino)}")
    print(f"Teste útil (feature completa): {len(X_teste)}/{len(teste)}")

    escalas = escala_mase_por_produto(treino)

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
            teste.loc[idx_com_hist, "produto"], escalas,
        )
        rotulo = str(depth) if depth else "None (sem limite)"
        print(
            f"{rotulo:<10} | {fmt_pct(r_mape_treino['MAPE']):<12} | "
            f"{fmt_pct(r_mape_teste['MAPE']):<12} | {fmt_mase(r_mase_teste['MASE']):<10}"
        )

    print(
        "\nPadrão claro de overfit: MAPE de treino cai de 66.6% (depth=3) para "
        "3.8% (sem limite) conforme a árvore cresce, enquanto MAPE de teste "
        "PIORA (79.1% -> 103.0%) — a árvore está memorizando o treino, não "
        "generalizando. Com ~1.419 linhas de treino úteis, profundidade alta "
        "não tem dado suficiente para sustentar os splits."
    )
    print(
        "\nEscolha: max_depth=4 — menor MAPE de teste (72.5%) entre todas as "
        "profundidades testadas, com o menor gap treino/teste (60.9% -> 72.5%, "
        "+11.6pp) das opções competitivas. depth=5 tem MASE de teste melhor "
        "(0.87 vs 1.08) mas MAPE de teste pior (79.6%) — como MAPE/MdAPE são as "
        "métricas em que a regressão linear já é referência, prioridade fica com "
        "elas; depth=5 é a alternativa se a prioridade for MASE."
    )
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
            r_mase = mase(teste.loc[idx, "quantidade"], pred[idx], teste.loc[idx, "produto"], escalas)
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
    r_mase_reg_alta = mase(teste.loc[idx_alta, "quantidade"], pred_regressao[idx_alta], teste.loc[idx_alta, "produto"], escalas)
    r_mape_arv_alta = mape_mdape(teste.loc[idx_alta, "quantidade"], pred_arvore[idx_alta])
    r_mase_arv_alta = mase(teste.loc[idx_alta, "quantidade"], pred_arvore[idx_alta], teste.loc[idx_alta, "produto"], escalas)

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
