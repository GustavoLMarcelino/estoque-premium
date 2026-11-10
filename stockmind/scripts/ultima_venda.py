"""
StockMind — última venda HISTÓRICA de cada SKU (Excel + livro caixa).

O histórico anterior a 09/10/2026 não é por SKU: o Excel traz o nome do produto
(que quase nunca bate com o cadastro) e o livro caixa de 2026 só traz marca +
amperagem. Por isso a data é buscada pela chave MARCA + SUBGRUPO
(categoria, amperagem, tecnologia, polaridade, caixa) e, se o histórico não tem essa
chave, pela MARCA + GRUPO GROSSO (categoria, amperagem, tecnologia).

A data de um grupo é uma COTA SUPERIOR da data real de cada SKU dele (a última venda
do grupo é igual ou mais recente que a do SKU). Logo "dias sem venda" calculado com
ela é um PISO: o alerta de "mais de N dias" nunca é falso por causa do mapeamento,
mas pode deixar de pegar um SKU parado. A origem fica marcada (nível "subgrupo" ou
"grosso") para a tela avisar que a data é estimada.

MARCAS: o Excel e o cadastro escrevem a marca diferente; a tabela abaixo foi
aprovada pelo dono do negócio. Marca fora dela casa pelo primeiro token do nome.
"""

import unicodedata

import pandas as pd

from classificar_produto import MAPA_CATEGORIA_BASE_EXCEL, chave_grossa, chave_subgrupo, classificar_produto

NIVEL_SUBGRUPO, NIVEL_GROSSO = "subgrupo", "grosso"

# Marca escrita no Excel -> marca do cadastro.
ALIAS_MARCA = {"ELETRAM": "ELETRAN", "PIOBAT": "PIONEIRO", "PIOBATE": "PIONEIRO", "HEIZER": "HAZER", "NICOLL": "GETPOWER"}
# Linhas escritas só pelo código (sem a marca na frente): prefixo do primeiro token -> marca.
PREFIXOS_MARCA = (
    ("MBR", "PIONEIRO"),
    ("HTZ", "HELIAR"),
    ("HT12", "HELIAR"),
    ("HTX", "HELIAR"),
    ("HZR", "HAZER"),
    ("DF", "FREEDOM"),
)


def normalizar(texto):
    sem_acento = "".join(c for c in unicodedata.normalize("NFD", str(texto)) if unicodedata.category(c) != "Mn")
    return sem_acento.upper().strip()


def marca_do_excel(produto):
    primeiro = (normalizar(produto).split() or [""])[0]
    for prefixo, marca in PREFIXOS_MARCA:
        if primeiro.startswith(prefixo):
            return marca
    return ALIAS_MARCA.get(primeiro, primeiro)


def marca_do_cadastro(marca):
    m = normalizar(marca)
    return ALIAS_MARCA.get(m, m)


def ultimas_vendas_historico(vendas):
    """vendas: DataFrame data, produto, categoria, amperagem_ah (Excel + livro caixa já
    tratados). Retorna ({(marca, subgrupo): data}, {(marca, grosso): data})."""
    info = vendas.groupby("produto").agg(categoria=("categoria", "first"), amperagem=("amperagem_ah", "first"))
    classe = {
        produto: classificar_produto(produto, MAPA_CATEGORIA_BASE_EXCEL.get(r.categoria), r.amperagem)
        for produto, r in info.iterrows()
    }
    v = vendas.assign(classe=vendas["produto"].map(classe))
    v = v[v["classe"].notna()]
    v = v.assign(
        marca=v["produto"].map(marca_do_excel),
        sub=v["classe"].map(chave_subgrupo),
        gro=v["classe"].map(chave_grossa),
    )
    por_sub = v.groupby(["marca", "sub"])["data"].max()
    por_gro = v.groupby(["marca", "gro"])["data"].max()
    return dict(por_sub.items()), dict(por_gro.items())


def ultima_venda_historica(marca, classe, por_subgrupo, por_grosso):
    """Data da última venda histórica do SKU (marca do cadastro + classe de
    classificar_produto). Retorna (data, nivel) ou (None, None) se o histórico
    nunca viu essa marca naquele grupo."""
    m = marca_do_cadastro(marca)
    data = por_subgrupo.get((m, chave_subgrupo(classe)))
    if data is not None:
        return pd.Timestamp(data), NIVEL_SUBGRUPO
    data = por_grosso.get((m, chave_grossa(classe)))
    if data is not None:
        return pd.Timestamp(data), NIVEL_GROSSO
    return None, None
