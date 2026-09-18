"""
StockMind — diagnóstico de casamento Excel x produção por CÓDIGO +
AMPERAGEM extraídos via regex (não por nome completo). Ainda é só
diagnóstico — nenhum merge é implementado aqui.

Extração (heurística, precisa de validação humana — nomes de bateria
não têm formato 100% consistente):
  - amperagem: número (com decimal opcional) imediatamente antes de
    "AH" (case-insensitive), em qualquer lugar do nome.
  - código: o token que vem logo depois da marca (1º token), DESDE QUE
    esse token não seja ele mesmo o número+AH (ex.: em "ACDELCO 100AH"
    não há código separado — é só marca + amperagem).

Casa por (código normalizado, amperagem) exatos. Reporta separado:
  - código igual + amperagem diferente (candidato a variante real)
  - código PARECIDO (não idêntico) + amperagem igual (candidato a
    erro de digitação em algum dos dois sistemas)
  - sem nenhum candidato por código (forte candidato a "não existe
    mais no catálogo atual")
"""

import difflib
import json
import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_PATH = BASE_DIR / "data" / "raw" / "vendas_saidas_final.xlsx"
PRODUCAO_PATH = BASE_DIR / "saida" / "produtos_producao.json"

RE_AMPERAGEM = re.compile(r"(\d+(?:[.,]\d+)?)\s*AH\b", re.IGNORECASE)
RE_TOKEN_AMPERAGEM = re.compile(r"^\d+(?:[.,]\d+)?AH$", re.IGNORECASE)

SIMILARIDADE_CODIGO_PARECIDO = 0.75


def linha(titulo=""):
    print()
    print("=" * 70)
    if titulo:
        print(titulo)
        print("=" * 70)


