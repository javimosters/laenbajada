/* ══════════════════════════════════════════════════════════════════════
   La Enbajada — netlify/edge-functions/og.js
   Intercepta bots de redes sociales en artículos, ediciones y perfiles
   de editor, y sirve un HTML mínimo con OG tags rellenos desde Supabase.
   ══════════════════════════════════════════════════════════════════════ */

const SUPA_URL = 'https://pkilwzcypcyhxjuknkho.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBraWx3emN5cGN5aHhqdWtua2hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNDE1NTksImV4cCI6MjA5MDgxNzU1OX0.fAhepDbj2p1JEbHzZvD1ZqwAK95OskE-CRxF4gqgIrg';

/* Imagen de respaldo cuando no hay foto/portada específica — debe existir
   subida en assets/og-image.jpg (logo o imagen genérica de La Enbajada). */
const DEFAULT_IMAGE = 'https://laenbajada.com/assets/og-image.jpg';

/* Solo bots de redes sociales — NO buscadores. Googlebot/bingbot/Applebot
   deben recibir la página real renderizada por app.js (contenido completo
   + schema.org), no este stub mínimo pensado solo para previews sociales. */
const BOT_UA = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|LinkedInBot|Slackbot|Discordbot|Pinterest|vkShare|redditbot|W3C_Validator/i;

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function supaSelect(tabla, query) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${tabla}?${query}`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

function buildHtml({ type = 'website', title, desc, url, image, linkText }) {
  const imgTags = image ? `
<meta property="og:image"            content="${esc(image)}">
<meta property="og:image:secure_url" content="${esc(image)}">
<meta property="og:image:width"      content="1200">
<meta property="og:image:height"     content="630">
<meta name="twitter:image"           content="${esc(image)}">` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<meta name="description"             content="${esc(desc)}">
<meta property="og:type"             content="${esc(type)}">
<meta property="og:site_name"        content="La Enbajada">
<meta property="og:title"            content="${esc(title)}">
<meta property="og:description"      content="${esc(desc)}">
<meta property="og:url"              content="${esc(url)}">
${imgTags}
<meta name="twitter:card"            content="summary_large_image">
<meta name="twitter:title"           content="${esc(title)}">
<meta name="twitter:description"     content="${esc(desc)}">
<link rel="canonical"                href="${esc(url)}">
</head>
<body><p><a href="${esc(url)}">${esc(linkText)}</a></p></body>
</html>`;
}

function respond(html) {
  return new Response(html, {
    status: 200,
    headers: {
      'content-type':  'text/html; charset=UTF-8',
      'cache-control': 'public, max-age=3600',
      'x-robots-tag':  'index, follow',
    },
  });
}

/* /sobre/equipo/:slug → perfil de editor */
async function renderEditor(slug, context) {
  try {
    const ed = await supaSelect('editores',
      `slug=eq.${encodeURIComponent(slug)}&activo=eq.true&select=nombre,cargo,bio,foto_url,slug&limit=1`);
    if (!ed) return context.next();

    const url   = `https://laenbajada.com/sobre/equipo/${encodeURIComponent(ed.slug || slug)}`;
    const title = `${ed.nombre || 'Editor'} — La Enbajada`;
    const desc  = ed.cargo
      ? `${ed.cargo} en La Enbajada, revista cultural del Caribe colombiano.`
      : (ed.bio || 'Editor de La Enbajada, revista cultural del Caribe colombiano.');
    const image = ed.foto_url || DEFAULT_IMAGE;

    return respond(buildHtml({ type: 'profile', title, desc, url, image, linkText: ed.nombre || 'Ver perfil' }));
  } catch (_) {
    return context.next();
  }
}

