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

## Decisão (09/11/2026): a regressão linear continua em produção

Avaliou-se trocar a previsão de produção pela média móvel 3m. **Decisão: não trocar.**

### Torneio de 03/11/2026 (`resultados_tcc/torneio_2026-11-03/`)

| Modelo | MASE validação | MASE teste | Dif. MASE vs média móvel (teste), IC95 |
|---|---|---|---|
| Média móvel 3m | 1,095 | 0,962 | 0 |
| Regressão linear | 1,158 | 2,282 | +1,319 [+0,305, +3,172] |

- Na **validação** (critério de escolha) as duas empatam: dif. +0,062, IC95 [-0,160, +0,412]. O campeão da validação foi o Naive sazonal.
- No **teste** a média móvel foi melhor no MASE. Mas o teste já havia sido visto antes do torneio, então não é uma avaliação limpa.
- No teste, MAE e métricas relativas favorecem a regressão ou empatam: MAE 2,06 (regressão) contra 1,89 (média móvel); MAPE 56,7% contra 65,1%; MdAPE 38,2% contra 66,7%.
- O viés da média móvel não é estável: -0,25 no teste e +0,47 na validação.

### Checagem de ruptura (teste congelado, `features_teste.csv`)

Critério de negócio: em quantos grupos-mês a venda real passou de previsão + segurança. O `features_teste.csv` não tem
`qtd_minima` (existe só por SKU no banco), então a segurança é uma aproximação (unidades fixas). Foram usadas as 301 linhas
com as 6 features completas (o torneio usa 253, as comuns a todos os modelos); a regressão é o `regressao_linear.pkl` de produção.

| Segurança | Rupturas média móvel | Rupturas regressão | Unid. faltantes (mm3 / reg) | Unid. sobrando (mm3 / reg) |
|---|---|---|---|---|
| 0 | 78/301 (25,9%) | 62/301 (20,6%) | 274 / 207 | 209 / 376 |
| 1 un | 41 (13,6%) | 32 (10,6%) | 207 / 163 | 443 / 633 |
| 2 un | 26 (8,6%) | 21 (7,0%) | 170 / 138 | 708 / 909 |
| 3 un | 20 (6,6%) | 16 (5,3%) | 147 / 119 | 985 / 1.192 |
| 25% da previsão | 68 (22,6%) | 43 (14,3%) | - | - |

Por categoria (rupturas média móvel / regressão; unidades reais e previstas no total do teste):

| Categoria | Linhas | Seg. 0 | Seg. 2 un | Real | Prev. média móvel | Prev. regressão |
|---|---|---|---|---|---|---|
| Carro | 138 | 54 / 41 | 19 / 15 | 860 | 794 | 899 |
| Moto | 78 | 10 / 10 | 3 / 3 | 53 | 54 | 112 |
| Estacionária | 48 | 7 / 5 | 1 / 1 | 12 | 12 | 47 |
| Caminhão | 37 | 7 / 6 | 3 / 2 | 35 | 35 | 71 |

Nos grupos de alto volume (média real >= 10 un/mês, segurança 0) as duas empatam em rupturas: 50AH Convencional Carro 3 / 3 e
60AH Convencional Carro 3 / 3; a média móvel prevê um pouco abaixo do real (60AH: 509 contra 527 reais).

### Motivo

- Na validação as duas empatam; a vantagem da média móvel só aparece no teste, que já tinha sido visto.
- Pelo critério de negócio (ruptura), a regressão deixa faltar menos, principalmente em **Carro**, onde está o volume
  (a média móvel prevê 794 contra 860 reais, -8%; a regressão 899, +5%).
- O excesso da regressão em Moto, Caminhão e Estacionária (previsão de 2 a 4 vezes o real, em volumes pequenos) é
  controlado na hora da compra.
- Limites da checagem: só 6 meses de teste e segurança aproximada.

### Hipótese para o próximo torneio

Modelo por categoria: **regressão linear para Carro e média móvel 3m para as demais** (Moto, Caminhão, Estacionária).
A regra fica definida **aqui, antes** de qualquer avaliação, e não escolhida olhando o teste atual. Deve ser avaliada com a
base completa e o holdout fresco, com a ruptura (com `qtd_minima` real) como métrica de negócio ao lado do MASE.

## Holdout fresco (mai a set/2026): avaliado uma vez em 09/11/2026

Período nunca visto pelos modelos: vendas do livro caixa de 02/05 a 30/09/2026 (696 linhas, 709 unidades), convertidas por
`importar_livro_caixa.py --livro-2026`. O modelo avaliado é o campeão da v2 (regressão linear), reajustado em treino + teste,
com a média móvel 3m como referência. Os dias 02 a 06/05 da planilha antiga foram substituídos pelos do livro (batem em
unidades por dia). Features: `gerar_features.py --holdout` (cada linha usa só meses anteriores).

