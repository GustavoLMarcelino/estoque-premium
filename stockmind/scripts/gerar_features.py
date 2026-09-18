"""
Engenharia de features do StockMind: agrega vendas por GRUPO (categoria,
amperagem exata, tecnologia) x mês, substituindo a agregação por produto
individual usada até a rodada anterior.

DECISÃO (substitui a tentativa de casamento produto-a-produto entre Excel
e produção): em vez de prever por SKU/marca individual, o StockMind prevê
"quanto comprar desse perfil de bateria" (ex.: "60AH Convencional Carro").
O gestor decide a marca na hora da compra. Isso elimina a necessidade de
casar nomes de produto entre os dois sistemas — só amperagem, tecnologia
e categoria precisam ser extraídos/consistentes nos dois lados, o que já
é mais robusto (amperagem extrai bem de ambos).

Lê stockmind/data/processed/treino.csv e teste.csv (gerados por
preparar_dados.py) e escreve stockmind/data/processed/:
  - features_treino.csv
  - features_teste.csv
agora com granularidade GRUPO x mês (colunas categoria/amperagem/
tecnologia/grupo em vez de produto).

--- EXTRAÇÃO DE TECNOLOGIA (EFB/AGM/Convencional) ---
Busca as palavras "EFB"/"AGM" no nome do produto (case-insensitive). Se
nenhuma das duas aparecer, tecnologia="Convencional". Validado com 15-20
exemplos antes de aplicar (ver conversa) — bate com a convenção real dos
fabricantes (ADF=EFB, ADG=AGM, ADR=convencional).

--- REGRA DE CATEGORIZAÇÃO FINAL (sobrescreve a coluna "categoria" do
Excel onde se aplica; mesma regra usada em gerar_previsao_producao.py) ---
Descoberta durante a investigação de histórico "escondido" de caminhão:
a série "DF" (DF500, DF700, DF1000, DF2000, DF3000) e o Excel inteiro da
categoria "estacionaria" SÃO A MESMA COISA — 40-150AH é incompatível com
bateria estacionária real (nobreak, ~1-20AH; ver ECON EP12 1.3AH na
produção), e a convenção de nome (sem marca, capacidade crescente sem
código de placa) é visivelmente uma linha comercial/pesada separada.
Aplicada nesta ordem de prioridade:
  1. nome começa com "DF" + dígito -> estacionaria (linha comercial "DF",
     mal categorizada)
  2. "nicoll" no nome (case-insensitive) -> estacionaria
  3. amperagem >= 100 E tecnologia == Convencional -> caminhao (limiar
     geral, não lista fechada: qualquer amperagem futura >=100
     Convencional cai aqui)
  4. amperagem >= 100 mas tecnologia EFB/AGM -> mantém categoria original
     (carro de alto desempenho, não caminhão — o limiar de caminhão só
     vale pra Convencional)
  5. resto -> mantém a categoria original do Excel (convencional->carro,
     moto->moto, estacionaria->estacionaria)

Decisão de grade de calendário (mantida, agora por GRUPO): para cada
grupo, preenchemos com quantidade=0 os meses sem venda entre o primeiro
mês em que ALGUM produto do grupo vendeu e o último mês do período
observado (abril/2026).

Sazonalidade: mes_sin/mes_cos (não inteiro 1-12), mesma decisão de
sempre.

Não treina nenhum modelo. Só gera as features.
"""

import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent.parent
PROCESSED_DIR = BASE_DIR / "data" / "processed"

TREINO_FIM_IDX = 2025 * 12 + 10  # outubro/2025
TESTE_INICIO_IDX = 2025 * 12 + 11  # novembro/2025

RE_AMPERAGEM = re.compile(r"(\d+(?:[.,]\d+)?)\s*AH\b", re.IGNORECASE)
MAPA_CATEGORIA_BASE = {"convencional": "carro", "moto": "moto", "estacionaria": "estacionaria"}


