# CRM Grupo YR

Aplicação local de atendimento, contratos, assinatura, financeiro e integração com WhatsApp do Grupo YR Hospitalar.

## Estrutura

- `client/`: frontend React + Vite.
- `server/`: API Node.js, PostgreSQL/Neon, contratos e integrações.
- `start_crm.py`: inicia API, frontend e tunnel rápido local quando o ambiente está configurado.
- `server/.env.example`: modelo sem credenciais.

## Rodar no PC

1. Instale Node.js e Python.
2. No diretório `crm/server`, execute `npm install`.
3. No diretório `crm/client`, execute `npm install`.
4. Copie `server/.env.example` para `server/.env` e preencha as variáveis localmente, inclusive `INITIAL_ADMIN_PASSWORD` se for inicializar um banco novo.
5. A partir desta pasta, execute `python start_crm.py`.

O código real do Neon, Meta/WhatsApp, Gemini e qualquer segredo deve ficar somente em `server/.env` ou no gerenciador de segredos. Sessões do Baileys, uploads, cache e dados locais também ficam fora do Git.

## Cloudflare

O launcher pode abrir um Quick Tunnel temporário para testes. Para produção, use um tunnel nomeado com domínio estável e credenciais armazenadas fora do repositório. O arquivo `cloudflared-crm.example.yml` é apenas um modelo.

## Observação de publicação

Este backend mantém conexões, WebSocket e integrações de WhatsApp. O diretório foi colocado no repositório do site como `crm/`, mas não é servido automaticamente pela Vercel como uma aplicação serverless. Para uso público contínuo, mantenha o backend em um servidor persistente (por exemplo, Hetzner) e use Neon para o banco.
