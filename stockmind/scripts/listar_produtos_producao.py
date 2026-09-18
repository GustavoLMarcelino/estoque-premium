"""
StockMind — extrai SÓ os nomes (produto/modelo) dos produtos ativos de
Baterias em produção, para investigar se dá pra casar com os nomes do
Excel histórico. Leitura pura, nenhum dado financeiro/de venda — só
identificação de produto.

Roda na EC2 (mesma restrição de gerar_previsao_producao.py — a RDS não
é alcançável de fora). Uso:

    cd stockmind
    export DATABASE_URL="mesma connection string de produção"
    python scripts/listar_produtos_producao.py

Gera stockmind/saida/produtos_producao.json (gitignored) — copie esse
arquivo de volta pra rodar comparar_produtos_excel_producao.py.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent.parent
SAIDA_DIR = BASE_DIR / "saida"


def montar_engine():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL não definida no ambiente.")
    if url.startswith("mysql://"):
        url = "mysql+pymysql://" + url[len("mysql://"):]
    return create_engine(url)


def main():
    engine = montar_engine()
    with engine.connect() as conn:
        produtos = pd.read_sql(
            text(
                """
                SELECT e.id, e.produto, e.modelo
                FROM estoque e
                JOIN marca m ON m.id = e.marca_id
                WHERE m.ativo = 1
                ORDER BY e.produto, e.modelo
                """
            ),
            conn,
        )

    print(f"Produtos ativos (Baterias, marca.ativo=1): {len(produtos)}")

    registros = produtos.to_dict(orient="records")
    payload = {
        "gerado_em": datetime.now(timezone.utc).isoformat(),
        "total": len(registros),
        "produtos": registros,
    }

    SAIDA_DIR.mkdir(parents=True, exist_ok=True)
    caminho = SAIDA_DIR / "produtos_producao.json"
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"Salvo em: {caminho}")
    print("Copie esse arquivo de volta e me avise — ele só tem id/produto/modelo, nada financeiro.")


if __name__ == "__main__":
    main()