| Arquivo (fora do git) | SHA-256 |
|---|---|
| `data/raw/vendas_saidas_com_livro_caixa_2026.xlsx` | `a3c6ad0aea8ed9977ceca657b6bf9a6356b9cf3f64dc9e78e84fec2d6879aecd` |
| `data/processed/recente.csv` | `523007f9daebb3e605ce343983770bee3ebbdac87e1b4936eaffd27cd25372fa` |
| `data/processed/features_holdout.csv` | `7d606bec4bc5acd48cf18dd8b49690f46381cbd9e6eff8fc52acba3019e553f9` |

Os hashes de `treino.csv`, `teste.csv`, `baixo_volume.csv`, `features_treino.csv` e `features_teste.csv` (v2) e os da v1 não mudaram.
Resultado em `referencia_tcc_v2_2022-03/holdout_fresco_2026-11-09/` e registro em `registro_teste.csv`.

### Resultado (262 linhas grupo x mês, 54 grupos)

| Modelo | MASE | MASE aparado | MAE | Viés | MAPE | MdAPE |
|---|---|---|---|---|---|---|
| Regressão linear | 0,835 | 0,550 | 1,04 | +0,38 | 53,5% | 49,9% |
| Média móvel 3m | 0,818 | 0,604 | 0,97 | +0,37 | 58,9% | 44,4% |

Diferença de MASE (regressão menos média móvel): +0,017, IC95 [-0,101, +0,150]. **Empate**: a diferença grande do teste
congelado (2,28 contra 0,96) não se repetiu. A regressão tem MASE aparado e MAPE melhores; a média móvel, MAE e MdAPE.

### Checagem de ruptura no holdout (avaliação complementar, mesmos dois modelos já pontuados)

Mesmo critério da checagem do teste: grupo-mês com venda real acima de previsão + segurança. Desta vez com o `qtd_minima`
**real**: soma dos SKUs ativos de cada grupo grosso, lida do banco na EC2 (só SELECT; é o cadastro de 09/11/2026, aplicado a
meses anteriores). Grupos sem SKU cadastrado ficam com segurança 0 (14 grupos).

| Segurança | Rupturas média móvel | Rupturas regressão | Unid. faltantes (mm3 / reg) | Unid. sobrando (mm3 / reg) |
|---|---|---|---|---|
| `qtd_minima` real | 9/262 (3,4%) | 11/262 (4,2%) | 9 / 11 | 901 / 905 |
| 0 | 56 (21,4%) | 64 (24,4%) | 79 / 87 | 176 / 186 |
| 1 un | 24 (9,2%) | 28 (10,7%) | 31 / 37 | 389 / 399 |
| 2 un | 9 (3,4%) | 14 (5,3%) | 12 / 14 | 633 / 637 |
| 3 un | 3 (1,1%) | 4 (1,5%) | 6 / 5 | 888 / 891 |

Por categoria, com `qtd_minima` real (rupturas média móvel / regressão; unidades reais e previstas no período):

| Categoria | Linhas | Rupturas | Real | Prev. média móvel | Prev. regressão |
|---|---|---|---|---|---|
| Carro | 120 | 3 / 4 | 615 | 710 | 722 |
| Moto | 65 | 3 / 3 | 54 | 49 | 45 |
| Estacionária | 42 | 2 / 2 | 4 | 5 | 5 |
| Caminhão | 35 | 1 / 2 | 35 | 41 | 35 |

Sem segurança (0), Carro: 30 / 36 rupturas em 120 linhas; Moto 13 / 14; Caminhão 9 / 10; Estacionária 4 / 4.
Alto volume (60AH e 50AH Convencional Carro, 5 meses cada): com a segurança real não há ruptura em nenhum dos dois; com
segurança 0, 60AH 0 / 0 e 50AH 1 / 1.

Leitura:
- **A vantagem da regressão em Carro vista no teste não se repetiu.** Aqui ela deixa faltar um pouco mais que a média móvel
  em todos os níveis de segurança (Carro: 36 contra 30 rupturas com segurança 0), e as duas superestimam Carro (real 615;
  média móvel 710, regressão 722) porque as vendas caíram de 168 para 128 unidades por mês de maio a setembro.
- Com o `qtd_minima` real as rupturas são raras nos dois modelos (3 a 4%), e o excesso de unidades vem do tamanho do mínimo
  (por exemplo, 61 un. só no 60AH Convencional Carro), não do modelo.
- Limites: 5 meses, 262 linhas, segurança do cadastro de hoje e demanda sem considerar o estoque que havia em cada mês.
  Não altera o campeão da validação nem a decisão de produção; é registro complementar da mesma avaliação.

