"""
StockMind — features de produção por grupo GROSSO, com tratamento de
período SEM DADO.

O histórico vem de duas fontes que cobrem intervalos diferentes: o Excel
(até a última data da planilha) e o sistema em produção (desde a primeira
movimentação do banco). O que fica fora desses intervalos é FALTANTE, não
"vendeu zero": preencher a lacuna com zero derrubava mm3/mm6 e a previsão
(60AH: 91/mês no Excel virava 9,8 com maio-setembro/2026 como zero).

REGRAS:
  - cobertura de um mês = fração dos dias do mês dentro de algum intervalo
    coberto. Abaixo de COBERTURA_MINIMA_MES o mês é faltante (NaN).
  - mês parcialmente coberto (ex.: o sistema começou no dia 9) tem a venda
    proporcionalizada: venda / fração coberta.
  - mm3 e mm6 são médias sobre a janela de CALENDÁRIO (3 e 6 meses antes do
    mês previsto), ignorando os meses faltantes. Isso dá o peso aos meses
    recentes sem alterar a definição da feature com que o modelo foi
    treinado (média simples da janela); meses antigos do Excel não entram
    na média de uma janela recente. Janela sem nenhum mês coberto -> NaN
    (grupo sem previsão, não previsão inventada).
  - confiança "alta" exige a janela inteira coberta; com lacuna, no máximo
    "média", e a justificativa do grupo avisa.
"""

import numpy as np
import pandas as pd

FEATURE_COLS_PRODUCAO = [
    "mm3",
    "mm6",
    "mes_sin",
    "mes_cos",
    "qty_mesmo_mes_ano_anterior",
    "tempo_desde_ultima_venda_meses",
]
COLUNAS_GROSSA = ["categoria", "amperagem", "tecnologia"]

JANELA_MM3 = 3
JANELA_MM6 = 6
COBERTURA_MINIMA_MES = 0.25  # menos que isso de dados no mês -> faltante


def mes_idx(ts):
    return ts.year * 12 + ts.month


def intervalos_de_cobertura(excel_ini, excel_fim, inicio_producao, fim):
    """Intervalos [inicio, fim) disjuntos com dado real. excel_fim é inclusivo;
    `fim` é o primeiro dia do mês previsto. A produção só vale DEPOIS do fim
    do Excel (onde os dois se sobrepõem, o Excel vale) — assim atualizar a
    planilha para cobrir a lacuna não duplica venda."""
    excel_fim_excl = excel_fim.normalize() + pd.Timedelta(days=1)
    intervalos = [(excel_ini.to_period("M").to_timestamp(), min(excel_fim_excl, fim))]
    if inicio_producao is not None:
        ini = max(inicio_producao.normalize(), excel_fim_excl)
        if ini < fim:
            intervalos.append((ini, fim))
    return intervalos


def fracao_coberta(mes, intervalos):
    inicio, fim = mes, mes + pd.DateOffset(months=1)
    dias = sum(max(0, (min(fim, b) - max(inicio, a)).days) for a, b in intervalos)
    return min(1.0, dias / (fim - inicio).days)


def dias_cobertos_na_janela(intervalos, mes_previsto, meses):
    """Dias com dado real nos `meses` meses completos antes do mês previsto."""
    ini = mes_previsto - pd.DateOffset(months=meses)
    return sum(max(0, (min(mes_previsto, b) - max(ini, a)).days) for a, b in intervalos)


