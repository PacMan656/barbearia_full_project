# Barbearia — Front + Backend

## Como rodar

### Backend (API)
1. Entre em `barbearia_api/`
2. Copie `.env.example` para `.env` e ajuste se quiser.
3. Instale e rode:
   ```bash
   npm install
   npm run dev
   ```
   A API estará em `http://localhost:8080`.

### Frontend (HTML)
1. Entre em `barbearia_front/`
2. Abra `index.html` no navegador (clique 2x no arquivo ou sirva com Live Server/VS Code).
3. Na seção **Agendar**, salve um pedido localmente e clique **Sincronizar tudo**.
4. Verifique no backend (`admin/appointments` via token) ou pelo arquivo `data/barbearia.db`.

> Ajuste a constante `API_BASE` no `index.html` se necessário (porta/host).
