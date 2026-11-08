"""
StockMind — torneio padronizado de modelos de previsão (TCC).

Compara baselines e modelos de forma justa, sem vazamento e reproduzível.

REGRAS (definidas ANTES de rodar):
  1. Três partes no tempo.
     - TREINO: aprende (features_treino.csv; v1: mai/2023 a out/2025, v2: mar/2022 a out/2025).
       A trava de integridade aceita os hashes da v1 OU da v2 (REFERENCIA_TCC.md).
     - VALIDAÇÃO: rolling origin com janela crescente, N_DOBRAS=6 dobras. A
       dobra k valida UM mês (mai..out/2025) treinando só com linhas de meses
       ANTERIORES a ele; a escala do MASE de cada dobra usa só esse treino.
       É AQUI que se comparam modelos e se escolhem hiperparâmetros.
     - TESTE CONGELADO (tag tcc-metricas-v1, nov/2025 a abr/2026): pontuado
       UMA vez, no fim, com os hiperparâmetros já escolhidos na validação.
       Uma segunda avaliação é recusada sem --forcar-reavaliacao, e toda
       avaliação fica registrada em registro_teste.csv.
  2. Critério de escolha do campeão (na validação):
     - métrica principal: MASE agregado (todas as dobras);
     - empate técnico: MASE até TOLERANCIA_EMPATE (0,05) acima do melhor;
       entre os empatados prefere-se o MENOR viés não negativo (errar
       levemente para cima custa menos que ruptura); se nenhum tiver viés
       >= 0, o de viés mais próximo de zero; persistindo o empate, o mais
       simples (ordem de MODELOS).
     - reportados também: MAPE, MdAPE (ignoram meses de venda zero), MAE,
       viés (previsto - real, em unidades) e o MASE sem os 5% piores erros
       (grupos de escala minúscula, como 5AH Moto, dominam o MASE).
  3. Competidores: média móvel 3m, naive sazonal (mesmo mês do ano anterior),
     Croston, SBA, regressão linear, árvore, Random Forest, MLP — mesmas
     features, mesmas linhas (com_historico e feature completa) e mesmo teste.
  4. Reprodutível: seed 42 em tudo; versões das bibliotecas na saída.
  5. Nada muda em produção: este script só lê os CSVs e escreve relatórios.

HOLDOUT FRESCO (estrutura pronta, NÃO executado ainda): quando o Excel de
maio a setembro/2026 for preenchido e as features desse período geradas
(mesmo formato de features_teste.csv), esse período vira um holdout nunca
visto. Uso:
    python scripts/torneio_modelos.py --holdout-fresco features_holdout.csv \\
        --campeao <pasta_torneio>/campeao.json
Avalia UMA vez o campeão e os hiperparâmetros já escolhidos (mais a média
móvel e a regressão linear de produção como referência), reajustando em
treino + teste congelado (--treino-do-holdout treino para só o treino).

Uso normal (de stockmind/):
    python scripts/torneio_modelos.py                  # validação + teste (uma vez)
    python scripts/torneio_modelos.py --so-validacao   # itera sem tocar no teste
"""

import argparse
import hashlib
import json
import platform
import re
import subprocess
import sys
import warnings
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestRegressor
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LinearRegression
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeRegressor

from metricas import FEATURE_COLS, escala_mase_por_grupo, mape_mdape, media_aparada
from previsores_baseline import prever_croston

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent.parent
REFERENCIA_DIR = BASE_DIR / "referencia_tcc_2026-04"
REFERENCIA_V2_DIR = BASE_DIR / "referencia_tcc_v2_2022-03"  # treino a partir de mar/2022 (com o livro caixa)
REFERENCIA_MD = BASE_DIR / "REFERENCIA_TCC.md"

SEED = 42
N_DOBRAS = 6
TOLERANCIA_EMPATE = 0.05
N_BOOTSTRAP = 1000
MODELO_BASE = "media_movel_3m"  # contra quem se mede a diferença de MASE

