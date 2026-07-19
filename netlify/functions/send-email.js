/* ══════════════════════════════════════════════
   La Enbajada — netlify/functions/send-email.js
   Proxy hacia la API de Resend para enviar el boletín
   editorial y los correos de prueba desde el admin.

   Corre server-side porque la API de Resend no acepta
   llamadas directas desde el navegador (sin CORS) —
   sin esta función, el botón "Enviar boletín ahora" y
   "Enviar prueba" en Configuración fallan siempre.
   ══════════════════════════════════════════════ */

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Método no permitido' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ message: 'JSON inválido' }) };
  }

  const { apiKey, from, to, bcc, subject, html } = body;

  if (!apiKey)  return { statusCode: 400, body: JSON.stringify({ message: 'Falta la API key de Resend' }) };
  if (!from)    return { statusCode: 400, body: JSON.stringify({ message: 'Falta el remitente (from)' }) };
  if (!to)      return { statusCode: 400, body: JSON.stringify({ message: 'Falta el destinatario (to)' }) };
  if (!subject) return { statusCode: 400, body: JSON.stringify({ message: 'Falta el asunto' }) };
  if (!html)    return { statusCode: 400, body: JSON.stringify({ message: 'Falta el contenido del correo' }) };

  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  };

  const bccList = Array.isArray(bcc) ? bcc : (bcc ? [bcc] : []);
  if (bccList.length) payload.bcc = bccList;

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await resendRes.json().catch(() => ({}));

    return {
      statusCode: resendRes.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (e) {
    return {
      statusCode: 502,
      body: JSON.stringify({ message: 'No se pudo contactar a Resend: ' + e.message }),
    };
  }
};
