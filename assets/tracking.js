/* ══════════════════════════════════════════════
   La Enbajada — tracking.js
   Registra visitas anónimas en Supabase.
   Incluir en cada .html antes de </body>:
   <script src="assets/tracking.js"></script>
   ══════════════════════════════════════════════ */
(function () {
  'use strict';

  const SUPA_URL = 'https://pkilwzcypcyhxjuknkho.supabase.co';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBraWx3emN5cGN5aHhqdWtua2hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNDE1NTksImV4cCI6MjA5MDgxNzU1OX0.fAhepDbj2p1JEbHzZvD1ZqwAK95OskE-CRxF4gqgIrg';

  /* Identificador de sesión anónimo (no persiste entre días) */
  function getSesionId() {
    let sid = sessionStorage.getItem('_lae_sid');
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('_lae_sid', sid);
    }
    return sid;
  }

  /* Detectar qué página es */
  function detectarPagina() {
    const path   = location.pathname;
    const params = new URLSearchParams(location.search);
    const parts  = path.split('/').filter(Boolean);

    /* ── URLs limpias (rewrite de Netlify, la barra de direcciones NO
       contiene articulo.html/editor.html/etc — hay que leer el path) ── */

    /* /secciones/:tag/:slug → artículo dentro de una sección */
    if (parts[0] === 'secciones' && parts.length >= 3) {
      return {
        pagina: 'articulo',
        tipo: 'articulo',
        referencia_id: params.get('id') || parts[2] || null,
        slug: parts[2] || params.get('slug') || null,
      };
    }
    /* /secciones/:tag → listado de sección */
    if (parts[0] === 'secciones' && parts.length === 2) {
      return { pagina: 'secciones', tipo: 'pagina', referencia_id: parts[1] || params.get('sec') || null };
    }
    /* /historias/:slug → artículo legacy sin sección */
    if (parts[0] === 'historias' && parts[1]) {
      return {
        pagina: 'articulo',
        tipo: 'articulo',
        referencia_id: params.get('id') || parts[1] || null,
        slug: parts[1],
      };
    }
    /* /ediciones/:num → edición */
    if (parts[0] === 'ediciones' && parts[1]) {
      return { pagina: 'edicion', tipo: 'pagina', referencia_id: parts[1] || params.get('num') || null };
    }
    /* /sobre/equipo/:slug → perfil de editor (revisar ANTES que /sobre genérico) */
    if (parts[0] === 'sobre' && parts[1] === 'equipo') {
      return { pagina: 'editor', tipo: 'pagina', referencia_id: parts[2] || params.get('slug') || null };
    }

    /* ── Fallback: acceso directo a los .html con query string ── */
    if (path.includes('articulo')) {
      const slug  = params.get('slug') || params.get('s') || params.get('') || '';
      const artId = params.get('id') || '';
      return {
        pagina: 'articulo',
        tipo: 'articulo',
        referencia_id: artId || slug || null,
        slug: slug || null,
      };
    }
    if (path.includes('edicion') || path.includes('numero'))
      return {
        pagina: 'edicion',
        tipo: 'pagina',
        /* Sin ?num= (alias genérico "Edición actual") — edicion.html
           ya resolvió cuál es y la dejó en window._lae_num_id */
        referencia_id: params.get('num') || window._lae_num_id || null
      };
    if (path.includes('secciones'))                           return { pagina: 'secciones',  tipo: 'pagina', referencia_id: params.get('sec') || null };
    if (path.includes('archivo'))                             return { pagina: 'archivo',    tipo: 'pagina' };
    if (path.includes('editor'))                              return { pagina: 'editor',     tipo: 'pagina', referencia_id: params.get('slug') || null };
    if (path.includes('sobre'))                               return { pagina: 'sobre',      tipo: 'pagina' };
    if (path.includes('404'))                                 return { pagina: '404',        tipo: 'pagina' };
    /* index o raíz */
    return { pagina: 'index', tipo: 'pagina' };
  }

  /* No registrar visitas desde el admin */
  function esAdmin() {
    return location.pathname.includes('admin') ||
           location.search.includes('preview=1') ||
           sessionStorage.getItem('_lae_admin') === '1';
  }

  /* Registrar visita */
  async function registrar() {
    if (esAdmin()) return;

    /* Esperar 800ms para no penalizar el tiempo de carga inicial */
    await new Promise(r => setTimeout(r, 800));

    const info = detectarPagina();
    const payload = {
      ...info,
      sesion_id: getSesionId(),
    };

    try {
      await fetch(`${SUPA_URL}/rest/v1/visitas`, {
        method: 'POST',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      /* Fallo silencioso — las métricas no deben interrumpir la navegación */
    }
  }

  /* Ejecutar cuando el DOM esté listo */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registrar);
  } else {
    registrar();
  }
})();