### Pendência para uma futura v3 dos dados: MBR 10 (8,6 contra 10)

O histórico antigo tem 29 vendas de MBR10-BS e HTZ10S-BS com amperagem 8,6AH, e o cadastro de produção as trata como 10AH.
Corrigir mudaria os hashes de treino e teste da v1 e da v2, então só os dados novos entram como 10AH (as vendas "MBR 10"
sem sufixo e Heliar 10). O pipeline usa a primeira amperagem de cada produto; por isso a venda "MBR 10 BS" de 2026 (1 un.)
continua no grupo 8,6AH Moto (1 un. no holdout). Resolver os dois lados exige uma v3.

## Conclusão do holdout e decisão (10/11/2026)

- **Regressão linear e média móvel 3m empatam no holdout de mai a set/2026**, tanto no MASE (0,835 contra 0,818, IC95 da
  diferença [-0,101, +0,150]) quanto na ruptura (com `qtd_minima` real: 4,2% contra 3,4%, 11 contra 9 grupos-mês em 262).
- **A vantagem da regressão em Carro, vista no teste antigo, não se repetiu**: no holdout ela deixa faltar um pouco mais que
  a média móvel em Carro, e as duas superestimam a categoria.
- **Decisão: mantém a regressão em produção, agora retreinada** (seção abaixo). O desempate entre os modelos e a hipótese de
  modelo por categoria (regressão para Carro, média móvel para as demais) ficam para o **próximo holdout fresco, de out/2026
  em diante**, com dados da produção.
- O holdout de mai a set/2026 foi **consumido**: entrou no treino do modelo de produção e não serve mais para avaliar nada.

## Modelo de produção retreinado (10/11/2026)

Até aqui `modelos/regressao_linear.pkl` (e `classificador.pkl`) eram o ajuste da **v1** (só o treino de mai/2023 a out/2025,
632 linhas): os coeficientes são idênticos aos de um ajuste nesses dados. Esses dois arquivos continuam como material do TCC
(SHA-256 `7d8e73cd…` e `60fdffe5…`, inalterados). A produção passa a usar
`modelos/regressao_linear_producao.pkl` e `classificador_producao.pkl`, reajustados com **treino + teste da v2 + holdout**
(mar/2022 a set/2026), pelo comando `python scripts/serializar_modelos_producao.py --producao`.

| Entrada (fora do git) | SHA-256 |
|---|---|
| `features_treino.csv` (v2) | `1d77679b7b333c692e00cf76c29a929bf48c03134a7a76e1132d09826667966b` |
| `features_teste.csv` (v2) | `fb89fa975fce4d700faa6dc540cc4a2d9f93db4d235a2351b2b3b03e1b04e9d7` |
| `features_holdout.csv` | `7d606bec4bc5acd48cf18dd8b49690f46381cbd9e6eff8fc52acba3019e553f9` |

| Saída (no git) | SHA-256 |
|---|---|
| `regressao_linear_producao.pkl` | `32557ea91f09e99d0b06851d5d9a97e7b4dc9236ff5070f6e4ae6f4efceb48dc` |
| `classificador_producao.pkl` | `30a7eb35ab9ce60636110219922fb3ccc888d94389cefcac6b250ee5f3c1c3ac` |

- scikit-learn 1.9.1, Python 3.11.9. 2.494 linhas grupo x mês, **1.855 com as 6 features completas** (as usadas no ajuste).
- **Reprodução:** reajustar uma segunda vez gera `.pkl` idênticos byte a byte (mesmo SHA-256).
- Não há avaliação desse ajuste (não sobra dado fora do treino). A referência de qualidade é o holdout acima, que usou a mesma
  receita sem o holdout (treino + teste): MASE 0,835.

| Coeficiente da regressão | Produção até 09/11 (v1, 632 linhas) | Retreinada (1.855 linhas) |
|---|---|---|
| intercepto | 0,068 | 0,018 |
| `mm3` | 0,344 | 0,352 |
| `mm6` | 0,593 | 0,467 |
| `mes_sin` | 0,663 | 0,373 |
| `mes_cos` | 0,187 | 0,133 |
| `qty_mesmo_mes_ano_anterior` | 0,056 | 0,176 |
| `tempo_desde_ultima_venda_meses` | 0,026 | 0,002 |

Logística retreinada: intercepto -0,888; `mm3` 0,219, `mm6` 0,777, `mes_sin` 0,157, `mes_cos` 0,045,
`qty_mesmo_mes_ano_anterior` 0,062, `tempo_desde_ultima_venda_meses` -0,108.

**Próximo holdout fresco:** out/2026 em diante, com as vendas registradas na produção (o sistema registra desde 09/10/2026;
01 a 08/10 seguem como faltante). Não usar esse período no treino antes de avaliá-lo.
