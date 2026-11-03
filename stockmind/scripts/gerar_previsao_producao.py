"""
StockMind — gera a previsão de produção (previsao_atual.json) a partir
do banco real (linha Baterias), usando os modelos já treinados e
validados: regressão linear (quantidade_prevista) + regressão
logística (probabilidade_venda). A probabilidade é do grupo GROSSO
(categoria, amperagem, tecnologia) vender no mês e vai no JSON como
probabilidadeVenda de todos os grupos finos dele (nenhuma tela usa).

GRANULARIDADE — GRUPO, NÃO SKU. Três grãos, definidos em
classificar_produto.py (leia o docstring de lá):
  1. PREVISÃO no grão grosso (categoria, amperagem, tecnologia) — o grão
     em que os modelos foram treinados e validados.
  2. REPARTIÇÃO dessa demanda entre os subgrupos (polaridade, caixa) pela
     participação nas vendas dos últimos 6 meses (reposicao.py).
  3. REPOSIÇÃO por GRUPO (subgrupo, com Fit 38/40AH unidos): estoque do
     grupo = soma dos SKUs, segurança = soma de qtd_minima, comprar =
     max(0, demanda + segurança - estoque), prioridade pela cobertura.
O JSON traz uma linha por grupo com seus SKUs dentro (estoque, vendas e
participação de cada um) — a decisão de marca na compra é do gestor.

O histórico usado para calcular as features de um grupo é a UNIÃO do
histórico do Excel (stockmind/data/processed/treino.csv + teste.csv,
já tratados por preparar_dados.py) com as movimentações reais e
recentes da produção — mesmo grupo, meses somados. O Excel termina em
abr/2026: os meses seguintes só existem na produção.

RODA NA EC2 DE PRODUÇÃO (decisão do usuário — a RDS não é alcançável
daqui). Script batch, sob demanda/periódico — NÃO é servidor, NÃO fica
rodando. Uso:

    cd stockmind
    pip install -r requirements.txt   # uma vez
    export DATABASE_URL="mysql://usuario:senha@host:3306/estoque_premium"
    python scripts/gerar_previsao_producao.py

DEPENDÊNCIA: precisa de stockmind/data/processed/treino.csv e
teste.csv (histórico do Excel já tratado) presentes junto do script na
EC2 — copie a pasta stockmind/ inteira, não só scripts/ e modelos/.

LEITURA APENAS — este script nunca executa INSERT/UPDATE/DELETE. Só
SELECT nas tabelas estoque/movimentacoes/marca.

FORMATO DO JSON: "schema": 2. O frontend recusa qualquer outro valor e
pede para regerar a previsão — mude o número junto com o frontend.

DECISÕES DE DESIGN (leia antes de alterar):

1. "Mês previsto" = o mês em andamento (ou o próximo, se hoje for
   virada de mês) — mesma janela de 30 dias que a tela já promete.
   Meses completos = tudo ANTES do mês corrente. As features (mm3, mm6,
   etc.) são calculadas como se houvesse uma linha nova na grade de
   cada grupo grosso no mês previsto, usando só meses completos
   anteriores — sem vazamento.

2. PERÍODO SEM DADO É FALTANTE, NÃO ZERO (features_producao.py): a
   cobertura de cada fonte é calculada (Excel até a última data da
   planilha, produção desde a primeira movimentação do banco); meses
   fora dela ficam NaN e as médias usam só meses com dado, mês parcial
   proporcionalizado. Grupo com lacuna na janela das médias tem
   confiança no máximo "média" e a justificativa avisa.

3. Grupo grosso sem histórico suficiente (qualquer feature NaN) = NÃO
   inventa previsão: os grupos dele ficam com demanda None e
   confianca="baixa"; a reposição cai na regra "sem previsão" (só repor
   mínimo). Produto sem amperagem extraível do nome não tem grupo e é
   contado no resumo impresso no final.

4. Giro (tercis) é calculado sobre a demanda dos GRUPOS, uma vez por
   grupo — nunca por SKU.

5. EXCLUSÃO DE NEGÓCIO: "Terminal Bateria" é acessório, não bateria —
   removido do pipeline por completo logo após a leitura do banco (o
   cadastro real não é alterado). Lista fechada, comparação
   case-insensitive por nome; qualquer outra exclusão futura do mesmo
   tipo entra em EXCLUSOES_NOME_NEGOCIO.

6. estoqueAtual usa saldo_estoque(), que ESPELHA saldoDe()/
   emEstoqueDe() de estoqueResumo.routes.js — em_estoque é um cache que
   costuma vir NULL; o saldo real vem de qtd_inicial+entradas-saidas.
   Ler só em_estoque zerava o estoque de todo produto sem esse cache.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text

from classificar_produto import (
    MAPA_CATEGORIA_BASE_EXCEL,
    chave_grossa,
    classificar_produto,
    codigo_do_produto,
    polaridade_assumida,
)
from features_producao import (
    COLUNAS_GROSSA,
    FEATURE_COLS_PRODUCAO,
    calcular_features_por_grupo,
    classificar_confianca,
    descrever_lacuna,
    dias_cobertos_na_janela,
    intervalos_de_cobertura,
)
from reposicao import (
    COBERTURA_ALTA_DIAS,
    COBERTURA_MEDIA_DIAS,
    DIAS_MINIMOS_HISTORICO,
    HORIZONTE_DIAS,
    JANELA_PARTICIPACAO_MESES,
    montar_grupos,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent.parent
MODELOS_DIR = BASE_DIR / "modelos"
SAIDA_DIR = BASE_DIR / "saida"
PROCESSED_DIR = BASE_DIR / "data" / "processed"

SCHEMA_JSON = 2

COLUNAS_SUBGRUPO = COLUNAS_GROSSA + ["polaridade", "caixa"]

# Exclusão de negócio (não é falta de histórico, é "não é bateria") — ver
# docstring do módulo, item 4. Nome completo (produto+modelo via
# montar_nome_produto), comparação case-insensitive.
EXCLUSOES_NOME_NEGOCIO = {"terminal bateria"}


def linha(titulo=""):
    print()
    print("=" * 70)
    if titulo:
        print(titulo)
        print("=" * 70)


def montar_engine():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit(
            "DATABASE_URL não definida no ambiente. Defina a mesma connection "
            "string que o backend Node usa em produção (mysql://usuario:senha@host:porta/banco)."
        )
    if url.startswith("mysql://"):
        url = "mysql+pymysql://" + url[len("mysql://"):]
    return create_engine(url)


def carregar_dados_producao(engine):
    """Só SELECT. Produtos ativos (marca.ativo=1) da linha Baterias, todo o
    histórico de SAIDA e a data da primeira movimentação de qualquer tipo
    (início da cobertura de dados da produção; None se não há movimentação)."""
    with engine.connect() as conn:
        produtos = pd.read_sql(
            text(
                """
                SELECT e.id, e.produto, e.modelo, e.qtd_minima, e.em_estoque,
                       e.qtd_inicial, e.entradas, e.saidas, m.nome AS marca
                FROM estoque e
                JOIN marca m ON m.id = e.marca_id
                WHERE m.ativo = 1
                """
            ),
            conn,
        )
        movimentos = pd.read_sql(
            text(
                """
                SELECT produto_id, quantidade, data_movimentacao
                FROM movimentacoes
                WHERE tipo = 'SAIDA'
                """
            ),
            conn,
        )
        inicio_producao = conn.execute(text("SELECT MIN(data_movimentacao) FROM movimentacoes")).scalar()
    return produtos, movimentos, pd.Timestamp(inicio_producao) if inicio_producao is not None else None


def saldo_estoque(em_estoque, qtd_inicial, entradas, saidas):
    """Saldo real de estoque — ESPELHA intencionalmente saldoDe()/
    emEstoqueDe() de backend/src/routes/estoqueResumo.routes.js:22-31
    (mesma lógica também em movimentacoes.routes.js:175-178/474-476).
    NÃO reimplementar diferente: em_estoque é um cache que costuma vir
    NULL (confirmado com dado real — produto id=38, Acdelco ADR60HD, um
    dos de maior giro do catálogo, tinha em_estoque=NULL e saldo real 8
    via qtd_inicial+entradas-saidas); usar só em_estoque e cair pra 0 no
    NULL zera o estoque de todo produto sem cache preenchido.
    """
    bruto = (
        float(em_estoque)
        if em_estoque is not None and pd.notna(em_estoque)
        else float(qtd_inicial or 0) + float(entradas or 0) - float(saidas or 0)
    )
    if not np.isfinite(bruto):
        bruto = 0.0
    return max(0, int(round(bruto)))


def montar_nome_produto(produto, modelo):
    """Concatena produto+modelo pra exibição, sem duplicar quando modelo já
    está embutido em produto (ex.: id=111 tem produto="ONBAT F60DN 60AH" E
    modelo="60AH" — cadastro inconsistente com o resto da tabela, que não
    repete a amperagem em produto; sem essa checagem viraria "...60AH 60AH")."""
    produto = (produto or "").strip()
    modelo = (modelo or "").strip()
    if not modelo or produto.upper().endswith(modelo.upper()):
        return produto
    return f"{produto} {modelo}"


def _expandir_classe(df, coluna_classe):
    """Abre o dict de classificar_produto em colunas e descarta quem não
    tem grupo (classe None)."""
    df = df[df[coluna_classe].notna()].copy()
    classes = pd.DataFrame(df[coluna_classe].tolist(), index=df.index, columns=COLUNAS_SUBGRUPO)
    return df.drop(columns=[coluna_classe]).join(classes)


def carregar_historico_excel():
    """Lê treino.csv + teste.csv (já tratados por preparar_dados.py),
    classifica cada produto (mesma regra da produção) e agrega quantidade
    mensal por SUBGRUPO. Retorna (DataFrame [COLUNAS_SUBGRUPO, mes, quantidade],
    primeira data, última data da planilha)."""
    treino = pd.read_csv(PROCESSED_DIR / "treino.csv", parse_dates=["data"])
    teste = pd.read_csv(PROCESSED_DIR / "teste.csv", parse_dates=["data"])
    df = pd.concat([treino, teste], ignore_index=True)

    info_produto = (
        df.groupby("produto")
        .agg(categoria_original=("categoria", "first"), amperagem=("amperagem_ah", "first"))
        .reset_index()
    )
    classe_por_produto = {
        r.produto: classificar_produto(r.produto, MAPA_CATEGORIA_BASE_EXCEL.get(r.categoria_original), r.amperagem)
        for r in info_produto.itertuples()
    }
    df["classe"] = df["produto"].map(classe_por_produto)
    df = _expandir_classe(df.drop(columns=["categoria"]), "classe")
    df["mes"] = df["data"].values.astype("datetime64[M]")
    mensal = df.groupby(COLUNAS_SUBGRUPO + ["mes"], as_index=False)["quantidade"].sum()
    return mensal, df["data"].min(), df["data"].max()


def carregar_historico_producao(movimentos, classe_por_id):
    """Junta movimentações reais da produção com o subgrupo de cada produto
    e agrega quantidade mensal."""
    movimentos = movimentos.copy()
    movimentos["data_movimentacao"] = pd.to_datetime(movimentos["data_movimentacao"])
    movimentos["mes"] = movimentos["data_movimentacao"].values.astype("datetime64[M]")
    movimentos["classe"] = movimentos["produto_id"].map(classe_por_id)
    movimentos = _expandir_classe(movimentos, "classe")
    return movimentos.groupby(COLUNAS_SUBGRUPO + ["mes"], as_index=False)["quantidade"].sum()


def prever_demanda_grossa(features_grupo, chaves_ativas):
    """Aplica os modelos aos grupos grossos que têm SKU ativo. Retorna
    ({grossa: demanda|None}, {grossa: confianca})."""
    reg = joblib.load(MODELOS_DIR / "regressao_linear.pkl")
    clf = joblib.load(MODELOS_DIR / "classificador.pkl")
    demanda, confianca, probabilidade = {}, {}, {}
    prontos = []
    for chave in chaves_ativas:
        if chave in features_grupo.index:
            confianca[chave] = classificar_confianca(features_grupo.loc[chave])
            if features_grupo.loc[chave, FEATURE_COLS_PRODUCAO].notna().all():
                prontos.append(chave)
                continue
        else:
            confianca[chave] = "baixa"
        demanda[chave] = None
        probabilidade[chave] = None
    if prontos:
        X = features_grupo.loc[prontos, FEATURE_COLS_PRODUCAO]
        previstos = np.clip(reg.predict(X), a_min=0, a_max=None)
        for chave, previsto, prob in zip(prontos, previstos, clf.predict_proba(X)[:, 1]):
            demanda[chave] = float(previsto)
            probabilidade[chave] = float(prob)
    return demanda, confianca, probabilidade


def vendas_por_subgrupo(historico, inicio=None, fim=None):
    """{subgrupo: unidades vendidas}, opcionalmente só em [inicio, fim)."""
    h = historico
    if inicio is not None:
        h = h[(h["mes"] >= inicio) & (h["mes"] < fim)]
    soma = h.groupby(COLUNAS_SUBGRUPO)["quantidade"].sum()
    return {chave: float(q) for chave, q in soma.items() if q > 0}


def gerar_payload(produtos, movimentos, agora, inicio_producao):
    linha("2. CLASSIFICAR PRODUTOS ATIVOS EM GRUPOS (categoria, amperagem, tecnologia, polaridade, caixa)")
    mes_previsto = pd.Timestamp(year=agora.year, month=agora.month, day=1)
    print(f"Mês previsto (janela de {HORIZONTE_DIAS} dias): {mes_previsto.strftime('%Y-%m')}")

    classe_por_id = {
        int(p["id"]): classificar_produto(montar_nome_produto(p["produto"], p["modelo"]))
        for _, p in produtos.iterrows()
    }
    sem_grupo = [i for i, c in classe_por_id.items() if c is None]
    print(f"Produtos sem grupo identificável (sem amperagem extraível do nome): {len(sem_grupo)}/{len(produtos)}")
    for i in sem_grupo:
        print(f"  - [{i}] {montar_nome_produto(*produtos.loc[produtos['id'] == i, ['produto', 'modelo']].iloc[0])}")
    classe_por_id = {i: c for i, c in classe_por_id.items() if c is not None}

    for _, p in produtos.iterrows():
        classe = classe_por_id.get(int(p["id"]))
        nome = montar_nome_produto(p["produto"], p["modelo"])
        if classe and polaridade_assumida(nome, classe["categoria"]):
            print(f"AVISO polaridade assumida NORMAL (código '{codigo_do_produto(nome)}' não termina em D/E): "
                  f"[{int(p['id'])}] {nome}")

    # ------------------------------------------------------------------
    linha("3. HISTÓRICO — EXCEL (todo) + PRODUÇÃO (movimentações reais)")
    historico_excel, excel_ini, excel_fim = carregar_historico_excel()
    intervalos = intervalos_de_cobertura(excel_ini, excel_fim, inicio_producao, mes_previsto)
    # onde o Excel tem dado, ele vale: produção só depois do fim da planilha
    depois_do_excel = pd.to_datetime(movimentos["data_movimentacao"]) >= excel_fim.normalize() + pd.Timedelta(days=1)
    historico_producao = carregar_historico_producao(movimentos[depois_do_excel], classe_por_id)
    print(f"Linhas subgrupo x mês — Excel: {len(historico_excel)} | Produção: {len(historico_producao)}")
    print(f"Cobertura de dados: Excel {excel_ini.date()} a {excel_fim.date()}; produção desde "
          f"{inicio_producao.date() if inicio_producao is not None else 'nunca'}.")
    for (_, fim_a), (ini_b, _) in zip(intervalos, intervalos[1:]):
        print(f"  LACUNA sem dado de {fim_a.date()} a {(ini_b - pd.Timedelta(days=1)).date()} — tratada como "
              "faltante (NaN), não como venda zero.")
    historico = (
        pd.concat([historico_excel, historico_producao], ignore_index=True)
        .groupby(COLUNAS_SUBGRUPO + ["mes"], as_index=False)["quantidade"]
        .sum()
    )
    historico_grosso = historico.groupby(COLUNAS_GROSSA + ["mes"], as_index=False)["quantidade"].sum()

    # ------------------------------------------------------------------
    linha("4. PREVER A DEMANDA NO GRÃO GROSSO (o validado)")
    features_grupo = calcular_features_por_grupo(historico_grosso, mes_previsto, intervalos)
    chaves_ativas = sorted({chave_grossa(c) for c in classe_por_id.values()})
    demanda_grossa, confianca_grossa, probabilidade_grossa = prever_demanda_grossa(features_grupo, chaves_ativas)
    lacuna_grossa = {
        chave: descrever_lacuna(features_grupo.loc[chave]) for chave in chaves_ativas if chave in features_grupo.index
    }
    lacuna_grossa = {c: t for c, t in lacuna_grossa.items() if t}
    com_previsao = sum(1 for d in demanda_grossa.values() if d is not None)
    print(f"Grupos grossos ativos com previsão calculada: {com_previsao}/{len(chaves_ativas)}"
          f" | com lacuna na janela das médias: {len(lacuna_grossa)}")

    # ------------------------------------------------------------------
    linha("5. REPARTIR POR PARTICIPAÇÃO E CALCULAR A REPOSIÇÃO POR GRUPO")
    inicio_janela = mes_previsto - pd.DateOffset(months=JANELA_PARTICIPACAO_MESES)
    dias_historico = dias_cobertos_na_janela(intervalos, mes_previsto, JANELA_PARTICIPACAO_MESES)
    print(f"Dias com dado real nos últimos {JANELA_PARTICIPACAO_MESES} meses: {dias_historico} "
          f"(mínimo para concluir 'sem giro': {DIAS_MINIMOS_HISTORICO})")
    vendas_janela = vendas_por_subgrupo(historico, inicio_janela, mes_previsto)
    vendas_total = vendas_por_subgrupo(historico)

    mov = movimentos.copy()
    mov["data_movimentacao"] = pd.to_datetime(mov["data_movimentacao"])
    mov_janela = mov[(mov["data_movimentacao"] >= inicio_janela) & (mov["data_movimentacao"] < mes_previsto)]
    vendas_sku = mov_janela.groupby("produto_id")["quantidade"].sum().to_dict()
    ultima_venda_sku = mov.groupby("produto_id")["data_movimentacao"].max().dt.strftime("%Y-%m-%d").to_dict()

    skus = []
    for _, p in produtos.iterrows():
        pid = int(p["id"])
        if pid not in classe_por_id:
            continue
        skus.append(
            {
                "id": pid,
                "produto": montar_nome_produto(p["produto"], p["modelo"]),
                "marca": p["marca"],
                "estoque": saldo_estoque(p["em_estoque"], p["qtd_inicial"], p["entradas"], p["saidas"]),
                "minimo": int(p["qtd_minima"]) if pd.notna(p["qtd_minima"]) else 0,
                "classe": classe_por_id[pid],
                "vendas6m": int(vendas_sku.get(pid, 0)),
                "ultimaVenda": ultima_venda_sku.get(pid),
            }
        )

    grupos, demanda_por_categoria = montar_grupos(
        skus, demanda_grossa, confianca_grossa, vendas_janela, vendas_total, probabilidade_grossa, lacuna_grossa,
        dias_historico,
    )
    print(f"{len(skus)} SKUs -> {len(grupos)} grupos")

    payload = {
        "schema": SCHEMA_JSON,
        "gerado_em": agora.isoformat(),
        "mes_previsto": mes_previsto.strftime("%Y-%m"),
        "parametros": {
            "coberturaAltaDias": COBERTURA_ALTA_DIAS,
            "coberturaMediaDias": COBERTURA_MEDIA_DIAS,
            "horizonteDias": HORIZONTE_DIAS,
            "janelaParticipacaoMeses": JANELA_PARTICIPACAO_MESES,
            "diasHistoricoJanela": dias_historico,
            "diasMinimosHistorico": DIAS_MINIMOS_HISTORICO,
        },
        "grupos": grupos,
        "demandaPorCategoria": demanda_por_categoria,
    }
    return payload, len(sem_grupo)


def main():
    linha("1. CONECTAR (leitura) E LER PRODUTOS/MOVIMENTAÇÕES REAIS")
    engine = montar_engine()
    produtos, movimentos, inicio_producao = carregar_dados_producao(engine)
    print(f"Produtos ativos (Baterias, marca.ativo=1): {len(produtos)}")

    nomes_completos = produtos.apply(lambda p: montar_nome_produto(p["produto"], p["modelo"]), axis=1)
    mascara_excluido = nomes_completos.str.lower().isin(EXCLUSOES_NOME_NEGOCIO)
    if mascara_excluido.any():
        excluidos = nomes_completos[mascara_excluido].tolist()
        produtos = produtos[~mascara_excluido].reset_index(drop=True)
        print(f"Excluídos por decisão de negócio (não é bateria, ver docstring): {excluidos}")
    print(f"Produtos no pipeline após exclusões de negócio: {len(produtos)}")
    print(f"Linhas de SAIDA no histórico (produção): {len(movimentos)}")

    payload, n_sem_grupo = gerar_payload(produtos, movimentos, datetime.now(timezone.utc), inicio_producao)

    SAIDA_DIR.mkdir(parents=True, exist_ok=True)
    caminho_saida = SAIDA_DIR / "previsao_atual.json"
    with open(caminho_saida, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    linha("6. RESUMO")
    print(f"JSON gerado em: {caminho_saida}")
    grupos = payload["grupos"]
    print(f"Grupos: {len(grupos)} | produtos sem grupo identificável: {n_sem_grupo}")
    for prioridade in ("alta", "media", "baixa"):
        print(f"  prioridade {prioridade}: {sum(1 for g in grupos if g['prioridade'] == prioridade)}")
    print(f"  dados insuficientes: {sum(1 for g in grupos if g['giro'] == 'dados_insuficientes')}"
          f" | sem giro: {sum(1 for g in grupos if g['giro'] == 'sem_giro')}")
    sem_previsao = [g for g in grupos if g["demandaPrevista30d"] is None]
    print(f"Grupos sem previsão (confiança baixa, só repor mínimo): {len(sem_previsao)}")
    for g in sem_previsao[:20]:
        print(f"  - {g['grupo']}")

    linha("FIM")


if __name__ == "__main__":
    main()
