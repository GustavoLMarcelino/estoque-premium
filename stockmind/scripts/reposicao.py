"""
StockMind — cálculo de reposição por GRUPO de bateria (sem I/O, sem pandas).

Recebe os SKUs já classificados (classificar_produto.py) mais a demanda
prevista no grão grosso, e devolve um registro por grupo:

  estoque_grupo = soma do estoque dos SKUs do grupo
  segurança     = soma de qtd_minima dos SKUs do grupo
  necessidade   = demanda prevista do grupo + segurança
  comprar       = max(0, necessidade - estoque_grupo)
  prioridade    = cobertura do grupo (estoque / demanda diária) vs. limites abaixo

DEMANDA DO GRUPO: os modelos preveem no grão grosso (categoria, amperagem,
tecnologia) — o validado. Essa demanda é repartida entre os subgrupos
(polaridade, caixa) pela participação nas vendas dos últimos meses; se a
janela está zerada, usa o histórico inteiro; se ainda assim não há venda,
divide igualmente entre os subgrupos ativos.

SEM GIRO: demanda prevista ~0 (ou grupo sem previsão) nunca gera prioridade
Alta. Abaixo do mínimo -> "Repor mínimo (X un)"; senão -> "Sem giro: avaliar
no mix" — mas só se a janela tem pelo menos DIAS_MINIMOS_HISTORICO dias de
dado real; com menos, é "Dados insuficientes: X dias de histórico" (Baixa).
"""

import math
from collections import defaultdict

import numpy as np

from classificar_produto import (
    CATEGORIA_TITULO,
    chave_grossa,
    chave_subgrupo,
    grupo_do_subgrupo,
    nome_grupo,
)

# Prazo de reposição dos fornecedores ~7 dias. Cobertura menor que isso (com
# folga) é ruptura certa antes de a compra chegar.
COBERTURA_ALTA_DIAS = 10  # < 10 dias de cobertura -> prioridade Alta
COBERTURA_MEDIA_DIAS = 20  # 10 a 20 dias -> Média; acima -> Baixa
HORIZONTE_DIAS = 30  # a demanda prevista é de 30 dias
JANELA_PARTICIPACAO_MESES = 6  # meses completos usados na participação por marca/subgrupo
DEMANDA_MINIMA_COM_GIRO = 0.5  # abaixo disso (arredonda para 0 un) o grupo é "sem giro"
# Menos que isso de dado real na janela de participação: venda zero não prova
# falta de giro (ex.: sistema novo, poucos dias de histórico).
DIAS_MINIMOS_HISTORICO = 60

# Base da repartição da demanda entre subgrupos, da melhor para a pior. O
# fallback é necessário quando não há venda na janela (ex.: reset de estoque).
BASE_JANELA, BASE_HISTORICO, BASE_IGUAL = "janela", "historico", "igual"
ORDEM_BASE = {BASE_JANELA: 0, BASE_HISTORICO: 1, BASE_IGUAL: 2}

ORDEM_PRIORIDADE = {"alta": 0, "media": 1, "baixa": 2}
ORDEM_CONFIANCA = {"alta": 0, "media": 1, "baixa": 2}


def _participacao(grossa, ativos, vendas_janela, vendas_total):
    """Participação de cada subgrupo nas vendas do grupo grosso e a base
    usada: janela recente -> histórico inteiro (Excel + produção) ->
    divisão igual entre os ativos."""
    for base, fonte in ((BASE_JANELA, vendas_janela), (BASE_HISTORICO, vendas_total)):
        da_grossa = {s: q for s, q in fonte.items() if s[:3] == grossa}
        total = sum(da_grossa.values())
        if total > 0:
            return {s: q / total for s, q in da_grossa.items()}, base
    return {s: 1 / len(ativos) for s in ativos}, BASE_IGUAL