def linha(titulo=""):
    print()
    print("=" * 70)
    if titulo:
        print(titulo)
        print("=" * 70)


def mes_idx(mes_timestamp):
    return mes_timestamp.year * 12 + mes_timestamp.month


def extrair_tecnologia(nome):
    nome_upper = nome.upper()
    if "EFB" in nome_upper:
        return "EFB"
    if "AGM" in nome_upper:
        return "AGM"
    return "Convencional"


def categoria_final(nome, categoria_base, amperagem, tecnologia):
    """Ver docstring do módulo — mesma regra aplicada em
    gerar_previsao_producao.py (categoria_exibicao). Cadeia if/elif —
    ordem de prioridade importa, cada regra só é avaliada se nenhuma
    anterior já classificou o produto:
      1. nome começa com "DF"+dígito -> estacionaria
      2. "nicoll" no nome -> estacionaria
      3. amperagem >= 100 E tecnologia == Convencional -> caminhao
      3.5. "estacion"/"nobreak" no nome -> estacionaria (protege
           nobreaks reais, ex.: ECON EP12/Moura 1.3, 1.3AH — sem essa
           regra ANTES da 4, amperagem<38 os classificaria como moto
           incorretamente)
      4. amperagem < 38 -> moto
      5. resto -> mantém categoria_base
    """
    primeiro_token = nome.strip().split()[0] if nome.strip() else ""
    nome_lower = nome.lower()
    if re.match(r"^DF\d", primeiro_token, re.IGNORECASE):
        return "estacionaria"
    elif "nicoll" in nome_lower:
        return "estacionaria"
    elif amperagem is not None and amperagem >= 100 and tecnologia == "Convencional":
        return "caminhao"
    elif "estacion" in nome_lower or "nobreak" in nome_lower:
        return "estacionaria"
    elif amperagem is not None and amperagem < 38:
        return "moto"
    else:
        return categoria_base


def montar_grupo_exibicao(categoria, amperagem, tecnologia):
    categoria_titulo = {"carro": "Carro", "moto": "Moto", "estacionaria": "Estacionária", "caminhao": "Caminhão"}[categoria]
    amp_fmt = f"{amperagem:g}AH" if pd.notna(amperagem) else "?AH"
    return f"{amp_fmt} {tecnologia} {categoria_titulo}"


