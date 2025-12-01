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

## Landing Page do projeto
### Nesta tela são apresentadas algumas informações essenciais sobre a loja, como dados de contato, serviços oferecidos e localização, tudo pensado para facilitar a vida do cliente. Também há um botão direto para o WhatsApp, permitindo que o cliente inicie uma conversa com a loja de forma rápida e prática para tirar dúvidas ou solicitar atendimento.
<img width="1858" height="918" alt="{4F071B73-6468-4A28-B609-6C79AB35CB1A}" src="https://github.com/user-attachments/assets/3830f3e3-a314-45a2-bea6-57ce92d0dccc" />
<img width="1858" height="918" alt="{725A15F1-7FB6-4925-9AEE-BAE539EB049F}" src="https://github.com/user-attachments/assets/0a5d8d75-272b-461b-96ac-7dc6a8bc2846" />
<img width="1858" height="918" alt="{556243FD-5B5A-4BB2-9EDA-5BC6EEE3F069}" src="https://github.com/user-attachments/assets/9a68b66c-a300-4253-9aa3-a2510f4a2c12" />
<img width="1858" height="918" alt="{1B7D0551-D3E4-4A59-8451-0309ACA320CF}" src="https://github.com/user-attachments/assets/6ebd5d3a-faa5-44ad-9031-2e46902843d9" />
<img width="1858" height="918" alt="{CBE669BB-9B0D-457E-B5F6-6CD2A16F55A5}" src="https://github.com/user-attachments/assets/1e912a13-dd0a-4da5-845a-140deb763882" />
<img width="1858" height="918" alt="{ABD99EC5-F753-49CF-ABEF-DEF0F19E8CB5}" src="https://github.com/user-attachments/assets/6560fb37-f5e5-4651-b99d-ed6571e79b30" />

## Tela de Login
### Tela inicial de acesso ao sistema, onde o usuário cadastrado informa e-mail e senha para entrar no Estoque Premium. Essa etapa garante que apenas pessoas autorizadas possam visualizar e manipular os dados de estoque, reforçando a segurança das informações da empresa.
<img width="1858" height="918" alt="{B5B964F5-DEA6-42E2-84AB-7EA1BE929E2C}" src="https://github.com/user-attachments/assets/e116c417-3596-4fcf-b5c1-e7a305206712" />

## Home
### Esta é a primeira tela dentro do módulo de estoque. Nela são exibidas as últimas movimentações realizadas, o quantitativo de produtos em estoque, o valor total do estoque, a lista de produtos críticos (abaixo da quantidade mínima) e um resumo das vendas da semana. Esse painel oferece uma visão geral rápida e objetiva da situação do estoque, auxiliando na tomada de decisão do dia a dia.
<img width="1858" height="918" alt="{AC18B416-E674-45E1-82DC-3E2AA8D1D14B}" src="https://github.com/user-attachments/assets/11c93a7c-8b19-4f07-9fe8-1d932b7ff6c1" />

## Estoque de Baterias
### Nesta tela são listadas todas as baterias cadastradas no sistema, exibindo informações completas de cada item: modelo, custo, valor de venda, lucro, quantidade mínima, tempo de garantia, quantidade inicial, entradas, saídas e o saldo atual em estoque. Além disso, a tela oferece ações rápidas como editar e excluir, facilitando a manutenção e atualização dos dados dos produtos.
<img width="1858" height="918" alt="{E7E987E1-62C3-4D74-BCE8-212E544B9732}" src="https://github.com/user-attachments/assets/2568086b-9e24-4c15-823c-e20a9de43797" />

## Cadastro
### Nesta tela são realizados os cadastros dos itens do sistema. Ao registrar um produto, o usuário pode definir para qual estoque ele será destinado, escolhendo entre Estoque de Baterias ou Estoque do Som. A exibição foi ajustada com redução de zoom para permitir a visualização completa da tabela em um único print.
<img width="1858" height="918" alt="{F88752C6-2869-4575-A811-2712D0358B11}" src="https://github.com/user-attachments/assets/c66e664e-86ee-4672-9e9d-7e1458465d10" />