def repartir_demanda(demanda_grossa, subgrupos_ativos, vendas_janela, vendas_total):
    """{grossa: demanda|None} -> ({grupo: demanda|None}, {grupo: base}), só
    para grupos com SKU cadastrado — inclusive com estoque 0, que é
    justamente quem está em ruptura e precisa receber a sua fatia. Demanda
    de subgrupos sem nenhum SKU cadastrado (ex.: invertida que a loja não
    vende mais) não é atribuída a ninguém — não há o que comprar para ela."""
    demanda = {grupo_do_subgrupo(s): None for s in subgrupos_ativos}
    base_usada = {g: BASE_JANELA for g in demanda}
    for grossa, d in demanda_grossa.items():
        if d is None:
            continue
        ativos = [s for s in subgrupos_ativos if s[:3] == grossa]
        if not ativos:
            continue
        participacao, base = _participacao(grossa, ativos, vendas_janela, vendas_total)
        for sub in ativos:
            g = grupo_do_subgrupo(sub)
            demanda[g] = (demanda[g] or 0.0) + d * participacao.get(sub, 0.0)
            base_usada[g] = max(base_usada[g], base, key=ORDEM_BASE.get)
    return demanda, base_usada


def calcular_reposicao(estoque, seguranca, demanda, dias_historico=None):
    """demanda None = grupo sem previsão. dias_historico = dias com dado real
    na janela (None = não informado, tratado como suficiente). Retorna
    quantidadeSugerida, coberturaDias, prioridade, acao (texto pronto para a
    tela) e dadosInsuficientes."""
    if demanda is None or demanda < DEMANDA_MINIMA_COM_GIRO:
        insuficiente = demanda is not None and dias_historico is not None and dias_historico < DIAS_MINIMOS_HISTORICO
        falta = max(0, seguranca - estoque)
        if falta > 0:
            prioridade = "media" if estoque == 0 else "baixa"
            return {"quantidadeSugerida": falta, "coberturaDias": None, "prioridade": prioridade,
                    "acao": f"Repor mínimo ({falta} un)", "dadosInsuficientes": insuficiente}
        if demanda is None:
            acao = "Sem previsão: avaliar no mix"
        elif insuficiente:
            acao = f"Dados insuficientes: {dias_historico} dias de histórico"
        else:
            acao = "Sem giro: avaliar no mix"
        return {"quantidadeSugerida": 0, "coberturaDias": None, "prioridade": "baixa", "acao": acao,
                "dadosInsuficientes": insuficiente}

    cobertura = estoque / (demanda / HORIZONTE_DIAS)
    comprar = math.ceil(round(max(0.0, demanda + seguranca - estoque), 6))
    if cobertura < COBERTURA_ALTA_DIAS:
        prioridade = "alta"
    elif cobertura <= COBERTURA_MEDIA_DIAS:
        prioridade = "media"
    else:
        prioridade = "baixa"
    acao = f"Comprar {comprar} un" if comprar > 0 else "Estoque suficiente"
    return {"quantidadeSugerida": comprar, "coberturaDias": round(cobertura, 1), "prioridade": prioridade, "acao": acao,
            "dadosInsuficientes": False}


def calcular_tercis(demandas):
    com_giro = [d for d in demandas if d is not None and d >= DEMANDA_MINIMA_COM_GIRO]
    return np.quantile(com_giro, [1 / 3, 2 / 3]) if len(com_giro) >= 3 else [0, 0]


def classificar_giro(demanda, tercis, dados_insuficientes=False):
    if demanda is None:
        return "baixa_confianca"
    if demanda < DEMANDA_MINIMA_COM_GIRO:
        return "dados_insuficientes" if dados_insuficientes else "sem_giro"
    if demanda >= tercis[1]:
        return "alto"
    if demanda >= tercis[0]:
        return "medio"
    return "baixo"


