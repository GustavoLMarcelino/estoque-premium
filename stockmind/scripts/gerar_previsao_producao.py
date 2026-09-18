"""
StockMind — gera a previsão de produção (previsao_atual.json) a partir
do banco real (linha Baterias), usando os modelos já treinados e
validados: regressão linear (quantidade_prevista) + regressão
logística (probabilidade_venda, limiar 0.4).

GRANULARIDADE — GRUPO, NÃO SKU: a previsão é calculada por GRUPO
(categoria, amperagem exata, tecnologia) e a MESMA previsão é atribuída
a todos os produtos ativos daquele grupo (ex.: todos os "60AH
Convencional Carro" recebem o mesmo número; o gestor decide a marca na
hora da compra). Isso substitui a tentativa de casamento produto-a-
produto entre Excel e produção (que só casava 6.5-19.6% dos nomes) —
amperagem e tecnologia extraem de forma robusta dos dois lados, então
todo produto ativo encontra seu grupo, mesmo quando o SKU exato nunca
apareceu no Excel. Ver gerar_features.py para a regra de categorização
completa (documentada também abaixo, categoria_final()).

O histórico usado para calcular as features de um grupo é a UNIÃO do
histórico do Excel (stockmind/data/processed/treino.csv + teste.csv,
já tratados por preparar_dados.py) com as movimentações reais e
recentes da produção — mesmo grupo, meses somados. Isso é o que
permite prever grupos que só têm SKUs novos na produção (sem venda
própria ainda) usando o histórico real do Excel daquele mesmo perfil de
bateria.

RODA NA EC2 DE PRODUÇÃO (decisão do usuário — a RDS não é alcançável
daqui). Script batch, sob demanda/periódico — NÃO é servidor, NÃO fica
rodando. Uso:

    cd stockmind
    pip install -r requirements.txt   # uma vez
    export DATABASE_URL="mysql://usuario:senha@host:3306/estoque_premium"
    python scripts/gerar_previsao_producao.py

DEPENDÊNCIA NOVA: precisa de stockmind/data/processed/treino.csv e
teste.csv (histórico do Excel já tratado) presentes junto do script na
EC2 — copie a pasta stockmind/ inteira, não só scripts/ e modelos/.

LEITURA APENAS — este script nunca executa INSERT/UPDATE/DELETE. Só
SELECT nas tabelas estoque/movimentacoes/marca.

DECISÕES DE DESIGN (leia antes de alterar):

1. "Mês previsto" = o mês em andamento (ou o próximo, se hoje for
   virada de mês) — mesma janela de 30 dias que a tela já promete.
   Meses completos = tudo ANTES do mês corrente. As features (mm3, mm6,
   etc.) são calculadas como se houvesse uma linha nova na grade de
   cada GRUPO no mês previsto, usando só meses completos anteriores —
   sem vazamento.

2. Grupo sem histórico suficiente (qualquer feature NaN, incluindo
   grupos que não existem nem no Excel nem na produção) = mesma
   política de sempre: NÃO inventa previsão. quantidade_prevista e
   probabilidade_venda ficam None, confianca="baixa", e o produto é
   contado explicitamente no resumo impresso no final. Produto sem
   amperagem extraível do nome (raro, ver relatório) também cai aqui —
   sem grupo identificável, sem previsão.

3. Mapeamento pro formato do mockData.js (giro/quantidadeSugerida/
   justificativa/prioridade/confianca) é uma heurística de negócio v1 —
   não veio de nenhum requisito formal do RFC além do nome dos campos.
   giro (tercis de mm3) é calculado sobre os GRUPOS únicos, não
   duplicado por produto — senão categorias com mais SKUs distorceriam
   os tercis.

4. EXCLUSÃO DE NEGÓCIO: "Terminal Bateria" é acessório, não bateria —
   não faz sentido prever demanda dele (nem tem amperagem, então nunca
   teria grupo). Removido do pipeline por completo (não aparece no
   JSON de saída, nem como confiança baixa) logo após a leitura do
   banco — o cadastro real no Estoque Premium não é alterado, é só
   este script que ignora esse produto. Lista fechada, comparação
   case-insensitive por nome; qualquer outra exclusão futura do mesmo
   tipo entra em EXCLUSOES_NOME_NEGOCIO.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent.parent
MODELOS_DIR = BASE_DIR / "modelos"
SAIDA_DIR = BASE_DIR / "saida"
PROCESSED_DIR = BASE_DIR / "data" / "processed"

FEATURE_COLS_PRODUCAO = [
    "mm3",
    "mm6",
    "mes_sin",
    "mes_cos",
    "qty_mesmo_mes_ano_anterior",
    "tempo_desde_ultima_venda_meses",
]
LIMIAR_CLASSIFICADOR = 0.4  # mesmo valor validado em explorar_limiar.py

RE_AMPERAGEM = re.compile(r"(\d+(?:[.,]\d+)?)\s*AH\b", re.IGNORECASE)
MAPA_CATEGORIA_BASE_EXCEL = {"convencional": "carro", "moto": "moto", "estacionaria": "estacionaria"}
CATEGORIA_TITULO = {"carro": "Carro", "moto": "Moto", "estacionaria": "Estacionária", "caminhao": "Caminhão"}

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


def mes_idx(ts):
    return ts.year * 12 + ts.month


def carregar_dados_producao(engine):
    """Só SELECT. Produtos ativos (marca.ativo=1) da linha Baterias e todo
    o histórico de SAIDA."""
    with engine.connect() as conn:
        produtos = pd.read_sql(
            text(
                """
                SELECT e.id, e.produto, e.modelo, e.qtd_minima, e.em_estoque
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
    return produtos, movimentos


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


