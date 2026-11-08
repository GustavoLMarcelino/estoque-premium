# Resultados do torneio e dos modelos adaptados (StockMind / TCC)

Só métricas agregadas (por modelo, hiperparâmetro e dobra). **Não há venda por produto, mês ou cliente**: cada `teste.csv`
tem uma linha por modelo, e o `registro_teste.csv` tem uma linha por avaliação do teste.

Teste em todos: **nov/2025 a abr/2026**, em linhas grupo x mês (grupo = categoria, amperagem, tecnologia).

- **v1:** treino mai/2023 a out/2025 (1.162 linhas); teste com 285 linhas, 253 pontuáveis.
- **v2:** treino mar/2022 a out/2025, com o livro caixa antigo (1.908 linhas); teste com 318 linhas, 301 pontuáveis.
  O teste é o mesmo período e as mesmas vendas; só o histórico de treino é maior.

| Pasta | Base | O que é | Gerado por |
|---|---|---|---|
| `metricas_stdout_scripts_adaptados_2026-11-03/` | v1 | Saída (stdout) dos scripts de árvore, Random Forest, MLP, confiança e limiar, em 03/11/2026. Os hiperparâmetros desses scripts foram escolhidos olhando o próprio teste (exploratório). O rótulo "produto x mês" impresso em `avaliar_confianca.txt` é antigo: a unidade é grupo x mês. | `treinar_arvore.py`, `treinar_random_forest.py`, `treinar_mlp.py`, `avaliar_confianca.py`, `explorar_limiar.py` |
| `torneio_2026-11-03/` | v1 | Torneio oficial: validação em 6 dobras (mai a out/2025) escolhe o campeão e os hiperparâmetros; teste congelado pontuado uma vez. Inclui `registro_teste.csv` (avaliação do teste, 03/11/2026). Features: SHA-256 `747d5aba…` (treino) e `1cd8cce4…` (teste). | `torneio_modelos.py` |
| `comparacao_v1_v2/torneio_completo_A/` | v1 | Torneio com os dados da v1, teste inteiro (285 linhas; 253 pontuáveis). Mesmos números do `torneio_2026-11-03`. | `torneio_modelos.py` (cópia de trabalho, trava de integridade desligada) |
| `comparacao_v1_v2/torneio_completo_B/` | v2 | Torneio com os dados da v2, teste inteiro (318 linhas; 301 pontuáveis). Mesmos números da rodada oficial da v2. Features: `1d77679b…` e `fb89fa97…`. | idem |
| `comparacao_v1_v2/torneio_comum_A/` e `torneio_comum_B/` | v1 e v2 | O mesmo torneio, com o teste restrito às **247 linhas pontuáveis nas duas versões**, para comparar de forma justa. A = v1, B = v2. | idem |
| `comparacao_v1_v2/significancia.csv` | v1 x v2 | Diferença de erro (v2 menos v1) nas 247 linhas comuns: MAE, IC 95% por bootstrap de grupos, Diebold-Mariano e MASE na mesma escala (naive do treino da v1). | script de significância (não incluído) |

Notas:
- `campeao.json` guarda os hiperparâmetros escolhidos na validação e o SHA-256 dos CSVs de features usados. Nos `torneio_comum_*` o hash difere porque os CSVs foram refeitos só com as linhas comuns.
- O MASE do torneio usa a escala do treino de cada versão; por isso só o `significancia.csv` compara o MASE v1 x v2 na mesma escala. O MAE é comparável direto.
- Leitura e conclusões: ver `../REFERENCIA_TCC.md` (seção "Versão v2").
- Os CSVs de dados (`treino.csv`, `teste.csv`, features, planilhas) e os `.pkl` **não** estão neste repositório.