# Ordem = complexidade crescente (desempate final). Grades vêm dos scripts
# antigos e ficam fixas ANTES de olhar a validação.
MODELOS = {
    "media_movel_3m": [{}],
    "naive_sazonal": [{}],
    "croston": [{"alpha": a} for a in (0.1, 0.2, 0.3)],
    "sba": [{"alpha": a} for a in (0.1, 0.2, 0.3)],
    "regressao_linear": [{}],
    "arvore": [{"max_depth": d} for d in (3, 4, 5, 6, 8, None)],
    "random_forest": [{"n_estimators": n, "max_depth": d} for n in (50, 100, 200) for d in (4, 5, 6, 8, None)],
    "mlp": [{"arquitetura": a} for a in ((8,), (16,), (16, 8))],
}
ROTULOS = {
    "media_movel_3m": "Média móvel 3m", "naive_sazonal": "Naive sazonal", "croston": "Croston", "sba": "SBA",
    "regressao_linear": "Regressão linear", "arvore": "Árvore", "random_forest": "Random Forest", "mlp": "MLP",
}


# ----------------------------------------------------------------------
# Dados
# ----------------------------------------------------------------------

def montar_dados(treino, teste, holdout=None):
    """Um DataFrame só, com a coluna `parte` (treino/teste/holdout) e `completo`
    (as 6 features existem). Croston precisa da série inteira em ordem."""
    partes = [treino.assign(parte="treino"), teste.assign(parte="teste")]
    if holdout is not None:
        partes.append(holdout.assign(parte="holdout"))
    D = pd.concat(partes, ignore_index=True)
    D["completo"] = D[FEATURE_COLS].notna().all(axis=1)
    return D


def origens_de_validacao(D, n_dobras=N_DOBRAS):
    """Os últimos n_dobras meses do TREINO são os meses validados."""
    meses = sorted(D.loc[D["parte"] == "treino", "mes"].unique())
    return [pd.Timestamp(m) for m in meses[-n_dobras:]]


def mascaras_da_dobra(D, origem):
    """(treino, alvo) da dobra: treino = linhas do TREINO estritamente antes da
    origem; alvo = linhas do mês da origem, de grupos já vistos, com feature completa.
    Nunca olha o teste."""
    tr = (D["parte"] == "treino") & (D["mes"] < origem)
    grupos_vistos = set(D.loc[tr, "grupo"])
    alvo = (D["parte"] == "treino") & (D["mes"] == origem) & D["completo"] & D["grupo"].isin(grupos_vistos)
    return tr, alvo


# ----------------------------------------------------------------------
# Previsores
# ----------------------------------------------------------------------

def _ajustar_prever_sklearn(modelo, params, X_tr, y_tr, X_alvo):
    if modelo == "regressao_linear":
        m, escalar = LinearRegression(), False
    elif modelo == "arvore":
        m, escalar = DecisionTreeRegressor(max_depth=params["max_depth"], random_state=SEED), False
    elif modelo == "random_forest":
        m = RandomForestRegressor(n_estimators=params["n_estimators"], max_depth=params["max_depth"],
                                  random_state=SEED, n_jobs=-1)
        escalar = False
    elif modelo == "mlp":
        m = MLPRegressor(hidden_layer_sizes=tuple(params["arquitetura"]), max_iter=2000, random_state=SEED,
                         early_stopping=True, n_iter_no_change=20)
        escalar = True
    else:
        raise ValueError(modelo)
    if escalar:
        sc = StandardScaler().fit(X_tr)
        X_tr, X_alvo = sc.transform(X_tr), sc.transform(X_alvo)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", ConvergenceWarning)
        m.fit(X_tr, y_tr)
    return np.clip(m.predict(X_alvo), 0, None)  # igual à produção: sem previsão negativa


def prever(modelo, params, D, mask_treino, mask_alvo, cache_croston):
    """Previsão (Series alinhada a D.index, NaN fora de mask_alvo ou onde o modelo não prevê)."""
    pred = pd.Series(np.nan, index=D.index)
    if modelo == "media_movel_3m":
        pred[mask_alvo] = D.loc[mask_alvo, "mm3"]
    elif modelo == "naive_sazonal":
        pred[mask_alvo] = D.loc[mask_alvo, "qty_mesmo_mes_ano_anterior"]
    elif modelo in ("croston", "sba"):
        chave = (modelo, params["alpha"])
        if chave not in cache_croston:  # a série inteira, uma vez: previsão de t só usa < t
            cache_croston[chave] = prever_croston(D, params["alpha"], sba=(modelo == "sba"))
        pred[mask_alvo] = cache_croston[chave][mask_alvo]
    else:
        tr = mask_treino & D["completo"]
        al = mask_alvo & D["completo"]
        if al.any():
            pred[al] = _ajustar_prever_sklearn(modelo, params, D.loc[tr, FEATURE_COLS], D.loc[tr, "quantidade"],
                                               D.loc[al, FEATURE_COLS])
    return pred


