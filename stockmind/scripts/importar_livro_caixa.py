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

LIVRO CAIXA DE 2026 (maio a setembro, digitado em Markdown): formato de 4 colunas
(data, marca, amperagem, quantidade), com a dica junto da amperagem ("72 EFB",
"80 direita", "Estacionária 18", "L9BS 9"). Uso:
    python scripts/importar_livro_caixa.py --livro-2026 <arquivo.md>
Lê o mesmo vendas_saidas_com_livro_caixa.xlsx (não altera) e grava
vendas_saidas_com_livro_caixa_2026.xlsx: as linhas da planilha a partir da primeira
data do livro são SUBSTITUÍDAS pelas do livro (não somadas). Linha que nenhuma
regra reconhece interrompe a importação (ValueError), nunca é descartada em silêncio.
"""

import csv
import io
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
SAIDA_2026_PATH = BASE_DIR / "data" / "raw" / "vendas_saidas_com_livro_caixa_2026.xlsx"

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


# ----------------------------------------------------------------------
# Livro caixa de 2026 (formato de 4 colunas, em blocos ```csv de um .md)
# ----------------------------------------------------------------------

# Produto que o livro só descreve de forma resumida: (MARCA, texto da amperagem)
# -> (nome do produto, categoria, amperagem). Nomes confirmados pelo dono do negócio.
PRODUTOS_FIXOS_2026 = {
    ("HELIAR", "FREEDOM DF500"): ("DF500", "estacionaria", 40.0),
    ("ECON", "ESTACIONARIA 1.3"): ("ECON EP12 1.3AH ESTACIONARIA", "estacionaria", 1.3),
    ("ONBAT", "60"): ("ONBAT F60DN 60AH", "convencional", 60.0),
    ("JUPITER", "90 INVERTIDA"): ("JUPITER JJF90HE 90AH", "convencional", 90.0),
}
# O livro escreve a amperagem comercial; o cadastro usa a nominal: (MARCA, livro) -> nominal.
AMPERAGEM_NOMINAL_2026 = {
    ("JUPITER", 100.0): 105.0,
    ("MOURA", 92.0): 95.0,
    ("EXCELL", 160.0): 150.0,
    ("ACDELCO", 52.0): 50.0,
}
MARCA_AMPERAGEM_UNICA_2026 = {"FENIX": 60.0}  # Fênix é sempre 60AH
CAIXA_ACDELCO_2026 = {95.0: "BX", 90.0: "ALT", 75.0: "ALT"}  # ACDelco 95 baixa; 90 e 75 alta
# Dica escrita no livro -> etiqueta no nome (None = sem efeito: "direita" é o normal).
DICAS_2026 = {
    "EFB": "EFB", "AGM": "AGM", "GM": "AGM", "INVERTIDA": "INV", "ESQUERDA": "INV", "DIREITA": None,
    "CIVIC": "CIVIC", "FIT": "FIT", "BAIXA": "BX", "ALTA": "ALT", "L": None,
}
ORDEM_ETIQUETAS_2026 = ("EFB", "AGM", "INV", "CIVIC", "FIT", "ALT", "BX")
RE_MBR_SUFIXO_ANTES = re.compile(r"^([A-Z]\d+[A-Z]*)\s+(\d+)$")  # "L9BS 9"
RE_MBR_SUFIXO_DEPOIS = re.compile(r"^(\d+)\s*([A-Z]*)$")  # "14 VP", "8BP", "10"
RE_AMP_DICAS = re.compile(r"^(\d+(?:\.\d+)?)\s*([A-Z ]*)$")  # "62 EFB", "6L", "75 baixa"
RE_ESTACIONARIA = re.compile(r"^ESTACIONARIA\s+(\d+(?:\.\d+)?)$")


def converter_linha_2026(marca, amperagem):
    """(marca, amperagem como escrita no livro) -> (produto, categoria, amperagem).
    Levanta ValueError se nenhuma regra reconhece a linha."""
    m = sem_acento(marca).upper().strip()
    a = re.sub(r"\s+", " ", sem_acento(amperagem).upper().strip())
    if (m, a) in PRODUTOS_FIXOS_2026:
        return PRODUTOS_FIXOS_2026[(m, a)]
    if m == "PIONEIRO" and a.startswith("MBR "):  # Pioneiro MBR 7 = MBR7
        m, a = "MBR", a[4:]

    est = RE_ESTACIONARIA.match(a)
    if est:
        amp = float(est.group(1))
        return f"{m} {amp:g}AH ESTACIONARIA", "estacionaria", amp

    if m == "MBR":
        antes, depois = RE_MBR_SUFIXO_ANTES.match(a), RE_MBR_SUFIXO_DEPOIS.match(a)
        if antes:
            sufixo, amp = antes.group(1), float(antes.group(2))
        elif depois:
            amp, sufixo = float(depois.group(1)), depois.group(2)
        else:
            raise ValueError(f"MBR não reconhecido: {marca!r} {amperagem!r}")
        return (f"MBR{amp:g}-{sufixo}" if sufixo else f"MBR{amp:g}"), "moto", amp

    casou = RE_AMP_DICAS.match(a)
    if not casou:
        raise ValueError(f"Amperagem não reconhecida: {marca!r} {amperagem!r}")
    amp, dicas = float(casou.group(1)), casou.group(2).split()
    desconhecidas = [d for d in dicas if d not in DICAS_2026]
    if desconhecidas:
        raise ValueError(f"Dica não reconhecida {desconhecidas}: {marca!r} {amperagem!r}")
    etiquetas = {DICAS_2026[d] for d in dicas} - {None}

    amp = MARCA_AMPERAGEM_UNICA_2026.get(m, AMPERAGEM_NOMINAL_2026.get((m, amp), amp))
    if "CIVIC" in etiquetas and amp in (45.0, 50.0):
        amp = 50.0  # Civic 45 e 50 são a mesma caixa
    if m == "ACDELCO" and amp in CAIXA_ACDELCO_2026:
        etiquetas.add(CAIXA_ACDELCO_2026[amp])

    categoria = "moto" if m in MARCAS_MOTO or amp < 38 else "convencional"
    nome = " ".join([m, f"{amp:g}AH", *[t for t in ORDEM_ETIQUETAS_2026 if t in etiquetas]])
    return nome, categoria, amp


def ler_livro_markdown(texto):
    """Junta os blocos ```csv do Markdown (cabeçalho data,marca,amperagem,quantidade;
    data dd/mm/aaaa) em um DataFrame data, produto, quantidade, amperagem_ah, categoria.
    O que está fora dos blocos é ignorado."""
    linhas = []
    for bloco in re.findall(r"```csv\n(.*?)```", texto, re.S):
        leitor = csv.reader(io.StringIO(bloco.strip()))
        if next(leitor) != ["data", "marca", "amperagem", "quantidade"]:
            raise ValueError("Cabeçalho do bloco csv diferente de data,marca,amperagem,quantidade")
        for data, marca, amperagem, quantidade in leitor:
            produto, categoria, amp = converter_linha_2026(marca, amperagem)
            data_iso = pd.to_datetime(data, format="%d/%m/%Y").strftime("%Y-%m-%d")
            linhas.append((data_iso, produto, int(quantidade), amp, categoria))
    if not linhas:
        raise ValueError("Nenhum bloco csv encontrado no arquivo")
    return pd.DataFrame(linhas, columns=["data", "produto", "quantidade", "amperagem_ah", "categoria"])


def juntar_livro_2026(base, livro):
    """Planilha + livro: a planilha perde tudo a partir da primeira data do livro
    (o livro vale no lugar, não soma). Retorna (planilha final, linhas substituídas)."""
    inicio = livro["data"].min()
    substituidas = base[base["data"] >= inicio]
    final = pd.concat([base[base["data"] < inicio], livro], ignore_index=True)
    return final.sort_values("data", kind="stable").reset_index(drop=True), substituidas


def main_2026(livro_path):
    livro = ler_livro_markdown(Path(livro_path).read_text(encoding="utf-8"))
    print(f"Linhas lidas do livro 2026: {len(livro)}  ({livro['data'].min()} a {livro['data'].max()})")
    base = pd.read_excel(SAIDA_PATH, sheet_name="Sheet1")  # Excel + livro antigo (v2)
    final, substituidas = juntar_livro_2026(base, livro)
    print(f"Planilha: {len(substituidas)} linha(s) a partir de {livro['data'].min()} substituídas pelas do livro")
    final.to_excel(SAIDA_2026_PATH, sheet_name="Sheet1", index=False)
    print(f"\nGravado: {SAIDA_2026_PATH.name} — {len(final)} linhas, {final['data'].min()} a {final['data'].max()}")
    print("\nVendas do livro por mês (unidades):")
    print(livro.assign(mes=livro["data"].str[:7]).groupby("mes")["quantidade"].sum().to_string())


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--livro-2026":
        return main_2026(sys.argv[2])
    if len(sys.argv) != 2:
        sys.exit("Uso: python scripts/importar_livro_caixa.py <livro_caixa.txt> | --livro-2026 <arquivo.md>")
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
