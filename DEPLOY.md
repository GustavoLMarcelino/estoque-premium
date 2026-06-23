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
