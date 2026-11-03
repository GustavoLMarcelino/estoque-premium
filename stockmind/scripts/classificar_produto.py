"""
StockMind — classificação de um produto em GRUPO de bateria.

Fonte única das regras de categoria/amperagem/tecnologia/polaridade/caixa,
usada pela geração de features (Excel), pela previsão de produção e pelos
testes. Não há campo equivalente no cadastro (tabela estoque): tudo sai do
NOME do produto, então qualquer mudança de regra é feita aqui, num lugar só.

CHAVES (do mais grosso ao mais fino):
  grossa    = (categoria, amperagem, tecnologia)
              grão em que os modelos foram treinados e validados — é nele
              que a demanda é PREVISTA.
  subgrupo  = grossa + (polaridade, caixa)
              grão em que a demanda prevista é REPARTIDA pela participação
              nas vendas (ver reposicao.repartir_demanda).
  grupo     = subgrupo com a amperagem "do grupo": Fit 38AH e 40AH são
              intercambiáveis e formam um grupo só ("38-40"). É o grão em
              que a reposição é calculada e exibida.

POLARIDADE (carro/caminhão): token "inv" no nome; senão, marcas em
MARCAS_POLARIDADE_NORMAL (Eletran) são sempre normal; senão, código do
produto terminando em E (D = direita/normal, E = esquerda/invertida — confirmado
pelo dono do negócio). Moto e estacionária: sempre normal, salvo o token
"inv". Código que não termina em D nem E (ex.: Piobate F60DN) é tratado
como normal, mas com aviso (polaridade_assumida) para conferência.

CAIXA: Fit, Civic, Alta ("alt") e Baixa ("bx") só valem se estiverem
escritos no nome; sem marcação é Normal.
"""

import re

RE_AMPERAGEM = re.compile(r"(\d+(?:[.,]\d+)?)\s*AH\b", re.IGNORECASE)
RE_TOKEN_AMPERAGEM = re.compile(r"^\d+(?:[.,]\d+)?AH$", re.IGNORECASE)
RE_TOKEN_MESES = re.compile(r"^\d+M$", re.IGNORECASE)
RE_CODIGO_TERMINA_EM_E = re.compile(r"\d[A-Z]*E$", re.IGNORECASE)
RE_CODIGO_TERMINA_EM_D_OU_E = re.compile(r"\d[A-Z]*[DE]$", re.IGNORECASE)

MAPA_CATEGORIA_BASE_EXCEL = {"convencional": "carro", "moto": "moto", "estacionaria": "estacionaria"}
CATEGORIA_TITULO = {"carro": "Carro", "moto": "Moto", "estacionaria": "Estacionária", "caminhao": "Caminhão"}

AMPERAGENS_FIT_INTERCAMBIAVEIS = (38.0, 40.0)
AMPERAGEM_GRUPO_FIT = "38-40"

# Códigos que NÃO terminam em D/E mas o dono do negócio confirmou como
# polaridade normal — param de gerar aviso em polaridade_assumida. Código
# novo fora do padrão continua avisando até ser conferido e entrar aqui.
CODIGOS_NORMAIS_CONFIRMADOS = frozenset({"ADF72PF", "F45DN", "F50DN", "F60DN", "F60DG"})

# Marcas cujos códigos não seguem o padrão D/E: toda a marca é polaridade
# normal, exceto quando o nome traz "Inv" (confirmado pelo dono do negócio).
MARCAS_POLARIDADE_NORMAL = ("eletran",)


def extrair_amperagem(nome):
    m = RE_AMPERAGEM.search(nome)
    return float(m.group(1).replace(",", ".")) if m else None


def extrair_tecnologia(nome):
    nome_upper = nome.upper()
    if "EFB" in nome_upper:
        return "EFB"
    if "AGM" in nome_upper:
        return "AGM"
    return "Convencional"


def categoria_base_producao(nome):
    """Heurística de texto — ponto de partida antes de categoria_final."""
    texto = nome.lower()
    if "moto" in texto:
        return "moto"
    if "caminh" in texto:
        return "caminhao"
    if "estacion" in texto or "nobreak" in texto:
        return "estacionaria"
    return "carro"


