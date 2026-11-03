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