def main():
    linha("1. CARREGAR TREINO + TESTE (dados já tratados)")
    treino = pd.read_csv(PROCESSED_DIR / "treino.csv", parse_dates=["data"])
    teste = pd.read_csv(PROCESSED_DIR / "teste.csv", parse_dates=["data"])
    df = pd.concat([treino, teste], ignore_index=True)
    print(f"Linhas combinadas (treino+teste): {len(df)}")

    # ------------------------------------------------------------------
    linha("2. RECLASSIFICAR CATEGORIA POR PRODUTO (DF/Nicoll/>=100AH Convencional)")
    info_produto = (
        df.groupby("produto")
        .agg(categoria_original=("categoria", "first"), amperagem=("amperagem_ah", "first"))
        .reset_index()
    )
    info_produto["categoria_base"] = info_produto["categoria_original"].map(MAPA_CATEGORIA_BASE)
    info_produto["tecnologia"] = info_produto["produto"].apply(extrair_tecnologia)
    info_produto["categoria_final"] = info_produto.apply(
        lambda r: categoria_final(r["produto"], r["categoria_base"], r["amperagem"], r["tecnologia"]), axis=1
    )

    mudou = info_produto[info_produto["categoria_base"] != info_produto["categoria_final"]].sort_values(
        "categoria_final"
    )
    print(f"Produtos que MUDARAM de categoria pela nova regra: {len(mudou)}/{len(info_produto)}")
    for _, r in mudou.iterrows():
        print(
            f"  {r['produto']:<24} {r['categoria_base']:<12} -> {r['categoria_final']:<12} "
            f"(amperagem={r['amperagem']}, tecnologia={r['tecnologia']})"
        )
    print("\nDistribuição final de categoria (por produto único):")
    print(info_produto["categoria_final"].value_counts().to_string())

    categoria_por_produto = info_produto.set_index("produto")["categoria_final"].to_dict()
    amperagem_por_produto = info_produto.set_index("produto")["amperagem"].to_dict()
    tecnologia_por_produto = info_produto.set_index("produto")["tecnologia"].to_dict()

    df["categoria_grupo"] = df["produto"].map(categoria_por_produto)
    df["amperagem_grupo"] = df["produto"].map(amperagem_por_produto)
    df["tecnologia_grupo"] = df["produto"].map(tecnologia_por_produto)

    # ------------------------------------------------------------------
    linha("3. AGREGAR POR GRUPO (categoria, amperagem, tecnologia) x MÊS")
    df["mes"] = df["data"].values.astype("datetime64[M]")
    mensal = df.groupby(
        ["categoria_grupo", "amperagem_grupo", "tecnologia_grupo", "mes"], as_index=False
    )["quantidade"].sum()
    grupos_unicos = mensal[["categoria_grupo", "amperagem_grupo", "tecnologia_grupo"]].drop_duplicates()
    print(f"Grupos únicos (categoria, amperagem, tecnologia): {len(grupos_unicos)}")
    print(f"  (antes, produto individual: {info_produto['produto'].nunique()} produtos)")
    print(f"Combinações grupo x mês com venda registrada: {len(mensal)}")

    global_max_idx = mes_idx(df["mes"].max())
    print(f"Último mês do período observado: {df['mes'].max().strftime('%Y-%m')}")

    # ------------------------------------------------------------------
    linha("4. GRADE DE CALENDÁRIO POR GRUPO (zero-fill dos meses sem venda)")
    linhas_grade = []
    for (cat, amp, tec), grupo in mensal.groupby(["categoria_grupo", "amperagem_grupo", "tecnologia_grupo"]):
        primeiro_idx = mes_idx(grupo["mes"].min())
        n_meses = global_max_idx - primeiro_idx + 1
        meses_full = pd.date_range(start=grupo["mes"].min(), periods=n_meses, freq="MS")
        linhas_grade.append(
            pd.DataFrame(
                {"categoria_grupo": cat, "amperagem_grupo": amp, "tecnologia_grupo": tec, "mes": meses_full}
            )
        )
    grade = pd.concat(linhas_grade, ignore_index=True)

    completo = grade.merge(mensal, on=["categoria_grupo", "amperagem_grupo", "tecnologia_grupo", "mes"], how="left")
    completo["quantidade"] = completo["quantidade"].fillna(0.0)
    completo = completo.sort_values(
        ["categoria_grupo", "amperagem_grupo", "tecnologia_grupo", "mes"], kind="stable"
    ).reset_index(drop=True)

    zero_fill = (completo["quantidade"] == 0).sum()
    print(
        f"Linhas na grade completa: {len(completo)} "
        f"({len(mensal)} com venda real + {zero_fill} preenchidas com 0)"
    )

    # ------------------------------------------------------------------
    linha("5. FEATURES")
    completo["mes_idx"] = completo["mes"].apply(mes_idx)
    mes_num = completo["mes"].dt.month
    completo["mes_sin"] = np.sin(2 * np.pi * mes_num / 12)
    completo["mes_cos"] = np.cos(2 * np.pi * mes_num / 12)

    chave_grupo = ["categoria_grupo", "amperagem_grupo", "tecnologia_grupo"]
    g = completo.groupby(chave_grupo, group_keys=False)

    completo["mm3"] = g["quantidade"].apply(lambda s: s.shift(1).rolling(3).mean())
    completo["mm6"] = g["quantidade"].apply(lambda s: s.shift(1).rolling(6).mean())
    completo["qty_mesmo_mes_ano_anterior"] = g["quantidade"].shift(12)

    def tempo_desde_ultima_venda(grupo):
        idx_venda = grupo["mes_idx"].where(grupo["quantidade"] > 0)
        idx_venda_passado = idx_venda.shift(1).ffill()
        return grupo["mes_idx"] - idx_venda_passado

    completo["tempo_desde_ultima_venda_meses"] = completo.groupby(chave_grupo, group_keys=False).apply(
        tempo_desde_ultima_venda
    )

    n_total = len(completo)
    for col in ["mm3", "mm6", "qty_mesmo_mes_ano_anterior", "tempo_desde_ultima_venda_meses"]:
        n_nan = completo[col].isnull().sum()
        print(f"  {col}: {n_nan}/{n_total} linhas sem valor (NaN) — histórico insuficiente")

    completo["grupo"] = completo.apply(
        lambda r: montar_grupo_exibicao(r["categoria_grupo"], r["amperagem_grupo"], r["tecnologia_grupo"]), axis=1
    )

    # ------------------------------------------------------------------
    linha("6. SPLIT TEMPORAL (mesmos limites de antes)")
    completo["particao"] = np.where(
        completo["mes_idx"] <= TREINO_FIM_IDX,
        "treino",
        np.where(completo["mes_idx"] >= TESTE_INICIO_IDX, "teste", "fora"),
    )

    fora = completo[completo["particao"] == "fora"]
    if len(fora):
        print(f"AVISO: {len(fora)} linha(s) fora das janelas de treino/teste.")

    colunas_saida = [
        "grupo",
        "categoria_grupo",
        "amperagem_grupo",
        "tecnologia_grupo",
        "mes",
        "quantidade",
        "mm3",
        "mm6",
        "mes_sin",
        "mes_cos",
        "qty_mesmo_mes_ano_anterior",
        "tempo_desde_ultima_venda_meses",
    ]

    features_treino = completo[completo["particao"] == "treino"][colunas_saida]
    features_teste = completo[completo["particao"] == "teste"][colunas_saida]

    features_treino.to_csv(PROCESSED_DIR / "features_treino.csv", index=False)
    features_teste.to_csv(PROCESSED_DIR / "features_teste.csv", index=False)

    print(f"features_treino.csv: {len(features_treino)} linhas (grupo x mês)")
    print(f"features_teste.csv:  {len(features_teste)} linhas (grupo x mês)")

    # ------------------------------------------------------------------
    linha("7. CHECAGEM: grupos novos vs. com histórico no teste")
    grupos_treino = set(features_treino["grupo"].unique())
    grupos_teste = set(features_teste["grupo"].unique())
    grupos_novos = sorted(grupos_teste - grupos_treino)
    print(f"Grupos no teste sem NENHUMA linha no treino: {len(grupos_novos)}")
    for g_novo in grupos_novos:
        print(f"  - {g_novo}")

    sem_nenhuma_feature = features_teste[
        features_teste[["mm3", "mm6", "qty_mesmo_mes_ano_anterior", "tempo_desde_ultima_venda_meses"]]
        .isnull()
        .all(axis=1)
    ]
    grupos_sem_feature_alguma = sorted(sem_nenhuma_feature["grupo"].unique())
    print(f"Grupos no teste com TODAS as features vazias (proxy de 'grupo novo'): {len(grupos_sem_feature_alguma)}")

    linha("8. GRUPOS ESTACIONÁRIA E CAMINHÃO — histórico disponível (informativo)")
    for cat_alvo in ["estacionaria", "caminhao"]:
        sub = completo[completo["categoria_grupo"] == cat_alvo]
        for (cat, amp, tec), g_sub in sub.groupby(chave_grupo):
            n_meses_com_venda = int((g_sub["quantidade"] > 0).sum())
            print(
                f"  {montar_grupo_exibicao(cat, amp, tec):<28} grade={len(g_sub)} meses "
                f"({g_sub['mes'].min().strftime('%Y-%m')} a {g_sub['mes'].max().strftime('%Y-%m')}), "
                f"meses_com_venda={n_meses_com_venda}"
            )

    linha("FIM")


if __name__ == "__main__":
    main()
