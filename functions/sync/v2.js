import { handleSyncV2Meta, handleSyncV2GetChunk, handleSyncV2PostChunk } from './chunks.js';
import { handleSyncV2Commit, handleSyncV2Delete } from './mutations.js';
import { json } from './http.js';


async function handleSyncV2(request, db, tokenHash) {
  const url = new URL(request.url);
  const operation = (url.searchParams.get('op') || '').toLowerCase();
  let response;

  if (request.method === 'GET' && operation === 'meta') {
    response = await handleSyncV2Meta(db, tokenHash);
  } else if (request.method === 'GET' && operation === 'chunk') {
    response = await handleSyncV2GetChunk(request, db, tokenHash);
  } else if (request.method === 'POST' && operation === 'chunk') {
    response = await handleSyncV2PostChunk(request, db, tokenHash);
  } else if (request.method === 'POST' && operation === 'commit') {
    response = await handleSyncV2Commit(request, db, tokenHash);
  } else if (request.method === 'DELETE') {
    response = await handleSyncV2Delete(request, db, tokenHash);
  } else {
    response = json({ success: false, error: 'Unsupported sync protocol v2 operation.' }, { status: 405 });
  }

  const headers = new Headers(response.headers);
  headers.set('X-OpenTavern-Protocol', '2');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
export { handleSyncV2 };
