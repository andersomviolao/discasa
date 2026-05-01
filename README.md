# Discasa

Discasa é uma biblioteca desktop de arquivos e mídia que usa Discord como camada de armazenamento e sincronização. A interface é local, o estado principal é coordenado pelo app, e o bot fica como um adaptador leve para operações pontuais na API do Discord.

O projeto está organizado em dois pacotes principais:

- `discasa_app`: aplicativo desktop, backend local e tipos compartilhados do app.
- `discasa_bot`: serviço local do bot Discord, mantido pequeno para reduzir carga quando vários usuários usam o Discasa ao mesmo tempo.

Para detalhes completos de arquitetura e fluxos, veja [documentation.md](documentation.md).

## Estado Atual

O Discasa atualmente inclui:

- app desktop com Tauri 2, React 19 e Vite;
- backend local em Node.js/Express para OAuth, API local, persistência, cache e coordenação de sincronização;
- bot Discord em Node.js/Express com `discord.js`;
- sincronização de arquivos no canal `discasa-drive`;
- importação automática de arquivos adicionados manualmente no `discasa-drive`;
- espelhamento local opcional, com importação automática de arquivos colocados diretamente na pasta espelhada;
- limite fixo de `10 MiB` para cada upload enviado ao Discord;
- chunking automático de arquivos maiores que `10 MiB`;
- snapshots de índice, pastas e configuração armazenados no Discord;
- fluxo de login/instalação com tela de sincronização dinâmica;
- cache local de biblioteca, arquivos e thumbnails.

## Arquitetura Resumida

```text
Discasa
  discasa_app
    apps/desktop     Interface Tauri + React
    apps/server      Backend local do app
    packages/shared  Tipos e contratos compartilhados

  discasa_bot
    src              Serviço HTTP do bot Discord
    packages/shared  Tipos compartilhados usados pelo bot
```

O app é responsável por regras de produto e coordenação:

- chunking e manifesto de arquivos grandes;
- comparação e filtragem de anexos conhecidos;
- importação automática de arquivos externos;
- recovery/relink de snapshots;
- trash, restore e delete;
- cache local e espelhamento local;
- OAuth e fluxo de setup.

O bot é responsável apenas por operações que precisam da identidade do bot no Discord:

- verificar status e instalação no servidor;
- criar/reusar categoria e canais do Discasa;
- enviar anexos para canais;
- excluir mensagens de armazenamento;
- listar páginas brutas de anexos;
- resolver referências pontuais de anexos;
- ler e escrever snapshots.

## Estrutura Criada no Discord

Ao aplicar o Discasa em um servidor, o app cria ou reutiliza:

```text
Discasa
  #discasa-drive
  #discasa-index
  #discasa-trash
```

- `discasa-drive`: arquivos ativos.
- `discasa-index`: snapshots de índice, pastas e configuração.
- `discasa-trash`: armazenamento de itens enviados para a lixeira.

Instalações antigas podem ter canais legados `discasa-folder` e `discasa-config`; o app ainda possui recuperação para esses formatos.

## Limite de Upload

O Discasa usa limite fixo de `10 MiB` por envio ao Discord, mesmo que o servidor aceite arquivos maiores por boost/plano. Isso evita quebrar o armazenamento caso o servidor sofra downgrade.

Arquivos maiores que `10 MiB` são divididos pelo app em partes menores e registrados em um manifesto `chunked`. A leitura/reconstrução acontece pelo app.

## Desenvolvimento

### Requisitos

- Node.js 20 ou superior.
- Rust e dependências do Tauri para executar o desktop em modo desenvolvimento.
- Uma aplicação Discord com OAuth configurado, quando `MOCK_MODE=false`.
- Um bot Discord com token configurado, quando `MOCK_MODE=false`.

### Instalação

Na raiz do repositório:

```powershell
cd discasa_app
npm install

cd ..\discasa_bot
npm install
```

Copie os exemplos de ambiente:

```powershell
copy discasa_app\.env.example discasa_app\.env
copy discasa_bot\.env.example discasa_bot\.env
```

### Variáveis do App

`discasa_app\.env`:

```env
PORT=3001
FRONTEND_URL=http://localhost:1420
SESSION_SECRET=discasa-dev-session-secret
MOCK_MODE=true
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_URL=http://localhost:3002
DISCORD_REDIRECT_URI=http://localhost:3001/auth/discord/callback
```

### Variáveis do Bot

`discasa_bot\.env`:

```env
BOT_PORT=3002
MOCK_MODE=true
DISCORD_BOT_TOKEN=
```

### Executar

Use o launcher da raiz:

```powershell
.\start.bat
```

Ele inicia:

- bot em `3002`;
- backend local em `3001`;
- desktop Tauri/Vite em `1420`.

Para parar:

```powershell
.\stop.bat
```

## Scripts Úteis

App:

```powershell
cd discasa_app
npm run check
npm --workspace @discasa/desktop run build
npm --workspace @discasa/server run build
```

Bot:

```powershell
cd discasa_bot
npm run check
npm run build
```

Reset local:

```powershell
.\hard-reset.bat
```

O reset remove artefatos locais, `node_modules`, caches e dados locais do Discasa. Ele não remove canais ou arquivos existentes no Discord.

## Portas de Desenvolvimento

- `3001`: backend local do app.
- `3002`: serviço local do bot.
- `1420`: Vite/Tauri desktop.
- `5173`: porta alternativa usada pelo Vite em alguns cenários.

## Dados Locais

No Windows, o Discasa usa:

```text
%APPDATA%\Discasa
  auth.json
  mock-db.json

%LOCALAPPDATA%\Discasa\Cache
  files\
  thumbnails\
```

Também existe cache de biblioteca por servidor no storage local do desktop.

## Licença e Distribuição

O projeto ainda é privado/interno e não define uma licença pública neste repositório.
