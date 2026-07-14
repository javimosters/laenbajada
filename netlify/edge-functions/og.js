/* ══════════════════════════════════════════════════════════════════════
   La Enbajada — netlify/edge-functions/og.js
   Intercepta bots que no pueden ver el contenido real a tiempo:
   • Bots de redes sociales (WhatsApp, Facebook, Twitter…) → HTML mínimo
     con los meta tags para la previsualización del link.
   • Bots de búsqueda/IA (Google, Bing, GPTBot, ClaudeBot, PerplexityBot…)
     → el artículo completo (texto real + JSON-LD). Aunque Google sí
     ejecuta JavaScript, lo hace en una segunda pasada con retraso de
     horas a semanas — evidencia real: Bing indexó "Cargando…" como
     título de un artículo. Server-renderizar para bots no es cloaking
     (mismo contenido, ya armado) — la propia Google lo recomienda.
   ══════════════════════════════════════════════════════════════════════ */

const SUPA_URL = 'https://pkilwzcypcyhxjuknkho.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBraWx3emN5cGN5aHhqdWtua2hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNDE1NTksImV4cCI6MjA5MDgxNzU1OX0.fAhepDbj2p1JEbHzZvD1ZqwAK95OskE-CRxF4gqgIrg';

/* Imagen de respaldo cuando no hay foto/portada específica — debe existir
   subida en assets/og-image.jpg (logo o imagen genérica de La Enbajada). */
const DEFAULT_IMAGE = 'https://laenbajada.com/assets/og-image.jpg';

/* Bots de redes sociales — solo leen meta tags para armar la previsualización
   del link (WhatsApp, Facebook, Twitter, etc). Les basta el stub mínimo. */
const SOCIAL_BOT_UA = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|LinkedInBot|Slackbot|Discordbot|Pinterest|vkShare|redditbot|W3C_Validator/i;

/* Bots de búsqueda/IA — incluye Googlebot. Google SÍ ejecuta JavaScript,
   pero en una segunda pasada con retraso de horas a semanas (y a veces
   falla silenciosamente); Bing y los bots de IA prácticamente no ejecutan
   JS en absoluto. Para una revista con contenido nuevo constante, ese
   retraso es exactamente lo que causa que Bing indexe "Cargando…" en vez
   del artículo real — ya visto en resultados reales de laenbajada.com.
   Server-rendering estos bots no es cloaking: es el mismo contenido,
   solo que ya armado — la propia documentación de Google lo respalda
   ("server-side or pre-rendering is still a great idea"). */
const AI_SEARCH_BOT_UA = /bingbot|BingPreview|GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|anthropic-ai|PerplexityBot|Perplexity-User|Bytespider|CCBot|Applebot-Extended|YandexBot|DuckDuckBot|Googlebot|Google-InspectionTool|GoogleOther|Google-Extended/i;

const BOT_UA = new RegExp(SOCIAL_BOT_UA.source + '|' + AI_SEARCH_BOT_UA.source, 'i');

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

function stripTags(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* Convierte los bloques del editor (parrafo/cita_destacada/pregunta_respuesta/…)
   en texto plano legible, en el mismo orden en que se publicaron. Los bloques
   de imagen/separador/embed no aportan texto y se omiten. */
function bloquesATexto(bloques) {
  return (bloques || [])
    .map(b => {
      const c = b.contenido || {};
      switch (b.tipo) {
        case 'parrafo':
        case 'body':
          return stripTags(c.html || c.texto || '');
        case 'cita_destacada':
          return c.texto ? `«${stripTags(c.texto)}»${c.atribucion ? ' — ' + c.atribucion : ''}` : '';
        case 'pregunta_respuesta':
          return c.pregunta || c.respuesta ? `${c.pregunta || ''}\n${c.respuesta || ''}` : '';
        default:
          return '';
      }
    })
    .filter(Boolean);
}

async function supaSelectAll(tabla, query) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${tabla}?${query}`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

/* HTML completo (no solo meta tags) para bots que NO ejecutan JavaScript
   y por lo tanto no pueden ver el artículo real — incluye el texto completo
   y JSON-LD de Schema.org, igual que ve un lector humano una vez cargado app.js. */
function buildArticleFullHtml({ title, desc, url, image, autor, fecha, parrafos }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title,
    description: desc,
    image: image ? [image] : undefined,
    author: autor ? { '@type': 'Person', name: autor } : undefined,
    publisher: { '@type': 'Organization', name: 'La Enbajada', logo: { '@type': 'ImageObject', url: 'https://laenbajada.com/assets/logo.png' } },
    datePublished: fecha || undefined,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };

  const imgTags = image ? `
<meta property="og:image"            content="${esc(image)}">
<meta property="og:image:secure_url" content="${esc(image)}">
<meta name="twitter:image"           content="${esc(image)}">` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="La Enbajada">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
${imgTags}
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${esc(url)}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<article>
<h1>${esc(title)}</h1>
${autor ? `<p><em>Por ${esc(autor)}</em></p>` : ''}
${parrafos.map(p => `<p>${esc(p)}</p>`).join('\n')}
<p><a href="${esc(url)}">Ver artículo completo en La Enbajada →</a></p>
</article>
</body>
</html>`;
}

