/**
 * Cloudflare Worker - TTS proxy for OpenAI-compatible and Fish Audio APIs.
 *
 * Routes:
 * - POST /v1/audio/speech -> OpenAI-compatible TTS
 * - POST /v1/tts          -> Fish Audio TTS
 *
 * The browser may send either normal provider headers:
 * - Authorization: Bearer <key>
 * - model: <fish-model>
 *
 * Or proxy-specific headers:
 * - X-OpenAI-Key: <key>
 * - X-Fish-Key: <key>
 * - X-Fish-Model: <fish-model>
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, model, X-OpenAI-Key, X-Fish-Key, X-Fish-Model',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return textResponse('Method Not Allowed', 405);
    }

    try {
      if (path === '/v1/audio/speech') {
        return await handleOpenAI(request);
      }

      if (path === '/v1/tts') {
        return await handleFishAudio(request);
      }

      return jsonResponse({
        error: 'Not Found. Use /v1/audio/speech for OpenAI-compatible TTS or /v1/tts for Fish Audio.',
      }, 404);
    } catch (err) {
      return jsonResponse({
        error: err && err.message ? err.message : 'Internal Server Error',
      }, 500);
    }
  },
};

async function handleOpenAI(request) {
  const openaiKey = request.headers.get('X-OpenAI-Key') || getBearerToken(request);

  if (!openaiKey) {
    return jsonResponse({ error: 'Missing API key. Send X-OpenAI-Key or Authorization: Bearer <key>.' }, 401);
  }

  const body = await request.json();
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return proxyAudioResponse(response);
}

async function handleFishAudio(request) {
  const fishKey = request.headers.get('X-Fish-Key') || getBearerToken(request);
  const fishModel = request.headers.get('X-Fish-Model') || request.headers.get('model') || 's2.1-pro-free';

  if (!fishKey) {
    return jsonResponse({ error: 'Missing API key. Send X-Fish-Key or Authorization: Bearer <key>.' }, 401);
  }

  const body = await request.json();
  const response = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${fishKey}`,
      'Content-Type': 'application/json',
      'model': fishModel,
    },
    body: JSON.stringify(body),
  });

  return proxyAudioResponse(response);
}

async function proxyAudioResponse(response) {
  if (!response.ok) {
    const errorText = await response.text();
    return new Response(errorText, {
      status: response.status,
      headers: withCors({
        'Content-Type': response.headers.get('Content-Type') || 'text/plain; charset=utf-8',
      }),
    });
  }

  return new Response(response.body, {
    status: response.status,
    headers: withCors({
      'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg',
    }),
  });
}

function getBearerToken(request) {
  const value = request.headers.get('Authorization') || '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: withCors({ 'Content-Type': 'application/json; charset=utf-8' }),
  });
}

function textResponse(text, status) {
  return new Response(text, {
    status,
    headers: withCors({ 'Content-Type': 'text/plain; charset=utf-8' }),
  });
}

function withCors(headers) {
  return Object.assign({}, CORS_HEADERS, headers || {});
}
