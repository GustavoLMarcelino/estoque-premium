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

1. No PC, atualize `stockmind/data/raw/vendas_saidas_final.xlsx` (aba `Sheet1`, mesmas colunas).
2. No PC, regenere os CSVs: `cd stockmind && python scripts/preparar_dados.py`. Isso grava em `stockmind/data/processed/` o `treino.csv` (até out/2025), o `teste.csv` (nov/2025 a abr/2026) e o `recente.csv` (de maio/2026 em diante). Só o `recente.csv` muda quando a planilha ganha meses novos; treino e teste ficam congelados (métricas do TCC, ver `REFERENCIA_TCC.md`).
3. Faça backup dos CSVs atuais na EC2 e copie os novos (origem no PC, destino na EC2):

```bash
ssh -i ~/.ssh/premium-baterias-key.pem ubuntu@18.229.20.120 \
  'cd /var/www/estoque-premium/stockmind/data/processed && cp treino.csv treino.csv.bak && cp teste.csv teste.csv.bak && { [ ! -f recente.csv ] || cp recente.csv recente.csv.bak; }'
scp -i ~/.ssh/premium-baterias-key.pem \
  stockmind/data/processed/treino.csv stockmind/data/processed/teste.csv stockmind/data/processed/recente.csv \
  ubuntu@18.229.20.120:/var/www/estoque-premium/stockmind/data/processed/
```

4. Rode o script (comando acima). O log mostra a cobertura (`Cobertura de dados: Excel ... a ...`) e qualquer `LACUNA` que sobrar.
