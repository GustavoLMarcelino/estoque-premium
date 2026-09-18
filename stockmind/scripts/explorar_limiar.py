"""
StockMind — explora o limiar de decisão do classificador vende/não
vende (regressão logística já usada em treinar_modelos.py), priorizando
recall da classe "vende": falso negativo (previu "não vende" quando na
real vendeu) é o erro caro — ruptura de estoque.

Não retreina o modelo em si para a parte de limiar: usa a mesma
regressão logística (probabilidades) e só troca a regra de decisão
sobre a probabilidade (threshold). Também testa, à parte,
class_weight='balanced' no treino (com limiar padrão 0.5), para
comparar as duas abordagens.

Só reporta a tabela — não decide o limiar final por conta própria
quando o resultado é ambíguo (ganho de recall com queda forte de
precisão é uma troca de negócio, não uma escolha técnica).
"""

import sys
from pathlib import Path

import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix

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
LIMIARES = [0.5, 0.4, 0.35, 0.3, 0.25]


def linha(titulo=""):
    print()
    print("=" * 70)
    if titulo:
        print(titulo)
        print("=" * 70)


def metricas(y_real, y_pred):
    tn, fp, fn, tp = confusion_matrix(y_real, y_pred, labels=[0, 1]).ravel()
    acuracia = (tp + tn) / (tp + tn + fp + fn)
    precisao = tp / (tp + fp) if (tp + fp) else float("nan")
    recall = tp / (tp + fn) if (tp + fn) else float("nan")
    return {"tn": tn, "fp": fp, "fn": fn, "tp": tp, "acuracia": acuracia, "precisao": precisao, "recall": recall}


def main():
    linha("1. CARREGAR FEATURES E TREINAR CLASSIFICADOR BASE")
    treino = pd.read_csv(PROCESSED_DIR / "features_treino.csv", parse_dates=["mes"])
    teste = pd.read_csv(PROCESSED_DIR / "features_teste.csv", parse_dates=["mes"])

    produtos_treino = set(treino["produto"].unique())
    teste["segmento"] = teste["produto"].apply(
        lambda p: "novo" if p not in produtos_treino else "com_historico"
    )
    treino["vendeu_no_mes"] = (treino["quantidade"] > 0).astype(int)
    teste["vendeu_no_mes"] = (teste["quantidade"] > 0).astype(int)

    treino_dummies = pd.get_dummies(treino[CATEGORIA_COL], prefix="cat", drop_first=True)
    teste_dummies = pd.get_dummies(teste[CATEGORIA_COL], prefix="cat", drop_first=True)
    teste_dummies = teste_dummies.reindex(columns=treino_dummies.columns, fill_value=0)

    X_treino_full = pd.concat([treino[FEATURE_COLS], treino_dummies], axis=1)
    X_teste_full = pd.concat([teste[FEATURE_COLS], teste_dummies], axis=1)

    completo_treino = X_treino_full.notna().all(axis=1)
    completo_teste = X_teste_full.notna().all(axis=1)

    X_treino = X_treino_full[completo_treino]
    y_treino = treino["vendeu_no_mes"][completo_treino]
    X_teste = X_teste_full[completo_teste]

    clf_base = LogisticRegression(max_iter=1000)
    clf_base.fit(X_treino, y_treino)
    proba_teste = pd.Series(clf_base.predict_proba(X_teste)[:, 1], index=X_teste.index)

    clf_balanced = LogisticRegression(max_iter=1000, class_weight="balanced")
    clf_balanced.fit(X_treino, y_treino)
    proba_teste_balanced = pd.Series(clf_balanced.predict_proba(X_teste)[:, 1], index=X_teste.index)

    # ------------------------------------------------------------------
    linha("2. VARREDURA DE LIMIARES (segmento com_histórico — 'novo' não tem feature completa)")
    idx_com_historico = teste.loc[completo_teste, "segmento"] == "com_historico"
    y_real = teste.loc[completo_teste, "vendeu_no_mes"][idx_com_historico]

    print(f"Linhas avaliáveis (com_histórico, feature completa): {len(y_real)}")
    print(f"{'limiar':<10} | {'recall':<10} | {'precisão':<10} | {'acurácia':<10} | fn / tp / fp / tn")
    linhas_tabela = []
    for lim in LIMIARES:
        y_pred = (proba_teste[idx_com_historico.index[idx_com_historico]] >= lim).astype(int)
        m = metricas(y_real, y_pred)
        linhas_tabela.append((lim, m))
        print(
            f"{lim:<10} | {m['recall']*100:>7.1f}%  | {m['precisao']*100:>7.1f}%  | "
            f"{m['acuracia']*100:>7.1f}%  | {m['fn']:>3} / {m['tp']:>3} / {m['fp']:>3} / {m['tn']:>3}"
        )

    # ------------------------------------------------------------------
    linha("3. class_weight='balanced' (limiar padrão 0.5) — comparação")
    y_pred_balanced = (proba_teste_balanced[idx_com_historico.index[idx_com_historico]] >= 0.5).astype(int)
    m_bal = metricas(y_real, y_pred_balanced)
    print(
        f"{'balanced':<10} | {m_bal['recall']*100:>7.1f}%  | {m_bal['precisao']*100:>7.1f}%  | "
        f"{m_bal['acuracia']*100:>7.1f}%  | {m_bal['fn']:>3} / {m_bal['tp']:>3} / {m_bal['fp']:>3} / {m_bal['tn']:>3}"
    )
    print(
        "\n(linha 'balanced' usa um modelo re-treinado com pesos de classe "
        "diferentes, não é o mesmo classificador do limiar 0.5 acima — a "
        "comparação é entre estratégias, não a mesma curva.)"
    )

    linha("FIM")


if __name__ == "__main__":
    main()