# ----------------------------------------------------------------------
# Métricas agregadas
# ----------------------------------------------------------------------

def quadro(D, mask_alvo, pred, escalas, **extra):
    """Uma linha por (linha de D) avaliada: real, previsto, escala, erro escalado."""
    f = D.loc[mask_alvo, ["grupo", "mes", "quantidade"]].rename(columns={"quantidade": "y"}).copy()
    f["pred"] = pred[mask_alvo]
    f["escala"] = f["grupo"].map(escalas) if isinstance(escalas, dict) else escalas[mask_alvo]
    valido = f["pred"].notna() & f["escala"].notna() & (f["escala"] > 0)
    f["erro_esc"] = np.where(valido, (f["y"] - f["pred"]).abs() / f["escala"].where(f["escala"] > 0, np.nan), np.nan)
    for k, v in extra.items():
        f[k] = v
    return f


def resumir(f):
    """Métricas de um quadro (pode juntar dobras)."""
    com = f["pred"].notna()
    ee = f["erro_esc"].dropna()
    m = mape_mdape(f["y"], f["pred"])
    return {
        "MASE": ee.mean() if len(ee) else np.nan,
        "MASE_aparado": media_aparada(ee),
        "MAE": (f.loc[com, "y"] - f.loc[com, "pred"]).abs().mean() if com.any() else np.nan,
        "vies": (f.loc[com, "pred"] - f.loc[com, "y"]).mean() if com.any() else np.nan,
        "MAPE": m["MAPE"], "MdAPE": m["MdAPE"],
        "n_linhas": int(len(f)), "n_previstas": int(com.sum()), "n_mase": int(len(ee)), "n_mape": int(m["n_usado"]),
    }


def bootstrap_diferenca_mase(f_modelo, f_base, n=N_BOOTSTRAP, seed=SEED):
    """Diferença de MASE (modelo - base) com IC 95% por bootstrap DE GRUPOS
    (reamostra grupos inteiros, com reposição). Negativo = modelo melhor.
    Os dois quadros precisam ter as mesmas linhas, na mesma ordem."""
    d = (f_modelo["erro_esc"].to_numpy() - f_base["erro_esc"].to_numpy())
    ok = ~np.isnan(d)
    grupos = f_modelo["grupo"].to_numpy()[ok]
    d = d[ok]
    ug, inv = np.unique(grupos, return_inverse=True)
    soma, cont = np.bincount(inv, weights=d), np.bincount(inv).astype(float)
    rng = np.random.default_rng(seed)
    ix = rng.integers(0, len(ug), size=(n, len(ug)))
    medias = soma[ix].sum(axis=1) / cont[ix].sum(axis=1)
    return float(d.mean()), float(np.percentile(medias, 2.5)), float(np.percentile(medias, 97.5))


# ----------------------------------------------------------------------
# Validação e escolha
# ----------------------------------------------------------------------

def rodar_validacao(D, modelos=MODELOS, n_dobras=N_DOBRAS):
    """Retorna dict {(modelo, chave_params): quadro agregado das dobras}. Só enxerga
    linhas do TREINO — o teste não entra em nenhuma máscara."""
    cache_croston = {}
    resultados = {}
    for origem in origens_de_validacao(D, n_dobras):
        mask_tr, mask_alvo = mascaras_da_dobra(D, origem)
        escalas = escala_mase_por_grupo(D[mask_tr])[0]
        for modelo, grade in modelos.items():
            for params in grade:
                pred = prever(modelo, params, D, mask_tr, mask_alvo, cache_croston)
                f = quadro(D, mask_alvo, pred, escalas, dobra=origem.strftime("%Y-%m"))
                resultados.setdefault((modelo, json.dumps(params)), []).append(f)
    return {k: pd.concat(v, ignore_index=True) for k, v in resultados.items()}


def escolher_hiperparametros(resultados, modelos=MODELOS):
    """Melhor combinação de cada modelo pelo MASE agregado (empate: a primeira da grade)."""
    escolhas = {}
    for modelo, grade in modelos.items():
        melhor = None
        for params in grade:
            mase = resumir(resultados[(modelo, json.dumps(params))])["MASE"]
            chave = np.inf if pd.isna(mase) else mase
            if melhor is None or chave < melhor[0]:
                melhor = (chave, params)
        escolhas[modelo] = melhor[1]
    return escolhas


