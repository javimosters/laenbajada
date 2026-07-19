/* ═══════════════════════════════════════════════════════════════
   LA ENBAJADA — app.js v7  (PREMIUM)
   Motor principal · Supabase como base de datos
   ═══════════════════════════════════════════════════════════════ */

/* ── CONFIGURACIÓN SUPABASE ─────────────────────────────────── */
const SUPA_URL = 'https://pkilwzcypcyhxjuknkho.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBraWx3emN5cGN5aHhqdWtua2hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNDE1NTksImV4cCI6MjA5MDgxNzU1OX0.fAhepDbj2p1JEbHzZvD1ZqwAK95OskE-CRxF4gqgIrg';

/* ═══════════════════════════════════════════════════════════════
   normTag(v) — Normaliza el formato de seccion_tag.
   Las secciones son dinámicas (viven en la tabla `secciones`).
   Solo limpia el formato: minúsculas, sin #, espacios → guiones.
   ═══════════════════════════════════════════════════════════════ */
function normTag(v) {
  if (!v) return '';
  return String(v)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/#/g,'')
    .replace(/\s+/g,'-')
    .trim();
}

/* ── Cliente Supabase mínimo (sin SDK — fetch directo) ────────── */
const SB = {
  /* Token a usar en cada request: el de la sesión real si hay una
     (admin logueado) — si no, la key anónima pública (lectores).
     AUTH existe en TODAS las páginas (se define más abajo en este
     mismo archivo), así que esto funciona igual en el sitio público
     (sin sesión → siempre key anónima) y en el admin (con sesión →
     token real, para que RLS lo reconozca como "authenticated"). */
  _token() {
    try {
      const session = AUTH.getSession();
      if (session?.access_token) return session.access_token;
    } catch (_) {}
    return SUPA_KEY;
  },

  async _req(path, opts = {}) {
    const res = await fetch(`${SUPA_URL}/rest/v1${path}`, {
      headers: {
        'apikey':        SUPA_KEY,
        'Authorization': `Bearer ${this._token()}`,
        'Content-Type':  'application/json',
        'Prefer':        opts.prefer || 'return=representation',
        ...(opts.headers || {}),
      },
      ...opts,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Supabase error:', err);
      throw new Error(err.message || err.hint || res.statusText);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  async select(table, params = '') {
    return this._req(`/${table}?${params}`);
  },
  /* Supabase/PostgREST corta las respuestas en 1000 filas por defecto,
     sin importar el &limit= que mandes en la query. Para tablas que
     pueden crecer más allá de eso (ej. `visitas`), hay que paginar con
     el header Range hasta agotar los resultados. */
  async selectAll(table, params = '', maxRows = 20000) {
    let all = [];
    let offset = 0;
    const chunk = 1000;
    while (offset < maxRows) {
      const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`, {
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${this._token()}`,
          'Range-Unit': 'items',
          'Range': `${offset}-${offset + chunk - 1}`,
          'Prefer': 'count=exact',
        },
      });
      if (!res.ok) break;
      const rows = await res.json().catch(() => []);
      all = all.concat(rows);
      if (rows.length < chunk) break; /* última página alcanzada */
      offset += chunk;
    }
    return all;
  },
  /* Conteo exacto vía HEAD + Prefer: count=exact — no trae filas,
     solo el total real (evita el límite de 1000 filas al mostrar stats). */
  async count(table, params = '') {
    try {
      const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`, {
        method: 'HEAD',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${this._token()}`,
          'Prefer': 'count=exact',
        },
      });
      const range = res.headers.get('content-range'); // "0-24/1234"
      if (!range) return null;
      const total = range.split('/')[1];
      return total === '*' ? null : parseInt(total, 10);
    } catch(e) { return null; }
  },
  async insert(table, data) {
    return this._req(`/${table}`, {
      method:  'POST',
      body:    JSON.stringify(Array.isArray(data) ? data : [data]),
      prefer:  'return=representation',
    });
  },
  async update(table, filter, data) {
    return this._req(`/${table}?${filter}`, {
      method: 'PATCH',
      body:   JSON.stringify(data),
      prefer: 'return=representation',
    });
  },
  async upsert(table, data, onConflict = 'id') {
    return this._req(`/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      body:   JSON.stringify(Array.isArray(data) ? data : [data]),
      prefer: 'return=representation,resolution=merge-duplicates',
    });
  },
  async delete(table, filter) {
    return this._req(`/${table}?${filter}`, {
      method: 'DELETE',
      prefer: 'return=minimal',
    });
  },
};

/* ── AUTH (Supabase Auth — login real) ─────────────────────── */
const AUTH = {
  async login(email, password) {
    const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey':       SUPA_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.message || 'Error de autenticación');
    return data; /* { access_token, user, ... } */
  },
  async logout(accessToken) {
    await fetch(`${SUPA_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        'apikey':        SUPA_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
    }).catch(() => {});
  },
  getSession() {
    try { return JSON.parse(localStorage.getItem('lae_session') || 'null'); } catch { return null; }
  },
  setSession(data) {
    localStorage.setItem('lae_session', JSON.stringify(data));
  },
  clearSession() {
    localStorage.removeItem('lae_session');
    localStorage.removeItem('lae_admin');
    localStorage.removeItem('lae_admin_email');
  },
};

/* ── STORAGE KEYS ───────────────────────────────────────────── */
const SK = {
  /* darkmode eliminado */
  favoritos: 'lae_favoritos',
  leidos:    'lae_leidos',
  font:      'lae_font',
};

/* ── CACHE EN MEMORIA ───────────────────────────────────────── */
const _cache = {
  config:       null,
  secciones:    null,
  numeros:      null,
  articulos:    {},
  bloques:      {},
};

/* ══════════════════════════════════════════════════════════════
   DB API — interfaz única para todo el sitio
   ══════════════════════════════════════════════════════════════ */

/* ── Validación de datos antes de enviar a Supabase ── */
function _validarArticulo(data) {
  const errs = [];
  if (!data.titulo || typeof data.titulo !== 'string' || data.titulo.trim().length < 2)
    errs.push('Título requerido (mínimo 2 caracteres)');
  if (data.titulo && data.titulo.length > 500)
    errs.push('Título demasiado largo (máx 500 caracteres)');
  if (!data.contenido_id)
    errs.push('Contenido requerido');
  const estadosValidos = ['borrador','publicado','archivado'];
  if (data.estado && !estadosValidos.includes(data.estado))
    errs.push('Estado inválido');
  return errs;
}