def distribuir_por_participacao(total, vendas_por_id):
    """Reparte `total` unidades entre os SKUs pela participação nas vendas
    (maior resto, soma exata). Sem venda nenhuma no grupo -> {} (sem base)."""
    soma = sum(vendas_por_id.values())
    if total <= 0 or soma <= 0:
        return {}
    cotas = {i: total * v / soma for i, v in vendas_por_id.items()}
    inteiros = {i: math.floor(c) for i, c in cotas.items()}
    sobra = total - sum(inteiros.values())
    for i in sorted(cotas, key=lambda i: cotas[i] - inteiros[i], reverse=True)[:sobra]:
        inteiros[i] += 1
    return {i: q for i, q in inteiros.items() if q > 0}


def montar_justificativa(
    nome, estoque, seguranca, demanda, reposicao, confianca, base, vendas_janela_grupo, lacuna=None, dias_historico=None
):
    if demanda is None:
        frase = (f"Grupo {nome}: sem histórico suficiente para prever a demanda. "
                 f"Estoque de {estoque} un, mínimo somado de {seguranca} un.")
    elif demanda < DEMANDA_MINIMA_COM_GIRO and reposicao["dadosInsuficientes"]:
        frase = (f"Grupo {nome}: sem vendas nos {dias_historico} dias de dado disponíveis — pouco histórico "
                 f"(menos de {DIAS_MINIMOS_HISTORICO} dias) para concluir que não há giro. "
                 f"Estoque de {estoque} un, mínimo somado de {seguranca} un.")
    elif demanda < DEMANDA_MINIMA_COM_GIRO:
        frase = (f"Grupo {nome}: sem giro previsto nos próximos {HORIZONTE_DIAS} dias. "
                 f"Estoque de {estoque} un, mínimo somado de {seguranca} un.")
    else:
        necessidade = demanda + seguranca
        frase = (f"Grupo {nome}: estoque de {estoque} un cobre {reposicao['coberturaDias']:g} dia(s) da demanda "
                 f"prevista de {demanda:.0f} un em {HORIZONTE_DIAS} dias. "
                 f"Necessidade = demanda + segurança ({seguranca} un) = {necessidade:.0f} un")
        frase += (f"; sugerido comprar {reposicao['quantidadeSugerida']} un." if reposicao["quantidadeSugerida"]
                  else "; o estoque do grupo é suficiente.")
    if base == BASE_HISTORICO:
        if vendas_janela_grupo > 0:
            frase += (f" Vendas nos últimos {JANELA_PARTICIPACAO_MESES} meses: {vendas_janela_grupo:g} un; para a parte "
                      "do grupo sem venda no período, a repartição usou o histórico completo (inclusive o do Excel).")
        else:
            frase += (f" Sem vendas nos últimos {JANELA_PARTICIPACAO_MESES} meses: a demanda foi repartida entre os "
                      "subgrupos (polaridade/caixa) pelo histórico completo de vendas, inclusive o do Excel.")
    elif base == BASE_IGUAL:
        frase += " Sem vendas em todo o histórico: a demanda foi dividida igualmente entre os subgrupos."
    if lacuna:
        frase += f" {lacuna}"
    if confianca == "baixa":
        frase += " Confiança baixa — grupo sem histórico de vendas suficiente."
    elif confianca == "media":
        frase += " Confiança média — histórico de vendas do grupo ainda curto."
    return frase


