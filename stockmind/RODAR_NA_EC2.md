# Rodar o StockMind na EC2

Gera `stockmind/saida/previsao_atual.json` (o que as telas do StockMind leem). Só faz SELECT.

- Pasta: `/var/www/estoque-premium/stockmind`
- Venv: `/home/ubuntu/venv` (Python 3.14.4). O Python do sistema não tem as bibliotecas.
- Precisa de `data/processed/treino.csv` e `teste.csv` (ignorados pelo git; já estão na EC2).

Instalar as dependências (uma vez, só wheels, sem compilar; o scikit-learn precisa ser 1.9.1, a versão dos `.pkl`):

```bash
cd /var/www/estoque-premium/stockmind
~/venv/bin/python -m pip install --only-binary=:all: -r requirements.txt
```

Rodar:

```bash
cd /var/www/estoque-premium/stockmind
U=$(grep "^DATABASE_URL_MYSQL" ../backend/.env | cut -d'"' -f2)
export DATABASE_URL="${U%%\?*}"
~/venv/bin/python scripts/gerar_previsao_producao.py
```

Se o JSON sair errado, restaure o backup: `cp saida/previsao_atual_schema1_18-09.json saida/previsao_atual.json` (formato antigo: as telas pedem para regerar).

## Atualizar o histórico do Excel na EC2

O script lê `data/processed/treino.csv`, `teste.csv` e `recente.csv` (ignorados pelo git: não vêm no deploy, são copiados à mão). O fim da planilha define onde acaba a cobertura do Excel; o que não tem dado (nem Excel, nem sistema) é tratado como faltante, não como venda zero.

1. No PC, gere a planilha de origem em duas etapas (ambas leem arquivos de `stockmind/data/raw/`, que não vão para o git):
   - `python scripts/importar_livro_caixa.py data/raw/livro_caixa.txt` junta o livro caixa de mar/2022 a mai/2023 à `vendas_saidas_final.xlsx` e gera `vendas_saidas_com_livro_caixa.xlsx` (v2; não altere, o hash está no `REFERENCIA_TCC.md`).
   - `python scripts/importar_livro_caixa.py --livro-2026 <livro_2026.md>` lê o livro caixa de 2026 (um bloco ```csv por mês, colunas `data,marca,amperagem,quantidade`) e gera `vendas_saidas_com_livro_caixa_2026.xlsx`, a planilha que o `preparar_dados.py` lê. As linhas da planilha a partir da primeira data do livro são substituídas, não somadas. Linha que nenhuma regra reconhece interrompe a importação: acrescente a regra em `importar_livro_caixa.py` (e um caso em `tests/test_importar_livro_caixa.py`).
2. No PC, regenere os CSVs: `cd stockmind && python scripts/preparar_dados.py`. Isso grava em `stockmind/data/processed/` o `treino.csv` (mar/2022 a out/2025), o `teste.csv` (nov/2025 a abr/2026) e o `recente.csv` (de maio/2026 em diante). Só o `recente.csv` muda quando a planilha ganha meses novos; treino e teste ficam congelados (métricas do TCC, ver `REFERENCIA_TCC.md`): confira que o SHA-256 deles continua igual ao registrado lá.
3. Faça backup dos CSVs atuais na EC2 e copie o `recente.csv` novo (treino e teste só precisam ser copiados se mudarem; origem no PC, destino na EC2):

```bash
ssh -i ~/.ssh/premium-baterias-key.pem ubuntu@18.229.20.120 \
  'cd /var/www/estoque-premium/stockmind/data/processed && cp treino.csv treino.csv.bak && cp teste.csv teste.csv.bak && { [ ! -f recente.csv ] || cp recente.csv recente.csv.bak; }'
scp -i ~/.ssh/premium-baterias-key.pem \
  stockmind/data/processed/treino.csv stockmind/data/processed/teste.csv stockmind/data/processed/recente.csv \
  ubuntu@18.229.20.120:/var/www/estoque-premium/stockmind/data/processed/
```

4. Rode o script (comando acima). O log mostra a cobertura (`Cobertura de dados: Excel ... a ...`) e qualquer `LACUNA` que sobrar.

## Modelos de produção (`modelos/*_producao.pkl`)

O script carrega `modelos/regressao_linear_producao.pkl` e `classificador_producao.pkl`, que vêm pelo git (deploy). Os `.pkl` sem sufixo são do TCC e não são usados em produção. Para reajustar com mais histórico (no PC):

```bash
cd stockmind
python scripts/gerar_features.py --holdout          # features_holdout.csv (mai/2026 em diante)
python scripts/serializar_modelos_producao.py --producao
```

O log mostra o SHA-256 dos dados e dos `.pkl`, os coeficientes e a versão do scikit-learn (tem de ser a 1.9.1 do `requirements.txt`). Registre os hashes no `REFERENCIA_TCC.md`, faça commit dos `.pkl` e, depois do deploy, rode o script (com backup do `previsao_atual.json`). Depois que um período entra no treino ele deixa de servir como holdout.

## Estoque parado (cards do Dashboard Inteligente)

`GET /api/stockmind/estoque-parado` calcula, para cada SKU com estoque, os dias desde a venda ou a entrada de compra mais recente. Estoque, custo, última venda e última entrada vêm do banco na hora; só a última venda **antiga** (Excel e livro caixa, por marca + grupo) vem do `previsao_atual.json`, campos `ultimaVendaHistorico` e `ultimaVendaHistoricoNivel` de cada SKU. Rode o script quando entrar SKU novo, para ele receber essa data.

- Limites (90 dias: promoção; 120 dias: verificar carga): constantes `LIMITE_PROMOCAO_DIAS` e `LIMITE_RECARGA_DIAS` em `backend/src/services/estoqueParado.js`.
- Empréstimo de garantia (`garantia_id` preenchido) não conta como venda nem como entrada de compra.
- **Compra ainda não lançada como entrada:** informe a data de chegada em `stockmind/chegadas_manuais.json`, no formato `{ "108": "2026-10-28" }` (id do SKU: data `AAAA-MM-DD`). Vale como entrada/compra e o SKU deixa de aparecer como parado. O arquivo é lido a cada chamada (sem reiniciar); remova a linha quando a entrada for lançada no sistema.