function respondFull(html) {
  return new Response(html, {
    status: 200,
    headers: {
      'content-type':  'text/html; charset=UTF-8',
      'cache-control': 'public, max-age=1800',
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

/* /secciones/:tag → listado de una sección (Historias, Conversaciones,
   o cualquiera que se cree/renombre desde el admin). Sin esto, todas
   las secciones —presentes y futuras— muestran a los bots sin JS el
   mismo título/descripción genérico de secciones.html, sin importar
   cuál sección sea: mismo título duplicado en decenas de páginas. */
async function renderSeccion(tag, context) {
  try {
    const sec = await supaSelect('secciones',
      `tag=eq.${encodeURIComponent(tag)}&activa=eq.true&select=nombre,tag,descripcion&limit=1`);
    if (!sec) return context.next();

    const url   = `https://laenbajada.com/secciones/${encodeURIComponent(sec.tag)}`;
    const title = `${sec.nombre || 'Sección'} — La Enbajada`;
    const desc  = sec.descripcion || `Artículos de ${sec.nombre || 'esta sección'} en La Enbajada, revista cultural del Caribe colombiano.`;

    return respond(buildHtml({ type: 'website', title, desc, url, image: DEFAULT_IMAGE, linkText: sec.nombre || 'Ver sección' }));
  } catch (_) {
    return context.next();
  }
}

/* /articulo.html, /secciones/:tag/:slug, /historias/:slug → artículo */
async function renderArticulo(request, context, esIA) {
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
      `${filter}&select=id,titulo,extracto,subtitulo,imagen_url,autor,slug,seccion_tag,fecha_publicacion,created_at&limit=1`);
    if (!art) return context.next();

    const artSlug = art.slug || art.id;
    const artTag  = (art.seccion_tag||'').replace(/#/g,'').trim();
    const artUrl  = artTag
      ? `https://laenbajada.com/secciones/${artTag}/${encodeURIComponent(artSlug)}`
      : `https://laenbajada.com/historias/${encodeURIComponent(artSlug)}`;
    const title   = `${art.titulo || 'Artículo'} — La Enbajada`;
    const desc    = art.subtitulo || art.extracto || 'Revista cultural del Caribe colombiano.';
    const image   = art.imagen_url || DEFAULT_IMAGE;

    /* Bots que no ejecutan JS (Bing, GPTBot, ClaudeBot, PerplexityBot…):
       les damos el texto completo del artículo + JSON-LD, no solo meta tags —
       de lo contrario ven exactamente lo mismo que un navegador sin JS: nada. */
    if (esIA) {
      const bloques  = await supaSelectAll('bloques_contenido', `articulo_id=eq.${art.id}&select=tipo,contenido,orden&order=orden.asc`);
      const parrafos = bloquesATexto(bloques);
      return respondFull(buildArticleFullHtml({
        title: art.titulo || 'Artículo', desc, url: artUrl, image,
        autor: art.autor || '', fecha: art.fecha_publicacion || art.created_at || '',
        parrafos: parrafos.length ? parrafos : [desc],
      }));
    }

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

  // Usuarios normales → archivo estático/renderizado, sin cambios
  if (!BOT_UA.test(ua)) return context.next();

  const esIA = AI_SEARCH_BOT_UA.test(ua);

  if (parts[0] === 'sobre' && parts[1] === 'equipo' && parts[2]) {
    return renderEditor(parts[2], context);
  }

  if (parts[0] === 'contenido' && parts[1]) {
    return renderContenido(parts[1], context);
  }

  if (parts[0] === 'secciones' && parts.length === 2 && parts[1]) {
    return renderSeccion(parts[1], context);
  }

  return renderArticulo(request, context, esIA);
};

export const config = {
  path: [
    '/articulo.html',
    '/secciones/:tag/:slug',
    '/secciones/:tag',
    '/historias/:slug',
    '/sobre/equipo/:slug',
    '/contenido/:slug',
  ],
};