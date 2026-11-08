# Referência das métricas do RFC/TCC (congelada em 03/11/2026)

Versão de referência do StockMind para o RFC/TCC: o que foi medido com dados de **mai/2023 a abr/2026**,
antes de o histórico do Excel passar a ser estendido para além de abril.

- **Tag git:** `tcc-metricas-v1` (anotada, no commit `8e27fb1`). Contém o código e os dois modelos `.pkl`.
- **Período coberto:** mai/2023 a abr/2026. Treino: mai/2023 a out/2025. Teste: nov/2025 a abr/2026.

## Arquivos congelados (fora do git)

Copiados para `stockmind/referencia_tcc_2026-04/` (pasta fora do git; tem backup só na máquina do autor).

| Arquivo | Tamanho (bytes) | SHA-256 |
|---|---:|---|
| `processed/treino.csv` | 238016 | `f67afc67f15c30b48a4d5efec5e6f60016f6e7ff0b2dec12d99535e94a663146` |
| `processed/teste.csv` | 39152 | `facab68ef9279f3850c7405a6467dbc51ed4561892df2d0b1f95c6b1ae2545ff` |
| `processed/baixo_volume.csv` | 177 | `d0f09c71815587c9228a2ec89a88de81d0a269281d2eaf7512bd2aff9f1bb4aa` |
| `processed/features_treino.csv` | 147402 | `747d5aba7355c454defb341169b949ed0505571a9c56cffa7bde4a67ade0a4d2` |
| `processed/features_teste.csv` | 37308 | `1cd8cce41238721597732b0710118ac6a4b4fcd6db6bde79c16174dbd82ec58e` |
| `modelos/regressao_linear.pkl` | 1001 | `7d8e73cd689b1882867fffae6ab170745f3bf20b0fbe492ca5e9d6f85c82ec87` |
| `modelos/classificador.pkl` | 1247 | `60fdffe53fd36fe585e6bb3eaa40a9f0d86a961cf6521ededdce4e0725ebd031` |
| `raw/vendas_saidas_final.xlsx` | 131638 | `9ee0d944dad62655959d409d74f9d3e02c11bbd3a42c52731f38f160a9a085df` |
| `metricas_stdout/treinar_modelos.txt` | 4206 | `c1ef26b2eab86c0824bc01763a14f260288e9364d18f4bbe00457dd3ddd48490` |

Notas:
- O `.xlsx` tem 5491 linhas (04/05/2023 a 06/05/2026). As 31 linhas posteriores a 30/04/2026 **não** estão nos CSVs de treino/teste.
- Os `features_*.csv` são gerados por `gerar_features.py`. Foi conferido que o código da tag gera arquivos byte a byte idênticos a estes a partir de `treino.csv` e `teste.csv`.
- Os dois `.pkl` também estão versionados no git, então a tag os preserva.

## Métricas de base (`treinar_modelos.py`, teste nov/2025 a abr/2026)

| Modelo | MAPE | MdAPE | MASE |
|---|---:|---:|---:|
| Baseline média móvel 3 meses | 65,9% | 66,7% | 0,93 |
| Regressão linear | 56,7% | 38,2% | 2,28 |

Classificador vende/não vende (limiar 0,4), linhas com histórico: acurácia 64,8%, precisão 58,5%, **recall 90,9%**.

Saída completa em `metricas_stdout/treinar_modelos.txt`.

## Como reproduzir

```bash
git checkout tcc-metricas-v1          # código e .pkl da referência
cd stockmind
mkdir -p data/processed
cp referencia_tcc_2026-04/processed/*.csv data/processed/   # CSVs congelados
python scripts/gerar_features.py      # opcional: regenera features_*.csv (idênticos aos congelados)
python scripts/treinar_modelos.py     # baseline, regressão linear e classificador
```

Confira a saída com `metricas_stdout/treinar_modelos.txt` e os arquivos com os hashes acima (`sha256sum`).
Os modelos usam `random_state=42` e scikit-learn 1.9.1 (versão dos `.pkl`).

**Não rode `serializar_modelos_producao.py` para reproduzir:** ele sobrescreve os `.pkl` de `modelos/`.

## Atualização (03/11/2026): scripts adaptados e torneio

