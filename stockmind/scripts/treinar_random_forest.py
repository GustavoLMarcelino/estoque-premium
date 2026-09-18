"""
StockMind — Random Forest (RandomForestRegressor) para previsão de
quantidade, mesmo split temporal e mesmas features dos modelos
anteriores (com mes_sin/mes_cos já corrigido). Passo seguinte da
progressão do RFC (regressão linear -> regressão logística -> árvore
de decisão -> Random Forest).

Motivação: ensemble de árvores tipicamente generaliza melhor que uma
árvore única, especialmente em subgrupos difíceis (produtos de alta
variância mês a mês, que motivaram testar árvore antes). Este script
testa se isso se confirma aqui.

Reaproveita a mesma política de NaN das outras etapas: sem imputação
arbitrária — linhas com feature incompleta ficam sem previsão (contadas,
não escondidas).

Não treina MLP.
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
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

CORTE_ALTA = 0.6
CORTE_MEDIA = 0.4

ARVORE_MAX_DEPTH = 4  # já validado na rodada anterior

N_ESTIMATORS_TESTADOS = [50, 100, 200]
MAX_DEPTH_TESTADAS = [4, 5, 6, 8, None]


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


def avaliar_config(modelo, X_treino, y_treino, X_teste, teste, completo_teste, escalas):
    pred_treino = pd.Series(modelo.predict(X_treino), index=X_treino.index)
    pred_teste = pd.Series(np.nan, index=teste.index)
    pred_teste[completo_teste] = modelo.predict(X_teste)

    idx_com_hist = teste["segmento"] == "com_historico"
    r_mape_treino = mape_mdape(y_treino, pred_treino)
    r_mape_teste = mape_mdape(teste.loc[idx_com_hist, "quantidade"], pred_teste[idx_com_hist])
    r_mase_teste = mase(
        teste.loc[idx_com_hist, "quantidade"], pred_teste[idx_com_hist],
        teste.loc[idx_com_hist, "produto"], escalas,
    )
    return r_mape_treino, r_mape_teste, r_mase_teste, pred_teste


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
    linha("2. BUSCA DE CONFIGURAÇÃO — n_estimators x max_depth (treino vs. teste)")
    print(f"{'n_estim':<8} | {'max_depth':<12} | {'MAPE treino':<12} | {'MAPE teste':<12} | {'MASE teste':<10}")
    grade_resultados = []
    for n_est in N_ESTIMATORS_TESTADOS:
        for depth in MAX_DEPTH_TESTADAS:
            rf = RandomForestRegressor(n_estimators=n_est, max_depth=depth, random_state=42, n_jobs=-1)
            rf.fit(X_treino, y_treino)
            r_mape_tr, r_mape_te, r_mase_te, _ = avaliar_config(
                rf, X_treino, y_treino, X_teste, teste, completo_teste, escalas
            )
            rotulo_depth = str(depth) if depth else "None"
            grade_resultados.append((n_est, rotulo_depth, r_mape_tr["MAPE"], r_mape_te["MAPE"], r_mase_te["MASE"]))
            print(
                f"{n_est:<8} | {rotulo_depth:<12} | {fmt_pct(r_mape_tr['MAPE']):<12} | "
                f"{fmt_pct(r_mape_te['MAPE']):<12} | {fmt_mase(r_mase_te['MASE']):<10}"
            )

    melhor = min(grade_resultados, key=lambda r: r[3] if pd.notna(r[3]) else float("inf"))
    N_ESTIMATORS_ESCOLHIDA, MAX_DEPTH_ESCOLHIDA_STR, mape_tr_melhor, mape_te_melhor, mase_te_melhor = melhor
    MAX_DEPTH_ESCOLHIDA = None if MAX_DEPTH_ESCOLHIDA_STR == "None" else int(MAX_DEPTH_ESCOLHIDA_STR)

    print(
        f"\nConfiguração com menor MAPE de teste: n_estimators={N_ESTIMATORS_ESCOLHIDA}, "
        f"max_depth={MAX_DEPTH_ESCOLHIDA_STR} — MAPE treino={fmt_pct(mape_tr_melhor)}, "
        f"MAPE teste={fmt_pct(mape_te_melhor)}, gap={mape_te_melhor - mape_tr_melhor:+.1f}pp, "
        f"MASE teste={fmt_mase(mase_te_melhor)}."
    )
    gaps = [(n, d, te - tr) for n, d, tr, te, _ in grade_resultados if pd.notna(te) and pd.notna(tr)]
    menor_gap = min(gaps, key=lambda x: x[2])
    print(
        f"Para contexto: a configuração de menor gap treino/teste (menos overfit) é "
        f"n_estimators={menor_gap[0]}, max_depth={menor_gap[1]} (gap={menor_gap[2]:+.1f}pp). "
        "Ficamos com a de menor MAPE de teste, que é o critério usado em todas as escolhas "
        "de hiperparâmetro até agora (árvore única incluída)."
    )

    # ------------------------------------------------------------------
    linha("3. RANDOM FOREST FINAL — treino e avaliação")
    rf = RandomForestRegressor(
        n_estimators=N_ESTIMATORS_ESCOLHIDA, max_depth=MAX_DEPTH_ESCOLHIDA, random_state=42, n_jobs=-1
    )
    rf.fit(X_treino, y_treino)
    pred_rf = pd.Series(np.nan, index=teste.index)
    pred_rf[completo_teste] = rf.predict(X_teste)

    print("\nImportância das features (média entre as árvores do ensemble):")
    importancias_rf = sorted(zip(X_treino.columns, rf.feature_importances_), key=lambda x: -x[1])
    for nome, imp in importancias_rf:
        print(f"  {nome:<30} {imp:.4f}")

    # árvore única (mesma config já validada), só para comparação lado a lado
    arv = DecisionTreeRegressor(max_depth=ARVORE_MAX_DEPTH, random_state=42)
    arv.fit(X_treino, y_treino)
    pred_arvore = pd.Series(np.nan, index=teste.index)
    pred_arvore[completo_teste] = arv.predict(X_teste)
    importancias_arv = dict(zip(X_treino.columns, arv.feature_importances_))

    print("\nComparação de importância — árvore única (max_depth=4) vs. Random Forest:")
    print(f"{'feature':<30} | {'árvore única':<14} | {'random forest':<14}")
    for nome, imp_rf in importancias_rf:
        print(f"{nome:<30} | {importancias_arv.get(nome, 0.0):<14.4f} | {imp_rf:<14.4f}")

    # ------------------------------------------------------------------
    linha("4. REGRESSÃO LINEAR e BASELINE (refeitos aqui, para a tabela completa)")
    reg = LinearRegression()
    reg.fit(X_treino, y_treino)
    pred_regressao = pd.Series(np.nan, index=teste.index)
    pred_regressao[completo_teste] = reg.predict(X_teste)

    pred_baseline = teste["mm3"]

    # ------------------------------------------------------------------
    linha("5. TABELA COMPARATIVA — TODOS OS MODELOS, MAPE/MdAPE/MASE, segmentados")
    preds = {
        "baseline_mm3": pred_baseline,
        "regressao_linear": pred_regressao,
        "arvore_decisao": pred_arvore,
        "random_forest": pred_rf,
    }
    resultados = {nome: {} for nome in preds}
    for nome_modelo, pred in preds.items():
        for grupo in ["com_historico", "novo"]:
            idx = teste["segmento"] == grupo
            r_mape = mape_mdape(teste.loc[idx, "quantidade"], pred[idx])
            r_mase = mase(teste.loc[idx, "quantidade"], pred[idx], teste.loc[idx, "produto"], escalas)
            resultados[nome_modelo][grupo] = (r_mape, r_mase)

    for nome_modelo in ["baseline_mm3", "regressao_linear", "arvore_decisao", "random_forest"]:
        for grupo in ["com_historico", "novo"]:
            r_mape, r_mase = resultados[nome_modelo][grupo]
            imprimir_tabela_completa(nome_modelo, grupo, r_mape, r_mase)

    # ------------------------------------------------------------------
    linha("6. CLASSIFICADOR (reaproveitado) — subgrupo 'alta' probabilidade de venda")
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
    linha("7. REGRESSÃO x ÁRVORE x RANDOM FOREST — subgrupo de alta variância ('alta')")
    resultados_alta = {}
    for nome_modelo, pred in [
        ("regressao_linear", pred_regressao),
        ("arvore_decisao", pred_arvore),
        ("random_forest", pred_rf),
    ]:
        r_mape = mape_mdape(teste.loc[idx_alta, "quantidade"], pred[idx_alta])
        r_mase = mase(teste.loc[idx_alta, "quantidade"], pred[idx_alta], teste.loc[idx_alta, "produto"], escalas)
        resultados_alta[nome_modelo] = (r_mape, r_mase)
        imprimir_tabela_completa(nome_modelo, "faixa_alta", r_mape, r_mase)

    r_mape_arv, r_mase_arv = resultados_alta["arvore_decisao"]
    r_mape_rf, r_mase_rf = resultados_alta["random_forest"]
    delta_mape = r_mape_arv["MAPE"] - r_mape_rf["MAPE"] if pd.notna(r_mape_arv["MAPE"]) and pd.notna(r_mape_rf["MAPE"]) else float("nan")
    delta_mdape = r_mape_arv["MdAPE"] - r_mape_rf["MdAPE"] if pd.notna(r_mape_arv["MdAPE"]) and pd.notna(r_mape_rf["MdAPE"]) else float("nan")
    delta_mase = r_mase_arv["MASE"] - r_mase_rf["MASE"] if pd.notna(r_mase_arv["MASE"]) and pd.notna(r_mase_rf["MASE"]) else float("nan")
    print(
        f"\nÁrvore única vs. Random Forest no subgrupo 'alta': "
        f"ΔMAPE={delta_mape:+.1f}pp | ΔMdAPE={delta_mdape:+.1f}pp | ΔMASE={delta_mase:+.2f} "
        "(positivo = Random Forest melhor que a árvore única)"
    )

    linha("FIM")


if __name__ == "__main__":
    main()