function _sanitizarTexto(str, maxLen = 10000) {
  if (!str) return '';
  return String(str).trim().slice(0, maxLen);
}

const DB = {

  /* ── Configuración ──────────────────────────────────────────── */
  async getConfig() {
    /* localStorage: persiste entre sesiones — 5 min TTL, stale-while-revalidate */
    try {
      const sc = localStorage.getItem('_lae_cfg');
      if (sc) {
        const { data, ts } = JSON.parse(sc);
        const age = Date.now() - ts;
        if (age < 60000) { _cache.config = data; return data; }
        if (data) { _cache.config = data; this._refreshConfig(); return data; }
      }
    } catch(e) {}
    if (_cache.config) return _cache.config;
    /* Deduplicación: si ya hay un fetch en vuelo, no lanzar otro */
    if (_cache._configPromise) return _cache._configPromise;
    _cache._configPromise = SB.select('configuracion', 'id=eq.1').then(rows => {
      _cache._configPromise = null;
      return rows;
    });
    const rows = await _cache._configPromise;
    const _cfgRow = rows?.[0] || null;
    if (_cfgRow) { try { localStorage.setItem('_lae_cfg', JSON.stringify({ data: _cfgRow, ts: Date.now() })); } catch(e) {} }
    _cache.config = _cfgRow || {
      nombre:  'La Enbajada',
      tagline: 'Aterrizamos la Cultura',
      ciudad:  'Barranquilla, Colombia',
      logo_url: '',
      colores: { azul: '#004AAD', negro: '#0c0b09', oro: '#c8a96e' },
      footer:  {
        email:     'contacto@laenbajada.com',
        instagram: 'https://instagram.com/laenbajada',
        desc:      'Revista cultural del Caribe colombiano.',
        copy:      '© 2026 La Enbajada',
        redes:     [],
      },
      sobre:     {},
      index_cfg: {},
    };
    return _cache.config;
  },

  _refreshConfig() {
    SB.select('configuracion', 'id=eq.1').then(rows => {
      if (!rows?.[0]) return;
      _cache.config = rows[0];
      try { localStorage.setItem('_lae_cfg', JSON.stringify({ data: rows[0], ts: Date.now() })); } catch(e) {}
    }).catch(() => {});
  },

  /* Guarda CUALQUIER subconjunto de configuración de forma segura.
     Siempre hace un merge con lo que ya existe en la BD. */
  async setConfig(patch) {
    const cfg = await this.getConfig();
    /* Merge profundo de objetos JSONB */
    const merged = { ...cfg, ...patch };
    /* Para campos JSONB anidados, también mergeamos */
    if (patch.colores)   merged.colores   = { ...(cfg.colores   || {}), ...patch.colores };
    if (patch.footer) {
      merged.footer = { ...(cfg.footer || {}), ...patch.footer };
      /* Si el patch.footer trae index_cfg, hacer merge profundo también */
      if (patch.footer.index_cfg) {
        merged.footer.index_cfg = {
          ...((cfg.footer || {}).index_cfg || {}),
          ...patch.footer.index_cfg,
        };
      }
    }
    if (patch.sobre)     merged.sobre     = { ...(cfg.sobre     || {}), ...patch.sobre };
    if (patch.index_cfg) merged.index_cfg = { ...(cfg.index_cfg || {}), ...patch.index_cfg };
    _cache.config = null;
    /* Limpiar localStorage para que el index vea cambios de inmediato */
    try { localStorage.removeItem('_lae_cfg'); } catch(e) {}

    /* Solo enviamos las columnas que existen en la tabla */
    const payload = {
      id:         1,
      nombre:     merged.nombre,
      tagline:    merged.tagline,
      ciudad:     merged.ciudad,
      logo_url:   merged.logo_url,
      colores:    merged.colores,
      footer:     merged.footer,
      sobre:      merged.sobre,
      updated_at: new Date().toISOString(),
    };
    return SB.upsert('configuracion', payload, 'id');
  },

  /* ── Frase destacada (vive dentro de footer.frase) ─────────── */
  async getFrase() {
    const cfg = await this.getConfig();
    const ft = cfg.footer || {};
    return ft.frase || { texto: '', autor: '' };
  },
  async setFrase(frase) {
    return this.setConfig({ footer: { frase } });
  },

  /* ── Sobre (vive en configuracion.sobre) ───────────────────── */
  async getSobre() {
    const cfg = await this.getConfig();
    const s = cfg.sobre || {};
    return {
      titulo:     s.titulo     || 'Aterrizamos la Cultura',
      texto1:     s.texto1     || '',
      cita:       s.cita       || '',
      texto2:     s.texto2     || '',
      editor:     s.editor     || (cfg.nombre || 'La Enbajada'),
      cargo:      s.cargo      || 'Director Editorial',
      bio:        s.bio        || '',
      fotoEditor: s.fotoEditor || '',
      manTitulo:  s.manTitulo  || 'Por qué hacemos esto',
      manTexto1:  s.manTexto1  || '',
      manCita:    s.manCita    || '',
      manTexto2:  s.manTexto2  || '',
    };
  },
  async setSobre(sobre) {
    return this.setConfig({ sobre });
  },

  /* ── Index config (vive en configuracion.footer.index_cfg) ─── */
  async getIndexCfg() {
    const cfg = await this.getConfig();
    const ft = cfg.footer || {};
    const idx = ft.index_cfg || {};
    return {
      /* ── Visibilidad ──
         Si el valor existe en Supabase lo usa.
         Si no existe (primera vez) usa el default sensato. */
      mostrarTicker:       idx.mostrarTicker       === true,   /* default: OCULTO hasta que el admin lo active */
      mostrarArchivo:      idx.mostrarArchivo      !== false,  /* default: VISIBLE */
      mostrarBoletin:      idx.mostrarBoletin      !== false,  /* default: VISIBLE */
      /* Estos ya no se usan en el index v11 pero los dejamos por compatibilidad */
      mostrarCarrusel:     idx.mostrarCarrusel     !== false,
      mostrarFrase:        idx.mostrarFrase        !== false,
      mostrarConversacion: idx.mostrarConversacion !== false,
      mostrarCuratia:      idx.mostrarCuratia      !== false,
      /* ── Textos del boletín ── */
      tituloBoletin:  idx.tituloBoletin || idx.titbol  || 'Recibe lo nuevo de La Enbajada en tu correo',
      textoBoletin:   idx.textoBoletin  || idx.txtbol  || 'La Enbajada llega a tu bandeja cuando hay algo que vale la pena leer.',
      kickerBoletin:  idx.kickerBoletin               || 'Boletín editorial',
      btnBoletin:     idx.btnBoletin                  || 'Suscribirse',
      notaBoletin:    idx.notaBoletin                 || 'Solo enviamos cuando hay algo nuevo.',
      /* ── SEO ── */
      metaTitulo:     idx.metaTitulo  || '',
      metaDesc:       idx.metaDesc    || '',
      /* ── Grid y ticker ── */
      maxArtsGrid:    parseInt(idx.maxArtsGrid || idx.maxarts) || 9,
      colsGrid:       parseInt(idx.colsGrid)                   || 3,
      maxTicker:      parseInt(idx.maxTicker)                  || 8,
      /* ── Misc ── */
      tituloArchivo:      idx.tituloArchivo      || 'Números de La Enbajada',
      tituloConversacion: idx.tituloConversacion || 'Voces de la edición',
      tagSecBloque:       idx.tagSecBloque       || '',
    };
  },
  async setIndexCfg(idx) {
    const cfg = await this.getConfig();
    const footer = { ...(cfg.footer || {}), index_cfg: idx };
    return this.setConfig({ footer });
  },

  /* ── Secciones ──────────────────────────────────────────────── */
  async getSecciones(soloActivas = true) {
    if (soloActivas && _cache.secciones) return _cache.secciones;
    const filter = soloActivas ? 'activa=eq.true&order=orden.asc' : 'order=orden.asc';
    const rows = await SB.select('secciones', filter);
    /* BUG FIX: Normalizar tags — quitar # y lowercase */
    const normalized = (rows || []).map(s => ({
      ...s,
      tag: normTag(s.tag || s.nombre || ''),
    }));
    if (soloActivas) _cache.secciones = normalized;
    return normalized;
  },

  async crearSeccion(data) {
    _cache.secciones = null;
    return SB.insert('secciones', data);
  },

  async updateSeccion(id, data) {
    _cache.secciones = null;
    return SB.update('secciones', `id=eq.${id}`, data);
  },

  async deleteSeccion(id) {
    _cache.secciones = null;
    return SB.delete('secciones', `id=eq.${id}`);
  },

  /* ── Contenido ──────────────────────────────────────────────── */
  async getContenidos() {
    if (_cache.contenidos) return _cache.contenidos;
    const rows = await SB.select('contenidos', 'order=orden.asc');
    _cache.contenidos = rows || [];
    return _cache.contenidos;
  },
  /* El destacado: el primer 'activo' según orden. Ya no existe el
     estado especial 'edicion-actual' — el orden decide cuál se ve primero. */
  async getContenidoDestacado() {
    const cs = await this.getContenidos();
    return cs.find(c => c.estado === 'activo') || cs[0] || null;
  },
  async getContenido(id) {
    const cs = await this.getContenidos();
    return cs.find(c => c.id === id) || null;
  },
  async getContenidoBySlug(slug) {
    const cs = await this.getContenidos();
    return cs.find(c => c.slug === slug) || null;
  },
  async setContenido(id, data) {
    _cache.contenidos = null;
    const clean = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    );
    /* Usar PATCH si el contenido ya existe para nunca hacer INSERT accidental */
    try {
      const existe = await SB.select('contenidos', `id=eq.${id}&select=id`);
      if (existe && existe.length > 0) {
        return SB.update('contenidos', `id=eq.${id}`, { ...clean, updated_at: new Date().toISOString() });
      }
    } catch(_) {}
    return SB.upsert('contenidos', { id, ...clean, updated_at: new Date().toISOString() }, 'id');
  },
  async crearContenido(data) {
    _cache.contenidos = null;
    return SB.insert('contenidos', data);
  },
  async deleteContenido(id) {
    _cache.contenidos = null;
    return SB.delete('contenidos', `id=eq.${id}`);
  },

  /* ── Artículos ──────────────────────────────────────────────── */
  async getArticulos(contenido_id) {
    const key = contenido_id || 'all';
    if (_cache.articulos[key]) return _cache.articulos[key];
    return this._fetchArticulos(contenido_id, key);
  },
  async _fetchArticulos(contenido_id, key) {
    if (!key) key = contenido_id || 'all';
    const COLS = 'select=id,titulo,subtitulo,extracto,imagen_url,slug,estado,tipo,seccion_tag,contenido_id,orden,autor,editor_id,fecha_publicacion,created_at';
    const filter = contenido_id
      ? `${COLS}&contenido_id=eq.${contenido_id}&order=orden.asc,created_at.desc`
      : `${COLS}&order=orden.asc,created_at.desc`;
    const rows = await SB.select('articulos', filter);
    const normalized = (rows || []).map(a => ({
      ...a,
      seccion_tag: normTag(a.seccion_tag || a.tipo || ''),
    }));
    _cache.articulos[key] = normalized;
    return _cache.articulos[key];
  },
  async getPublicados(contenido_id) {
    const key = 'pub_' + (contenido_id || 'all');
    /* FIX: esto borraba TODAS las claves '_lae2_' (el prefijo que se usa
       AHORA para cachear) en cada llamada, justo antes de intentar leer
       esa misma caché dos líneas más abajo — se autodestruía siempre, así
       que nunca cacheaba nada de verdad (pedía todo fresco a Supabase en
       cada navegación). Solo debe limpiar el prefijo viejo y obsoleto
       ('_lae_'), no el que está en uso. */
    try {
      Object.keys(sessionStorage).filter(k=>k.startsWith('_lae_')).forEach(k=>sessionStorage.removeItem(k));
    } catch(e) {}
    /* Caché en sessionStorage — persiste entre páginas en la misma sesión */
    try {
      const cached = sessionStorage.getItem('_lae2_' + key);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < 300000) return data;
      }
    } catch(e) {}
    /* Filtrar publicados directo en Supabase — no bajar borradores al navegador */
    const COLS = 'select=id,titulo,subtitulo,extracto,imagen_url,slug,estado,tipo,seccion_tag,contenido_id,orden,autor,editor_id,fecha_publicacion,created_at';
    const ahora = new Date().toISOString();
    const base = contenido_id
      ? `${COLS}&contenido_id=eq.${contenido_id}&estado=eq.publicado&order=orden.asc,created_at.desc`
      : `${COLS}&estado=eq.publicado&order=orden.asc,created_at.desc`;
    const rows = await SB.select('articulos', base);
    const arts = (rows || [])
      .filter(a => !a.fecha_publicacion || a.fecha_publicacion <= ahora)
      .map(a => ({ ...a, seccion_tag: normTag(a.seccion_tag || a.tipo || '') }));

    /* Resolver nombres reales de editores — una sola query para todos */
    const editorIds = [...new Set(arts.map(a => a.editor_id).filter(Boolean))];
    if (editorIds.length) {
      try {
        const eds = await SB.select('editores',
          `id=in.(${editorIds.join(',')})&select=id,nombre,foto_url,slug,cargo`
        );
        const edMap = {};
        (eds || []).forEach(e => { edMap[e.id] = e; });
        arts.forEach(a => {
          if (a.editor_id && edMap[a.editor_id]) {
            a._editor = edMap[a.editor_id];
            a.autor   = edMap[a.editor_id].nombre || a.autor;
          }
        });
      } catch(e) {}
    }

    const result = arts;
    try {
      sessionStorage.setItem('_lae2_' + key, JSON.stringify({ data: result, ts: Date.now() }));
    } catch(e) {}
    return result;
  },
  async getArticulo(id) {
    if (!id) return null;
    /* Caché en memoria — evita fetch repetido en la misma sesión */
    if (_cache.articulos[id]) return _cache.articulos[id];
    const rows = await SB.select('articulos', `id=eq.${id}`);
    const art = rows?.[0] || null;
    if (art) _cache.articulos[id] = art;
    return art;
  },
  async setArticulo(data) {
    _cache.articulos = {};
    const payload = { ...data, updated_at: new Date().toISOString() };
    if (data.id) {
      return SB.update('articulos', `id=eq.${data.id}`, payload);
    } else {
      return SB.insert('articulos', payload);
    }
  },
  async deleteArticulo(id) {
    _cache.articulos   = {};
    _cache.bloques     = {};
    return SB.delete('articulos', `id=eq.${id}`);
  },

  /* ── Bloques de contenido ───────────────────────────────────── */
  async getBloques(articulo_id) {
    if (_cache.bloques[articulo_id]) return _cache.bloques[articulo_id];
    const rows = await SB.select('bloques_contenido', `articulo_id=eq.${articulo_id}&order=orden.asc`);
    _cache.bloques[articulo_id] = rows || [];
    return _cache.bloques[articulo_id];
  },
  async setBloques(articulo_id, bloques) {
    _cache.bloques[articulo_id] = null;
    await SB.delete('bloques_contenido', `articulo_id=eq.${articulo_id}`);
    if (!bloques.length) return;
    const payload = bloques.map((b, i) => ({
      ...b,
      articulo_id,
      orden: i,
      id: b.id || undefined,
    }));
    return SB.insert('bloques_contenido', payload);
  },

  /* ── Suscriptores ───────────────────────────────────────────── */
  async agregarSuscriptor(email) {
    const clean = (email || '').trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return false;
    try {
      await SB.insert('suscriptores', { email: clean });
      return true;
    } catch (e) {
      if (e.message && e.message.includes('duplicate')) return 'duplicado';
      return false;
    }
  },
  async getSuscriptores() {
    return SB.select('suscriptores', 'order=created_at.desc');
  },
  async deleteSuscriptor(id) {
    return SB.delete('suscriptores', `id=eq.${id}`);
  },

  /* ── Portadas / Carrusel ────────────────────────────────────── */
  async getPortadas(max = 8) {
    const cfg = await this.getConfig();
    const ft  = cfg.footer || {};
    /* Prioridad 1: portada_id explícita */
    if (ft.portada_id) {
      const art = await this.getArticulo(ft.portada_id).catch(() => null);
      if (art && art.estado === 'publicado') return [art];
    }
    /* Prioridad 2: carrusel como array de IDs */
    const carruselIds = ft.carrusel || [];
    if (carruselIds.length) {
      const arts = await this.getPublicados();
      const ordenado = carruselIds.map(id => arts.find(a => a.id === id)).filter(Boolean);
      return ordenado.length ? ordenado.slice(0, max) : arts.slice(0, max);
    }
    /* Fallback: artículos marcados es_portada o los primeros publicados */
    const arts = await this.getPublicados();
    const portadas = arts.filter(a => a.es_portada);
    return portadas.length ? portadas.slice(0, max) : arts.slice(0, max);
  },
  async getCarrusel() {
    const cfg = await this.getConfig();
    const ft = cfg.footer || {};
    return ft.carrusel || [];
  },
  async setCarrusel(ids) {
    return this.setConfig({ footer: { carrusel: ids } });
  },

  /* ── Búsqueda ───────────────────────────────────────────────── */
  async buscar(q) {
    if (!q || q.length < 2) return [];
    const all = await this.getPublicados();
    const ql = q.toLowerCase();
    return all
      .map(a => {
        let score = 0;
        if ((a.titulo   || '').toLowerCase().includes(ql)) score += 10;
        if ((a.subtitulo|| '').toLowerCase().includes(ql)) score += 6;
        if ((a.tipo     || '').toLowerCase().includes(ql)) score += 4;
        if ((a.autor    || '').toLowerCase().includes(ql)) score += 4;
        if ((a.extracto || '').toLowerCase().includes(ql)) score += 3;
        return { ...a, _score: score };
      })
      .filter(a => a._score > 0)
      .sort((a, b) => b._score - a._score);
  },

  /* ── Relacionados ───────────────────────────────────────────── */
  async getRelacionados(art, max = 3) {
    const todos = await this.getPublicados();
    return todos
      .filter(a => a.id !== art.id)
      .map(a => {
        let score = 0;
        if (a.contenido_id === art.contenido_id) score += 5;
        if (a.tipo        === art.tipo)         score += 3;
        if (a.seccion_tag === art.seccion_tag)  score += 3;
        return { ...a, _score: score };
      })
      .filter(a => a._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, max);
  },

  /* ── Stats ──────────────────────────────────────────────────── */
  async getStats() {
    const [arts, suscr] = await Promise.all([
      this.getArticulos(),
      this.getSuscriptores(),
    ]);
    const ahora = new Date().toISOString();
    return {
      total:        arts.length,
      publicados:   arts.filter(a => a.estado === 'publicado' && (!a.fecha_publicacion || a.fecha_publicacion <= ahora)).length,
      borradores:   arts.filter(a => a.estado === 'borrador').length,
      suscriptores: suscr?.length || 0,
    };
  },

  /* ── Invalidar caché ────────────────────────────────────────── */
  invalidarCache() {
    _cache.config      = null;
    _cache.secciones   = null;
    _cache.contenidos  = null;
    _cache.articulos   = {};
    _cache.bloques     = {};
  },

  /* ── Búsqueda (alias público) ─────────────────────────────── */
  async buscarArticulos(q) {
    return this.buscar(q);
  },


  esFavorito(id) { return esFavorito(id); },
};