def modelos_na_borda_da_grade(escolhas, modelos=MODELOS):
    """Modelos cujo hiperparâmetro escolhido é o primeiro ou o último da grade: sinal de
    que o ótimo pode estar fora dela (a grade é fixada antes de olhar a validação)."""
    borda = []
    for modelo, grade in modelos.items():
        if len(grade) > 1 and escolhas[modelo] in (grade[0], grade[-1]):
            borda.append(modelo)
    return borda


def escolher_campeao(tabela, modelos=MODELOS, tolerancia=TOLERANCIA_EMPATE):
    """tabela: DataFrame indexado por modelo com colunas MASE e vies (validação, melhor
    hiperparâmetro de cada). Retorna (campeão, motivo em texto)."""
    t = tabela.dropna(subset=["MASE"])
    melhor = t["MASE"].min()
    empatados = t[t["MASE"] <= melhor + tolerancia]
    lider = t["MASE"].idxmin()
    if len(empatados) == 1:
        return lider, (f"{ROTULOS[lider]} tem o menor MASE de validação ({melhor:.3f}), sem empate técnico "
                       f"(tolerância {tolerancia}).")
    ordem = {m: i for i, m in enumerate(modelos)}
    nao_neg = empatados[empatados["vies"] >= 0]
    if len(nao_neg):
        escolhido = sorted(nao_neg.index, key=lambda m: (nao_neg.loc[m, "vies"], ordem[m]))[0]
        regra = "o de menor viés não negativo (erra levemente para cima)"
    else:
        escolhido = sorted(empatados.index, key=lambda m: (-empatados.loc[m, "vies"], ordem[m]))[0]
        regra = "nenhum tem viés >= 0; o de viés mais próximo de zero"
    lista = ", ".join(f"{ROTULOS[m]} (MASE {empatados.loc[m, 'MASE']:.3f}, viés {empatados.loc[m, 'vies']:+.2f})"
                      for m in sorted(empatados.index, key=lambda m: empatados.loc[m, "MASE"]))
    return escolhido, (f"Empate técnico (MASE até {tolerancia} acima do melhor, {melhor:.3f}) entre: {lista}. "
                       f"Critério de desempate: {regra} -> {ROTULOS[escolhido]}.")


# ----------------------------------------------------------------------
# Teste (e holdout)
# ----------------------------------------------------------------------

def avaliar_em_parte(D, parte, escolhas, treino_partes, modelos_avaliar):
    """Avalia os modelos (com os hiperparâmetros já escolhidos) na `parte` (teste ou
    holdout), treinando com as partes `treino_partes`. Retorna (tabela, quadros)."""
    mask_tr = D["parte"].isin(treino_partes)
    escalas = escala_mase_por_grupo(D[mask_tr])[0]
    grupos_vistos = set(D.loc[mask_tr, "grupo"])
    todas = D["parte"] == parte
    comuns = todas & D["completo"] & D["grupo"].isin(grupos_vistos)
    cache_croston = {}
    linhas, quadros, previsoes_todas = [], {}, {}
    for modelo in modelos_avaliar:
        params = escolhas[modelo]
        # cobertura PRÓPRIA do modelo: tudo o que ele consegue prever na parte inteira
        pred_todas = prever(modelo, params, D, mask_tr, todas, cache_croston)
        previsoes_todas[modelo] = pred_todas
        pred = pred_todas  # nas linhas comuns, os previstos são os mesmos
        f = quadro(D, comuns, pred, escalas)
        quadros[modelo] = f
        r = resumir(f)
        prevê = pred_todas[todas].notna()
        r.update({
            "modelo": modelo, "hiperparametros": json.dumps(params),
            "cobertura_linhas": int(prevê.sum()), "cobertura_total_linhas": int(todas.sum()),
            "cobertura_grupos": int(D.loc[todas & pred_todas.notna(), "grupo"].nunique()),
            "cobertura_total_grupos": int(D.loc[todas, "grupo"].nunique()),
        })
        linhas.append(r)
    tabela = pd.DataFrame(linhas).set_index("modelo")
    # as linhas comuns devem ser previstas por TODOS os modelos
    sem = {m: int(q["pred"].isna().sum()) for m, q in quadros.items() if q["pred"].isna().any()}
    return tabela, quadros, sem


