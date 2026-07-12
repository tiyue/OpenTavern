/**
 * 新手导读：这是运行在 Cloudflare Pages 上的“公共角色卡查询接口”。
 *
 * 浏览器访问 /api/cards 时，本文件从 D1 数据库读取已审核的角色卡列表；访问
 * /api/cards/:id 时返回某张卡的完整资料。onRequest 是 Cloudflare 规定的入口函数，
 * context.request 表示本次网络请求，context.env.DB 是部署时绑定的 D1 数据库。
 *
 * 数据流：检查请求方法和地址 -> 拼装带占位符的 SQL -> 用 bind 绑定用户参数 ->
 * 查询数据库 -> 返回 JSON。用户输入绝不能直接拼进 SQL，否则会产生 SQL 注入风险。
 * OPTIONS 分支用于浏览器的跨域预检，也不能随意删除。
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // GET /api/cards?search=xxx&tags=温柔,校园
  if (url.pathname === '/api/cards' && request.method === 'GET') {
    const search = url.searchParams.get('search') || '';
    const limit = parseInt(url.searchParams.get('limit') || '30');

    let query = `
      SELECT id, name, tags, short_description, download_count 
      FROM cards 
      WHERE status = 'curated'
    `;
    const params = [];

    if (search) {
      query += ` AND (name LIKE ? OR short_description LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY download_count DESC, created_at DESC LIMIT ?`;
    params.push(limit);

    const { results } = await env.DB.prepare(query).bind(...params).all();

    return Response.json({ success: true, data: results }, { headers: corsHeaders });
  }

  // GET /api/cards/:id （返回完整 card_json + lorebook）
  const match = url.pathname.match(/^\/api\/cards\/(\d+)$/);
  if (match && request.method === 'GET') {
    const id = match[1];
    const { results } = await env.DB
      .prepare(`SELECT card_json, lorebook_json FROM cards WHERE id = ? AND status = 'curated'`)
      .bind(id)
      .all();

    if (!results.length) {
      return Response.json({ success: false, error: 'Card not found' }, { status: 404, headers: corsHeaders });
    }

    const card = JSON.parse(results[0].card_json);
    if (results[0].lorebook_json) {
      card.data.character_book = JSON.parse(results[0].lorebook_json);
    }

    return Response.json({ success: true, data: card }, { headers: corsHeaders });
  }

  return new Response('Not Found', { status: 404, headers: corsHeaders });
}
