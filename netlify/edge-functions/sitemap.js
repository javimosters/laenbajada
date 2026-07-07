/* ══════════════════════════════════════════════════════════════════════
   La Enbajada — netlify/edge-functions/sitemap.js
   Genera sitemap.xml dinámico desde Supabase.
   Artículos y secciones se leen de la BD — nada hardcodeado.
   ══════════════════════════════════════════════════════════════════════ */

const SUPA_URL = 'https://pkilwzcypcyhxjuknkho.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBraWx3emN5cGN5aHhqdWtua2hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNDE1NTksImV4cCI6MjA5MDgxNzU1OX0.fAhepDbj2p1JEbHzZvD1ZqwAK95OskE-CRxF4gqgIrg';

const PAGINAS_FIJAS = [
  { loc: 'https://laenbajada.com/',        priority: '1.0', changefreq: 'daily'   },
  { loc: 'https://laenbajada.com/archivo', priority: '0.7', changefreq: 'monthly' },
  { loc: 'https://laenbajada.com/sobre',   priority: '0.5', changefreq: 'monthly' },
];

function url(loc, priority, changefreq, lastmod) {
  return `
  <url>
    <loc>${loc}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export default async (request) => {
  try {
    const [resArts, resSecs, resNums] = await Promise.all([
      fetch(`${SUPA_URL}/rest/v1/articulos?estado=eq.publicado&select=slug,seccion_tag,updated_at,created_at&order=created_at.desc`, {
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
      }),
      fetch(`${SUPA_URL}/rest/v1/secciones?activa=eq.true&select=tag`, {
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
      }),
      fetch(`${SUPA_URL}/rest/v1/numeros?estado=neq.proximo&select=id`, {
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
      }),
    ]);

    const articulos = resArts.ok ? await resArts.json() : [];
    const secciones = resSecs.ok ? await resSecs.json() : [];
    const numeros   = resNums.ok ? await resNums.json() : [];

    const urls = [
      // Páginas fijas
      ...PAGINAS_FIJAS.map(p => url(p.loc, p.priority, p.changefreq)),

      // Ediciones activas desde Supabase
      ...numeros.map(n => url(`https://laenbajada.com/ediciones/${n.id}`, '0.9', 'weekly')),

      // Secciones desde Supabase — dinámico, sin hardcodear
      ...secciones.map(s => url(`https://laenbajada.com/secciones/${s.tag}`, '0.8', 'weekly')),

      // Artículos publicados
      ...articulos
        .filter(a => a.slug)
        .map(a => {
          const lastmod = (a.updated_at || a.created_at || '').split('T')[0];
          /* FIX: mismo criterio que og.js/articulo.html — solo tratar el tag
             como sección real si es una de las 3 válidas. */
          const VALID_TAGS = ['la-cronica', 'la-conversacion', 'la-curaturia'];
          const TAG_ALIASES = { 'cronica':'la-cronica','conversacion':'la-conversacion','curatia':'la-curaturia','curaturia':'la-curaturia','la-curatia':'la-curaturia' };
          const rawTag = (a.seccion_tag||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/#/g,'').replace(/\s+/g,'-').trim();
          const normalizedTag = TAG_ALIASES[rawTag] || rawTag;
          const tag = VALID_TAGS.includes(normalizedTag) ? normalizedTag : '';
          const artUrl = tag
            ? `https://laenbajada.com/secciones/${tag}/${a.slug}`
            : `https://laenbajada.com/historias/${a.slug}`;
          return url(artUrl, '0.9', 'monthly', lastmod);
        }),
    ].join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

    return new Response(xml, {
      status: 200,
      headers: {
        'content-type':  'application/xml; charset=UTF-8',
        'cache-control': 'public, max-age=3600',
      },
    });

  } catch (e) {
    return new Response('Error generando sitemap', { status: 500 });
  }
};

export const config = { path: '/sitemap.xml' };