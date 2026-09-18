"""
Preparação de dados para o StockMind: tratamento de qualidade e split
temporal treino/teste a partir do histórico de vendas de baterias.

Lê stockmind/data/raw/vendas_saidas_final.xlsx e gera em
stockmind/data/processed/:
  - treino.csv  (maio/2023 a outubro/2025)
  - teste.csv   (novembro/2025 a abril/2026)
  - baixo_volume.csv (categorias descontinuado / encomenda_especial)

Decisão travada: a linha com quantidade=60 (ELETRAN 60AH, 12/12/2025) é
um evento real (dia de pico com múltiplas vendas grandes de baterias
60Ah) e entra em teste.csv normalmente — não é mais isolada.

Não treina nenhum modelo. Só trata, separa e reporta.
"""

import sys
from pathlib import Path

import pandas as pd

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_PATH = BASE_DIR / "data" / "raw" / "vendas_saidas_final.xlsx"
PROCESSED_DIR = BASE_DIR / "data" / "processed"

TREINO_INICIO = "2023-05-01"
TREINO_FIM = "2025-10-31"
TESTE_INICIO = "2025-11-01"
TESTE_FIM = "2026-04-30"

CATEGORIAS_BAIXO_VOLUME = {"descontinuado", "encomenda_especial"}


def linha(titulo=""):
    print()
    print("=" * 70)
    if titulo:
        print(titulo)
        print("=" * 70)


def main():
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    linha("1. LEITURA")
    df = pd.read_excel(RAW_PATH, sheet_name="Sheet1")
    df["data"] = pd.to_datetime(df["data"])
    total_original = len(df)
    print(f"Linhas lidas de {RAW_PATH.name}: {total_original}")
    print(f"Período bruto: {df['data'].min().date()} a {df['data'].max().date()}")

    # ------------------------------------------------------------------
    linha("2. DESCARTE: maio/2026 (mês parcial)")
    mask_maio_2026 = (df["data"].dt.year == 2026) & (df["data"].dt.month == 5)
    descartado_maio = df[mask_maio_2026]
    df = df[~mask_maio_2026]
    print(
        f"Decisão: descartar {len(descartado_maio)} linha(s) de maio/2026 — "
        "extração cortada no meio do mês, confirmado que não é queda real de vendas."
    )
    if len(descartado_maio):
        print(
            f"Período descartado: {descartado_maio['data'].min().date()} "
            f"a {descartado_maio['data'].max().date()}"
        )

    # ------------------------------------------------------------------
    linha("3. OUTLIER: quantidade = 60 (mediana é 1) — decisão travada")
    outlier = df[df["quantidade"] == 60]
    print(
        f"Decisão travada: {len(outlier)} linha(s) com quantidade=60 tratada(s) "
        "como venda real (dia de pico, 12/12/2025, com múltiplas vendas grandes "
        "de baterias 60Ah) e mantida(s) no fluxo normal — entra em teste.csv."
    )
    if len(outlier):
        print(outlier.to_string(index=False))
    pendente_path = PROCESSED_DIR / "pendente_revisao.csv"
    if pendente_path.exists():
        pendente_path.unlink()
        print(f"Removido {pendente_path.name} (decisão já consolidada).")

    # ------------------------------------------------------------------
    linha("4. amperagem_ah nula (2 linhas esperadas)")
    nulos = df[df["amperagem_ah"].isnull()]
    print(f"Linhas com amperagem_ah nula: {len(nulos)}")
    if len(nulos):
        print(nulos.to_string(index=False))
        categorias_nulos = set(nulos["categoria"].unique())
        if categorias_nulos <= CATEGORIAS_BAIXO_VOLUME:
            print(
                "Nota: essas linhas já pertencem a categoria(s) de baixo volume "
                f"({', '.join(sorted(categorias_nulos))}) e serão isoladas no passo "
                "5 — não entram no split treino/teste, então o NULL não afeta o "
                "modelo. Mantidas como NULL (produto MBR16-LBS não tem amperagem "
                "óbvia no nome — decisão de preenchimento fica para você)."
            )

    # ------------------------------------------------------------------
    linha("5. Categorias de baixo volume (descontinuado / encomenda_especial)")
    mask_baixo_volume = df["categoria"].isin(CATEGORIAS_BAIXO_VOLUME)
    baixo_volume = df[mask_baixo_volume]
    df = df[~mask_baixo_volume]
    print(
        f"Decisão: isolar {len(baixo_volume)} linha(s) dessas categorias em "
        "baixo_volume.csv — volume insuficiente para avaliar previsão."
    )
    print(baixo_volume["categoria"].value_counts().to_string())
    baixo_volume.to_csv(PROCESSED_DIR / "baixo_volume.csv", index=False)

    # ------------------------------------------------------------------
    linha("6. SPLIT TEMPORAL (ordem cronológica, sem embaralhar)")
    df = df.sort_values("data", kind="stable").reset_index(drop=True)

    treino = df[(df["data"] >= TREINO_INICIO) & (df["data"] <= TREINO_FIM)]
    teste = df[(df["data"] >= TESTE_INICIO) & (df["data"] <= TESTE_FIM)]

    sobrando = df[~(df.index.isin(treino.index) | df.index.isin(teste.index))]
    if len(sobrando):
        print(
            f"AVISO: {len(sobrando)} linha(s) fora das janelas de treino/teste "
            "definidas — verifique manualmente."
        )
        print(sobrando.to_string(index=False))

    treino.to_csv(PROCESSED_DIR / "treino.csv", index=False)
    teste.to_csv(PROCESSED_DIR / "teste.csv", index=False)

    print(f"\nTreino: {len(treino)} linhas")
    print(f"  Período: {treino['data'].min().date()} a {treino['data'].max().date()}")
    print("  Por categoria:")
    print(treino["categoria"].value_counts().to_string())

    print(f"\nTeste: {len(teste)} linhas")
    print(f"  Período: {teste['data'].min().date()} a {teste['data'].max().date()}")
    print("  Por categoria:")
    print(teste["categoria"].value_counts().to_string())

    # ------------------------------------------------------------------
    linha("7. SANITY CHECKS")

    sem_vazamento = treino["data"].max() < teste["data"].min()
    print(
        f"[{'OK' if sem_vazamento else 'FALHA'}] Nenhuma data de treino é "
        f"posterior a nenhuma data de teste (max treino={treino['data'].max().date()}, "
        f"min teste={teste['data'].min().date()})"
    )

    soma = len(treino) + len(teste) + len(baixo_volume) + len(descartado_maio)
    print(
        f"\n[{'OK' if soma == total_original else 'FALHA'}] Soma de linhas: "
        f"treino({len(treino)}) + teste({len(teste)}) + baixo_volume({len(baixo_volume)}) "
        f"+ descartado_maio2026({len(descartado_maio)}) "
        f"= {soma} (original = {total_original})"
    )

    produtos_treino = set(treino["produto"].unique())
    produtos_teste = set(teste["produto"].unique())
    produtos_novos = sorted(produtos_teste - produtos_treino)
    print(
        f"\nProdutos no teste sem NENHUM histórico no treino: {len(produtos_novos)}"
    )
    for p in produtos_novos:
        print(f"  - {p}")

    linha("FIM")


if __name__ == "__main__":
    main()
