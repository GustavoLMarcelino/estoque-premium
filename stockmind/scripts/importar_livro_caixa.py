"""
StockMind — junta o livro caixa antigo (CSV por mês, ';') ao histórico do Excel.

Uso:
    python scripts/importar_livro_caixa.py <livro_caixa.txt>

Lê data/raw/vendas_saidas_final.xlsx (não altera) e grava
data/raw/vendas_saidas_com_livro_caixa.xlsx com as colunas
data, produto, quantidade, amperagem_ah, categoria.

Regras (decididas com o dono do negócio):
  - só entra venda de 01/03/2022 em diante (fevereiro/2022 tinha datas estimadas);
  - em 04/05/2023 vale o livro caixa: as linhas do Excel nesse dia são trocadas.

O modelo agrupa por categoria/amperagem/tecnologia/polaridade/caixa lidos do
NOME do produto (classificar_produto.py), então o nome é montado como
"MARCA 60AH EFB INV CIVIC", sem tentar casar com o código exato do SKU.
"""

import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent.parent
EXCEL_PATH = BASE_DIR / "data" / "raw" / "vendas_saidas_final.xlsx"
SAIDA_PATH = BASE_DIR / "data" / "raw" / "vendas_saidas_com_livro_caixa.xlsx"

DATA_MINIMA = "2022-03-01"
DIA_DO_LIVRO = "2023-05-04"  # dia presente nos dois lados: vale o livro

RE_LINHA = re.compile(r"^\d{2}/\d{2}/\d{4};")
RE_AMP_NO_OBS = re.compile(r"^(\d+)([A-Z]*)$")
MARCAS_MOTO = {"MBR", "HTZ"}

TAGS_OBS = (  # (palavra no Obs em minúsculas, etiqueta no nome)
    ("efb", "EFB"),
    ("agm", "AGM"),
    ("invertida", "INV"),
    ("civic", "CIVIC"),
    ("fit", "FIT"),
    ("alta", "ALT"),
    ("baixa", "BX"),
    ("caixa 60", "CX 60AH"),
)


def sem_acento(texto):
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


def montar_linha(partes, amperagem_df):
    data, marca, amp, obs, qtd = (p.strip() for p in partes[:5])
    marca_up = sem_acento(marca).upper()
    obs_low = obs.lower()
    data_iso = pd.to_datetime(data, format="%d/%m/%Y").strftime("%Y-%m-%d")

    if re.match(r"^DF\d", marca_up):
        return data_iso, marca_up, int(qtd), amperagem_df.get(marca_up), "estacionaria"

    if amp:
        amperagem = float(amp)
        sufixo = ""
    else:
        m = RE_AMP_NO_OBS.match(obs.upper())
        if not m:
            raise ValueError(f"Linha sem amperagem: {partes}")
        amperagem, sufixo = float(m.group(1)), m.group(2)
        obs_low = ""  # o Obs era a amperagem/modelo, não uma etiqueta

    amp_txt = f"{amperagem:g}"
    if marca_up == "MBR" and sufixo:
        produto, categoria = f"MBR{amp_txt}-{sufixo}", "moto"
    elif marca_up == "MBR":
        produto, categoria = f"MBR{amp_txt}", "moto"
    else:
        nome = marca_up or "SEM MARCA"
        etiquetas = [tag for chave, tag in TAGS_OBS if chave in obs_low]
        if "estacion" in obs_low:
            etiquetas.append("ESTACIONARIA")
        if "moto" in obs_low:
            etiquetas.append("MOTO")
        if "encomenda" in obs_low:
            etiquetas.append("ENCOMENDA")
        produto = " ".join([nome, f"{amp_txt}AH", *etiquetas])
        if "encomenda" in obs_low:
            categoria = "encomenda_especial"
        elif "estacion" in obs_low:
            categoria = "estacionaria"
        elif marca_up in MARCAS_MOTO or "moto" in obs_low or amperagem < 38:
            categoria = "moto"
        else:
            categoria = "convencional"
    return data_iso, produto, int(qtd), amperagem, categoria


def main():
    if len(sys.argv) != 2:
        sys.exit("Uso: python scripts/importar_livro_caixa.py <livro_caixa.txt>")
    livro_path = Path(sys.argv[1])

    base = pd.read_excel(EXCEL_PATH, sheet_name="Sheet1")
    amperagem_df = (
        base[base["produto"].str.match(r"^DF\d")].drop_duplicates("produto").set_index("produto")["amperagem_ah"].to_dict()
    )

    linhas = []
    for bruta in livro_path.read_text(encoding="utf-8").splitlines():
        if RE_LINHA.match(bruta):
            linhas.append(montar_linha(bruta.split(";"), amperagem_df))
    livro = pd.DataFrame(linhas, columns=["data", "produto", "quantidade", "amperagem_ah", "categoria"])
    print(f"Linhas lidas do livro: {len(livro)}  ({livro['data'].min()} a {livro['data'].max()})")

    livro = livro[livro["data"] >= DATA_MINIMA]
    print(f"Depois do corte em {DATA_MINIMA}: {len(livro)}")
    if (livro["data"] > DIA_DO_LIVRO).any():
        sys.exit("O livro tem data depois do dia de emenda: revisar antes de juntar.")

    removidas = base[base["data"] == DIA_DO_LIVRO]
    print(f"Excel: {len(removidas)} linha(s) de {DIA_DO_LIVRO} trocadas pelas do livro")
    base = base[base["data"] != DIA_DO_LIVRO]

    final = pd.concat([livro, base], ignore_index=True)
    final = final.sort_values("data", kind="stable").reset_index(drop=True)
    final.to_excel(SAIDA_PATH, sheet_name="Sheet1", index=False)

    print(f"\nGravado: {SAIDA_PATH.name} — {len(final)} linhas, {final['data'].min()} a {final['data'].max()}")
    print("\nCategorias do livro:")
    print(livro["categoria"].value_counts().to_string())
    print("\nSem amperagem (modelo ignora, revisar):")
    print(livro[livro["amperagem_ah"].isna()].to_string(index=False))
    print("\nProdutos novos do livro:", livro["produto"].nunique())
    print(livro["produto"].value_counts().head(12).to_string())
    print("\nVendas por mês (primeiros meses unidos):")
    mes = final.assign(mes=final["data"].str[:7]).groupby("mes")["quantidade"].sum()
    print(mes.head(16).to_string())


if __name__ == "__main__":
    main()