/* /contenido/:slug → contenido */
async function renderContenido(slug, context) {
  try {
    const cont = await supaSelect('contenidos',
      `slug=eq.${encodeURIComponent(slug)}&select=id,slug,titulo,subtitulo,imagen_url&limit=1`);
    if (!cont) return context.next();

    const url   = `https://laenbajada.com/contenido/${encodeURIComponent(cont.slug)}`;
    const title = `${cont.titulo || 'Contenido'} — La Enbajada`;
    const desc  = cont.subtitulo || 'Contenido de La Enbajada, revista cultural del Caribe colombiano.';
    const image = cont.imagen_url || DEFAULT_IMAGE;

    return respond(buildHtml({ type: 'website', title, desc, url, image, linkText: cont.titulo || 'Ver contenido' }));
  } catch (_) {
    return context.next();
  }
}

/* /articulo.html, /secciones/:tag/:slug, /historias/:slug → artículo */
async function renderArticulo(request, context) {
  const url      = new URL(request.url);
  const pathname = url.pathname;

  let slug = url.searchParams.get('slug') || url.searchParams.get('s') || '';
  const id = url.searchParams.get('id') || '';

  if (!slug && !id) {
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
    const art = await supaSelect('articulos',
      `${filter}&select=titulo,extracto,subtitulo,imagen_url,autor,slug,id,seccion_tag&limit=1`);
    if (!art) return context.next();

    const artSlug = art.slug || art.id;
    const artTag  = (art.seccion_tag||'').replace(/#/g,'').trim();
    const artUrl  = artTag
      ? `https://laenbajada.com/secciones/${artTag}/${encodeURIComponent(artSlug)}`
      : `https://laenbajada.com/historias/${encodeURIComponent(artSlug)}`;
    const title   = `${art.titulo || 'Artículo'} — La Enbajada`;
    const desc    = art.subtitulo || art.extracto || 'Revista cultural del Caribe colombiano.';
    const image   = art.imagen_url || DEFAULT_IMAGE;

    return respond(buildHtml({ type: 'article', title, desc, url: artUrl, image, linkText: art.titulo || 'Ver artículo' }));
  } catch (_) {
    return context.next();
  }
}

/* /historias/:slug con seccion_tag real → 301 a /secciones/:tag/:slug.
   Esto corre para TODOS (bots y navegadores reales), antes que el resto de
   la función — así se evita el "flash" donde la barra de direcciones
   muestra primero /historias/... y el JS recién la corrige después de
   cargar los datos. Si el artículo de verdad no tiene sección, no hay
   redirect y /historias/:slug sigue siendo su URL canónica normal. */
async function redirectHistoriasSiAplica(slug, origin) {
  try {
    const art = await supaSelect('articulos', `slug=eq.${encodeURIComponent(slug)}&select=seccion_tag&limit=1`);
    const tag = (art?.seccion_tag || '').replace(/#/g,'').trim();
    if (tag) {
      return Response.redirect(new URL(`/secciones/${tag}/${encodeURIComponent(slug)}`, origin), 301);
    }
  } catch (_) {}
  return null;
}

export default async (request, context) => {
  const url      = new URL(request.url);
  const pathname = url.pathname;
  const parts    = pathname.split('/').filter(Boolean);

  if (parts[0] === 'historias' && parts[1]) {
    const redirected = await redirectHistoriasSiAplica(parts[1], url.origin);
    if (redirected) return redirected;
  }

  const ua = request.headers.get('user-agent') || '';

  // Usuarios normales y buscadores → archivo estático/renderizado, sin cambios
  if (!BOT_UA.test(ua)) return context.next();

  if (parts[0] === 'sobre' && parts[1] === 'equipo' && parts[2]) {
    return renderEditor(parts[2], context);
  }

  if (parts[0] === 'contenido' && parts[1]) {
    return renderContenido(parts[1], context);
  }

  return renderArticulo(request, context);
};

export const config = {
  path: [
    '/articulo.html',
    '/secciones/:tag/:slug',
    '/historias/:slug',
    '/sobre/equipo/:slug',
    '/contenido/:slug',
  ],
};