"""
StockMind — métricas de avaliação compartilhadas (sem I/O).

Fonte única de MAPE/MdAPE, MASE (escala por GRUPO, calculada só no treino),
MAE e viés, usada por treinar_modelos.py, pelos demais scripts de
modelagem e pelo torneio_modelos.py. Antes, cada script tinha a sua cópia.

Convenções:
  - y_pred NaN = sem previsão: a linha não entra no erro, mas é contada.
  - MAPE/MdAPE ignoram meses com venda real zero (erro percentual não é
    definido); MASE e MAE usam todas as linhas com previsão.
  - viés = média de (previsto - real); positivo = prevê acima do real.
"""

import numpy as np
import pandas as pd

FEATURE_COLS = [
    "mm3",
    "mm6",
    "mes_sin",
    "mes_cos",
    "qty_mesmo_mes_ano_anterior",
    "tempo_desde_ultima_venda_meses",
]

FRACAO_APARADA = 0.05  # MASE "sem os 5% piores erros"


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


def _linhas_usadas(y_pred, grupos, escalas):
    escala_serie = grupos.map(escalas)
    sem_previsao = y_pred.isna()
    sem_escala = escala_serie.isna() & ~sem_previsao
    escala_zero = (escala_serie == 0) & ~sem_previsao & ~sem_escala
    usar = (~sem_previsao) & (~sem_escala) & (~escala_zero)
    return escala_serie, sem_previsao, sem_escala, escala_zero, usar


def erros_escalados(y_true, y_pred, grupos, escalas):
    """Erro absoluto / escala do grupo, por linha, só das linhas usadas no MASE."""
    escala_serie, _, _, _, usar = _linhas_usadas(y_pred, grupos, escalas)
    return (y_true[usar] - y_pred[usar]).abs() / escala_serie[usar]


def mase(y_true, y_pred, grupos, escalas):
    """MASE por linha (erro absoluto / escala do grupo no treino),
    depois com média simples entre as linhas usadas."""
    n_total = len(y_true)
    _, sem_previsao, sem_escala, escala_zero, usar = _linhas_usadas(y_pred, grupos, escalas)
    erro_escalado = erros_escalados(y_true, y_pred, grupos, escalas)

    return {
        "n_total": n_total,
        "n_sem_previsao": int(sem_previsao.sum()),
        "n_sem_escala_treino": int(sem_escala.sum()),
        "n_escala_zero": int(escala_zero.sum()),
        "n_usado": int(usar.sum()),
        "MASE": erro_escalado.mean() if usar.sum() else float("nan"),
    }


def media_aparada(erros, fracao=FRACAO_APARADA):
    """Média sem a fração `fracao` de maiores erros (robusta a grupos de
    escala minúscula, como 5AH Moto)."""
    if len(erros) == 0:
        return float("nan")
    return erros[erros <= erros.quantile(1 - fracao)].mean()


def mae(y_true, y_pred):
    valido = y_pred.notna() & y_true.notna()
    return (y_true[valido] - y_pred[valido]).abs().mean() if valido.any() else float("nan")


def vies(y_true, y_pred):
    valido = y_pred.notna() & y_true.notna()
    return (y_pred[valido] - y_true[valido]).mean() if valido.any() else float("nan")


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
