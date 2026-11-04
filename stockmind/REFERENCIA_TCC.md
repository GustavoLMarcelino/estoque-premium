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

## Limitação conhecida: scripts de árvore, Random Forest, MLP, confiança e limiar

`treinar_arvore.py`, `treinar_random_forest.py`, `treinar_mlp.py`, `avaliar_confianca.py` e `explorar_limiar.py`
**falham com `KeyError: 'produto'`** no código desta tag. Eles esperam features por produto, e o pipeline passou a
agregar por grupo (categoria, amperagem, tecnologia). O mesmo erro acontece no commit `6716863`, anterior a qualquer
mudança desta etapa, e o módulo `stockmind/` entra no git inteiro em `b38ef41`, sem histórico anterior. Se o RFC/TCC cita
métricas desses modelos, elas vieram de uma versão por produto que **não está no git**.
