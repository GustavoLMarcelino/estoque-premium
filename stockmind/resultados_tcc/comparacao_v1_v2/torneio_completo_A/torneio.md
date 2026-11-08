# Torneio de modelos — 2026-11-08 00:01

Commit: `desconhecido` · Versões: `{"python": "3.11.9", "numpy": "2.4.4", "pandas": "3.0.5", "scikit-learn": "1.9.1", "seed": 42}`

Dados (SHA-256): `features_treino.csv` `747d5aba7355…`, `features_teste.csv` `1cd8cce41238…`

## Regras

- Validação: rolling origin, 6 dobras (um mês cada, treino só com meses anteriores), janela crescente.
- Escolha: MASE agregado; empate técnico = até 0.05 de MASE; desempate = menor viés ≥ 0; depois o mais simples.
- MAPE/MdAPE ignoram meses com venda real zero; MASE e MAE usam todas as linhas previstas.
- `dif_MASE_vs_base`: MASE do modelo − MASE da média móvel (negativo = melhor), IC 95% por bootstrap de grupos (1000 sorteios, seed 42).
- O teste congelado já havia sido visto antes deste torneio (métricas de base do TCC e comparação exploratória); 'uma vez só' vale daqui para frente e fica registrado em `registro_teste.csv`.

## Validação (usada para escolher)

| modelo | hiperparametros | MASE | MASE_aparado | MAE | vies | MAPE | MdAPE | dif_MASE_vs_base | IC95_inf | IC95_sup | n_linhas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Média móvel 3m | {} | 1.095 | 0.851 | 1.80 | +0.47 | 67.6% | 50.0% | +0.000 | +0.000 | +0.000 | 245 |
| Naive sazonal | {} | 1.059 | 0.792 | 2.39 | +0.42 | 79.1% | 66.7% | -0.037 | -0.223 | +0.174 | 245 |
| Croston | {"alpha": 0.3} | 1.719 | 0.983 | 1.78 | +0.65 | 64.7% | 45.6% | +0.623 | -0.069 | +1.882 | 245 |
| SBA | {"alpha": 0.3} | 1.570 | 0.916 | 1.66 | -0.06 | 59.5% | 44.8% | +0.475 | -0.122 | +1.549 | 245 |
| Regressão linear | {} | 1.158 | 0.823 | 1.78 | +0.55 | 72.2% | 53.9% | +0.062 | -0.160 | +0.412 | 245 |
| Árvore | {"max_depth": 8} | 1.269 | 1.012 | 2.06 | +0.62 | 79.7% | 63.9% | +0.173 | +0.046 | +0.305 | 245 |
| Random Forest | {"n_estimators": 100, "max_depth": null} | 1.230 | 1.006 | 1.94 | +0.51 | 73.5% | 51.4% | +0.135 | -0.005 | +0.268 | 245 |
| MLP | {"arquitetura": [16, 8]} | 1.228 | 0.982 | 2.11 | +0.75 | 71.1% | 54.2% | +0.133 | +0.020 | +0.262 | 245 |

**Campeão: Naive sazonal.** Empate técnico (MASE até 0.05 acima do melhor, 1.059) entre: Naive sazonal (MASE 1.059, viés +0.42), Média móvel 3m (MASE 1.095, viés +0.47). Critério de desempate: o de menor viés não negativo (erra levemente para cima) -> Naive sazonal.

Atenção: hiperparâmetro escolhido na BORDA da grade (o ótimo pode estar fora dela): Croston {"alpha": 0.3}, SBA {"alpha": 0.3}, MLP {"arquitetura": [16, 8]}.

## Teste congelado (nota final, avaliado uma vez)

| modelo | hiperparametros | MASE | MASE_aparado | MAE | vies | MAPE | MdAPE | dif_MASE_vs_base | IC95_inf | IC95_sup | n_linhas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Média móvel 3m | {} | 0.962 | 0.759 | 1.89 | -0.25 | 65.1% | 66.7% | +0.000 | +0.000 | +0.000 | 253 |
| Naive sazonal | {} | 1.235 | 1.009 | 2.26 | +1.21 | 104.9% | 57.4% | +0.273 | +0.044 | +0.541 | 253 |
| Croston | {"alpha": 0.3} | 1.729 | 0.973 | 1.89 | +0.08 | 57.4% | 46.6% | +0.767 | -0.006 | +2.188 | 253 |
| SBA | {"alpha": 0.3} | 1.570 | 0.905 | 1.90 | -0.50 | 53.9% | 45.8% | +0.608 | -0.060 | +1.813 | 253 |
| Regressão linear | {} | 2.282 | 1.331 | 2.06 | +0.43 | 56.7% | 38.2% | +1.319 | +0.305 | +3.172 | 253 |
| Árvore | {"max_depth": 8} | 1.184 | 0.981 | 2.09 | +0.43 | 70.7% | 56.4% | +0.221 | +0.081 | +0.360 | 253 |
| Random Forest | {"n_estimators": 100, "max_depth": null} | 1.319 | 1.093 | 2.16 | +0.88 | 77.0% | 58.5% | +0.356 | +0.208 | +0.503 | 253 |
| MLP | {"arquitetura": [16, 8]} | 1.400 | 1.173 | 2.14 | +0.15 | 83.8% | 49.4% | +0.438 | +0.309 | +0.588 | 253 |

## Cobertura no teste (o que cada modelo consegue prever, em todas as linhas do teste)

| modelo | cobertura_linhas | cobertura_total_linhas | cobertura_grupos | cobertura_total_grupos | % linhas |
|---|---|---|---|---|---|
| Média móvel 3m | 282 | 285 | 47 | 48 | 99% |
| Naive sazonal | 253 | 285 | 44 | 48 | 89% |
| Croston | 284 | 285 | 48 | 48 | 100% |
| SBA | 284 | 285 | 48 | 48 | 100% |
| Regressão linear | 253 | 285 | 44 | 48 | 89% |
| Árvore | 253 | 285 | 44 | 48 | 89% |
| Random Forest | 253 | 285 | 44 | 48 | 89% |
| MLP | 253 | 285 | 44 | 48 | 89% |

As métricas acima usam só as linhas COMUNS (grupo com histórico e as 6 features completas); a cobertura mostra quantas linhas/grupos cada modelo preveria por conta própria.

Campeão da validação: **Naive sazonal**. Melhor MASE no teste: **Média móvel 3m** (NÃO coincidem — o teste NÃO confirmou o campeão da validação; o campeão oficial segue sendo o da validação, e o teste não o altera).
