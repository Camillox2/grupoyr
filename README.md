# Grupo YR Hospitalar — Site React

Site institucional e catálogo inicial para venda e locação de equipamentos hospitalares, criado em React + Vite.

## CRM

O CRM local de atendimento, contratos, assinatura, financeiro e WhatsApp está em [`crm/`](crm/). Ele usa Neon/PostgreSQL e integrações externas configuradas por variáveis locais; credenciais, sessões do WhatsApp e dados de execução não são versionados.

## Rodar localmente

```bash
npm install
npm run dev
```

## Build de produção

```bash
npm run build
```

## Contato e WhatsApp

Edite `src/config.js` e informe o número do WhatsApp somente com números, usando DDI + DDD. Se o campo `whatsapp` ficar vazio, os botões de cotação usam o e-mail configurado.

## Deploy na Vercel

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

Também é compatível com Netlify, Cloudflare Pages e hospedagem estática após o build.

## SEO e páginas estáticas

`npm run build` compila o Vite e executa `scripts/prerender.mjs`. A página inicial, o guia `/comprar-ou-alugar` e as seis páginas `/equipamentos/:slug` saem com conteúdo completo no HTML e são hidratadas pelo React. Os dados do catálogo e FAQ ficam em `src/catalog.js`; títulos, descrições e JSON-LD em `src/seo.js`. Não use um redirecionamento genérico de todos os caminhos para `index.html`: URLs inexistentes devem responder 404.

O build gera `sitemap.xml`, títulos e descrições individuais, canonicals, Open Graph, Twitter Cards e JSON-LD de Organization, WebSite, WebPage, ItemList, FAQ e Product/Breadcrumb conforme a página. Não são inventados preços, avaliações, estoque, endereço ou credenciais da empresa. A marcação de Product sem ofertas não pretende habilitar resultados de preço; FAQ também não garante resultados expandidos no Google. Previews Vercel são marcados noindex.

Valide o build com `node scripts/check-seo.mjs`. Use `npm run preview -- --host 127.0.0.1` para conferir o HTML de produção. A confirmação de indexação, o envio do sitemap e o acompanhamento das consultas dependem de uma propriedade verificada no Google Search Console. Nenhuma verificação de propriedade foi inserida sem uma conta definida.

## Design e movimento

Abertura em formato de showroom, com a imagem original completa da logo e equipamentos como protagonistas. A galeria usa rolagem nativa por toque, arraste por mouse, fotos vizinhas visíveis, transições coordenadas de foto/legenda e controles por botão e teclado. O catálogo alterna apresentações amplas com linhas compactas; seus seis elementos e imagens permanecem montados ao filtrar. Não há animação de entrada nem observador de revelação reiniciado pelos filtros. `prefers-reduced-motion` desliga as transições e a rolagem suave. Fonte Manrope servida localmente, com licença em `public/fonts/OFL-Manrope.txt`.

`ShowroomCatalog` filtra a seleção comercial por ambiente: casa (camas, mesa e biombo) ou clínica (catálogo completo), além de modalidade e busca. `ProductInspector` apresenta três pontos por equipamento com explicações em `productDetails.js`; suas coordenadas acompanham a proporção real de cada fotografia. As categorias foram confrontadas com a [linha do fabricante](https://vitalscheffer.com.br/revenda_curitiba/). Dimensões, capacidades, configurações e acessórios não documentados são apresentados como itens a confirmar na cotação, sem valores inventados.

`SelectionProvider` mantém equipamento, modalidade, ambiente e prazo no `sessionStorage` versionado, validando o conteúdo salvo e tolerando armazenamento indisponível. A seleção acompanha as páginas de produto e o guia. `QuoteDock` mostra uma barra de seleção e um diálogo nativo com foco contido e fechamento por Escape. Casa pergunta sobre acesso; clínica pergunta quantidade. Cidade e acesso ficam somente na memória do diálogo. O botão de WhatsApp prepara uma mensagem para revisão; não envia automaticamente. As páginas legadas com produto/modalidade na URL continuam funcionando.

## Imagens

A logo oficial enviada pelo responsável está em `public/yr-hospitalar-logo.jpg`. As fotos do catálogo foram obtidas, a pedido do responsável, de `https://vitalscheffer.com.br/revenda_curitiba/assets/` e são servidas localmente em WebP em `public/products/`. São referências visuais; modelos e disponibilidade devem ser confirmados na cotação.

## Domínio de produção

`https://site.grupoyrhospitalar.com.br` aponta para o projeto Vercel `grupo-yr-hospitalar`. A Cloudflare mantém o CNAME `site` para `1c937794c9e3afc3.vercel-dns-017.com` com DNS only. O domínio principal, `www`, `crm`, `api` e os registros de e-mail permanecem independentes.

O repositório GitHub é `Camillox2/Teste`, branch `main`. A função `/api/chat` usa `GEMINI_API_KEY` somente no servidor; configure a variável na Vercel. Não grave credenciais no código.
