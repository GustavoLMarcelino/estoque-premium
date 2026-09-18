"""
StockMind — diagnóstico (SÓ diagnóstico, sem propor solução de matching
ainda): tenta casar os nomes de produto do Excel histórico de treino
com os nomes reais da tabela estoque em produção.

Entradas:
  - stockmind/data/raw/vendas_saidas_final.xlsx (coluna "produto")
  - stockmind/saida/produtos_producao.json (gerado por
    listar_produtos_producao.py, rodado na EC2 e copiado de volta)

Casamento exato: case-insensitive, espaços colapsados/trim. Para o que
não casa, mostra os N candidatos mais parecidos do outro lado (difflib,
biblioteca padrão — sem dependência nova) para revisão manual.

Não decide nada, não sugere de-para — só relatório.
"""

import difflib
import json
import re
import sys
from pathlib import Path

import pandas as pd

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_PATH = BASE_DIR / "data" / "raw" / "vendas_saidas_final.xlsx"
PRODUCAO_PATH = BASE_DIR / "saida" / "produtos_producao.json"

N_CANDIDATOS = 3
LIMIAR_SIMILARIDADE_EXIBIR = 0.4  # só pra não poluir com pares claramente sem relação


def linha(titulo=""):
    print()
    print("=" * 70)
    if titulo:
        print(titulo)
        print("=" * 70)


def normalizar(nome):
    return re.sub(r"\s+", " ", nome.strip().upper())


def montar_nome_produto(produto, modelo):
    """Concatena produto+modelo sem duplicar quando modelo já está embutido
    em produto (ex.: id=111, produto="ONBAT F60DN 60AH" + modelo="60AH")."""
    produto = (produto or "").strip()
    modelo = (modelo or "").strip()
    if not modelo or produto.upper().endswith(modelo.upper()):
        return produto
    return f"{produto} {modelo}"


def main():
    if not PRODUCAO_PATH.exists():
        raise SystemExit(
            f"Faltando {PRODUCAO_PATH}. Rode stockmind/scripts/listar_produtos_producao.py "
            "na EC2 e copie o produtos_producao.json de volta pra cá antes de rodar este script."
        )

    linha("1. LISTA DO EXCEL (produto, texto único)")
    df = pd.read_excel(RAW_PATH, sheet_name="Sheet1")
    excel_originais = sorted(df["produto"].str.strip().unique())
    excel_norm = {normalizar(p): p for p in excel_originais}
    print(f"Total de produtos únicos no Excel: {len(excel_originais)}")
    for p in excel_originais:
        print(f"  - {p}")

    linha("2. LISTA DA PRODUÇÃO (produto + modelo)")
    with open(PRODUCAO_PATH, "r", encoding="utf-8") as f:
        payload = json.load(f)
    producao_registros = payload["produtos"]
    producao_originais = sorted({montar_nome_produto(r["produto"], r["modelo"]) for r in producao_registros})
    producao_norm = {normalizar(p): p for p in producao_originais}
    print(f"Total de produtos ativos na produção: {len(producao_originais)}")
    for p in producao_originais:
        print(f"  - {p}")

    linha("3. CASAMENTO EXATO (case-insensitive, trim, espaços colapsados)")
    chaves_excel = set(excel_norm.keys())
    chaves_producao = set(producao_norm.keys())
    casados = chaves_excel & chaves_producao
    so_excel = chaves_excel - chaves_producao
    so_producao = chaves_producao - chaves_excel

    total_excel = len(chaves_excel)
    total_producao = len(chaves_producao)
    print(f"Casaram perfeitamente: {len(casados)}")
    print(f"  ({len(casados)}/{total_excel} = {len(casados)/total_excel*100:.1f}% do Excel)")
    print(f"  ({len(casados)}/{total_producao} = {len(casados)/total_producao*100:.1f}% da produção)")
    print(f"Só no Excel (sem par na produção): {len(so_excel)}")
    print(f"Só na produção (sem par no Excel): {len(so_producao)}")

    if casados:
        print("\nExemplos casados (até 10):")
        for k in list(sorted(casados))[:10]:
            print(f"  - {excel_norm[k]}")

    # ------------------------------------------------------------------
    linha("4. CANDIDATOS PARA OS QUE NÃO CASARAM — revisão manual")
    print(
        f"Para cada item sem par exato, os {N_CANDIDATOS} mais parecidos do outro lado "
        f"(similaridade >= {LIMIAR_SIMILARIDADE_EXIBIR}, difflib.SequenceMatcher)."
    )

    print("\n--- Excel sem par na produção ---")
    for k in sorted(so_excel):
        nome_original = excel_norm[k]
        candidatos = difflib.get_close_matches(k, chaves_producao, n=N_CANDIDATOS, cutoff=LIMIAR_SIMILARIDADE_EXIBIR)
        print(f"\nExcel: {nome_original}")
        if not candidatos:
            print("  (nenhum candidato acima do limiar na produção)")
        for c in candidatos:
            score = difflib.SequenceMatcher(None, k, c).ratio()
            print(f"  -> [{score:.2f}] {producao_norm[c]}")

    print("\n--- Produção sem par no Excel ---")
    for k in sorted(so_producao):
        nome_original = producao_norm[k]
        candidatos = difflib.get_close_matches(k, chaves_excel, n=N_CANDIDATOS, cutoff=LIMIAR_SIMILARIDADE_EXIBIR)
        print(f"\nProdução: {nome_original}")
        if not candidatos:
            print("  (nenhum candidato acima do limiar no Excel)")
        for c in candidatos:
            score = difflib.SequenceMatcher(None, k, c).ratio()
            print(f"  -> [{score:.2f}] {excel_norm[c]}")

    linha("FIM — diagnóstico apenas, nenhuma solução de matching proposta")


if __name__ == "__main__":
    main()
