"""
StockMind — serializa (joblib) os modelos finais escolhidos pro MVP:
regressão linear (quantidade_prevista) + classificador logístico
(probabilidade_venda, limiar 0.4 já validado).

GRANULARIDADE: treinados sobre features_treino.csv/features_teste.csv
agregados por GRUPO (categoria, amperagem, tecnologia) — não mais por
produto/SKU individual. Isso substitui a tentativa de casamento
produto-a-produto entre Excel e produção (que só casava 6.5-19.6% dos
nomes): amperagem e tecnologia extraem de forma robusta dos dois lados,
então o "grupo" de um produto ativo da produção sempre encontra sua
contraparte no histórico do Excel, mesmo quando o SKU exato nunca
apareceu lá. Ver gerar_features.py para a regra de categorização
(inclui a reclassificação DF/Nicoll->estacionaria e >=100AH
Convencional->caminhao).

Categoria NÃO é mais uma feature adicional (dummy) — ela já é parte da
identidade do grupo (cada linha é um grupo-mês). Continua sem entrar
como coluna do modelo, mesma decisão de sempre, só que agora pelo
motivo certo (é a própria chave de agrupamento, não faria sentido como
feature) em vez do motivo antigo (tabela de produção não tinha o
campo — também não tinha mais essa lacuna, pois agora produção deriva
sua própria categoria pela mesma heurística/regra).

NÃO cria scaler.pkl: regressão linear e regressão logística nunca
usaram StandardScaler nesta progressão (só o MLP precisou, e o MLP não
é o modelo escolhido pro MVP). Persistir um scaler não-ajustado para
estes dois modelos seria um artefato morto e um risco real: se alguém
aplicá-lo por engano, corrompe silenciosamente as previsões.

Salva em stockmind/modelos/:
  - regressao_linear.pkl
  - classificador.pkl
(sem scaler.pkl — ver nota acima)
"""

import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression, LogisticRegression

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent.parent
PROCESSED_DIR = BASE_DIR / "data" / "processed"
MODELOS_DIR = BASE_DIR / "modelos"

FEATURE_COLS_PRODUCAO = [
    "mm3",
    "mm6",
    "mes_sin",
    "mes_cos",
    "qty_mesmo_mes_ano_anterior",
    "tempo_desde_ultima_venda_meses",
]


def linha(titulo=""):
    print()
    print("=" * 70)
    if titulo:
        print(titulo)
        print("=" * 70)


def mape_mdape(y_true, y_pred):
    valido = y_pred.notna() & y_true.notna()
    y_true_v = y_true[valido]
    y_pred_v = y_pred[valido]
    usar = y_true_v != 0
    erro_pct = ((y_true_v[usar] - y_pred_v[usar]).abs() / y_true_v[usar]) * 100
    return erro_pct.mean() if len(erro_pct) else float("nan"), erro_pct.median() if len(erro_pct) else float("nan")


def main():
    linha("1. CARREGAR FEATURES (grupo x mês — mesmo split de sempre)")
    treino = pd.read_csv(PROCESSED_DIR / "features_treino.csv", parse_dates=["mes"])
    teste = pd.read_csv(PROCESSED_DIR / "features_teste.csv", parse_dates=["mes"])

    grupos_treino = set(treino["grupo"].unique())
    teste["segmento"] = teste["grupo"].apply(lambda g: "novo" if g not in grupos_treino else "com_historico")
    treino["vendeu_no_mes"] = (treino["quantidade"] > 0).astype(int)

    X_treino_full = treino[FEATURE_COLS_PRODUCAO]
    X_teste_full = teste[FEATURE_COLS_PRODUCAO]
    completo_treino = X_treino_full.notna().all(axis=1)
    completo_teste = X_teste_full.notna().all(axis=1)

    X_treino = X_treino_full[completo_treino]
    y_treino_qtd = treino["quantidade"][completo_treino]
    y_treino_clf = treino["vendeu_no_mes"][completo_treino]
    X_teste = X_teste_full[completo_teste]

    print(f"Treino útil: {len(X_treino)}/{len(treino)} | Teste útil: {len(X_teste)}/{len(teste)}")
    print(f"Features: {FEATURE_COLS_PRODUCAO}")

    # ------------------------------------------------------------------
    linha("2. TREINAR E AVALIAR (com_histórico)")
    reg = LinearRegression()
    reg.fit(X_treino, y_treino_qtd)
    pred_reg = pd.Series(np.nan, index=teste.index)
    pred_reg[completo_teste] = reg.predict(X_teste)

    idx_com_hist = teste["segmento"] == "com_historico"
    mape, mdape = mape_mdape(teste.loc[idx_com_hist, "quantidade"], pred_reg[idx_com_hist])
    print(f"regressao_linear (grupo) — MAPE={mape:.1f}% | MdAPE={mdape:.1f}%")
    print("(referência por PRODUTO individual, rodada anterior: MAPE=69.2% | MdAPE ~semelhante)")

    clf = LogisticRegression(max_iter=1000)
    clf.fit(X_treino, y_treino_clf)

    # ------------------------------------------------------------------
    linha("3. SERIALIZAR")
    MODELOS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(reg, MODELOS_DIR / "regressao_linear.pkl")
    joblib.dump(clf, MODELOS_DIR / "classificador.pkl")
    print(f"Salvos em {MODELOS_DIR}: regressao_linear.pkl, classificador.pkl")
    print("(sem scaler.pkl — ver docstring do módulo, esses dois modelos não usam escala)")

    linha("FIM")


if __name__ == "__main__":
    main()
