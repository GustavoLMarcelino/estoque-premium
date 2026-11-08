# Torneio de modelos — 2026-11-08 00:02

Commit: `desconhecido` · Versões: `{"python": "3.11.9", "numpy": "2.4.4", "pandas": "3.0.5", "scikit-learn": "1.9.1", "seed": 42}`

Dados (SHA-256): `features_treino.csv` `b880fb94f260…`, `features_teste.csv` `96bb41021080…`

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
| Média móvel 3m | {} | 0.973 | 0.764 | 1.92 | -0.27 | 65.1% | 66.7% | +0.000 | +0.000 | +0.000 | 247 |
| Naive sazonal | {} | 1.258 | 1.026 | 2.31 | +1.23 | 104.9% | 57.4% | +0.285 | +0.053 | +0.556 | 247 |
| Croston | {"alpha": 0.3} | 1.793 | 0.998 | 1.94 | +0.09 | 58.0% | 46.6% | +0.820 | +0.034 | +2.299 | 247 |
| SBA | {"alpha": 0.3} | 1.626 | 0.934 | 1.95 | -0.50 | 54.2% | 45.8% | +0.653 | -0.026 | +1.908 | 247 |
| Regressão linear | {} | 2.298 | 1.325 | 2.09 | +0.42 | 56.7% | 38.2% | +1.326 | +0.295 | +3.236 | 247 |
| Árvore | {"max_depth": 8} | 1.193 | 0.986 | 2.13 | +0.43 | 70.7% | 56.4% | +0.220 | +0.077 | +0.367 | 247 |
| Random Forest | {"n_estimators": 100, "max_depth": null} | 1.321 | 1.089 | 2.20 | +0.88 | 77.0% | 58.5% | +0.348 | +0.185 | +0.510 | 247 |
| MLP | {"arquitetura": [16, 8]} | 1.397 | 1.164 | 2.17 | +0.13 | 83.8% | 49.4% | +0.424 | +0.300 | +0.568 | 247 |

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

Campeão da validação: **Naive sazonal**. Melhor MASE no teste: **Média móvel 3m** (NÃO coincidem — o teste NÃO confirmou o campeão da validação; o campeão oficial segue sendo o da validação, e o teste não o altera).