def calcular_features_por_grupo(historico_combinado, mes_previsto, intervalos):
    """Grade mensal por grupo GROSSO (o grão dos modelos), com meses sem dado
    como NaN. Retorna DataFrame indexado por (categoria, amperagem,
    tecnologia) com as FEATURE_COLS_PRODUCAO mais n_mm3/n_mm6 (meses com
    dado em cada janela)."""
    idx_previsto = mes_idx(mes_previsto)
    ultimo_mes_completo = mes_previsto - pd.DateOffset(months=1)
    idx_ultimo_completo = mes_idx(ultimo_mes_completo)

    historico_combinado = historico_combinado[historico_combinado["mes"] <= ultimo_mes_completo]

    linhas_feature = []
    for (cat, amp, tec), grupo in historico_combinado.groupby(COLUNAS_GROSSA):
        primeiro_idx = mes_idx(grupo["mes"].min())
        n_meses = idx_ultimo_completo - primeiro_idx + 1
        if n_meses <= 0:
            continue
        meses_full = pd.date_range(start=grupo["mes"].min(), periods=n_meses, freq="MS")
        grade = pd.DataFrame({"mes": meses_full})
        grade = grade.merge(grupo[["mes", "quantidade"]], on="mes", how="left")
        grade["quantidade"] = grade["quantidade"].fillna(0.0)  # mês COBERTO sem venda = zero de verdade
        grade["fracao"] = grade["mes"].apply(lambda m: fracao_coberta(m, intervalos))
        grade["valor"] = np.where(
            grade["fracao"] >= COBERTURA_MINIMA_MES, grade["quantidade"] / grade["fracao"].where(grade["fracao"] > 0, 1), np.nan
        )
        grade["mes_idx"] = grade["mes"].apply(mes_idx)

        janela3 = grade["valor"].tail(JANELA_MM3).dropna()
        janela6 = grade["valor"].tail(JANELA_MM6).dropna()
        mm3 = janela3.mean() if len(grade) >= JANELA_MM3 and len(janela3) else np.nan
        mm6 = janela6.mean() if len(grade) >= JANELA_MM6 and len(janela6) else np.nan

        linha_ano_anterior = grade[grade["mes_idx"] == idx_previsto - 12]
        qty_ano_anterior = linha_ano_anterior["valor"].iloc[0] if len(linha_ano_anterior) else np.nan

        vendas_positivas = grade[grade["valor"] > 0]
        tempo_desde_ultima = (
            idx_previsto - vendas_positivas["mes_idx"].max() if len(vendas_positivas) else np.nan
        )

        linhas_feature.append(
            {
                "categoria": cat,
                "amperagem": amp,
                "tecnologia": tec,
                "mm3": mm3,
                "mm6": mm6,
                "qty_mesmo_mes_ano_anterior": qty_ano_anterior,
                "tempo_desde_ultima_venda_meses": tempo_desde_ultima,
                "n_mm3": len(janela3),
                "n_mm6": len(janela6),
            }
        )

    colunas = COLUNAS_GROSSA + ["mm3", "mm6", "qty_mesmo_mes_ano_anterior", "tempo_desde_ultima_venda_meses", "n_mm3", "n_mm6"]
    features = (
        pd.DataFrame(linhas_feature).set_index(COLUNAS_GROSSA)
        if linhas_feature
        else pd.DataFrame(columns=colunas).set_index(COLUNAS_GROSSA)
    )
    features["mes_sin"] = np.sin(2 * np.pi * mes_previsto.month / 12)
    features["mes_cos"] = np.cos(2 * np.pi * mes_previsto.month / 12)
    return features


def _tem_lacuna(row):
    return row["n_mm3"] < JANELA_MM3 or row["n_mm6"] < JANELA_MM6


def classificar_confianca(features_row):
    if features_row[FEATURE_COLS_PRODUCAO].isna().all():
        return "baixa"
    if features_row[FEATURE_COLS_PRODUCAO].isna().any() or _tem_lacuna(features_row):
        return "media"
    return "alta"


def descrever_lacuna(features_row):
    """Texto para a justificativa quando a janela das médias não está toda
    coberta; None se está."""
    if not _tem_lacuna(features_row):
        return None
    return (
        f"Série com lacuna de dados: {int(features_row['n_mm3'])} de {JANELA_MM3} meses (média de {JANELA_MM3} meses) "
        f"e {int(features_row['n_mm6'])} de {JANELA_MM6} (média de {JANELA_MM6} meses) com dado registrado; "
        "meses sem dado foram ignorados, não contados como zero."
    )
