# Google Ads (AW-18481732690)

O carregador `public/google-tag.js` está no início do head da página inicial, guia, equipamentos, 404 e páginas públicas do blog. A tag oficial carrega sempre no carregamento da página, com Consent Mode padrão `ad_storage`, `ad_user_data` e `analytics_storage` concedidos e `ad_personalization` negado, independentemente do aviso, GPC ou DNT.

O aviso de cookies é apenas informativo ("Este site utiliza cookies..."): "Entendi" e "Recusar" apenas fecham o aviso (lembrado em `localStorage` `yr-cookie-notice-v2`), sem alterar a medição.

Conversão "Clique WhatsApp (site)" (`AW-18481732690/6RmoCIn7lpcdENK44-xE`) dispara em todo clique de contato de WhatsApp: links wa.me, wa.link, api.whatsapp.com, web.whatsapp.com, whatsapp://send e o evento `yr:whatsapp-contact` do abridor central `src/whatsappContact.js`. O evento contém apenas `send_to`.