def extrair_tecnologia(nome):
    nome_upper = nome.upper()
    if "EFB" in nome_upper:
        return "EFB"
    if "AGM" in nome_upper:
        return "AGM"
    return "Convencional"


def extrair_amperagem(nome):
    m = RE_AMPERAGEM.search(nome)
    return float(m.group(1).replace(",", ".")) if m else None


def categoria_base_producao(nome):
    """Heurística de texto — mesma de sempre, agora só o ponto de partida
    antes da regra de reclassificação (ver categoria_final)."""
    texto = nome.lower()
    if "moto" in texto:
        return "moto"
    if "caminh" in texto:
        return "caminhao"
    if "estacion" in texto or "nobreak" in texto:
        return "estacionaria"
    return "carro"


def categoria_final(nome, categoria_base, amperagem, tecnologia):
    """Regra de categorização final, idêntica à de gerar_features.py.
    Cadeia if/elif — ordem de prioridade importa:
      1. nome começa com "DF" + dígito -> estacionaria (linha comercial
         "DF", mal categorizada — 40-150AH é incompatível com bateria
         estacionária/nobreak real, ~1-20AH; convenção de nome sem marca
         é uma linha comercial/pesada separada)
      2. "nicoll" no nome -> estacionaria
      3. amperagem >= 100 E tecnologia == Convencional -> caminhao
      3.5. "estacion"/"nobreak" no nome -> estacionaria (protege
           nobreaks reais, ex.: ECON EP12/Moura 1.3, 1.3AH — sem essa
           regra ANTES da 4, amperagem<38 os classificaria como moto
           incorretamente)
      4. amperagem < 38 -> moto (baterias pequenas cujo nome não
         contém literalmente "moto" — ex.: série MBR/HTZ/HTX)
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
    categoria_titulo = CATEGORIA_TITULO.get(categoria, categoria)
    amp_fmt = f"{amperagem:g}AH" if amperagem is not None and pd.notna(amperagem) else "?AH"
    return f"{amp_fmt} {tecnologia} {categoria_titulo}"


def calcular_grupo_produtos_ativos(produtos):
    """Para cada produto ativo, extrai amperagem/tecnologia do nome e
    aplica a regra de categorização. Retorna DataFrame indexado por
    produto_id com categoria/amperagem/tecnologia/grupo (chave) e
    grupo_exibicao (string). Produto sem amperagem extraível fica com
    grupo=None (sem grupo identificável, ver docstring do módulo)."""
    linhas = []
    for _, p in produtos.iterrows():
        nome = montar_nome_produto(p["produto"], p["modelo"])
        amp = extrair_amperagem(nome)
        tec = extrair_tecnologia(nome)
        cat_base = categoria_base_producao(nome)
        cat_final = categoria_final(nome, cat_base, amp, tec) if amp is not None else None
        grupo_chave = (cat_final, amp, tec) if amp is not None else None
        grupo_exib = montar_grupo_exibicao(cat_final, amp, tec) if amp is not None else None
        linhas.append(
            {
                "produto_id": p["id"],
                "categoria_final": cat_final,
                "amperagem": amp,
                "tecnologia": tec if amp is not None else None,
                "grupo_chave": grupo_chave,
                "grupo_exibicao": grupo_exib,
            }
        )
    return pd.DataFrame(linhas).set_index("produto_id")


def carregar_historico_excel():
    """Lê treino.csv + teste.csv (já tratados por preparar_dados.py),
    reclassifica categoria por produto (mesma regra) e agrega quantidade
    mensal por GRUPO. Retorna DataFrame [categoria_final, amperagem,
    tecnologia, mes, quantidade]."""
    treino = pd.read_csv(PROCESSED_DIR / "treino.csv", parse_dates=["data"])
    teste = pd.read_csv(PROCESSED_DIR / "teste.csv", parse_dates=["data"])
    df = pd.concat([treino, teste], ignore_index=True)

    info_produto = (
        df.groupby("produto")
        .agg(categoria_original=("categoria", "first"), amperagem=("amperagem_ah", "first"))
        .reset_index()
    )
    info_produto["categoria_base"] = info_produto["categoria_original"].map(MAPA_CATEGORIA_BASE_EXCEL)
    info_produto["tecnologia"] = info_produto["produto"].apply(extrair_tecnologia)
    info_produto["categoria_final"] = info_produto.apply(
        lambda r: categoria_final(r["produto"], r["categoria_base"], r["amperagem"], r["tecnologia"]), axis=1
    )

    cat_por_produto = info_produto.set_index("produto")["categoria_final"].to_dict()
    amp_por_produto = info_produto.set_index("produto")["amperagem"].to_dict()
    tec_por_produto = info_produto.set_index("produto")["tecnologia"].to_dict()

    df["categoria_final"] = df["produto"].map(cat_por_produto)
    df["amperagem"] = df["produto"].map(amp_por_produto)
    df["tecnologia"] = df["produto"].map(tec_por_produto)
    df["mes"] = df["data"].values.astype("datetime64[M]")

    mensal = df.groupby(["categoria_final", "amperagem", "tecnologia", "mes"], as_index=False)["quantidade"].sum()
    return mensal


def carregar_historico_producao_por_grupo(movimentos, grupo_por_produto):
    """Junta movimentações reais da produção com o grupo de cada produto
    e agrega quantidade mensal por GRUPO."""
    movimentos = movimentos.copy()
    movimentos["data_movimentacao"] = pd.to_datetime(movimentos["data_movimentacao"])
    movimentos["mes"] = movimentos["data_movimentacao"].values.astype("datetime64[M]")
    movimentos = movimentos.join(grupo_por_produto[["categoria_final", "amperagem", "tecnologia"]], on="produto_id")
    movimentos = movimentos.dropna(subset=["categoria_final"])  # produto sem grupo identificável não entra
    mensal = movimentos.groupby(["categoria_final", "amperagem", "tecnologia", "mes"], as_index=False)[
        "quantidade"
    ].sum()
    return mensal


def calcular_features_por_grupo(historico_combinado, mes_previsto):
    """Mesma lógica de sempre (grade zero-fill + mm3/mm6/etc.), agora por
    GRUPO em vez de por produto_id. Retorna DataFrame indexado por
    (categoria_final, amperagem, tecnologia)."""
    idx_previsto = mes_idx(mes_previsto)
    ultimo_mes_completo = mes_previsto - pd.DateOffset(months=1)
    idx_ultimo_completo = mes_idx(ultimo_mes_completo)

    historico_combinado = historico_combinado[historico_combinado["mes"] <= ultimo_mes_completo]

    chave_grupo = ["categoria_final", "amperagem", "tecnologia"]
    linhas_feature = []
    for (cat, amp, tec), grupo in historico_combinado.groupby(chave_grupo):
        primeiro_idx = mes_idx(grupo["mes"].min())
        n_meses = idx_ultimo_completo - primeiro_idx + 1
        if n_meses <= 0:
            continue
        meses_full = pd.date_range(start=grupo["mes"].min(), periods=n_meses, freq="MS")
        grade = pd.DataFrame({"mes": meses_full})
        grade = grade.merge(grupo[["mes", "quantidade"]], on="mes", how="left")
        grade["quantidade"] = grade["quantidade"].fillna(0.0)
        grade = grade.sort_values("mes").reset_index(drop=True)
        grade["mes_idx"] = grade["mes"].apply(mes_idx)

        mm3 = grade["quantidade"].tail(3).mean() if len(grade) >= 3 else np.nan
        mm6 = grade["quantidade"].tail(6).mean() if len(grade) >= 6 else np.nan

        linha_ano_anterior = grade[grade["mes_idx"] == idx_previsto - 12]
        qty_ano_anterior = linha_ano_anterior["quantidade"].iloc[0] if len(linha_ano_anterior) else np.nan

        vendas_positivas = grade[grade["quantidade"] > 0]
        tempo_desde_ultima = (
            idx_previsto - vendas_positivas["mes_idx"].max() if len(vendas_positivas) else np.nan
        )

        linhas_feature.append(
            {
                "categoria_final": cat,
                "amperagem": amp,
                "tecnologia": tec,
                "mm3": mm3,
                "mm6": mm6,
                "qty_mesmo_mes_ano_anterior": qty_ano_anterior,
                "tempo_desde_ultima_venda_meses": tempo_desde_ultima,
            }
        )

    features = (
        pd.DataFrame(linhas_feature).set_index(chave_grupo)
        if linhas_feature
        else pd.DataFrame(columns=chave_grupo + ["mm3", "mm6", "qty_mesmo_mes_ano_anterior", "tempo_desde_ultima_venda_meses"]).set_index(chave_grupo)
    )
    features["mes_sin"] = np.sin(2 * np.pi * mes_previsto.month / 12)
    features["mes_cos"] = np.cos(2 * np.pi * mes_previsto.month / 12)
    return features


def classificar_confianca(features_row):
    if features_row[FEATURE_COLS_PRODUCAO].isna().all():
        return "baixa"
    if features_row[FEATURE_COLS_PRODUCAO].isna().any():
        return "media"
    return "alta"


def classificar_giro(mm3, tercis):
    if pd.isna(mm3):
        return "baixa_confianca"
    if mm3 >= tercis[1]:
        return "alto"
    if mm3 >= tercis[0]:
        return "medio"
    return "baixo"


def montar_justificativa(giro, confianca, em_risco, demanda30, grupo_exib):
    if not em_risco:
        return None
    partes = []
    if giro == "alto":
        partes.append(f"grupo {grupo_exib} de alto giro" if grupo_exib else "produto de alto giro")
    elif giro == "medio":
        partes.append(f"grupo {grupo_exib} de giro médio" if grupo_exib else "produto de giro médio")
    elif giro == "baixo":
        partes.append(f"grupo {grupo_exib} de giro baixo" if grupo_exib else "produto de giro baixo")
    else:
        partes.append("sem histórico suficiente para prever giro (grupo sem dado no Excel nem na produção)")
    partes.append("estoque abaixo ou no limite do mínimo configurado")
    if demanda30 is not None:
        partes.append(f"previsão de venda de {demanda30} unidade(s) nos próximos 30 dias para esse grupo")
    frase = ", ".join(partes) + "."
    if confianca == "baixa":
        frase += " Confiança baixa — grupo sem histórico de vendas suficiente."
    elif confianca == "media":
        frase += " Confiança média — histórico de vendas do grupo ainda curto."
    return frase[0].upper() + frase[1:]


def main():
    linha("1. CONECTAR (leitura) E LER PRODUTOS/MOVIMENTAÇÕES REAIS")
    engine = montar_engine()
    produtos, movimentos = carregar_dados_producao(engine)
    print(f"Produtos ativos (Baterias, marca.ativo=1): {len(produtos)}")

    nomes_completos = produtos.apply(lambda p: montar_nome_produto(p["produto"], p["modelo"]), axis=1)
    mascara_excluido = nomes_completos.str.lower().isin(EXCLUSOES_NOME_NEGOCIO)
    if mascara_excluido.any():
        excluidos = nomes_completos[mascara_excluido].tolist()
        produtos = produtos[~mascara_excluido].reset_index(drop=True)
        print(f"Excluídos por decisão de negócio (não é bateria, ver docstring): {excluidos}")
    print(f"Produtos no pipeline após exclusões de negócio: {len(produtos)}")
    print(f"Linhas de SAIDA no histórico (produção): {len(movimentos)}")

    agora = datetime.now(timezone.utc)
    mes_previsto = pd.Timestamp(year=agora.year, month=agora.month, day=1)
    print(f"Mês previsto (janela de 30 dias): {mes_previsto.strftime('%Y-%m')}")

    # ------------------------------------------------------------------
    linha("2. CALCULAR GRUPO (categoria, amperagem, tecnologia) POR PRODUTO ATIVO")
    grupo_por_produto = calcular_grupo_produtos_ativos(produtos)
    sem_grupo = grupo_por_produto["grupo_chave"].isna().sum()
    print(f"Produtos sem grupo identificável (sem amperagem extraível do nome): {sem_grupo}/{len(produtos)}")

    grupos_ativos = grupo_por_produto["grupo_chave"].dropna().unique()
    print(f"Grupos distintos formados pelos {len(produtos)} produtos ativos: {len(grupos_ativos)}")
    print("\nDistribuição por categoria final:")
    print(grupo_por_produto["categoria_final"].value_counts(dropna=False).to_string())

    # ------------------------------------------------------------------
    linha("3. HISTÓRICO POR GRUPO — EXCEL (todo) + PRODUÇÃO (movimentações reais)")
    historico_excel = carregar_historico_excel()
    historico_producao = carregar_historico_producao_por_grupo(movimentos, grupo_por_produto)
    print(f"Linhas grupo x mês — Excel: {len(historico_excel)} | Produção: {len(historico_producao)}")

    historico_combinado = (
        pd.concat([historico_excel, historico_producao], ignore_index=True)
        .groupby(["categoria_final", "amperagem", "tecnologia", "mes"], as_index=False)["quantidade"]
        .sum()
    )
    grupos_com_historico_excel = set(
        historico_excel[["categoria_final", "amperagem", "tecnologia"]].drop_duplicates().itertuples(index=False, name=None)
    )
    grupos_ativos_com_historico_excel = sum(1 for g in grupos_ativos if g in grupos_com_historico_excel)
    print(
        f"Dos {len(grupos_ativos)} grupos ativos na produção, {grupos_ativos_com_historico_excel} "
        "já existiam no histórico do Excel (previsão fundamentada em dado real de venda)."
    )
    print(
        f"Os outros {len(grupos_ativos) - grupos_ativos_com_historico_excel} dependem só de "
        "movimentação própria da produção (ou ficam sem histórico nenhum, ver seção 5)."
    )

    # ------------------------------------------------------------------
    linha("4. CALCULAR FEATURES POR GRUPO E PREVER")
    features_grupo = calcular_features_por_grupo(historico_combinado, mes_previsto)

    reg = joblib.load(MODELOS_DIR / "regressao_linear.pkl")
    clf = joblib.load(MODELOS_DIR / "classificador.pkl")

    if len(features_grupo):
        X = features_grupo[FEATURE_COLS_PRODUCAO]
        completo = X.notna().all(axis=1)
        quantidade_prevista = pd.Series(np.nan, index=X.index)
        probabilidade_venda = pd.Series(np.nan, index=X.index)
        if completo.any():
            quantidade_prevista[completo] = np.clip(reg.predict(X[completo]), a_min=0, a_max=None)
            probabilidade_venda[completo] = clf.predict_proba(X[completo])[:, 1]
    else:
        completo = pd.Series(dtype=bool)
        quantidade_prevista = pd.Series(dtype=float)
        probabilidade_venda = pd.Series(dtype=float)

    n_grupos_com_previsao = int(completo.sum()) if len(features_grupo) else 0
    print(f"Grupos com previsão calculada (feature completa): {n_grupos_com_previsao}/{len(features_grupo)}")

    # ------------------------------------------------------------------
    linha("5. MONTAR JSON NO FORMATO DO mockData.js (previsão por grupo, replicada por produto)")
    mm3_por_grupo_unico = features_grupo.loc[completo, "mm3"] if len(features_grupo) and completo.any() else pd.Series(dtype=float)
    tercis = np.quantile(mm3_por_grupo_unico, [1 / 3, 2 / 3]) if len(mm3_por_grupo_unico) >= 3 else [0, 0]

    saida = []
    n_sem_grupo = 0
    n_grupo_sem_historico = 0
    for _, p in produtos.iterrows():
        pid = p["id"]
        grupo_info = grupo_por_produto.loc[pid]
        grupo_chave = grupo_info["grupo_chave"]

        if grupo_chave is None:
            n_sem_grupo += 1
            confianca = "baixa"
            giro = "baixa_confianca"
            qp, prob = np.nan, np.nan
        else:
            if grupo_chave in features_grupo.index:
                feat_row = features_grupo.loc[grupo_chave]
                confianca = classificar_confianca(feat_row)
                giro = classificar_giro(feat_row["mm3"], tercis)
                qp = quantidade_prevista.get(grupo_chave, np.nan)
                prob = probabilidade_venda.get(grupo_chave, np.nan)
            else:
                n_grupo_sem_historico += 1
                confianca = "baixa"
                giro = "baixa_confianca"
                qp, prob = np.nan, np.nan

        demanda30 = int(round(qp)) if pd.notna(qp) else None

        estoque_atual = int(p["em_estoque"]) if pd.notna(p["em_estoque"]) else 0
        estoque_minimo = int(p["qtd_minima"]) if pd.notna(p["qtd_minima"]) else 0
        em_risco = estoque_atual <= estoque_minimo

        qtd_sugerida = None
        if em_risco and demanda30 is not None:
            qtd_sugerida = max(0, demanda30 - estoque_atual)

        if em_risco and confianca != "alta":
            prioridade = "media"
        elif em_risco:
            prioridade = "alta"
        else:
            prioridade = "baixa"

        saida.append(
            {
                "id": int(pid),
                "produto": montar_nome_produto(p["produto"], p["modelo"]),
                "categoria": CATEGORIA_TITULO.get(grupo_info["categoria_final"], "Carro"),
                "grupo": grupo_info["grupo_exibicao"],
                "estoqueAtual": estoque_atual,
                "estoqueMinimo": estoque_minimo,
                "demandaPrevista30d": demanda30 if demanda30 is not None else 0,
                "probabilidadeVenda": round(float(prob), 3) if pd.notna(prob) else None,
                "giro": giro,
                "confianca": confianca,
                "prioridade": prioridade,
                "quantidadeSugerida": qtd_sugerida,
                "justificativa": montar_justificativa(giro, confianca, em_risco, demanda30, grupo_info["grupo_exibicao"]),
            }
        )

    categorias = sorted({item["categoria"] for item in saida})
    demanda_por_categoria = [
        {"categoria": c, "demanda": sum(i["demandaPrevista30d"] for i in saida if i["categoria"] == c)}
        for c in categorias
    ]

    payload = {
        "gerado_em": agora.isoformat(),
        "mes_previsto": mes_previsto.strftime("%Y-%m"),
        "produtos": saida,
        "demandaPorCategoria": demanda_por_categoria,
    }

    SAIDA_DIR.mkdir(parents=True, exist_ok=True)
    caminho_saida = SAIDA_DIR / "previsao_atual.json"
    with open(caminho_saida, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"\nJSON gerado em: {caminho_saida}")
    print(f"Total de produtos no JSON: {len(saida)}")

    linha("6. RESUMO — cobertura em produção")
    print(f"Produtos sem grupo identificável (sem amperagem no nome): {n_sem_grupo}/{len(produtos)}")
    print(f"Produtos cujo grupo não tem NENHUM histórico (nem Excel, nem produção): {n_grupo_sem_historico}/{len(produtos)}")
    sem_previsao = [i for i in saida if i["confianca"] == "baixa"]
    print(f"Total com confiança 'baixa' (soma dos dois motivos acima + feature parcial): {len(sem_previsao)}")
    for i in sem_previsao[:20]:
        print(f"  - [{i['id']}] {i['produto']} (grupo={i['grupo']})")
    if len(sem_previsao) > 20:
        print(f"  ... e mais {len(sem_previsao) - 20}")

    linha("7. SEÇÃO ESTACIONÁRIA E CAMINHÃO — previsão/confiança honesta")
    for item in saida:
        if item["categoria"] in ("Estacionária", "Caminhão"):
            print(
                f"  [{item['categoria']:<13}] {item['produto']:<32} grupo={item['grupo']:<26} "
                f"demanda30d={item['demandaPrevista30d']:<4} confianca={item['confianca']}"
            )

    linha("FIM")


if __name__ == "__main__":
    main()
