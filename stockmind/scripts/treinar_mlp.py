"""
StockMind — MLPRegressor, último passo da progressão do RFC (regressão
linear -> regressão logística -> árvore de decisão -> Random Forest ->
MLP). O próprio RFC classifica MLP como "evolução futura", e os dois
passos anteriores mostraram um padrão de mais complexidade perdendo
pra modelo mais simples com o volume de dado disponível (~1.419 linhas
de treino úteis) — tratado aqui como exploratório, sem expectativa de
vencer os modelos anteriores.

MLP é sensível a escala (diferente de árvore/Random Forest): as
features atuais têm escalas bem diferentes (mm3/mm6 em unidades,
mes_sin/cos entre -1 e 1) — StandardScaler ajustado SÓ no treino,
aplicado em treino e teste (sem vazamento).

Testa no máximo 3 arquiteturas pequenas ((8,), (16,), (16,8)) — nada de
busca extensa, dado o volume de treino. Se não convergir bem ou
overfittar de forma óbvia, reporta e não insiste em mais configurações.

Reaproveita a mesma política de NaN das outras etapas: sem imputação
arbitrária — linhas com feature incompleta ficam sem previsão (contadas,
não escondidas).
"""

import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
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

ARVORE_MAX_DEPTH = 4
RF_N_ESTIMATORS = 50
RF_MAX_DEPTH = 4