def adicionar_bootstrap(tabela, quadros, base=MODELO_BASE):
    for coluna in ("dif_MASE_vs_base", "IC95_inf", "IC95_sup"):
        tabela[coluna] = np.nan
    for modelo, f in quadros.items():
        if modelo == base:
            tabela.loc[modelo, ["dif_MASE_vs_base", "IC95_inf", "IC95_sup"]] = [0.0, 0.0, 0.0]
        else:
            tabela.loc[modelo, ["dif_MASE_vs_base", "IC95_inf", "IC95_sup"]] = bootstrap_diferenca_mase(f, quadros[base])
    return tabela


# ----------------------------------------------------------------------
# Integridade, registro e relatório
# ----------------------------------------------------------------------

def sha256(caminho):
    return hashlib.sha256(Path(caminho).read_bytes()).hexdigest()


ARQUIVOS_CONGELADOS = ("features_treino.csv", "features_teste.csv")
PREFIXOS_VERSAO = {"v1": "processed/", "v2": "v2/processed/"}  # chaves da tabela do REFERENCIA_TCC.md


def verificar_integridade(pasta_dados, md=REFERENCIA_MD):
    """Confere os SHA-256 dos CSVs de `pasta_dados` com as tabelas do REFERENCIA_TCC.md.
    Aceita a v1 (chaves `processed/...`, treino a partir de mai/2023) OU a v2 (chaves
    `v2/processed/...`, treino a partir de mar/2022); os DOIS arquivos precisam bater com a
    MESMA versão. Retorna "v1" ou "v2"; qualquer outra coisa recusa."""
    texto = Path(md).read_text(encoding="utf-8")
    esperado = {m.group(1): m.group(3) for m in re.finditer(r"\| `([^`]+)` \| (\d+) \| `([0-9a-f]{64})` \|", texto)}
    problemas = {}
    for versao, prefixo in PREFIXOS_VERSAO.items():
        falhas = []
        for nome in ARQUIVOS_CONGELADOS:
            chave = f"{prefixo}{nome}"
            if chave not in esperado:
                falhas.append(f"{chave} não consta no REFERENCIA_TCC.md")
            elif sha256(Path(pasta_dados) / nome) != esperado[chave]:
                falhas.append(f"{nome}: SHA-256 diferente do congelado")
        if not falhas:
            return versao
        problemas[versao] = falhas
    detalhe = "\n".join(f"  [{v}] " + "; ".join(f) for v, f in problemas.items())
    raise SystemExit("Integridade dos dados congelados FALHOU (não bate com a v1 nem com a v2):\n" + detalhe)


def commit_git():
    try:
        return subprocess.run(["git", "-C", str(BASE_DIR), "rev-parse", "--short", "HEAD"], capture_output=True,
                              text=True, timeout=10).stdout.strip() or "desconhecido"
    except Exception:
        return "desconhecido"


def registrar_avaliacao(pasta_saida, tipo, hash_dados, campeao, forcado):
    reg = Path(pasta_saida) / "registro_teste.csv"
    nova = pd.DataFrame([{"data_hora": datetime.now().isoformat(timespec="seconds"), "tipo": tipo,
                          "sha256_dados": hash_dados, "commit": commit_git(), "campeao": campeao, "forcado": forcado}])
    nova.to_csv(reg, mode="a", header=not reg.exists(), index=False)


def ja_avaliado(pasta_saida, tipo, hash_dados):
    reg = Path(pasta_saida) / "registro_teste.csv"
    if not reg.exists():
        return False
    r = pd.read_csv(reg)
    return bool(((r["tipo"] == tipo) & (r["sha256_dados"] == hash_dados)).any())


def tabela_md(df, formatos):
    cab = "| " + " | ".join(df.columns) + " |"
    sep = "|" + "|".join("---" for _ in df.columns) + "|"
    linhas = []
    for _, r in df.iterrows():
        cel = []
        for c in df.columns:
            v = r[c]
            cel.append("—" if (not isinstance(v, str) and pd.isna(v)) else (formatos.get(c, "{}").format(v)))
        linhas.append("| " + " | ".join(cel) + " |")
    return "\n".join([cab, sep] + linhas)


def versoes():
    return {"python": platform.python_version(), "numpy": np.__version__, "pandas": pd.__version__,
            "scikit-learn": sklearn.__version__, "seed": SEED}


