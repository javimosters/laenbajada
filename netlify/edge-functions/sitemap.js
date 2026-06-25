/* ══════════════════════════════════════════════════════════════════════
   La Enbajada — netlify/edge-functions/sitemap.js
   Genera sitemap.xml dinámico con todos los artículos publicados.
   ══════════════════════════════════════════════════════════════════════ */

const SUPA_URL = 'https://pkilwzcypcyhxjuknkho.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBraWx3emN5cGN5aHhqdWtua2hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNDE1NTksImV4cCI6MjA5MDgxNzU1OX0.fAhepDbj2p1JEbHzZvD1ZqwAK95OskE-CRxF4gqgIrg';

const PAGINAS_ESTATICAS = [
  { loc: 'https://laenbajada.com/',                          priority: '1.0', changefreq: 'daily'   },
  { loc: 'https://laenbajada.com/ediciones/01',              priority: '0.9', changefreq: 'weekly'  },
  { loc: 'https://laenbajada.com/secciones/la-cronica',      priority: '0.8', changefreq: 'weekly'  },
  { loc: 'https://laenbajada.com/secciones/la-conversacion', priority: '0.8', changefreq: 'weekly'  },
  { loc: 'https://laenbajada.com/secciones/la-curaturia',    priority: '0.8', changefreq: 'weekly'  },
  { loc: 'https://laenbajada.com/archivo',                   priority: '0.7', changefreq: 'monthly' },
  { loc: 'https://laenbajada.com/sobre',                     priority: '0.5', changefreq: 'monthly' },
];

export default async (request) => {
  try {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/articulos?estado=eq.publicado&select=slug,titulo,updated_at,created_at&order=created_at.desc`,
      {
        headers: {
          apikey:        SUPA_KEY,
          Authorization: `Bearer ${SUPA_KEY}`,
        },
      }
    );

    const articulos = res.ok ? await res.json() : [];

    const urlset = [
      ...PAGINAS_ESTATICAS.map(p => `
  <url>
    <loc>${p.loc}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`),
      ...articulos.map(a => {
        const slug = a.slug || '';
        if (!slug) return '';
        const lastmod = (a.updated_at || a.created_at || '').split('T')[0];
        return `
  <url>
    <loc>https://laenbajada.com/historias/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>`;
      }).filter(Boolean),
    ].join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlset}
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