def remover_acentos(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def montar_nome_produto(produto, modelo):
    """Concatena produto+modelo sem duplicar quando modelo já está embutido
    em produto (ex.: id=111, produto="ONBAT F60DN 60AH" + modelo="60AH")."""
    produto = (produto or "").strip()
    modelo = (modelo or "").strip()
    if not modelo or produto.upper().endswith(modelo.upper()):
        return produto
    return f"{produto} {modelo}"


def extrair(nome):
    """Retorna (marca, codigo, amperagem) — codigo/amperagem podem ser None."""
    tokens = nome.strip().split()
    if not tokens:
        return None, None, None
    marca = remover_acentos(tokens[0]).upper()

    m_ah = RE_AMPERAGEM.search(nome)
    amperagem = float(m_ah.group(1).replace(",", ".")) if m_ah else None

    codigo = None
    if len(tokens) > 1:
        candidato = tokens[1]
        eh_token_amperagem = bool(RE_TOKEN_AMPERAGEM.fullmatch(candidato))
        tem_letra = bool(re.search(r"[A-Za-z]", candidato))
        if not eh_token_amperagem and tem_letra:
            codigo = remover_acentos(candidato).upper()

    return marca, codigo, amperagem


def main():
    linha("1. CARREGAR AS DUAS LISTAS")
    df = pd.read_excel(RAW_PATH, sheet_name="Sheet1")
    excel_nomes = sorted(df["produto"].str.strip().unique())

    with open(PRODUCAO_PATH, "r", encoding="utf-8") as f:
        payload = json.load(f)
    producao_nomes = sorted({montar_nome_produto(r["produto"], r["modelo"]) for r in payload["produtos"]})

    print(f"Excel: {len(excel_nomes)} produtos | Produção: {len(producao_nomes)} produtos")

    excel_extraido = {nome: extrair(nome) for nome in excel_nomes}
    producao_extraido = {nome: extrair(nome) for nome in producao_nomes}

    # ------------------------------------------------------------------
    linha("2. EXEMPLOS DE EXTRAÇÃO — VALIDE ANTES DE CONFIAR NO RESTO DO RELATÓRIO")
    print(f"{'NOME':<32} | {'marca':<10} | {'código':<14} | amperagem")
    print("--- Excel ---")
    for nome in excel_nomes[:10]:
        marca, codigo, amp = excel_extraido[nome]
        print(f"{nome:<32} | {marca or '—':<10} | {codigo or '—':<14} | {amp if amp is not None else '—'}")
    print("--- Produção ---")
    for nome in producao_nomes[:10]:
        marca, codigo, amp = producao_extraido[nome]
        print(f"{nome:<32} | {marca or '—':<10} | {codigo or '—':<14} | {amp if amp is not None else '—'}")

    n_sem_codigo_excel = sum(1 for v in excel_extraido.values() if v[1] is None)
    n_sem_amp_excel = sum(1 for v in excel_extraido.values() if v[2] is None)
    n_sem_codigo_prod = sum(1 for v in producao_extraido.values() if v[1] is None)
    n_sem_amp_prod = sum(1 for v in producao_extraido.values() if v[2] is None)
    print(
        f"\nSem código extraído: {n_sem_codigo_excel}/{len(excel_nomes)} (Excel), "
        f"{n_sem_codigo_prod}/{len(producao_nomes)} (Produção)"
    )
    print(
        f"Sem amperagem extraída: {n_sem_amp_excel}/{len(excel_nomes)} (Excel), "
        f"{n_sem_amp_prod}/{len(producao_nomes)} (Produção)"
    )

    # ------------------------------------------------------------------
    linha("3. CASAMENTO POR (código, amperagem) EXATOS")
    chave_excel = {}  # (codigo, amperagem) -> [nomes]
    for nome, (_, codigo, amp) in excel_extraido.items():
        if codigo and amp is not None:
            chave_excel.setdefault((codigo, amp), []).append(nome)

    chave_producao = {}
    for nome, (_, codigo, amp) in producao_extraido.items():
        if codigo and amp is not None:
            chave_producao.setdefault((codigo, amp), []).append(nome)

    chaves_comuns = set(chave_excel) & set(chave_producao)
    print(f"Produtos do Excel elegíveis (código+amperagem extraídos): {sum(len(v) for v in chave_excel.values())}/{len(excel_nomes)}")
    print(f"Casaram por (código, amperagem) exatos: {len(chaves_comuns)} combinações de chave")
    total_nomes_casados_excel = sum(len(chave_excel[k]) for k in chaves_comuns)
    print(f"  -> cobre {total_nomes_casados_excel}/{len(excel_nomes)} nomes do Excel ({total_nomes_casados_excel/len(excel_nomes)*100:.1f}%)")
    print("Comparação com o método anterior (nome completo): 21/153 (13.7%)")

    print("\nExemplos de casamento por código+amperagem (até 10):")
    for k in list(chaves_comuns)[:10]:
        print(f"  {k}: EXCEL {chave_excel[k]}  <->  PRODUÇÃO {chave_producao[k]}")

    # ------------------------------------------------------------------
    linha("4. MESMO CÓDIGO, AMPERAGEM DIFERENTE — candidato a variante real")
    codigos_excel = {}
    for (codigo, amp), nomes in chave_excel.items():
        codigos_excel.setdefault(codigo, []).append((amp, nomes))
    codigos_producao = {}
    for (codigo, amp), nomes in chave_producao.items():
        codigos_producao.setdefault(codigo, []).append((amp, nomes))

    codigos_comuns_amp_diferente = []
    for codigo in set(codigos_excel) & set(codigos_producao):
        amps_excel = {amp for amp, _ in codigos_excel[codigo]}
        amps_prod = {amp for amp, _ in codigos_producao[codigo]}
        if amps_excel != amps_prod or (amps_excel & amps_prod) != amps_excel:
            # há pelo menos uma combinação de amperagem que não bate
            for amp_e, nomes_e in codigos_excel[codigo]:
                for amp_p, nomes_p in codigos_producao[codigo]:
                    if amp_e != amp_p:
                        codigos_comuns_amp_diferente.append((codigo, amp_e, nomes_e, amp_p, nomes_p))

    print(f"Casos de código igual com amperagem diferente: {len(codigos_comuns_amp_diferente)}")
    for codigo, amp_e, nomes_e, amp_p, nomes_p in codigos_comuns_amp_diferente:
        print(f"\n  código={codigo}")
        print(f"    Excel     ({amp_e}AH): {nomes_e}")
        print(f"    Produção  ({amp_p}AH): {nomes_p}")

    # ------------------------------------------------------------------
    linha("5. CÓDIGO PARECIDO (NÃO idêntico), AMPERAGEM IGUAL — possível erro de digitação")
    codigos_por_amp_excel = {}
    for (codigo, amp), nomes in chave_excel.items():
        codigos_por_amp_excel.setdefault(amp, []).append((codigo, nomes))
    codigos_por_amp_prod = {}
    for (codigo, amp), nomes in chave_producao.items():
        codigos_por_amp_prod.setdefault(amp, []).append((codigo, nomes))

    pares_parecidos = []
    for amp, lista_excel in codigos_por_amp_excel.items():
        lista_prod = codigos_por_amp_prod.get(amp, [])
        for cod_e, nomes_e in lista_excel:
            for cod_p, nomes_p in lista_prod:
                if cod_e == cod_p:
                    continue
                score = difflib.SequenceMatcher(None, cod_e, cod_p).ratio()
                if score >= SIMILARIDADE_CODIGO_PARECIDO:
                    pares_parecidos.append((score, amp, cod_e, nomes_e, cod_p, nomes_p))

    pares_parecidos.sort(key=lambda x: -x[0])
    print(f"Pares com código parecido (>= {SIMILARIDADE_CODIGO_PARECIDO}) e mesma amperagem: {len(pares_parecidos)}")
    for score, amp, cod_e, nomes_e, cod_p, nomes_p in pares_parecidos:
        print(f"\n  [{score:.2f}] amperagem={amp}AH")
        print(f"    Excel:     código={cod_e}  {nomes_e}")
        print(f"    Produção:  código={cod_p}  {nomes_p}")

    # ------------------------------------------------------------------
    linha("6. SEM NENHUM CANDIDATO POR CÓDIGO — forte candidato a 'não existe mais'")
    codigos_producao_todos = {c for c in codigos_producao}
    excel_sem_candidato_codigo = []
    for nome, (marca, codigo, amp) in excel_extraido.items():
        if codigo is None:
            continue  # sem código extraído, não entra nesta análise (ver seção 2)
        if codigo in codigos_producao_todos:
            continue  # tem pelo menos alguma amperagem do mesmo código na produção
        melhor_sim = max((difflib.SequenceMatcher(None, codigo, c).ratio() for c in codigos_producao_todos), default=0.0)
        if melhor_sim < SIMILARIDADE_CODIGO_PARECIDO:
            excel_sem_candidato_codigo.append(nome)

    print(f"Excel sem candidato por código (nem exato, nem parecido): {len(excel_sem_candidato_codigo)}")
    print("Comparação com o método anterior (nome completo, <0.6 similaridade): 45/153")
    for nome in excel_sem_candidato_codigo:
        print(f"  - {nome}")

    linha("FIM — diagnóstico apenas, nenhum merge implementado")


if __name__ == "__main__":
    main()