/* ══════════════════════════════════════════════════════════════
   SUPABASE STORAGE — Subir imágenes al bucket "imagenes"
   ══════════════════════════════════════════════════════════════ */
async function subirImagen(file, carpeta = 'general') {
  if (!file) throw new Error('No se proporcionó archivo');
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Error leyendo archivo'));
    reader.readAsDataURL(file);
  });
  const comprimida = await comprimirImagen(dataUrl, 1400, 900, 0.85);
  const base64 = comprimida.split(',')[1];
  const mime   = comprimida.split(';')[0].split(':')[1];
  const bytes  = atob(base64);
  const arr    = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob   = new Blob([arr], { type: mime });
  const ext    = mime.includes('png') ? 'png' : 'jpg';
  const nombre = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const res = await fetch(`${SUPA_URL}/storage/v1/object/imagenes/${nombre}`, {
    method:  'POST',
    headers: {
      'apikey':        SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type':  mime,
      'x-upsert':      'true',
    },
    body: blob,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Storage error ${res.status}`);
  }
  return `${SUPA_URL}/storage/v1/object/public/imagenes/${nombre}`;
}

/* ══════════════════════════════════════════════════════════════
   PREFERENCIAS DE USUARIO
   ══════════════════════════════════════════════════════════════ */
function _getLeidos()    { try { return JSON.parse(localStorage.getItem(SK.leidos)    || '[]'); } catch { return []; } }
function _getFavoritos() { try { return JSON.parse(localStorage.getItem(SK.favoritos) || '[]'); } catch { return []; } }
function marcarLeido(id) {
  const l = _getLeidos(); const nid = String(id);
  if (!l.includes(nid)) { l.push(nid); localStorage.setItem(SK.leidos, JSON.stringify(l)); }
}
function esFavorito(id)  { return _getFavoritos().includes(String(id)); }
function toggleFavorito(id) {
  const fav = _getFavoritos(); const sid = String(id);
  const idx = fav.indexOf(sid);
  if (idx > -1) fav.splice(idx, 1); else fav.push(sid);
  localStorage.setItem(SK.favoritos, JSON.stringify(fav));
  return idx === -1;
}

/* ══════════════════════════════════════════════════════════════
   DARK MODE
   ══════════════════════════════════════════════════════════════ */
function initDarkMode() { try { localStorage.removeItem('lae_dark'); } catch(e) {} }
function toggleDarkMode() { /* dark mode eliminado */ }
function _updateDarkBtn() { /* dark mode eliminado */ }

/* ══════════════════════════════════════════════════════════════
   SEO DINÁMICO
   ══════════════════════════════════════════════════════════════ */
function setMeta(prop, content) {
  if (!content) return;
  let el = document.querySelector(`meta[property="${prop}"]`) ||
           document.querySelector(`meta[name="${prop}"]`);
  if (!el) {
    el = document.createElement('meta');
    (prop.startsWith('og:') || prop.startsWith('twitter:'))
      ? el.setAttribute('property', prop)
      : el.setAttribute('name', prop);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}
function aplicarSEO(overrides = {}) {
  const cfg      = _cache.config || {};
  const siteName = cfg.nombre || 'La Enbajada';
  const footer   = cfg.footer || {};
  const desc     = overrides.desc || footer.desc || 'Revista cultural del Caribe colombiano';
  const title    = overrides.titulo ? `${overrides.titulo} — ${siteName}` : siteName;
  document.title = title;
  setMeta('description', desc);
  setMeta('og:site_name', siteName);
  setMeta('og:title', title);
  setMeta('og:description', desc);
  setMeta('og:type', overrides.type || 'website');
  if (overrides.imagen) setMeta('og:image', overrides.imagen);
  setMeta('twitter:card', 'summary_large_image');
  setMeta('twitter:title', title);
  setMeta('twitter:description', desc);
  if (overrides.imagen) setMeta('twitter:image', overrides.imagen);
}

/* ══════════════════════════════════════════════════════════════
   APLICAR SITE — colores, logo, textos globales
   ══════════════════════════════════════════════════════════════ */
async function aplicarSite() {
  try { localStorage.removeItem('lae_dark'); document.documentElement.classList.remove('dark'); } catch(e) {}
  let cfg;
  try {
    cfg = await DB.getConfig();
  } catch (e) {
    console.warn('No se pudo cargar configuración:', e);
    cfg = {
      nombre: 'La Enbajada', tagline: 'Aterrizamos la Cultura',
      footer: {
        email: 'contacto@laenbajada.com', instagram: 'https://instagram.com/laenbajada',
        desc: 'Revista cultural del Caribe colombiano.', copy: '© 2026 La Enbajada', redes: [],
      },
    };
  }

  /* Paleta fija — no se aplican colores dinámicos */
  _setFavicon(cfg.logo_url, cfg.nombre, '#004AAD');

  /* Logo */
  if (cfg.logo_url) {
    document.querySelectorAll('.logo-img').forEach(img => { img.src = cfg.logo_url; img.style.display = ''; });
  }
  document.querySelectorAll('.js-logo-name').forEach(e => e.textContent = cfg.nombre || 'La Enbajada');
  document.querySelectorAll('.js-logo-tag').forEach(e  => e.textContent = cfg.tagline || 'Aterrizamos la Cultura');

  /* Textos globales */
  const ft = cfg.footer || {};
  document.querySelectorAll('.js-ciudad').forEach(e       => e.textContent = cfg.ciudad || '');
  document.querySelectorAll('.js-footer-brand').forEach(e  => e.textContent = cfg.nombre || 'La Enbajada');
  document.querySelectorAll('.js-footer-tagline').forEach(e => e.textContent = cfg.tagline || '');
  document.querySelectorAll('.js-footer-desc').forEach(e   => e.textContent = ft.desc || '');
  document.querySelectorAll('.js-footer-copy').forEach(e   => e.textContent = ft.copy || '© 2026 La Enbajada');
  document.querySelectorAll('.js-footer-email').forEach(e  => { if(ft.email){e.href=`mailto:${ft.email}`;e.textContent=ft.email;} });
  document.querySelectorAll('.js-footer-ig').forEach(e     => { if(ft.instagram)e.href=ft.instagram; });

  /* Redes sociales en footer */
  const redesWrap = document.getElementById('footer-redes-wrap');
  if (redesWrap && ft.redes?.length) {
    redesWrap.innerHTML = ft.redes.filter(r=>r.url).map(r =>
      `<a class="footer-red-btn" href="${r.url}" target="_blank" rel="noopener">${r.plataforma||'↗'}</a>`
    ).join('');
  }

  /* Boletín */
  const idxCfg = ft.index_cfg || {};
  document.querySelectorAll('.js-boletin-titulo').forEach(e => e.textContent = idxCfg.tituloBoletin || idxCfg.titbol || 'Recibe lo nuevo de La Enbajada en tu correo');
  document.querySelectorAll('.js-boletin-texto').forEach(e  => e.textContent = idxCfg.textoBoletin  || idxCfg.txtbol || 'La Enbajada llega a tu bandeja cuando hay algo que vale la pena leer.');

  aplicarSEO();

  /* theme-color */
  let tm = document.querySelector('meta[name="theme-color"]');
  if (!tm) { tm = document.createElement('meta'); tm.name = 'theme-color'; document.head.appendChild(tm); }
  tm.content = document.documentElement.classList.contains('dark') ? '#0F0E0C' : '#F7F4EE';
}

function _setFavicon(logoUrl, nombre, azul) {
  document.querySelectorAll('link[rel~="icon"]').forEach(l => l.remove());
  const link = document.createElement('link');
  link.rel = 'icon';
  if (logoUrl && logoUrl.startsWith('data:')) {
    link.type = 'image/png'; link.href = logoUrl;
  } else {
    const letra = (nombre || 'L')[0].toUpperCase();
    const color = azul || '#004AAD';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${color}"/><text x="16" y="23" font-family="serif" font-size="20" font-weight="bold" fill="white" text-anchor="middle">${letra}</text></svg>`;
    link.type = 'image/svg+xml';
    link.href = 'data:image/svg+xml;base64,' + btoa(svg);
  }
  document.head.appendChild(link);
}

