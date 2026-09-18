"""
StockMind — baseline, regressão linear e classificador vende/não vende,
avaliados no teste, sempre segmentados em:
  - "com_historico": grupos (categoria, amperagem, tecnologia) que já
    vendiam no treino
  - "novo": grupos que só aparecem no teste (sem nenhum histórico
    anterior)

GRANULARIDADE: desde a rodada de reagrupamento, a unidade de análise é o
GRUPO (categoria, amperagem, tecnologia), não mais o produto/SKU
individual — ver gerar_features.py. Isso substitui a tentativa de
casamento produto-a-produto entre Excel e produção. A feature
categórica (dummy de categoria) que existia aqui antes do reagrupamento
foi removida: agora a categoria já é parte da própria identidade da
linha (cada linha é um grupo-mês), não uma feature adicional — mesma
lista de features usada em serializar_modelos_producao.py.

IMPORTANTE — nomenclatura: esta segmentação com_histórico/novo É O
"NÍVEL DE CONFIANÇA PREDITIVA" que o RFC do projeto define em RF08/FA-2
("histórico suficiente" vs. "histórico limitado/insuficiente"). Ela
existe desde preparar_dados.py (é o próprio split treino/teste) e é
usada em toda avaliação, sempre com esses dois rótulos. NÃO confundir
com "probabilidade_venda" (a saída do classificador, em
avaliar_confianca.py) — aquilo mede propensão de o produto vender no
mês, uma pergunta completamente diferente. Nível de confiança
preditiva = "temos histórico suficiente pra confiar nesta previsão".
Probabilidade de venda = "esse produto costuma vender". Os dois nomes
não são intercambiáveis.

  1. baseline_mm3    — média móvel de 3 meses
  2. regressao_linear — regressão linear múltipla (sem clipping,
                         propositalmente, para diagnóstico)
  3. classificador    — regressão logística vende/não vende, avaliado
                         como classificador binário (acurácia, precisão,
                         recall, matriz de confusão)

IMPORTANTE — o que este script NÃO faz mais: houve uma versão anterior
aqui com um "modelo_duas_etapas" que usava o classificador como PORTÃO,
zerando a previsão da regressão quando ele dizia "não vende". Essa
abordagem foi abandonada: todo falso negativo do classificador virava
um erro de 100% garantido, o que piorava MAPE/MdAPE mesmo com o limiar
ajustado. O desenho atual (ver avaliar_confianca.py) trata a
probabilidade do classificador (probabilidade_venda) como um SINAL DE
APOIO à decisão, ao lado da quantidade prevista — não como decisão
automática, e não como "nível de confiança" (esse termo é reservado
para a segmentação com_histórico/novo, ver acima). Não existe mais "a
previsão final"; existem os dois números, e quem decide é o gestor.

Métricas: MAPE, MdAPE (ambas excluem linhas sem previsão e linhas com
atual=0, por definição matemática) e MASE (não tem esse problema de
divisão por zero — é calculável sobre toda linha que tenha uma escala
de treino disponível para aquele produto).

Lê stockmind/data/processed/features_treino.csv e features_teste.csv
(gerados por gerar_features.py). Não faz nenhum "conserto" artificial:
quando um modelo não tem dado suficiente para prever, a previsão fica
marcada como não disponível e é excluída do cálculo de erro (mas
contada e reportada).

Não treina árvore de decisão, Random Forest nem MLP.
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression, LogisticRegression
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

# Limiar de decisão do classificador vende/não vende, ajustado a partir da
# varredura em explorar_limiar.py: 0.4 é o "cotovelo" da curva recall x
# precisão — recall salta de 57.1% (limiar padrão 0.5) para 77.0% com
# queda de precisão de 70.4% para 57.9%; limiares menores (0.35/0.3/0.25)
# só compram recall adicional pequeno (+5 a +2pp) por mais queda de
# precisão. Falso negativo (perder venda por ruptura de estoque) custa
# mais caro que falso positivo, então vale priorizar recall até esse ponto.
LIMIAR_CLASSIFICADOR = 0.4


def linha(titulo=""):
    print()
    print("=" * 70)
    if titulo:
        print(titulo)
        print("=" * 70)


# ----------------------------------------------------------------------
# Métricas
# ----------------------------------------------------------------------

def mape_mdape(y_true, y_pred):
    """MAPE e MdAPE, ignorando linhas sem previsão (NaN) e com atual=0
    (erro percentual não é definido quando o real é zero)."""
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


def escala_mase_por_grupo(features_treino):
    """Escala do MASE: erro absoluto médio do previsor ingênuo (mês
    anterior, dentro do próprio treino), calculado grupo por grupo
    sobre a grade mensal já completa (com os zeros preenchidos)."""
    escalas = {}
    sem_variacao = []
    insuficiente = []
    for grupo_nome, grupo in features_treino.sort_values("mes").groupby("grupo"):
        diffs = grupo["quantidade"].diff().abs().dropna()
        if len(diffs) == 0:
            insuficiente.append(grupo_nome)
            escalas[grupo_nome] = np.nan
        elif diffs.mean() == 0:
            sem_variacao.append(grupo_nome)
            escalas[grupo_nome] = 0.0
        else:
            escalas[grupo_nome] = diffs.mean()
    return escalas, insuficiente, sem_variacao


def mase(y_true, y_pred, grupos, escalas):
    """MASE por linha (erro absoluto / escala do grupo no treino),
    depois com média simples entre as linhas usadas."""
    n_total = len(y_true)
    escala_serie = grupos.map(escalas)

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
    print(f"Treino: {len(treino)} linhas (grupo x mês)")
    print(f"Teste:  {len(teste)} linhas (grupo x mês)")

    grupos_treino = set(treino["grupo"].unique())
    teste["segmento"] = teste["grupo"].apply(
        lambda g: "novo" if g not in grupos_treino else "com_historico"
    )
    grupos_novos = sorted(set(teste["grupo"].unique()) - grupos_treino)
    print(f"Segmento 'novo' (sem histórico no treino): {len(grupos_novos)} grupo(s)")

    X_treino_full = treino[FEATURE_COLS]
    X_teste_full = teste[FEATURE_COLS]

    completo_treino = X_treino_full.notna().all(axis=1)
    completo_teste = X_teste_full.notna().all(axis=1)

    # ------------------------------------------------------------------
    linha("2. ESCALA DO MASE (previsor ingênuo dentro do treino)")
    escalas, grupos_sem_diff, grupos_sem_variacao = escala_mase_por_grupo(treino)
    print(f"Grupos com escala calculável no treino: {sum(pd.notna(v) for v in escalas.values())}/{len(escalas)}")
    if grupos_sem_diff:
        print(
            f"Grupos sem nenhuma variação mês-a-mês avaliável no treino "
            f"(1 único mês de histórico): {len(grupos_sem_diff)} — MASE não computável para eles."
        )
    if grupos_sem_variacao:
        print(
            f"Grupos com escala=0 no treino (quantidade nunca mudou mês a mês, "
            f"ex.: sempre 0): {len(grupos_sem_variacao)} — MASE não computável (divisão por 0)."
        )
    print(
        f"Nota: os {len(grupos_novos)} grupo(s) 'novo(s)' não têm nenhuma linha no treino, "
        "logo não têm escala — MASE também não é computável para eles, pelo mesmo motivo "
        "estrutural que já limita MAPE/regressão nesse grupo."
    )

    # ------------------------------------------------------------------
    linha("3. BASELINE — média móvel de 3 meses (mm3)")
    pred_baseline = teste["mm3"]
    resultados_baseline_mape = {}
    resultados_baseline_mase = {}
    for segmento, sub in teste.groupby("segmento"):
        resultados_baseline_mape[segmento] = mape_mdape(sub["quantidade"], sub["mm3"])
        resultados_baseline_mase[segmento] = mase(
            sub["quantidade"], sub["mm3"], sub["grupo"], escalas
        )

    # ------------------------------------------------------------------
    linha("4. REGRESSÃO LINEAR (sem clipping — diagnóstico)")
    X_treino = X_treino_full[completo_treino]
    y_treino = treino["quantidade"][completo_treino]

    reg = LinearRegression()
    reg.fit(X_treino, y_treino)

    pred_regressao = pd.Series(np.nan, index=teste.index)
    pred_regressao[completo_teste] = reg.predict(X_teste_full[completo_teste])

    n_negativas = (pred_regressao < 0).sum()
    print(
        f"Linhas de treino descartadas do fit (feature NaN): {(~completo_treino).sum()}/{len(treino)}"
    )
    print(
        f"Linhas de teste sem previsão da regressão (feature NaN): "
        f"{(~completo_teste).sum()}/{len(teste)}"
    )
    if n_negativas:
        print(
            f"Observação: {n_negativas} previsão(ões) negativa(s) da regressão, "
            "mantidas sem clipping neste modelo (é o mesmo comportamento já reportado antes)."
        )

    resultados_regressao_mape = {}
    resultados_regressao_mase = {}
    for segmento in teste["segmento"].unique():
        idx = teste["segmento"] == segmento
        resultados_regressao_mape[segmento] = mape_mdape(
            teste.loc[idx, "quantidade"], pred_regressao[idx]
        )
        resultados_regressao_mase[segmento] = mase(
            teste.loc[idx, "quantidade"], pred_regressao[idx], teste.loc[idx, "grupo"], escalas
        )

    # ------------------------------------------------------------------
    linha("5. CLASSIFICADOR — vende / não vende no mês")
    treino["vendeu_no_mes"] = (treino["quantidade"] > 0).astype(int)
    teste["vendeu_no_mes"] = (teste["quantidade"] > 0).astype(int)

    y_treino_clf = treino["vendeu_no_mes"][completo_treino]
    print(
        f"Distribuição do alvo no treino (linhas completas usadas para treinar): "
        f"vende={int((y_treino_clf==1).sum())}, não_vende={int((y_treino_clf==0).sum())}"
    )

    clf = LogisticRegression(max_iter=1000)
    clf.fit(X_treino, y_treino_clf)
    print("\nCoeficientes do classificador:")
    for nome, coef in zip(X_treino.columns, clf.coef_[0]):
        print(f"  {nome:<30} {coef: .4f}")
    print(f"  {'intercepto':<30} {clf.intercept_[0]: .4f}")

    print(
        f"\nLimiar de decisão: {LIMIAR_CLASSIFICADOR} (padrão do sklearn seria 0.5) — "
        "ajustado em explorar_limiar.py para priorizar recall da classe 'vende', "
        "sem retreinar o modelo (mesma probabilidade, só troca o ponto de corte)."
    )
    proba_vendeu = pd.Series(np.nan, index=teste.index)
    proba_vendeu[completo_teste] = clf.predict_proba(X_teste_full[completo_teste])[:, 1]
    pred_vendeu = pd.Series(np.nan, index=teste.index)
    pred_vendeu[completo_teste] = (proba_vendeu[completo_teste] >= LIMIAR_CLASSIFICADOR).astype(int)

    linha("5b. AVALIAÇÃO DO CLASSIFICADOR (segmentada)")
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

        print(f"  Matriz de confusão [real x previsto] — linhas=real, colunas=previsto:")
        print(f"                 previsto=não_vende  previsto=vende")
        print(f"  real=não_vende        {tn:>6}              {fp:>6}")
        print(f"  real=vende            {fn:>6}              {tp:>6}")
        print(f"  Acurácia:  {acuracia*100:.1f}%")
        print(f"  Precisão (classe 'vende'): {precisao*100:.1f}%")
        print(
            f"  >>> RECALL (classe 'vende'): {recall*100:.1f}% <<<  "
            f"— falsos negativos (previu 'não vende' mas vendeu) = {fn}/{tp+fn}. "
            "Esse é o erro caro: risco de ruptura de estoque por não repor."
        )

    # ------------------------------------------------------------------
    linha("6. TABELA COMPARATIVA — MAPE, MdAPE e MASE, segmentados")
    for grupo in ["com_historico", "novo"]:
        imprimir_tabela_completa("baseline_mm3", grupo, resultados_baseline_mape[grupo], resultados_baseline_mase[grupo])
    for grupo in ["com_historico", "novo"]:
        imprimir_tabela_completa("regressao_linear", grupo, resultados_regressao_mape[grupo], resultados_regressao_mase[grupo])

    print(
        "\nO classificador (seção 5b) e a regressão linear (acima) são avaliados "
        "separadamente. A combinação dos dois — probabilidade_venda ao lado de "
        "quantidade_prevista — está em avaliar_confianca.py, não aqui. Repetindo: "
        "'nível de confiança' nesta tabela é sempre com_histórico/novo (RFC "
        "RF08/FA-2), nunca a probabilidade do classificador."
    )

    linha("FIM")


if __name__ == "__main__":
    main()