def categoria_final(nome, categoria_base, amperagem, tecnologia):
    """Cadeia if/elif — a ordem de prioridade importa:
      1. nome começa com "DF" + dígito -> estacionaria
      2. "nicoll" no nome -> estacionaria
      3. amperagem >= 100 E tecnologia == Convencional -> caminhao
      3.5. "estacion"/"nobreak" no nome -> estacionaria (protege nobreaks
           reais de 1.3AH, que a regra 4 classificaria como moto)
      4. amperagem < 38 -> moto
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


def codigo_do_produto(nome):
    """Primeiro token com dígito que não seja a amperagem ("60AH") nem prazo
    de garantia ("24M"): "Acdelco ADR60HD 60AH" -> "ADR60HD"."""
    for token in nome.split():
        if not re.search(r"\d", token):
            continue
        if RE_TOKEN_AMPERAGEM.match(token) or RE_TOKEN_MESES.match(token):
            continue
        return token
    return ""


def extrair_polaridade(nome, categoria):
    if re.search(r"\binv\b", nome, re.IGNORECASE):
        return "invertida"
    if nome.lower().startswith(MARCAS_POLARIDADE_NORMAL):
        return "normal"
    if categoria in ("carro", "caminhao") and RE_CODIGO_TERMINA_EM_E.search(codigo_do_produto(nome)):
        return "invertida"
    return "normal"


def polaridade_assumida(nome, categoria):
    """True quando a polaridade "normal" foi ASSUMIDA, não lida: carro/
    caminhão sem token "inv" cujo código não termina em D nem E. O chamador
    loga um aviso por SKU para o gestor conferir."""
    if categoria not in ("carro", "caminhao") or re.search(r"inv", nome, re.IGNORECASE):
        return False
    if nome.lower().startswith(MARCAS_POLARIDADE_NORMAL):
        return False
    codigo = codigo_do_produto(nome)
    return codigo.upper() not in CODIGOS_NORMAIS_CONFIRMADOS and not RE_CODIGO_TERMINA_EM_D_OU_E.search(codigo)


def extrair_caixa(nome):
    texto = nome.lower()
    if re.search(r"\bfit\b", texto):
        return "Fit"
    if re.search(r"\bcivic\b", texto):
        return "Civic"
    if re.search(r"\balt\b", texto):
        return "Alta"
    if re.search(r"\bbx\b", texto):
        return "Baixa"
    return "Normal"


def classificar_produto(nome, categoria_base=None, amperagem=None):
    """Retorna dict (categoria, amperagem, tecnologia, polaridade, caixa)
    ou None se a amperagem não for conhecida (sem grupo identificável).
    Produção: só o nome. Excel: passa categoria_base e amperagem das colunas
    da planilha (a amperagem do nome pode ser omitida lá)."""
    if amperagem is None or amperagem != amperagem:  # None ou NaN
        amperagem = extrair_amperagem(nome)
    if amperagem is None:
        return None
    tecnologia = extrair_tecnologia(nome)
    categoria = categoria_final(nome, categoria_base or categoria_base_producao(nome), amperagem, tecnologia)
    return {
        "categoria": categoria,
        "amperagem": float(amperagem),
        "tecnologia": tecnologia,
        "polaridade": extrair_polaridade(nome, categoria),
        "caixa": extrair_caixa(nome),
    }


def chave_grossa(c):
    return (c["categoria"], c["amperagem"], c["tecnologia"])


def chave_subgrupo(c):
    return (c["categoria"], c["amperagem"], c["tecnologia"], c["polaridade"], c["caixa"])


def amperagem_do_grupo(amperagem, caixa):
    if caixa == "Fit" and amperagem in AMPERAGENS_FIT_INTERCAMBIAVEIS:
        return AMPERAGEM_GRUPO_FIT
    return f"{amperagem:g}"


def grupo_do_subgrupo(subgrupo):
    categoria, amperagem, tecnologia, polaridade, caixa = subgrupo
    return (categoria, amperagem_do_grupo(amperagem, caixa), tecnologia, polaridade, caixa)


def chave_grupo(c):
    return grupo_do_subgrupo(chave_subgrupo(c))


def nome_grupo(grupo):
    """('carro','60','Convencional','invertida','Normal') -> "60AH Convencional Carro · Invertida"."""
    categoria, amperagem, tecnologia, polaridade, caixa = grupo
    nome = f"{amperagem}AH {tecnologia} {CATEGORIA_TITULO[categoria]}"
    if caixa != "Normal":
        nome += f" · Caixa {caixa}"
    if polaridade == "invertida":
        nome += " · Invertida"
    return nome
