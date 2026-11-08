# Torneio de modelos — 2026-11-08 00:02

Commit: `desconhecido` · Versões: `{"python": "3.11.9", "numpy": "2.4.4", "pandas": "3.0.5", "scikit-learn": "1.9.1", "seed": 42}`

Dados (SHA-256): `features_treino.csv` `2d651b306150…`, `features_teste.csv` `9bb85f537bef…`

## Regras

- Validação: rolling origin, 6 dobras (um mês cada, treino só com meses anteriores), janela crescente.
- Escolha: MASE agregado; empate técnico = até 0.05 de MASE; desempate = menor viés ≥ 0; depois o mais simples.
- MAPE/MdAPE ignoram meses com venda real zero; MASE e MAE usam todas as linhas previstas.
- `dif_MASE_vs_base`: MASE do modelo − MASE da média móvel (negativo = melhor), IC 95% por bootstrap de grupos (1000 sorteios, seed 42).
- O teste congelado já havia sido visto antes deste torneio (métricas de base do TCC e comparação exploratória); 'uma vez só' vale daqui para frente e fica registrado em `registro_teste.csv`.

## Validação (usada para escolher)

| modelo | hiperparametros | MASE | MASE_aparado | MAE | vies | MAPE | MdAPE | dif_MASE_vs_base | IC95_inf | IC95_sup | n_linhas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Média móvel 3m | {} | 0.892 | 0.721 | 1.51 | +0.41 | 65.7% | 50.0% | +0.000 | +0.000 | +0.000 | 299 |
| Naive sazonal | {} | 0.887 | 0.680 | 2.01 | +0.29 | 79.5% | 75.0% | -0.005 | -0.175 | +0.177 | 299 |
| Croston | {"alpha": 0.3} | 3.179 | 1.488 | 1.65 | +0.68 | 63.7% | 45.0% | +2.287 | +0.281 | +4.674 | 299 |
| SBA | {"alpha": 0.3} | 2.789 | 1.356 | 1.53 | +0.07 | 59.0% | 46.1% | +1.898 | +0.187 | +3.915 | 299 |
| Regressão linear | {} | 0.818 | 0.652 | 1.51 | +0.53 | 69.7% | 53.8% | -0.074 | -0.164 | +0.012 | 299 |
| Árvore | {"max_depth": 8} | 0.943 | 0.785 | 1.50 | +0.51 | 63.7% | 56.4% | +0.051 | -0.039 | +0.145 | 299 |
| Random Forest | {"n_estimators": 200, "max_depth": 8} | 0.910 | 0.765 | 1.41 | +0.33 | 59.9% | 49.6% | +0.019 | -0.070 | +0.117 | 299 |
| MLP | {"arquitetura": [16, 8]} | 1.015 | 0.790 | 1.75 | +0.65 | 69.9% | 48.7% | +0.124 | -0.018 | +0.276 | 299 |

**Campeão: Regressão linear.** Regressão linear tem o menor MASE de validação (0.818), sem empate técnico (tolerância 0.05).

Atenção: hiperparâmetro escolhido na BORDA da grade (o ótimo pode estar fora dela): Croston {"alpha": 0.3}, SBA {"alpha": 0.3}, MLP {"arquitetura": [16, 8]}.

## Teste congelado (nota final, avaliado uma vez)

| modelo | hiperparametros | MASE | MASE_aparado | MAE | vies | MAPE | MdAPE | dif_MASE_vs_base | IC95_inf | IC95_sup | n_linhas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Média móvel 3m | {} | 0.968 | 0.767 | 1.93 | -0.26 | 65.1% | 66.7% | +0.000 | +0.000 | +0.000 | 247 |
| Naive sazonal | {} | 1.295 | 1.041 | 2.32 | +1.24 | 104.9% | 57.4% | +0.327 | +0.096 | +0.581 | 247 |
| Croston | {"alpha": 0.3} | 1.115 | 0.939 | 1.93 | +0.07 | 58.0% | 46.6% | +0.147 | +0.004 | +0.320 | 247 |
| SBA | {"alpha": 0.3} | 1.053 | 0.866 | 1.94 | -0.52 | 54.3% | 45.8% | +0.085 | -0.051 | +0.247 | 247 |
| Regressão linear | {} | 1.198 | 1.039 | 1.99 | +0.42 | 60.3% | 39.5% | +0.230 | +0.111 | +0.382 | 247 |
| Árvore | {"max_depth": 8} | 1.120 | 0.925 | 2.28 | +0.67 | 86.3% | 64.1% | +0.152 | +0.028 | +0.295 | 247 |
| Random Forest | {"n_estimators": 200, "max_depth": 8} | 1.076 | 0.909 | 2.08 | +0.58 | 72.8% | 60.9% | +0.108 | +0.025 | +0.201 | 247 |
| MLP | {"arquitetura": [16, 8]} | 1.202 | 1.034 | 2.13 | +0.82 | 83.1% | 57.9% | +0.235 | +0.134 | +0.354 | 247 |

## Cobertura no teste (o que cada modelo consegue prever, em todas as linhas do teste)

| modelo | cobertura_linhas | cobertura_total_linhas | cobertura_grupos | cobertura_total_grupos | % linhas |
|---|---|---|---|---|---|
| Média móvel 3m | 247 | 247 | 43 | 43 | 100% |
| Naive sazonal | 247 | 247 | 43 | 43 | 100% |
| Croston | 247 | 247 | 43 | 43 | 100% |
| SBA | 247 | 247 | 43 | 43 | 100% |
| Regressão linear | 247 | 247 | 43 | 43 | 100% |
| Árvore | 247 | 247 | 43 | 43 | 100% |
| Random Forest | 247 | 247 | 43 | 43 | 100% |
| MLP | 247 | 247 | 43 | 43 | 100% |

As métricas acima usam só as linhas COMUNS (grupo com histórico e as 6 features completas); a cobertura mostra quantas linhas/grupos cada modelo preveria por conta própria.

Campeão da validação: **Regressão linear**. Melhor MASE no teste: **Média móvel 3m** (NÃO coincidem — o teste NÃO confirmou o campeão da validação; o campeão oficial segue sendo o da validação, e o teste não o altera).