/* ══════════════════════════════════════════════════════════════
   RENDERIZADO DE CONTENIDO
   ══════════════════════════════════════════════════════════════ */
function renderBloques(bloques) {
  if (!bloques || !bloques.length) return '';
  return bloques.map(b => {
    const c = b.contenido || {};
    switch (b.tipo) {
      case 'body':
        /* HTML enriquecido del editor WYSIWYG — renderiza directo */
        return `<div class="art-body">${c.html || c.texto || ''}</div>`;
      case 'parrafo':
        /* Si viene del WYSIWYG tiene c.html, si es bloque clásico tiene c.texto */
        if (c.html) return `<div class="art-body">${c.html}</div>`;
        return `<p class="art-p">${c.texto || ''}</p>`;
      case 'imagen':
        return `<figure class="art-figura">
          <img src="${c.url || ''}" alt="${c.alt || c.caption || ''}" loading="lazy">
          ${c.caption ? `<figcaption class="art-caption">${c.caption}</figcaption>` : ''}
        </figure>`;
      case 'cita_destacada':
        return `<blockquote class="art-cita">
          <p>${c.texto || ''}</p>
          ${c.atribucion ? `<cite>— ${c.atribucion}</cite>` : ''}
        </blockquote>`;
      case 'pregunta_respuesta':
        return `<div class="art-qr">
          <div class="art-pregunta"><span class="art-qr-label">—</span><p>${c.pregunta || ''}</p></div>
          <div class="art-respuesta"><span class="art-qr-label">R</span><p>${c.respuesta || ''}</p></div>
        </div>`;
      case 'separador':
        return `<div class="art-sep"><span>· · ·</span></div>`;
      case 'embed': {
        const ytMatch = (c.url||'').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch) return `<div class="art-embed-video"><iframe src="https://www.youtube.com/embed/${ytMatch[1]}" allowfullscreen loading="lazy"></iframe></div>`;
        return `<div class="art-embed"><a href="${c.url || '#'}" target="_blank" rel="noopener" class="art-embed-link">Ver contenido externo ↗</a></div>`;
      }
      default:
        return c.html ? `<div class="art-body">${c.html}</div>` : c.texto ? `<p class="art-p">${c.texto}</p>` : '';
    }
  }).join('\n');
}