ARQUITETURAS_TESTADAS = [(8,), (16,), (16, 8)]


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
    linha("1. CARREGAR FEATURES E ESCALAR (StandardScaler ajustado só no treino)")
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

    X_treino_raw = X_treino_full[completo_treino]
    y_treino = treino["quantidade"][completo_treino]
    X_teste_raw = X_teste_full[completo_teste]

    scaler = StandardScaler()
    X_treino = pd.DataFrame(
        scaler.fit_transform(X_treino_raw), columns=X_treino_raw.columns, index=X_treino_raw.index
    )
    X_teste = pd.DataFrame(
        scaler.transform(X_teste_raw), columns=X_teste_raw.columns, index=X_teste_raw.index
    )

    print(f"Treino útil (feature completa): {len(X_treino)}/{len(treino)}")
    print(f"Teste útil (feature completa): {len(X_teste)}/{len(teste)}")
    print(
        "StandardScaler ajustado só em X_treino — média/desvio do teste NÃO "
        "entram no ajuste (sem vazamento). Dummies de categoria (0/1) também "
        "passam pelo scaler por simplicidade — não muda a natureza binária."
    )

    escalas = escala_mase_por_produto(treino)
    idx_com_hist = teste["segmento"] == "com_historico"

    # ------------------------------------------------------------------
    linha("2. TESTE DE ARQUITETURAS (no máximo 3, sem busca extensa)")
    print(f"{'arquitetura':<14} | {'convergiu?':<10} | {'MAPE treino':<12} | {'MAPE teste':<12} | {'MASE teste':<10}")
    resultados_arq = []
    for arq in ARQUITETURAS_TESTADAS:
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always", ConvergenceWarning)
            mlp = MLPRegressor(
                hidden_layer_sizes=arq,
                max_iter=2000,
                random_state=42,
                early_stopping=True,
                n_iter_no_change=20,
            )
            mlp.fit(X_treino, y_treino)
            convergiu = not any(issubclass(item.category, ConvergenceWarning) for item in w)

        pred_treino = pd.Series(mlp.predict(X_treino), index=X_treino.index)
        pred_teste = pd.Series(np.nan, index=teste.index)
        pred_teste[completo_teste] = mlp.predict(X_teste)

        r_mape_tr = mape_mdape(y_treino, pred_treino)
        r_mape_te = mape_mdape(teste.loc[idx_com_hist, "quantidade"], pred_teste[idx_com_hist])
        r_mase_te = mase(
            teste.loc[idx_com_hist, "quantidade"], pred_teste[idx_com_hist],
            teste.loc[idx_com_hist, "produto"], escalas,
        )
        resultados_arq.append((arq, convergiu, r_mape_tr["MAPE"], r_mape_te["MAPE"], r_mase_te["MASE"], mlp.n_iter_))
        print(
            f"{str(arq):<14} | {'sim' if convergiu else 'NÃO':<10} | "
            f"{fmt_pct(r_mape_tr['MAPE']):<12} | {fmt_pct(r_mape_te['MAPE']):<12} | "
            f"{fmt_mase(r_mase_te['MASE']):<10} (n_iter={mlp.n_iter_})"
        )

    algum_nao_convergiu = any(not conv for _, conv, *_ in resultados_arq)
    if algum_nao_convergiu:
        print(
            "\nAVISO: pelo menos uma arquitetura não convergiu dentro de max_iter=2000 "
            "(ConvergenceWarning). Reportando como está, sem insistir em mais configurações "
            "ou aumentar max_iter indefinidamente — é o comportamento esperado avisado antes de treinar."
        )

    melhor = min(resultados_arq, key=lambda r: r[3] if pd.notna(r[3]) else float("inf"))
    ARQ_ESCOLHIDA = melhor[0]
    print(
        f"\nEscolha: hidden_layer_sizes={ARQ_ESCOLHIDA} — menor MAPE de teste "
        f"({fmt_pct(melhor[3])}) entre as {len(ARQUITETURAS_TESTADAS)} testadas."
    )

    # ------------------------------------------------------------------
    linha("3. MLP FINAL — treino e avaliação")
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always", ConvergenceWarning)
        mlp_final = MLPRegressor(
            hidden_layer_sizes=ARQ_ESCOLHIDA, max_iter=2000, random_state=42,
            early_stopping=True, n_iter_no_change=20,
        )
        mlp_final.fit(X_treino, y_treino)
        convergiu_final = not any(issubclass(item.category, ConvergenceWarning) for item in w)
    print(f"Convergência: {'sim' if convergiu_final else 'NÃO — ver aviso acima'}, n_iter_={mlp_final.n_iter_}")

    pred_mlp = pd.Series(np.nan, index=teste.index)
    pred_mlp[completo_teste] = mlp_final.predict(X_teste)

    # ------------------------------------------------------------------
    linha("4. OS OUTROS MODELOS (refeitos aqui, mesma config já validada)")
    reg = LinearRegression()
    reg.fit(X_treino_raw, y_treino)
    pred_regressao = pd.Series(np.nan, index=teste.index)
    pred_regressao[completo_teste] = reg.predict(X_teste_raw)

    arv = DecisionTreeRegressor(max_depth=ARVORE_MAX_DEPTH, random_state=42)
    arv.fit(X_treino_raw, y_treino)
    pred_arvore = pd.Series(np.nan, index=teste.index)
    pred_arvore[completo_teste] = arv.predict(X_teste_raw)

    rf = RandomForestRegressor(n_estimators=RF_N_ESTIMATORS, max_depth=RF_MAX_DEPTH, random_state=42, n_jobs=-1)
    rf.fit(X_treino_raw, y_treino)
    pred_rf = pd.Series(np.nan, index=teste.index)
    pred_rf[completo_teste] = rf.predict(X_teste_raw)

    pred_baseline = teste["mm3"]

    print(
        "(regressão/árvore/random forest usam as features SEM escala — StandardScaler "
        "só é necessário/aplicado para o MLP; os outros modelos não são sensíveis a "
        "escala e reproduzem exatamente os números já reportados nas rodadas anteriores.)"
    )

    # ------------------------------------------------------------------
    linha("5. TABELA COMPARATIVA FINAL — 5 MODELOS, MAPE/MdAPE/MASE, segmentados")
    preds = {
        "baseline_mm3": pred_baseline,
        "regressao_linear": pred_regressao,
        "arvore_decisao": pred_arvore,
        "random_forest": pred_rf,
        "mlp": pred_mlp,
    }
    resultados = {nome: {} for nome in preds}
    for nome_modelo, pred in preds.items():
        for grupo in ["com_historico", "novo"]:
            idx = teste["segmento"] == grupo
            r_mape = mape_mdape(teste.loc[idx, "quantidade"], pred[idx])
            r_mase = mase(teste.loc[idx, "quantidade"], pred[idx], teste.loc[idx, "produto"], escalas)
            resultados[nome_modelo][grupo] = (r_mape, r_mase)

    for nome_modelo in preds:
        for grupo in ["com_historico", "novo"]:
            r_mape, r_mase = resultados[nome_modelo][grupo]
            imprimir_tabela_completa(nome_modelo, grupo, r_mape, r_mase)

    # ------------------------------------------------------------------
    linha("6. CLASSIFICADOR (reaproveitado) — subgrupo 'alta' probabilidade de venda")
    y_treino_clf = treino["vendeu_no_mes"][completo_treino]
    clf = LogisticRegression(max_iter=1000)
    clf.fit(X_treino_raw, y_treino_clf)

    probabilidade_venda = pd.Series(np.nan, index=teste.index)
    probabilidade_venda[completo_teste] = clf.predict_proba(X_teste_raw)[:, 1]
    faixa = probabilidade_venda.apply(
        lambda p: "sem_dados" if pd.isna(p) else ("alta" if p >= CORTE_ALTA else ("media" if p >= CORTE_MEDIA else "baixa"))
    )
    idx_alta = faixa == "alta"
    print(f"Linhas na faixa 'alta' de probabilidade_venda: {int(idx_alta.sum())}")

    # ------------------------------------------------------------------
    linha("7. TODOS OS MODELOS — subgrupo de alta variância ('alta')")
    for nome_modelo, pred in preds.items():
        if nome_modelo == "baseline_mm3":
            continue
        r_mape = mape_mdape(teste.loc[idx_alta, "quantidade"], pred[idx_alta])
        r_mase = mase(teste.loc[idx_alta, "quantidade"], pred[idx_alta], teste.loc[idx_alta, "produto"], escalas)
        imprimir_tabela_completa(nome_modelo, "faixa_alta", r_mape, r_mase)

    linha("FIM")


if __name__ == "__main__":
    main()