def pasta_datada(base, prefixo):
    hoje = datetime.now().strftime("%Y-%m-%d")
    p, n = Path(base) / f"{prefixo}_{hoje}", 1
    while p.exists():
        n += 1
        p = Path(base) / f"{prefixo}_{hoje}_{n}"
    p.mkdir(parents=True)
    return p


FMT = {"MASE": "{:.3f}", "MASE_aparado": "{:.3f}", "MAE": "{:.2f}", "vies": "{:+.2f}", "MAPE": "{:.1f}%",
       "MdAPE": "{:.1f}%", "dif_MASE_vs_base": "{:+.3f}", "IC95_inf": "{:+.3f}", "IC95_sup": "{:+.3f}",
       "n_linhas": "{:.0f}", "cobertura_linhas": "{:.0f}", "cobertura_total_linhas": "{:.0f}",
       "cobertura_grupos": "{:.0f}", "cobertura_total_grupos": "{:.0f}"}


def montar_tabela_validacao(resultados, modelos=MODELOS):
    linhas = []
    for (modelo, p), f in resultados.items():
        r = resumir(f)
        r.update({"modelo": modelo, "hiperparametros": p})
        for dobra, g in f.groupby("dobra"):
            r[f"MASE_{dobra}"] = resumir(g)["MASE"]
        linhas.append(r)
    return pd.DataFrame(linhas)


# ----------------------------------------------------------------------
# Execuções
# ----------------------------------------------------------------------

def executar_torneio(D, modelos=MODELOS, n_dobras=N_DOBRAS):
    """Validação + escolha. NÃO toca no teste. Retorna dict com tudo que a
    avaliação final precisa."""
    resultados = rodar_validacao(D, modelos, n_dobras)
    escolhas = escolher_hiperparametros(resultados, modelos)
    melhores = {m: resumir(resultados[(m, json.dumps(escolhas[m]))]) for m in modelos}
    tab_melhores = pd.DataFrame(melhores).T
    campeao, motivo = escolher_campeao(tab_melhores[["MASE", "vies"]].astype(float), modelos)
    quadros_val = {m: resultados[(m, json.dumps(escolhas[m]))].reset_index(drop=True) for m in modelos}
    tab_melhores = adicionar_bootstrap(tab_melhores, quadros_val)
    return {"resultados": resultados, "escolhas": escolhas, "tabela_melhores": tab_melhores,
            "campeao": campeao, "motivo": motivo}


