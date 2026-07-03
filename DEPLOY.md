## Deploy automático (CI/CD)

Todo push na branch `main` dispara o workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml), que faz o deploy em produção automaticamente.

### Fluxo

```
push na main → GitHub Actions → SSH na EC2 → deploy → email de sucesso/falha
```

1. **Push na `main`**: qualquer push (merge de PR incluído) dispara o workflow.
2. **GitHub Actions**: o runner conecta na EC2 de produção via SSH (action `appleboy/ssh-action`), usando os secrets configurados no repositório.
3. **Deploy na EC2**: executa o comando de deploy padrão:
   ```bash
   cd /var/www/estoque-premium && git pull origin main && cd frontend && npm run build && cd ../backend && npx prisma generate --schema=prisma/schema.mysql.prisma && pm2 restart estoque-premium
   ```
4. **Notificação por email** (action `dawidd6/action-send-mail`):
   - **Sucesso**: email com o hash do commit, autor e horário do deploy.
   - **Falha**: email com link direto para os logs do run no GitHub Actions.

### Secrets necessários no GitHub

Cadastre em **Settings → Secrets and variables → Actions → New repository secret** (apenas os nomes abaixo; nunca versione os valores):

| Secret | O que é |
| --- | --- |
| `EC2_HOST` | IP ou hostname da EC2 de produção |
| `EC2_USER` | Usuário SSH usado no deploy |
| `EC2_SSH_KEY` | Chave privada SSH dedicada ao deploy (conteúdo completo, formato PEM) |
| `EC2_PORT` | Porta SSH da EC2 (normalmente 22) |
| `SMTP_SERVER` | Endereço do servidor SMTP para envio dos emails |
| `SMTP_PORT` | Porta do servidor SMTP (ex.: 465 ou 587) |
| `SMTP_USERNAME` | Usuário/email de autenticação no SMTP (também usado como remetente) |
| `SMTP_PASSWORD` | Senha ou app password do SMTP |
| `MAIL_TO` | Email(s) de destino das notificações (separar múltiplos por vírgula) |

### Segurança da chave SSH

A chave SSH usada pelo workflow é **restrita via forced command** no `authorized_keys` da EC2: independentemente do que for enviado pela conexão, ela só consegue executar o comando de deploy — não abre shell interativo nem executa nada além disso. Se a chave vazar, o dano fica limitado a disparar um deploy.

### Rollback manual

Se o deploy automático falhar (você receberá o email de falha com o link dos logs):

1. Verifique os logs do run no GitHub Actions para entender a causa.
2. Conecte na EC2 com sua chave pessoal (a chave do CI não serve para isso, por causa do forced command) e rode o deploy manualmente:
   ```bash
   cd /var/www/estoque-premium && git pull origin main && cd frontend && npm run build && cd ../backend && npx prisma generate --schema=prisma/schema.mysql.prisma && pm2 restart estoque-premium
   ```
3. Se o problema for um commit ruim na `main`, reverta o commit (`git revert <hash>`) e faça push — o próprio push do revert dispara um novo deploy automático com o código anterior.
4. Confira o estado do processo: `pm2 status estoque-premium` e `pm2 logs estoque-premium`.

## Deploy rapido

### Backend
- Defina variaveis sensiveis em um `.env` na pasta `backend` (ex.: `DATABASE_URL`, `PORT`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`).
- Rode `npm install` e inicie com `npm start` ou seu process manager preferido. CORS ja esta liberado.
- Opcional: rode `npm run seed` para garantir que o admin existe.

### Frontend (Vite)
- Configure a URL da API: crie `frontend/.env` copiando de `frontend/.env.example` e ajuste `VITE_API_URL` (use https se tiver SSL). Se nao definir, o front tenta `https://<seu-dominio>/api` e, por ultimo, `http://localhost:3000/api`.
- Build: `cd frontend && npm install && npm run build` (bundle em `frontend/dist/`).
- Preview local do build: `cd frontend && npm run preview -- --host`.
- Hospede os arquivos de `frontend/dist/` em um host estatico (Vercel/Netlify/S3+CloudFront/nginx etc.). Se servir o backend no mesmo dominio com proxy em `/api`, nao precisa alterar o front.
