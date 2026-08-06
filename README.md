<div align="center">

# 🔋 Estoque Premium

**Sistema web de gestão de estoque para baterias automotivas e acessórios**

Desenvolvido em parceria com a **Premium Baterias** · Barra Velha/SC

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com/)
[![AWS](https://img.shields.io/badge/AWS-232F3E?style=for-the-badge&logo=amazonwebservices&logoColor=white)](https://aws.amazon.com/)

*PAC — Projeto de Aprendizagem Colaborativa Extensionista*
*Curso de Engenharia de Software · Católica de Santa Catarina*

</div>

---

## 📑 Sumário

- [Sobre o Projeto](#-sobre-o-projeto)
- [Funcionalidades](#-funcionalidades)
- [Tecnologias](#-tecnologias)
- [Arquitetura](#-arquitetura)
- [Documentação](#-documentação)
- [Como Rodar Localmente](#-como-rodar-localmente)
- [Testes](#-testes)
- [Deploy](#-deploy)
- [Screenshots](#-screenshots)
- [Equipe](#-equipe)

---

## 💡 Sobre o Projeto

A empresa **Premium Baterias** realizava o controle de estoque de forma manual — planilhas simples e registros em papel —, o que gerava:

- ❌ risco de erros nas entradas e saídas de produtos;
- ❌ dificuldade em localizar informações sobre itens disponíveis;
- ❌ falta de visão consolidada do valor em estoque;
- ❌ impacto no atendimento ao cliente e na tomada de decisão.

O **Estoque Premium** soluciona esse problema com um sistema web de gestão de estoque adequado à realidade da empresa parceira: interface simples, relatórios básicos e recursos específicos para o segmento de baterias automotivas. O objetivo é tornar a gestão mais **organizada, confiável e acessível**, contribuindo para a melhoria do atendimento e a sustentabilidade do negócio.

---

## ✨ Funcionalidades

| | Funcionalidade |
|---|---|
| 📦 | **Cadastro de produtos** — baterias, acessórios e serviços, com destino a estoques distintos (Baterias / Som) |
| 🔄 | **Entradas e saídas** — lançamento guiado de movimentações com atualização automática do saldo |
| 🔊 | **Pedidos de instalação (Som)** — venda que combina peças e mão de obra por tipo de serviço, com baixa de estoque automática |
| 🧾 | **Histórico de movimentações** — tipo, data, quantidade e responsável, para consulta e auditoria |
| ✏️ | **Edição de vendas** — corrigir produto, quantidade, valor ou forma de pagamento de uma venda já lançada, com estorno seguro de estoque e registro em diário |
| ⚠️ | **Produtos críticos** — alerta de itens abaixo da quantidade mínima |
| 💰 | **Valor total em estoque** — visão consolidada do capital imobilizado, a preço de venda e a preço de custo |
| 🏷️ | **Tabela de preços** — preço à vista e parcelado calculados a partir do custo, da margem desejada e das taxas de maquininha |
| 📋 | **Inventário** — conferência de estoque por linha, com foto do saldo do sistema na abertura e relatório de divergências |
| 💵 | **Comissão quinzenal** — apuração por vendedor (valor fixo por bateria) e por instalação (percentual sobre mão de obra), com fechamento e histórico congelados |
| 📊 | **Dashboards** — faturamento, custo, lucro e taxas de maquininha por linha e por período |
| 🛡️ | **Gestão de garantias** — cadastro completo, comprovante digital via mensagem ao cliente e empréstimo de bateria com baixa automática no estoque |
| 👤 | **Usuários e permissões** — permissões granulares por tela, escopo por linha de produto e controle de acesso ao preço de custo |
| 🏠 | **Painel inicial** — últimas movimentações, quantitativos e resumo de vendas da semana |

---

## 🛠 Tecnologias

| Camada | Tecnologias |
|---|---|
| **Frontend** | React + Vite (JavaScript), CSS / Tailwind |
| **Backend** | Node.js (ESM), Express, Prisma ORM |
| **Banco de Dados** | SQLite (desenvolvimento) · MySQL / AWS RDS (produção) |
| **Autenticação** | JWT + bcrypt |
| **Testes** | Vitest + Supertest |
| **Infra / Deploy** | AWS (EC2 + RDS MySQL) · GitHub Actions (CI/CD) |

---

## 🏗 Arquitetura

```text
estoque-premium/
├── docs/       → documentação técnica (arquitetura, edição de vendas, dashboard)
├── frontend/   → aplicação React + Vite (SPA); em produção é servida como build estático
└── backend/    → API em Express (Node.js, ESM) com Prisma ORM
    └── prisma/
        ├── schema.prisma        → SQLite (desenvolvimento local)
        ├── schema.mysql.prisma  → MySQL / AWS RDS (produção)
        └── sql/                 → DDL manual aplicado à mão no RDS (+ ledger APLICADOS.md)
```

> O projeto usa **dual schema** no Prisma: SQLite para agilidade no desenvolvimento local e MySQL para produção na AWS. O Prisma **não** roda migration no deploy — mudanças estruturais em produção exigem SQL manual, controlado por um guard no pipeline.

---

## 📚 Documentação

| Documento | Conteúdo |
|---|---|
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | Linhas de produto, modelo de permissões, comissão quinzenal, auditoria e snapshots congelados |
| [docs/EDICAO_DE_VENDAS.md](docs/EDICAO_DE_VENDAS.md) | Ciclo de edição de venda: estorno seguro, ordem das validações, quinzena fechada |
| [docs/DASHBOARD.md](docs/DASHBOARD.md) | Endpoints de agregação, definição de receita por linha e decisões de escopo do lucro |
| [DEPLOY.md](DEPLOY.md) | Pipeline, guard de SQL manual, ritual de mudança de schema e rollback |
| [backend/prisma/sql/APLICADOS.md](backend/prisma/sql/APLICADOS.md) | Ledger de SQL já aplicado no RDS — é o que destrava o deploy |

---

## 🚀 Como Rodar Localmente

### Pré-requisitos

- [Node.js](https://nodejs.org/) (LTS recomendado)
- npm

### 1️⃣ Instale as dependências

```bash
npm install   # na raiz e nos subprojetos (frontend/ e backend/)
```

### 2️⃣ Configure o backend

Crie um arquivo `.env` dentro de `backend/` a partir de `backend/.env.example`, preenchendo com os valores do seu ambiente:

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão do banco (SQLite em dev, MySQL em produção) |
| `JWT_SECRET` | Segredo para assinar os tokens JWT (mínimo de 32 caracteres) |
| `PORT` | Porta da API (padrão `3000`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credenciais do admin criado pelo seed |
| `SMTP_SERVER` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` | Envio do e-mail de redefinição de senha |
| `FRONTEND_URL` | Origem(ns) permitida(s) no CORS e base do link de redefinição de senha |

### 3️⃣ Configure o frontend

Crie `frontend/.env` a partir de `frontend/.env.example` e ajuste `VITE_API_URL`.

### 4️⃣ Prepare o banco

```bash
cd backend
npx prisma generate
npm run seed   # opcional — cria o usuário admin
```

### 5️⃣ Suba a aplicação

Na **raiz**, um único comando sobe API e frontend juntos (via `concurrently`):

```bash
npm run dev
```

<details>
<summary>Ou separadamente, em dois terminais</summary>

```bash
cd backend  && npm run dev    # API   → http://localhost:3000
cd frontend && npm run dev    # SPA   → http://localhost:5173
```

</details>

> ⚠️ **Nunca versione** o arquivo `.env` nem valores reais de conexão ou segredos. Os arquivos `.env.example` contêm apenas os nomes das variáveis, com placeholders.

---

## 🧪 Testes

```bash
npm test -w backend      # da raiz
cd backend && npm test   # ou de dentro do backend
```

A suíte usa **Vitest + Supertest**, com um banco SQLite isolado por arquivo de teste, e cobre as regras de dinheiro e estoque de ponta a ponta: apuração de comissão, estorno, edição de venda, escopo de permissões e agregações do dashboard.

Rodar um arquivo só:

```bash
npx vitest run tests/comissao.test.js
```

Os testes também rodam no pipeline, no job `check`, junto com a validação dos dois schemas Prisma e a verificação de drift entre eles.

---

## ☁️ Deploy

O deploy em produção (**AWS EC2 + RDS**) é automatizado via **GitHub Actions** a cada push na branch `main`.

> ⚠️ Mudanças de schema exigem **SQL manual aplicado no RDS antes** do código subir. Um guard no pipeline bloqueia o deploy enquanto houver `.sql` não registrado no ledger.

📄 Pipeline, guard, ritual de mudança de schema, secrets e rollback: **[DEPLOY.md](DEPLOY.md)**.

---

## 📸 Screenshots

> ℹ️ Algumas capturas mostram versões anteriores das telas — ver [Capturas pendentes de atualização](#capturas-pendentes-de-atualização) ao final desta seção.

<details>
<summary><strong>🌐 Landing Page</strong></summary>

<br>

Apresenta informações essenciais sobre a loja — dados de contato, serviços oferecidos e localização — tudo pensado para facilitar a vida do cliente. Também há um botão direto para o WhatsApp, permitindo iniciar uma conversa com a loja de forma rápida e prática.

<img width="1858" height="918" alt="Landing Page - seção inicial" src="https://github.com/user-attachments/assets/3830f3e3-a314-45a2-bea6-57ce92d0dccc" />
<img width="1858" height="918" alt="Landing Page - serviços" src="https://github.com/user-attachments/assets/0a5d8d75-272b-461b-96ac-7dc6a8bc2846" />
<img width="1858" height="918" alt="Landing Page - produtos" src="https://github.com/user-attachments/assets/9a68b66c-a300-4253-9aa3-a2510f4a2c12" />
<img width="1858" height="918" alt="Landing Page - diferenciais" src="https://github.com/user-attachments/assets/6ebd5d3a-faa5-44ad-9031-2e46902843d9" />
<img width="1858" height="918" alt="Landing Page - localização" src="https://github.com/user-attachments/assets/1e912a13-dd0a-4da5-845a-140deb763882" />
<img width="1858" height="918" alt="Landing Page - contato" src="https://github.com/user-attachments/assets/6560fb37-f5e5-4651-b99d-ed6571e79b30" />

</details>

<details>
<summary><strong>🔐 Tela de Login</strong></summary>

<br>

Tela inicial de acesso ao sistema, onde o usuário cadastrado informa e-mail e senha. Garante que apenas pessoas autorizadas possam visualizar e manipular os dados de estoque, reforçando a segurança das informações da empresa.

<img width="1858" height="918" alt="Tela de Login" src="https://github.com/user-attachments/assets/e116c417-3596-4fcf-b5c1-e7a305206712" />

</details>

<details>
<summary><strong>🏠 Home</strong></summary>

<br>

Primeira tela dentro do módulo de estoque: últimas movimentações, quantitativo de produtos, valor total do estoque, lista de produtos críticos (abaixo da quantidade mínima) e resumo das vendas da semana. Uma visão geral rápida e objetiva para a tomada de decisão do dia a dia.

<img width="1858" height="918" alt="Home - painel inicial" src="https://github.com/user-attachments/assets/11c93a7c-8b19-4f07-9fe8-1d932b7ff6c1" />

</details>

<details>
<summary><strong>🔋 Estoque de Baterias</strong></summary>

<br>

Lista todas as baterias cadastradas com informações completas: modelo, custo, valor de venda, lucro, quantidade mínima, tempo de garantia, quantidade inicial, entradas, saídas e saldo atual. Oferece ações rápidas de editar e excluir.

<img width="1858" height="918" alt="Estoque de Baterias" src="https://github.com/user-attachments/assets/2568086b-9e24-4c15-823c-e20a9de43797" />

</details>

<details>
<summary><strong>📝 Cadastro</strong></summary>

<br>

Cadastro dos itens do sistema. Ao registrar um produto, o usuário define para qual estoque ele será destinado: **Estoque de Baterias** ou **Estoque do Som**. *(Exibição com redução de zoom para visualizar a tabela completa em um único print.)*

<img width="1858" height="918" alt="Tela de Cadastro" src="https://github.com/user-attachments/assets/c66e664e-86ee-4672-9e9d-7e1458465d10" />

</details>

<details>
<summary><strong>🏷️ Tabela de Preços</strong></summary>

<br>

Exibe os valores de venda de todos os produtos em duas colunas: **à vista** e **parcelado**. Os dois preços são calculados a partir do custo e da margem desejada, cada um já embutindo a taxa da maquininha correspondente — débito no à vista, crédito em 10x no parcelado. Assim o valor líquido depositado preserva a margem, sem cálculo manual no atendimento.

<img width="1858" height="918" alt="Tabela de Preços - parte 1" src="https://github.com/user-attachments/assets/048f0a97-ebf5-42ff-8279-187b2d1a5873" />
<img width="1858" height="918" alt="Tabela de Preços - parte 2" src="https://github.com/user-attachments/assets/50728f63-67c6-4a8d-8c92-88c505d0bf7d" />

</details>

<details>
<summary><strong>🔄 Lançamento de Entrada e Saída</strong></summary>

<br>

Lançamento de movimentações de forma simples e guiada: seleciona o estoque → define o tipo (entrada ou saída) → escolhe o produto → informa a quantidade. Ao confirmar, o sistema atualiza o estoque automaticamente.

<img width="1858" height="918" alt="Lançamento de Entrada e Saída" src="https://github.com/user-attachments/assets/a2a93fa7-3942-4cb2-8e34-97e2c84c981b" />

</details>

<details>
<summary><strong>🧾 Registro de Movimentação</strong></summary>

<br>

Todos os lançamentos realizados no sistema, organizados para consulta: histórico de entradas e saídas, conferência de informações e apoio a auditorias de estoque.

<img width="1858" height="918" alt="Registro de Movimentação" src="https://github.com/user-attachments/assets/8d50fdb2-0c82-4bc3-9e8f-a98be0582629" />

</details>

<details>
<summary><strong>📊 Dashboards</strong></summary>

<br>

Faturamento, custo, lucro bruto e líquido, taxas de maquininha e série de vendas por dia. Um seletor alterna entre **Baterias**, **Som** e **Ambos**; custo e lucro só aparecem para quem tem a permissão de ver custo. As definições de receita e as decisões de escopo estão em [docs/DASHBOARD.md](docs/DASHBOARD.md).

<img width="1858" height="918" alt="Dashboards" src="https://github.com/user-attachments/assets/8284b277-3643-45fc-8fae-6abf36f78331" />

</details>

<details>
<summary><strong>🛡️ Garantia</strong></summary>

<br>

Cadastro completo das garantias: dados do cliente e do produto deixado em garantia, com rastreabilidade do atendimento. Permite o envio de mensagem direta ao cliente como **comprovante digital**. Há também uma aba de **empréstimo de garantia** — ao confirmar o empréstimo de uma bateria, o sistema realiza automaticamente a baixa no estoque.

<img width="1858" height="918" alt="Cadastro de Garantia" src="https://github.com/user-attachments/assets/e6d46f6e-4167-4cf7-9394-5cdb2eacb606" />

</details>

<details>
<summary><strong>🔍 Consulta de Garantia</strong></summary>

<br>

Exibe todas as garantias cadastradas, facilitando o acompanhamento dos atendimentos, a conferência de prazos e o controle dos produtos em análise ou aguardando retorno ao cliente.

<img width="1858" height="918" alt="Consulta de Garantia" src="https://github.com/user-attachments/assets/af49e5ca-9e6e-4c81-9f0e-d4050cf13132" />

</details>

### Capturas pendentes de atualização

As telas abaixo evoluíram desde que as imagens foram tiradas. As descrições em texto já refletem o comportamento atual; as imagens, não.

| Tela | O que mudou |
|---|---|
| **Home** | Os indicadores de Valor Total e Custo Imobilizado viraram cards em carrossel, alternando entre Total, Baterias e Som. Produtos Críticos abre um modal agrupado por linha |
| **Dashboards** | Ganhou o seletor Baterias/Som/Ambos, série por dia e separação entre receita de peças e de mão de obra |
| **Registro de Movimentação** | Ganhou ações de editar e excluir por linha, com formulário embutido; na aba Som, os pedidos de instalação aparecem mesclados às movimentações |
| **Tabela de Preços** | Passou a exibir duas colunas de preço (à vista e parcelado) em vez de preço com desconto |
| **Lançamento de Entrada e Saída** | Ganhou a aba de pedido de instalação de Som, com itens de peça e serviço |
| **Telas sem captura** | Comissões, Inventário/Conferência, Usuários e Permissões, Orçamento |

---

## 👥 Equipe

### Autor Principal

**[Gustavo Luis Marcelino](https://github.com/GustavoLMarcelino)** — desenvolvimento e manutenção do projeto

### Colaboradores (fase inicial)

Participaram da concepção e da etapa inicial do projeto:

- Andressa Lopes Rodrigues
- Davi Gonçalves Pereira
- Rebeca Lara de Souza
- Stefani Paula Sant'ana

### Professores Orientadores

- **Luiz Carlos Camargo**
- **Claudinei Dias**

---

<div align="center">

Feito com 💙 por [Gustavo Luis Marcelino](https://github.com/GustavoLMarcelino)
*Engenharia de Software · Católica de Santa Catarina*

</div>