function renderCuratia(items) {
  if (!items || !items.length) return '';
  const iconos = { musica:'♫', libro:'📖', pelicula:'◉', serie:'▶', podcast:'🎙', articulo:'✦', documental:'◈', otro:'→' };
  return `<div class="curatia-grid">
    ${items.map(it => {
      const icono  = iconos[it.tipo_medio] || '→';
      const meta   = it.meta || {};
      const metaStr = [meta.artista, meta.autor, meta.anio].filter(Boolean).join(' · ');
      return `<a href="${it.url_externa || '#'}" target="_blank" rel="noopener" class="curatia-card">
        ${it.imagen_url ? `<div class="curatia-img"><img src="${it.imagen_url}" alt="" loading="lazy"></div>` : ''}
        <div class="curatia-body">
          <span class="curatia-tipo">${icono} ${it.tipo_medio || 'otro'}</span>
          <div class="curatia-titulo">${it.titulo}</div>
          ${it.descripcion ? `<p class="curatia-desc">${it.descripcion}</p>` : ''}
          ${metaStr ? `<div class="curatia-meta">${metaStr}</div>` : ''}
        </div>
      </a>`;
    }).join('')}
  </div>`;
}

/* ── Función global de suscripción (usada desde todos los .html) ── */
async function suscribirse(btn) {
  const input    = document.getElementById('boletin-email');
  const feedback = document.getElementById('boletin-feedback');
  await suscribirBoletin(input, feedback, btn);
}