## Tabela de Preços
### Nesta tela são exibidos os valores de venda de todos os produtos cadastrados. Como a loja oferece 10% de desconto nas vendas à vista, o sistema já realiza esse cálculo de forma automática, mostrando tanto o preço original quanto o valor com desconto. Isso facilita o atendimento, agiliza o cálculo no momento da venda e reduz o risco de erros nos valores informados ao cliente.
<img width="1858" height="918" alt="{2179CF2E-A5AF-44C8-A3E7-77CA1AA768EC}" src="https://github.com/user-attachments/assets/048f0a97-ebf5-42ff-8279-187b2d1a5873" />
<img width="1858" height="918" alt="{076C0682-BAC1-4859-A2FB-82B45F03ECD0}" src="https://github.com/user-attachments/assets/50728f63-67c6-4a8d-8c92-88c505d0bf7d" />

## Lançamento de Entrada e Saída
### Nesta tela o usuário realiza o lançamento das movimentações de estoque de forma simples e guiada. Primeiro, seleciona qual estoque será utilizado; em seguida, define o tipo de movimentação, escolhendo entre entrada ou saída de produto. Depois, escolhe o produto desejado e, por último, informa a quantidade. Ao confirmar, o sistema atualiza automaticamente o estoque, mantendo todo o controle de forma organizada e precisa.
<img width="1858" height="918" alt="{454B6768-AE0D-46F7-AD0F-B2F3C201E683}" src="https://github.com/user-attachments/assets/a2a93fa7-3942-4cb2-8e34-97e2c84c981b" />

## Registro de Movimentação
### Nesta tela ficam salvos todos os registros de lançamentos realizados no sistema. Aqui é possível consultar, de forma organizada, as entradas e saídas já efetuadas, permitindo acompanhar o histórico de movimentações, conferir informações em caso de dúvidas e apoiar eventuais auditorias ou conferências de estoque.
<img width="1858" height="918" alt="{1C9BB0B9-1F19-4543-BBF2-09ABD13862E0}" src="https://github.com/user-attachments/assets/8d50fdb2-0c82-4bc3-9e8f-a98be0582629" />

## Dashboards
### Nesta tela são apresentados os gráficos e indicadores relacionados às máquinas de cartão utilizadas pela loja. O usuário pode visualizar de forma clara as taxas cobradas por tipo de operação (crédito, débito, parcelado etc.).
<img width="1858" height="918" alt="{84BAE78C-52FF-4669-911C-A8EBE3CEEDFE}" src="https://github.com/user-attachments/assets/8284b277-3643-45fc-8fae-6abf36f78331" />

## Garantia
### Nesta área é realizado o cadastro completo das garantias da loja. O sistema registra os dados do cliente e todas as informações do produto deixado em garantia, garantindo rastreabilidade do atendimento. A ferramenta permite também o envio de uma mensagem direta para o cliente, funcionando como um comprovante digital da bateria ou produto deixado na loja. Além disso, há uma aba específica para empréstimo de garantia, onde é possível cadastrar a bateria emprestada ao cliente; ao confirmar o empréstimo, o sistema já realiza automaticamente a baixa no estoque, mantendo o controle sempre atualizado.
<img width="1858" height="918" alt="{2293546E-12F9-43A6-AB3A-BB69091C2698}" src="https://github.com/user-attachments/assets/e6d46f6e-4167-4cf7-9394-5cdb2eacb606" />

## Consulta de Garantia
### Nesta tela são exibidas todas as garantias cadastradas no sistema. O usuário pode visualizar de forma organizada as informações de cada garantia registrada, facilitando o acompanhamento dos atendimentos, a conferência de prazos e o controle dos produtos que estão em análise ou aguardando retorno ao cliente.
<img width="1858" height="918" alt="{2A4D5D52-9997-4B23-8361-B7864F0C1B08}" src="https://github.com/user-attachments/assets/af49e5ca-9e6e-4c81-9f0e-d4050cf13132" />