def escrever_relatorio_torneio(pasta, val, teste_tab, sem_previsao, hashes, so_validacao):
    campeao = val["campeao"]
    tv = val["tabela_melhores"].copy()
    tv.insert(0, "modelo", [ROTULOS[m] for m in tv.index])
    tv["hiperparametros"] = [json.dumps(val["escolhas"][m]) for m in tv.index]
    cols = ["modelo", "hiperparametros", "MASE", "MASE_aparado", "MAE", "vies", "MAPE", "MdAPE", "dif_MASE_vs_base",
            "IC95_inf", "IC95_sup", "n_linhas"]
    md = [f"# Torneio de modelos — {datetime.now().strftime('%Y-%m-%d %H:%M')}", "",
          f"Commit: `{commit_git()}` · Versões: `{json.dumps(versoes())}`", "",
          "Dados (SHA-256): " + ", ".join(f"`{k}` `{v[:12]}…`" for k, v in hashes.items()), "",
          "## Regras", "",
          f"- Validação: rolling origin, {N_DOBRAS} dobras (um mês cada, treino só com meses anteriores), janela crescente.",
          f"- Escolha: MASE agregado; empate técnico = até {TOLERANCIA_EMPATE} de MASE; desempate = menor viés ≥ 0; depois o mais simples.",
          "- MAPE/MdAPE ignoram meses com venda real zero; MASE e MAE usam todas as linhas previstas.",
          f"- `dif_MASE_vs_base`: MASE do modelo − MASE da média móvel (negativo = melhor), IC 95% por bootstrap de grupos ({N_BOOTSTRAP} sorteios, seed {SEED}).",
          "- O teste congelado já havia sido visto antes deste torneio (métricas de base do TCC e comparação exploratória); "
          "'uma vez só' vale daqui para frente e fica registrado em `registro_teste.csv`.", "",
          "## Validação (usada para escolher)", "", tabela_md(tv[cols], FMT), "",
          f"**Campeão: {ROTULOS[campeao]}.** {val['motivo']}", ""]
    borda = modelos_na_borda_da_grade(val["escolhas"])
    if borda:
        md += ["Atenção: hiperparâmetro escolhido na BORDA da grade (o ótimo pode estar fora dela): "
               + ", ".join(f"{ROTULOS[m]} {json.dumps(val['escolhas'][m])}" for m in borda) + ".", ""]
    if teste_tab is not None:
        tt = teste_tab.copy()
        tt.insert(0, "modelo", [ROTULOS[m] for m in tt.index])
        cols_t = ["modelo", "hiperparametros", "MASE", "MASE_aparado", "MAE", "vies", "MAPE", "MdAPE", "dif_MASE_vs_base",
                  "IC95_inf", "IC95_sup", "n_linhas"]
        md += ["## Teste congelado (nota final, avaliado uma vez)", "", tabela_md(tt[cols_t], FMT), ""]
        cov = tt[["modelo", "cobertura_linhas", "cobertura_total_linhas", "cobertura_grupos", "cobertura_total_grupos"]].copy()
        cov["% linhas"] = (100 * tt["cobertura_linhas"] / tt["cobertura_total_linhas"]).map("{:.0f}%".format)
        md += ["## Cobertura no teste (o que cada modelo consegue prever, em todas as linhas do teste)", "",
               tabela_md(cov, {}), "",
               "As métricas acima usam só as linhas COMUNS (grupo com histórico e as 6 features completas); a cobertura "
               "mostra quantas linhas/grupos cada modelo preveria por conta própria.", ""]
        campeao_teste = teste_tab["MASE"].astype(float).idxmin()
        md += [f"Campeão da validação: **{ROTULOS[campeao]}**. Melhor MASE no teste: **{ROTULOS[campeao_teste]}**"
               + (" (coincidem)." if campeao_teste == campeao else " (NÃO coincidem — o teste NÃO confirmou "
                                                                 "o campeão da validação; o campeão oficial segue sendo o da validação, e o teste não o altera)."), ""]
        if sem_previsao:
            md += [f"Atenção: linhas comuns sem previsão em alguns modelos: {sem_previsao}.", ""]
    elif so_validacao:
        md += ["_Execução com `--so-validacao`: o teste congelado NÃO foi tocado._", ""]
    (pasta / "torneio.md").write_text("\n".join(md), encoding="utf-8")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--dados", default=str(REFERENCIA_DIR / "processed"), help="pasta com features_treino/teste.csv congelados (v1 ou v2)")
    ap.add_argument("--saida", default=None, help="onde criar a pasta datada do torneio (padrão: a pasta de referência da versão detectada)")
    ap.add_argument("--so-validacao", action="store_true", help="não toca no teste congelado")
    ap.add_argument("--forcar-reavaliacao", action="store_true", help="permite pontuar o teste de novo (fica registrado)")
    ap.add_argument("--holdout-fresco", help="CSV de features do período novo (mesmo formato de features_teste.csv)")
    ap.add_argument("--campeao", help="campeao.json de um torneio anterior (obrigatório com --holdout-fresco)")
    ap.add_argument("--treino-do-holdout", choices=["treino", "treino+teste"], default="treino+teste")
    args = ap.parse_args(argv)

    dados = Path(args.dados)
    versao = verificar_integridade(dados)
    if args.saida is None:
        args.saida = str(REFERENCIA_V2_DIR if versao == "v2" else REFERENCIA_DIR)
    print(f"Dados congelados: {versao} (SHA-256 conferido) | saída em {args.saida}")
    treino = pd.read_csv(dados / "features_treino.csv", parse_dates=["mes"])
    teste = pd.read_csv(dados / "features_teste.csv", parse_dates=["mes"])
    hashes = {"features_treino.csv": sha256(dados / "features_treino.csv"), "features_teste.csv": sha256(dados / "features_teste.csv")}

    if args.holdout_fresco:
        return main_holdout(args, treino, teste, hashes)

    D = montar_dados(treino, teste)
    print(f"Treino {int((D.parte == 'treino').sum())} linhas | teste {int((D.parte == 'teste').sum())} | dobras {N_DOBRAS}")
    val = executar_torneio(D)
    print(val["tabela_melhores"][["MASE", "MASE_aparado", "MAE", "vies"]].astype(float).round(3).to_string())
    print(f"\nCampeão (validação): {ROTULOS[val['campeao']]} — {val['motivo']}")

    pasta = pasta_datada(args.saida, "torneio")
    montar_tabela_validacao(val["resultados"]).to_csv(pasta / "validacao.csv", index=False)
    (pasta / "campeao.json").write_text(json.dumps({"campeao": val["campeao"], "hiperparametros": val["escolhas"],
                                                    "motivo": val["motivo"], "versoes": versoes(),
                                                    "sha256_dados": hashes}, ensure_ascii=False, indent=2), encoding="utf-8")
    teste_tab, sem = None, None
    if not args.so_validacao:
        hash_conj = hashlib.sha256("".join(hashes.values()).encode()).hexdigest()
        if ja_avaliado(args.saida, "teste_congelado", hash_conj) and not args.forcar_reavaliacao:
            raise SystemExit("O teste congelado JÁ foi pontuado para estes dados (ver registro_teste.csv). "
                             "Use --forcar-reavaliacao só se for realmente necessário; fica registrado.")
        teste_tab, quadros, sem = avaliar_em_parte(D, "teste", val["escolhas"], ["treino"], list(MODELOS))
        teste_tab = adicionar_bootstrap(teste_tab, quadros)
        registrar_avaliacao(args.saida, "teste_congelado", hash_conj, val["campeao"], bool(args.forcar_reavaliacao))
        teste_tab.reset_index().to_csv(pasta / "teste.csv", index=False)
        print("\nTESTE (uma vez):")
        print(teste_tab[["MASE", "MASE_aparado", "MAE", "vies", "cobertura_linhas"]].astype(float).round(3).to_string())
    escrever_relatorio_torneio(pasta, val, teste_tab, sem, hashes, args.so_validacao)
    print(f"\nSaída em: {pasta}")
    return 0