/* ── Modal de suscripción — reemplaza la sección de boletín embebida ── */
function openSubscribe() {
  const m = document.getElementById('sub-modal');
  if (!m) return;
  m.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('boletin-email')?.focus(), 80);
}
function closeSubscribe() {
  const m = document.getElementById('sub-modal');
  if (!m) return;
  m.classList.remove('open');
  document.body.style.overflow = '';
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sub-modal')?.addEventListener('click', function(e) {
    if (e.target === this) closeSubscribe();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSubscribe(); });
});

/* ══════════════════════════════════════════════════════════════
   NAVEGACIÓN A ARTÍCULO — con slug en URL
   ══════════════════════════════════════════════════════════════ */
function _artSlug(titulo) {
  return (titulo||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
/* Genera URL limpia para un artículo */
/* ═══════════════════════════════════════════════════════════════
   fmtFecha(iso, modo) — Formatea fecha en español.
   modo 'largo'  → '12 de junio de 2026'   (artículo hero)
   modo 'corto'  → '12 jun 2026'            (cards)
   Usa fecha_publicacion si existe, si no created_at.
   ═══════════════════════════════════════════════════════════════ */
function fmtFecha(a, modo = 'corto') {
  /* modo 'largo' = hero artículo → fecha_publicacion
     modo 'corto' = cards         → created_at        */
  const iso = modo === 'largo'
    ? (a?.fecha_publicacion || a?.created_at)
    : (a?.fecha_publicacion || a?.created_at);
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const opts_base = { timeZone: 'America/Bogota' };
  if (modo === 'largo') {
    return d.toLocaleDateString('es-CO', { ...opts_base, day: 'numeric', month: 'long', year: 'numeric' });
  }
  return d.toLocaleDateString('es-CO', { ...opts_base, day: 'numeric', month: 'short', year: 'numeric' });
}

function articuloUrl(a) {
  if (!a) return '/';
  const slug = a.slug || _artSlug(a.titulo || '');
  const tag  = normTag(a.seccion_tag || '');
  if (slug && tag) return `/secciones/${tag}/${slug}`;
  if (slug)        return `/historias/${slug}`;  /* fallback legacy */
  return `/articulo.html?id=${encodeURIComponent(a.id)}`;
}

function editorUrl(e) {
  if (!e) return '#';
  const slug = e.slug || e.id || '';
  return slug ? `/sobre/equipo/${slug}` : '#';
}
/* Genera URL limpia para una edición */
function edicionUrl(num) {
  return num ? `/ediciones/${num}` : '/edicion.html';
}
/* Genera URL limpia para una sección */
function seccionUrl(tag) {
  return tag ? `/secciones/${normTag(tag)}` : '/secciones.html';
}
function insertarModal() { /* no-op */ }
function abrirModal(id) {
  if (!id) return;
  const art = Object.values(_cache.articulos).flat().find?.(a => a.id === id);
  const href = art ? articuloUrl(art) : `articulo.html?id=${encodeURIComponent(id)}`;
  if (document.startViewTransition) {
    document.startViewTransition(() => { window.location.href = href; });
  } else {
    document.body.classList.add('page-exit');
    setTimeout(() => { window.location.href = href; }, 240);
  }
}
function cerrarModal() {}
function _initReadingProgress() {}

/* ══════════════════════════════════════════════════════════════
   BOLETÍN
   ══════════════════════════════════════════════════════════════ */
async function suscribirBoletin(inputEl, feedbackEl, btnEl) {
  const raw = (inputEl?.value || '').trim();

  const mostrar = (texto, tipo) => {
    if (!feedbackEl) return;
    feedbackEl.textContent = texto;
    feedbackEl.className = feedbackEl.className.replace(/\bfb-\w+\b/g, '').trim() + ` fb-${tipo} fb-in`;
    /* reiniciar la animación cada vez, aunque el mensaje sea igual al anterior */
    void feedbackEl.offsetWidth;
    feedbackEl.classList.add('fb-in');
  };

  /* Validación en el propio navegador, con mensajes específicos —
     no todo error es "correo inválido" genérico. */
  if (!raw) {
    mostrar('Escribe tu correo para suscribirte.', 'warn');
    inputEl?.focus();
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.toLowerCase())) {
    mostrar(raw.includes('@') ? 'Ese correo no se ve completo — revísalo.' : 'Falta la @ — revisa tu correo.', 'warn');
    inputEl?.focus();
    return;
  }

  if (btnEl) { btnEl.disabled = true; btnEl.dataset.txt = btnEl.textContent; btnEl.textContent = 'Enviando…'; }
  mostrar('Enviando…', 'info');

  const result = await DB.agregarSuscriptor(raw);

  if (btnEl) { btnEl.disabled = false; btnEl.textContent = btnEl.dataset.txt || 'Suscribirse'; }

  if (result === true) {
    mostrar('¡Gracias por suscribirte! Ya eres parte de La Enbajada.', 'ok');
    if (inputEl) inputEl.value = '';
  } else if (result === 'duplicado') {
    mostrar('Ya estás suscrito con ese correo — gracias por seguir ahí.', 'info');
  } else {
    mostrar('Algo falló de nuestro lado — intenta de nuevo en un momento.', 'warn');
  }
  setTimeout(() => { if (feedbackEl) { feedbackEl.textContent = ''; feedbackEl.className = feedbackEl.className.replace(/\bfb-\w+\b/g, '').trim(); } }, 5000);
}

/* ══════════════════════════════════════════════════════════════
   BÚSQUEDA EN NAVEGACIÓN
   ══════════════════════════════════════════════════════════════ */
function _debounce(fn, ms) {
  let t; return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}
function _initNavSearch() { return; /* eliminado — reemplazado por modal */ //
  const navRight = document.querySelector('.nav-right');
  if (!navRight || navRight.querySelector('.nav-search-wrap')) return;
  navRight.insertAdjacentHTML('afterbegin', `
    <div class="nav-search-wrap" role="search">
      <button class="nav-search-icon" id="nav-srch-btn" aria-label="Buscar" onclick="toggleNavSearch()">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <circle cx="6.5" cy="6.5" r="4.5"/><line x1="10" y1="10" x2="14" y2="14"/>
        </svg>
      </button>
      <div class="nav-search-box" id="nav-srch-box">
        <input class="nav-search-input" id="nav-srch" placeholder="Buscar artículos…" autocomplete="off"
          onblur="setTimeout(closeNavSearch,220)">
        <div class="nav-search-results" id="nav-srch-res"></div>
      </div>
    </div>`);
  const input = document.getElementById('nav-srch');
  if (input) input.addEventListener('input', _debounce(e => navBuscar(e.target.value), 280));
}
function toggleNavSearch() {
  const box = document.getElementById('nav-srch-box');
  const open = !box?.classList.contains('open');
  box?.classList.toggle('open', open);
  document.getElementById('nav-srch-btn')?.classList.toggle('activo', open);
  if (open) setTimeout(() => document.getElementById('nav-srch')?.focus(), 50);
}
function closeNavSearch() {
  document.getElementById('nav-srch-box')?.classList.remove('open');
  document.getElementById('nav-srch-btn')?.classList.remove('activo');
}
async function navBuscar(q) {
  const res = document.getElementById('nav-srch-res'); if (!res) return;
  if (!q || q.length < 2) { res.innerHTML = ''; return; }
  const arts = await DB.buscar(q);
  if (!arts.length) { res.innerHTML = `<div class="nsr-empty">Sin resultados para "${q}"</div>`; return; }
  res.innerHTML = arts.slice(0, 6).map(a => `
    <div class="nsr-item" tabindex="0"
      onclick="abrirModal('${a.id}');closeNavSearch()"
      onkeydown="if(event.key==='Enter'){abrirModal('${a.id}');closeNavSearch()}">
      <div class="nsr-cat">${a.tipo || ''}</div>
      <div class="nsr-titulo">${a.titulo}</div>
      <div class="nsr-meta">${a.autor || ''}</div>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════════════════
   REVEAL SCROLL
   ══════════════════════════════════════════════════════════════ */
function observeReveal() {
  const sel = '.reveal:not(.visible),.reveal-left:not(.visible),.reveal-right:not(.visible),.reveal-scale:not(.visible)';
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        const delay = e.target.classList.contains('stagger-5') ? 600
                    : e.target.classList.contains('stagger-4') ? 440
                    : e.target.classList.contains('stagger-3') ? 300
                    : e.target.classList.contains('stagger-2') ? 180
                    : e.target.classList.contains('stagger-1') ? 80
                    : i * 55;
        setTimeout(() => e.target.classList.add('visible'), delay);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.07, rootMargin: '0px 0px -20px 0px' });
  document.querySelectorAll(sel).forEach(el => obs.observe(el));
}

function _initHeaderScroll() {
  const hdr = document.querySelector('.site-header');
  if (!hdr) return;
  const fn = () => hdr.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', fn, { passive: true });
  fn();
}

function toggleMenu() { document.getElementById('mobile-menu')?.classList.toggle('open'); }

/* ══════════════════════════════════════════════════════════════
   TRANSICIONES ENTRE PÁGINAS
   ══════════════════════════════════════════════════════════════ */
function _initPageTransitions() {
  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto') || a.target === '_blank') return;
    a.addEventListener('click', e => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      if (document.startViewTransition) {
        document.startViewTransition(() => { window.location.href = href; });
      } else {
        document.body.classList.add('page-exit');
        setTimeout(() => { window.location.href = href; }, 280);
      }
    });
  });
  document.body.classList.add('page-enter');
  requestAnimationFrame(() => { setTimeout(() => document.body.classList.remove('page-enter'), 50); });
}

function _checkArtParam() {
  const params = new URLSearchParams(location.search);
  /* Legacy: ?art=id → redirect al artículo */
  const artId = params.get('art');
  if (artId && !location.pathname.includes('articulo') && !location.pathname.includes('historias')) {
    window.location.replace(`/articulo.html?id=${encodeURIComponent(artId)}`);
    return;
  }
  /* Nuevo: ?=slug → ya está en articulo.html, no hacer nada */
}

/* ══════════════════════════════════════════════════════════════
   CURSOR PERSONALIZADO
   ══════════════════════════════════════════════════════════════ */
/* Cursor personalizado desactivado — usa el del sistema */
function _initCursor() { /* desactivado */ }

/* ══════════════════════════════════════════════════════════════
   UTILIDADES
   ══════════════════════════════════════════════════════════════ */
function _fmtFecha(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
}

function imgHtml(src, cls = '') {
  if (src && (src.startsWith('data:') || src.startsWith('http') || src.startsWith('/'))) {
    return `<img src="${src}" alt="" loading="lazy"${cls ? ` class="${cls}"` : ''}>`;
  }
  return '<div class="ph"></div>';
}

function comprimirImagen(dataUrl, maxW = 1200, maxH = 800, quality = 0.82) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxW || h > maxH) {
        const r = Math.min(maxW / w, maxH / h);
        w = Math.round(w * r); h = Math.round(h * r);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function contarPalabras(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(w => w).length;
}
function calcularLectura(palabras) { return Math.max(1, Math.ceil(palabras / 200)) + ' min'; }

/* ══════════════════════════════════════════════════════════════
   SCROLL SPY
   ══════════════════════════════════════════════════════════════ */
function _initSectionBullets(secciones) {
  if (!secciones || !secciones.length || window.innerWidth < 900) return;
  const wrap = document.createElement('div');
  wrap.id = 'sec-bullets';
  wrap.style.cssText = 'position:fixed;right:20px;top:50%;transform:translateY(-50%);z-index:400;display:flex;flex-direction:column;gap:8px;padding:10px 8px;opacity:0;transition:opacity .35s;pointer-events:none;';
  secciones.forEach(({ id, label }) => {
    const btn = document.createElement('button');
    btn.dataset.target = id;
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.style.cssText = 'width:8px;height:8px;border-radius:50%;border:1.5px solid var(--c-azul);background:transparent;cursor:pointer;padding:0;transition:background .22s,transform .22s;flex-shrink:0;position:relative;';
    btn.addEventListener('click', () => {
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    wrap.appendChild(btn);
  });
  document.body.appendChild(wrap);
  const onScroll = () => {
    const scrolled = window.scrollY > 120;
    wrap.style.opacity = scrolled ? '1' : '0';
    wrap.style.pointerEvents = scrolled ? 'auto' : 'none';
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const bullets = wrap.querySelectorAll('button[data-target]');
  const setActivo = (id) => {
    bullets.forEach(btn => {
      const isActive = btn.dataset.target === id;
      btn.style.background = isActive ? 'var(--c-azul)' : 'transparent';
      btn.style.transform   = isActive ? 'scale(1.4)' : 'scale(1)';
    });
  };
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) setActivo(e.target.id); });
  }, { threshold: 0, rootMargin: '-40% 0px -55% 0px' });
  secciones.forEach(({ id }) => { const el = document.getElementById(id); if (el) obs.observe(el); });
  if (secciones[0]) setActivo(secciones[0].id);
}

/* ══════════════════════════════════════════════════════════════
   INIT PÚBLICO
   ══════════════════════════════════════════════════════════════ */
async function initSite() {
  insertarModal();
  await aplicarSite();
  requestAnimationFrame(() => {
    _initReadingProgress();
    /* Cursor personalizado desactivado — se usa el del sistema */
    _checkArtParam();
    _initPageTransitions();
    _initHeaderScroll();
  });
}