- Os cinco scripts acima foram adaptados para features por grupo (`metricas.py` compartilhado) e rodam no teste congelado.
  A regressão linear reproduz MAPE 56,7%, MdAPE 38,2% e MASE 2,28 em todos. A escolha de hiperparâmetros neles olha o
  próprio teste (exploratório). Saídas em `referencia_tcc_2026-04/metricas_stdout_scripts_adaptados_2026-11-03/` (fora do git).
- `scripts/torneio_modelos.py` compara baselines e modelos com validação temporal (rolling origin, 6 dobras) e usa o
  teste congelado uma única vez. Resultado da rodada de 03/11/2026 em `referencia_tcc_2026-04/torneio_2026-11-03/`
  (`torneio.md`, `validacao.csv`, `teste.csv`, `campeao.json`; fora do git). A avaliação do teste está registrada em
  `registro_teste.csv` na mesma pasta.
- O `treinar_modelos.py` continua gerando saída byte a byte igual a `metricas_stdout/treinar_modelos.txt`.

## Limitação conhecida: scripts de árvore, Random Forest, MLP, confiança e limiar

`treinar_arvore.py`, `treinar_random_forest.py`, `treinar_mlp.py`, `avaliar_confianca.py` e `explorar_limiar.py`
**falham com `KeyError: 'produto'`** no código desta tag. Eles esperam features por produto, e o pipeline passou a
agregar por grupo (categoria, amperagem, tecnologia). O mesmo erro acontece no commit `6716863`, anterior a qualquer
mudança desta etapa, e o módulo `stockmind/` entra no git inteiro em `b38ef41`, sem histórico anterior. Se o RFC/TCC cita
métricas desses modelos, elas vieram de uma versão por produto que **não está no git**.

## Versão v2: histórico com o livro caixa (início do treino em mar/2022)

Em 08/11/2026 o treino passou a começar em **01/03/2022**: o livro caixa antigo (mar/2022 a mai/2023, 1.741 linhas) foi
juntado ao Excel por `scripts/importar_livro_caixa.py`. Fevereiro/2022 ficou de fora (datas estimadas) e em 04/05/2023
vale o livro (o Excel tinha 2 linhas nesse dia; a de `JUPITER JJF90HD 90AH ALT` não consta no livro e se perdeu).
O **teste é o mesmo** (nov/2025 a abr/2026; `teste.csv` com o mesmo SHA-256 da v1). Só o treino é maior.

| | v1 (referência do RFC/TCC) | v2 (com livro caixa) |
|---|---|---|
| Treino | mai/2023 a out/2025 (1.162 linhas grupo x mês) | mar/2022 a out/2025 (1.908 linhas) |
| Teste | nov/2025 a abr/2026 | igual |
| Planilha | `vendas_saidas_final.xlsx` (5.491 linhas) | `vendas_saidas_com_livro_caixa.xlsx` (7.230 linhas) |
| Código | tag `tcc-metricas-v1` | `TREINO_INICIO = 2022-03-01` e nova planilha em `preparar_dados.py` |
| Campeão na validação (mai a out/2025) | Naive sazonal (MASE 1,059) | Regressão linear (MASE 0,818) |
| Linhas pontuáveis no teste | 253 | 301 |

### Arquivos da v2 (fora do git)

Copiados para `stockmind/referencia_tcc_v2_2022-03/`. As chaves levam o prefixo `v2/` para não colidir com a tabela da v1
(a trava de integridade do torneio lê só as chaves `processed/...` da v1).

| Arquivo | Tamanho (bytes) | SHA-256 |
|---|---:|---|
| `v2/processed/treino.csv` | 314394 | `013f0e846621d12b3771cdd370d0ea020cca4ad857b8ed4839e037fe3171eeba` |
| `v2/processed/teste.csv` | 39152 | `facab68ef9279f3850c7405a6467dbc51ed4561892df2d0b1f95c6b1ae2545ff` |
| `v2/processed/baixo_volume.csv` | 299 | `3e3f0a198efea90d8ae53ef8ae985547ed678e549ccc4db92a8adddeb44af89f` |
| `v2/processed/features_treino.csv` | 243890 | `1d77679b7b333c692e00cf76c29a929bf48c03134a7a76e1132d09826667966b` |
| `v2/processed/features_teste.csv` | 41435 | `fb89fa975fce4d700faa6dc540cc4a2d9f93db4d235a2351b2b3b03e1b04e9d7` |
| `v2/raw/vendas_saidas_com_livro_caixa.xlsx` | 170486 | `9eaf01f8e2a0b48eafaa4ff4fda99a55409624f1439a7e9c8e59b29926e07466` |