def main_holdout(args, treino, teste, hashes):
    """Avalia UMA vez o campeão (+ referências) no período novo. Estrutura pronta; ainda não executada."""
    if not args.campeao:
        raise SystemExit("--holdout-fresco exige --campeao <pasta>/campeao.json")
    cfg = json.loads(Path(args.campeao).read_text(encoding="utf-8"))
    caminho = Path(args.holdout_fresco)
    hash_h = sha256(caminho)
    if ja_avaliado(args.saida, "holdout_fresco", hash_h) and not args.forcar_reavaliacao:
        raise SystemExit("Este holdout JÁ foi avaliado (registro_teste.csv). Um holdout só vale uma vez.")
    holdout = pd.read_csv(caminho, parse_dates=["mes"])
    D = montar_dados(treino, teste, holdout)
    partes = ["treino"] if args.treino_do_holdout == "treino" else ["treino", "teste"]
    escolhas = cfg["hiperparametros"]
    avaliar = list(dict.fromkeys([cfg["campeao"], MODELO_BASE, "regressao_linear"]))
    tabela, quadros, sem = avaliar_em_parte(D, "holdout", escolhas, partes, avaliar)
    tabela = adicionar_bootstrap(tabela, quadros)
    pasta = pasta_datada(args.saida, "holdout_fresco")
    tabela.reset_index().to_csv(pasta / "holdout.csv", index=False)
    registrar_avaliacao(args.saida, "holdout_fresco", hash_h, cfg["campeao"], bool(args.forcar_reavaliacao))
    tt = tabela.copy()
    tt.insert(0, "modelo", [ROTULOS[m] for m in tt.index])
    md = [f"# Holdout fresco — {datetime.now().strftime('%Y-%m-%d %H:%M')}", "",
          f"Campeão avaliado: **{ROTULOS[cfg['campeao']]}** (hiperparâmetros fixados no torneio). Treino do ajuste: {args.treino_do_holdout}.", "",
          tabela_md(tt[["modelo", "hiperparametros", "MASE", "MASE_aparado", "MAE", "vies", "MAPE", "MdAPE", "dif_MASE_vs_base",
                        "IC95_inf", "IC95_sup", "n_linhas"]], FMT), "",
          f"Versões: `{json.dumps(versoes())}` · Commit `{commit_git()}` · holdout SHA-256 `{hash_h[:12]}…`"]
    (pasta / "holdout.md").write_text("\n".join(md), encoding="utf-8")
    print(tabela[["MASE", "MASE_aparado", "MAE", "vies"]].astype(float).round(3).to_string())
    print(f"\nSaída em: {pasta}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
