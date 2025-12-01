# Estoque Premium

PAC - Projeto de Aprendizagem Colaborativa Extensionista do Curso de Engenharia de Software da Católica de Santa Catarina.

Sistema web para controle de estoque de baterias automotivas e acessórios, desenvolvido em parceria com a empresa **Premium Baterias**, localizada em Barra Velha/SC.

---

## Autores

- Andressa Lopes Rodrigues
- Davi Gonçalves Pereira
- Gustavo Luis Marcelino
- Rebaca Lara de Souza
- Stefani Paula Sant´ana

---

## Professores Orientadores

- **Luiz Carlos Camargo**  
- **Claudinei Dias**

---

## Justificativa do PAC

A empresa **Premium Baterias** realizava o controle de estoque de forma manual (planilhas simples e registros em papel), o que gerava:

- risco de erros nas entradas e saídas de produtos;  
- dificuldade em localizar informações sobre itens disponíveis;  
- falta de visão consolidada do valor em estoque;  
- impacto no atendimento ao cliente e na tomada de decisão.

O PAC **Estoque Premium** busca solucionar esse problema por meio do desenvolvimento de um sistema web de gestão de estoque, adequado à realidade da empresa parceira, com interface simples, relatórios básicos e recursos específicos para o segmento de baterias automotivas.

---

## Descrição do App

O **Estoque Premium** é um aplicativo web voltado para:

- Cadastro de produtos (baterias, acessórios, serviços);  
- Controle de entradas e saídas de estoque;  
- Registro de movimentações (tipo, data, quantidade, responsável);  
- Identificação de produtos críticos (abaixo da quantidade mínima);  
- Acompanhamento do valor total em estoque;  
- Visualização das últimas movimentações e informações resumidas em um painel inicial.

O objetivo é tornar o processo de gestão de estoque mais organizado, confiável e acessível para a empresa beneficiada, contribuindo para a melhoria do atendimento e a sustentabilidade do negócio.

---

## Tecnologias Utilizadas

- **Frontend:** React + Vite (JavaScript)  
- **Estilização:** CSS / Tailwind 
- **Backend / Banco de Dados:**  Node.js e AWS
- **Autenticação:** bcrypt
- **Hospedagem:** Não tem ainda

---

## Requisitos para preparar o ambiente de desenvolvimento

Antes de iniciar, certifique-se:

- Na raiz do projeto: NPM INSTALL
- Entre na pasta BACKEND: NPX PRISMA CREATE
- Crie um arquivo `.env` dentro da pasta BACKEND com o seguinte conteudo: 

DATABASE_URL="mysql://admin:Th3m!Hpao4s4hRPS@database-estoquepremium.cr24k20qw9ew.us-east-2.rds.amazonaws.com:3306/estoquepremium?sslaccept=accept_invalid_certs"

- Por ultimo NPM RUN DEV na raiz do projeto

---

# Prints

<img width="1846" height="917" alt="{4F071B73-6468-4A28-B609-6C79AB35CB1A}" src="https://github.com/user-attachments/assets/3830f3e3-a314-45a2-bea6-57ce92d0dccc" />