Também guardados lá: `raw/livro_caixa.txt` e `comparacao_v1_v2/` (torneios das duas versões, `significancia.csv` e
`significancia.py`).

> **Nota sobre o uso do teste (08/11/2026):** o teste da v2 foi olhado ANTES do registro oficial, só para comparar as duas
> versões (torneios em cópias de trabalho e a tabela abaixo). Nenhum modelo, hiperparâmetro ou escolha de campeão foi ajustado
> com base nele: hiperparâmetros e campeão saem só da validação (mai a out/2025). Por isso o "teste pontuado uma vez" da v2
> não é virgem; o registro oficial está em `referencia_tcc_v2_2022-03/registro_teste.csv`.

### Comparação v1 x v2 no mesmo teste (247 linhas grupo x mês pontuáveis nas duas)

Cada versão treinada com seus próprios dados e seus hiperparâmetros da validação. A diferença é v2 menos v1 no erro
absoluto por linha (negativo = v2 melhor). IC 95% por bootstrap de grupos (10.000 reamostras); DM = Diebold-Mariano com
perda de erro absoluto, sem correção de autocorrelação (as linhas são grupo x mês, não uma série única). O MASE usa a
**mesma escala** nas duas: o erro do naive de cada grupo no treino da v1.

| Modelo | MAE v1 | MAE v2 | Dif. MAE | IC 95% (grupos) | DM p | MASE v1 | MASE v2 |
|---|---:|---:|---:|---|---:|---:|---:|
| Média móvel 3m | 1,924 | 1,931 | +0,007 | [+0,000, +0,021] | 0,096 | 0,973 | 0,999 |
| Naive sazonal | 2,312 | 2,316 | +0,004 | [+0,000, +0,013] | 0,318 | 1,258 | 1,273 |
| Croston | 1,928 | 1,924 | -0,004 | [-0,028, +0,016] | 0,417 | 1,755 | 1,529 |
| SBA | 1,940 | 1,937 | -0,003 | [-0,023, +0,014] | 0,519 | 1,595 | 1,403 |
| Regressão linear | 2,089 | 1,987 | **-0,102** | **[-0,173, -0,037]** | **0,046** | 2,298 | 1,528 |
| Árvore | 2,133 | 2,281 | +0,147 | [-0,106, +0,467] | 0,411 | 1,193 | 1,324 |
| Random Forest | 2,197 | 2,083 | -0,114 | [-0,240, +0,027] | 0,122 | 1,321 | 1,212 |
| MLP | 2,172 | 2,129 | -0,044 | [-0,166, +0,127] | 0,876 | 1,397 | 1,373 |

Leitura:
- Só a **regressão linear** melhora de forma estatisticamente distinguível (-0,10 de MAE; IC sem o zero; DM p = 0,046).
  Com 8 modelos comparados, esse p não sobrevive a correção para múltiplas comparações (Bonferroni: 0,05/8 = 0,006), então é indício, não prova.
- Random Forest e MLP melhoram na estimativa pontual, mas o IC inclui o zero. A árvore piora na estimativa pontual, também sem significância.
- A média móvel (baseline) fica igual. **Nenhum modelo supera a média móvel** no MAE do teste, em nenhuma das duas versões.
- O MASE do torneio (escala de cada treino) dá quedas maiores, por exemplo regressão linear 2,298 -> 1,198, porque o denominador mudou junto com o treino. Na mesma escala a queda é 2,298 -> 1,528; confie nesta e no MAE.
- Uma média móvel que muda de 1,924 para 1,931 vem de poucas linhas cujo `mm3` mudou com o histórico maior.

### Como reproduzir a v2

```bash
cd stockmind
python scripts/importar_livro_caixa.py data/raw/livro_caixa.txt   # gera vendas_saidas_com_livro_caixa.xlsx
python scripts/preparar_dados.py && python scripts/gerar_features.py
```

A trava de integridade do `torneio_modelos.py` continua ligada e compara com os hashes da **v1**, então o torneio oficial
segue apontando para `referencia_tcc_2026-04/processed`. Rodá-lo sobre os dados da v2 é recusado de propósito
(`Integridade dos dados congelados FALHOU`). A comparação acima foi feita em cópias com a trava desligada, só nelas.