def montar_grupos(
    skus, demanda_grossa, confianca_grossa, vendas_janela, vendas_total, probabilidade_grossa=None, lacuna_grossa=None,
    dias_historico=None,
):
    """skus: lista de dicts {id, produto, marca, estoque, minimo, classe,
    vendas6m, ultimaVenda} com `classe` vinda de classificar_produto.
    probabilidade_grossa: {grossa: prob|None} do classificador; o grupo herda
    a do seu grupo grosso (a maior, no Fit 38-40). Só informativa.
    Retorna (grupos ordenados por prioridade, demandaPorCategoria)."""
    probabilidade_grossa = probabilidade_grossa or {}
    lacuna_grossa = lacuna_grossa or {}
    # dias_historico: dias com dado real na janela de participação (None = não informado)
    subgrupos_ativos = sorted({chave_subgrupo(s["classe"]) for s in skus})
    demanda_por_grupo, base_por_grupo = repartir_demanda(demanda_grossa, subgrupos_ativos, vendas_janela, vendas_total)

    skus_por_grupo = defaultdict(list)
    for s in skus:
        skus_por_grupo[grupo_do_subgrupo(chave_subgrupo(s["classe"]))].append(s)

    tercis = calcular_tercis(demanda_por_grupo.values())
    grupos = []
    for g, membros in skus_por_grupo.items():
        nome = nome_grupo(g)
        estoque = sum(s["estoque"] for s in membros)
        seguranca = sum(s["minimo"] for s in membros)
        demanda = demanda_por_grupo[g]
        confianca = max(
            (confianca_grossa.get(chave_grossa(s["classe"]), "baixa") for s in membros), key=ORDEM_CONFIANCA.get
        )
        r = calcular_reposicao(estoque, seguranca, demanda, dias_historico)
        lacuna = next((lacuna_grossa[k] for k in sorted({chave_grossa(s["classe"]) for s in membros}) if k in lacuna_grossa), None)
        vendas_janela_grupo = sum(q for sub, q in vendas_janela.items() if grupo_do_subgrupo(sub) == g)
        probs = [probabilidade_grossa.get(chave_grossa(s["classe"])) for s in membros]
        probs = [p for p in probs if p is not None]

        vendas_grupo = sum(s["vendas6m"] for s in membros)
        distribuicao = distribuir_por_participacao(
            r["quantidadeSugerida"], {s["id"]: s["vendas6m"] for s in membros}
        )
        categoria, amperagem, tecnologia, polaridade, caixa = g
        grupos.append(
            {
                "id": "-".join(g).lower().replace(" ", ""),
                "grupo": nome,
                "categoria": CATEGORIA_TITULO[categoria],
                "amperagem": amperagem,
                "tecnologia": tecnologia,
                "polaridade": polaridade,
                "caixa": caixa,
                "estoqueAtual": estoque,
                "estoqueSeguranca": seguranca,
                "demandaPrevista30d": round(demanda, 1) if demanda is not None else None,
                "probabilidadeVenda": round(max(probs), 3) if probs else None,
                "coberturaDias": r["coberturaDias"],
                "quantidadeSugerida": r["quantidadeSugerida"],
                "acao": r["acao"],
                "prioridade": r["prioridade"],
                "giro": classificar_giro(demanda, tercis, r["dadosInsuficientes"]),
                "confianca": confianca,
                "justificativa": montar_justificativa(
                    nome, estoque, seguranca, demanda, r, confianca, base_por_grupo[g], vendas_janela_grupo, lacuna,
                    dias_historico,
                ),
                "skus": [
                    {
                        "id": s["id"],
                        "produto": s["produto"],
                        "marca": s["marca"],
                        "estoqueAtual": s["estoque"],
                        "estoqueMinimo": s["minimo"],
                        "vendas6m": s["vendas6m"],
                        "participacao": round(s["vendas6m"] / vendas_grupo, 3) if vendas_grupo else None,
                        "ultimaVenda": s["ultimaVenda"],
                        "distribuicaoSugerida": distribuicao.get(s["id"], 0),
                    }
                    for s in sorted(membros, key=lambda s: (-s["vendas6m"], s["produto"]))
                ],
            }
        )

    grupos.sort(key=lambda x: (ORDEM_PRIORIDADE[x["prioridade"]], -x["quantidadeSugerida"], x["grupo"]))

    por_categoria = defaultdict(float)
    for x in grupos:
        por_categoria[x["categoria"]] += x["demandaPrevista30d"] or 0
    demanda_por_categoria = [{"categoria": c, "demanda": round(d, 1)} for c, d in sorted(por_categoria.items())]
    return grupos, demanda_por_categoria
