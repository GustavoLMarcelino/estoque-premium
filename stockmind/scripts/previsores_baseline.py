"""
StockMind — previsores de referência para demanda intermitente, em numpy
puro (sem biblioteca nova): Croston e Croston-SBA.

Previsão de UM PASSO À FRENTE: a previsão do mês t usa só os meses
anteriores a t da própria série do grupo (nada do futuro).

Croston estima separadamente o tamanho da demanda (z) e o intervalo entre
demandas (p), ambos por suavização exponencial só nos meses COM venda:
    previsão = z / p
SBA (Syntetos-Boylan) corrige o viés para cima do Croston:
    previsão = (1 - alpha/2) * z / p
Enquanto não houve nenhuma venda, não há previsão (NaN).
"""

import numpy as np
import pandas as pd


def croston_um_passo(serie, alpha, sba=False):
    """serie: demandas mensais em ordem cronológica. Retorna array com a
    previsão de cada posição t feita só com serie[:t] (NaN sem venda prévia)."""
    serie = np.asarray(serie, dtype=float)
    previsao = np.full(len(serie), np.nan)
    z = p = None  # tamanho médio e intervalo médio entre demandas
    q = 1  # meses desde a última venda (contando o atual)
    fator = (1 - alpha / 2) if sba else 1.0
    for t, y in enumerate(serie):
        if z is not None:
            previsao[t] = fator * z / p
        if y > 0:
            if z is None:
                z, p = y, float(q)
            else:
                z = z + alpha * (y - z)
                p = p + alpha * (q - p)
            q = 1
        else:
            q += 1
    return previsao


def prever_croston(df, alpha, sba=False):
    """df: colunas grupo, mes, quantidade (qualquer ordem). Retorna Series com
    a previsão de um passo para cada linha, alinhada ao índice de df."""
    saida = pd.Series(np.nan, index=df.index)
    for _, g in df.sort_values("mes").groupby("grupo"):
        saida.loc[g.index] = croston_um_passo(g["quantidade"].to_numpy(), alpha, sba)
    return saida
