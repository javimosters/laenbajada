/* ══════════════════════════════════════════════════════════════════════
   La Enbajada — netlify/edge-functions/og.js
   Intercepta bots de redes sociales en /articulo.html y sirve
   un HTML mínimo con OG tags rellenos desde Supabase.
   ══════════════════════════════════════════════════════════════════════ */

const SUPA_URL = 'https://pkilwzcypcyhxjuknkho.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBraWx3emN5cGN5aHhqdWtua2hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNDE1NTksImV4cCI6MjA5MDgxNzU1OX0.fAhepDbj2p1JEbHzZvD1ZqwAK95OskE-CRxF4gqgIrg';

const BOT_UA = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|LinkedInBot|Slackbot|Discordbot|Pinterest|Googlebot|bingbot|Applebot|vkShare|redditbot|W3C_Validator/i;

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export default async (request, context) => {
  const ua = request.headers.get('user-agent') || '';

  // Usuarios normales → archivo estático sin cambios
  if (!BOT_UA.test(ua)) return context.next();

  const url      = new URL(request.url);
  const pathname = url.pathname; // ej: /secciones/historias/mi-articulo

  /* Leer slug desde query string (?slug=) o desde pathname (/secciones/:tag/:slug) */
  let slug = url.searchParams.get('slug') || url.searchParams.get('s') || '';
  const id = url.searchParams.get('id') || '';

  if (!slug && !id) {
    /* Intentar extraer slug del pathname /secciones/:tag/:slug */
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] === 'secciones' && parts.length >= 3) {
      slug = parts[2];
    }
  }

  if (!slug && !id) return context.next();

  const filter = slug
    ? `slug=eq.${encodeURIComponent(slug)}`
    : `id=eq.${encodeURIComponent(id)}`;

  try {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/articulos?${filter}&select=titulo,extracto,subtitulo,imagen_url,autor,slug,id,seccion_tag&limit=1`,
      {
        headers: {
          apikey:        SUPA_KEY,
          Authorization: `Bearer ${SUPA_KEY}`,
        },
      }
    );

    if (!res.ok) return context.next();

    const [art] = await res.json();
    if (!art)   return context.next();

    const artSlug = art.slug || art.id;
    const artTag  = (art.seccion_tag||'').replace(/#/g,'').trim();
    const artUrl  = artTag
      ? `https://laenbajada.com/secciones/${artTag}/${encodeURIComponent(artSlug)}`
      : `https://laenbajada.com/historias/${encodeURIComponent(artSlug)}`;
    const title   = `${art.titulo || 'Artículo'} — La Enbajada`;
    const desc    = art.subtitulo || art.extracto || 'Revista cultural del Caribe colombiano.';
    const image   = art.imagen_url || '';

    const imgTags = image ? `
<meta property="og:image"            content="${esc(image)}">
<meta property="og:image:secure_url" content="${esc(image)}">
<meta property="og:image:width"      content="1200">
<meta property="og:image:height"     content="630">
<meta name="twitter:image"           content="${esc(image)}">` : '';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<meta name="description"             content="${esc(desc)}">
<meta property="og:type"             content="article">
<meta property="og:site_name"        content="La Enbajada">
<meta property="og:title"            content="${esc(title)}">
<meta property="og:description"      content="${esc(desc)}">
<meta property="og:url"              content="${esc(artUrl)}">
${imgTags}
<meta name="twitter:card"            content="summary_large_image">
<meta name="twitter:title"           content="${esc(title)}">
<meta name="twitter:description"     content="${esc(desc)}">
<link rel="canonical"                href="${esc(artUrl)}">
</head>
<body><p><a href="${esc(artUrl)}">${esc(art.titulo || 'Ver artículo')}</a></p></body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        'content-type':  'text/html; charset=UTF-8',
        'cache-control': 'public, max-age=3600',
        'x-robots-tag':  'index, follow',
      },
    });

  } catch (_) {
    return context.next();
  }
};

export const config = {
  path: ['/articulo.html', '/secciones/:tag/:slug', '/historias/:slug'],
};