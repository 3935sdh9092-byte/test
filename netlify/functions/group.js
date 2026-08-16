// 그룹 MBTI 지도 - 실제 그룹 동기화용 서버리스 함수 (Netlify Functions v2, ESM)
// Netlify Blobs(내장 key-value 저장소)를 사용해 그룹/참여자 정보를 저장한다.
// v1(CommonJS exports.handler) 형식에서는 Blobs 자동 설정(auto-injection)이
// 누락되는 경우가 있어(MissingBlobsEnvironmentError), v2(ESM export default) 형식으로 작성한다.

import { getStore } from '@netlify/blobs';

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8'
};

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status: status, headers: HEADERS });
}

function makeCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default async (req, context) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: HEADERS });
  }

  let store;
  try {
    store = getStore({ name: 'group-mbti', consistency: 'strong' });
  } catch (e) {
    return json(500, { error: '[store-init] ' + (e && e.name) + ': ' + (e && e.message) });
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const code = (url.searchParams.get('code') || '').toUpperCase().trim();
      if (!code) return json(400, { error: 'code required' });
      const group = await store.get(code, { type: 'json' });
      if (!group) return json(404, { error: 'group not found' });
      return json(200, group);
    }

    if (req.method === 'POST') {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        return json(400, { error: 'invalid json body' });
      }
      const action = body.action;

      if (action === 'create') {
        const groupName = String(body.groupName || '').trim().slice(0, 40);
        const name = String(body.name || '').trim().slice(0, 20);
        const type = String(body.type || '').trim().toUpperCase().slice(0, 4);
        if (!groupName || !name || !type) return json(400, { error: 'missing fields' });

        let code = '';
        for (let i = 0; i < 6; i++) {
          const candidate = makeCode();
          const exists = await store.get(candidate, { type: 'json' });
          if (!exists) { code = candidate; break; }
        }
        if (!code) return json(500, { error: 'code generation failed, try again' });

        const group = {
          groupName: groupName,
          code: code,
          members: [{ name: name, type: type, joinedAt: Date.now() }],
          createdAt: Date.now()
        };
        await store.setJSON(code, group);
        return json(200, group);
      }

      if (action === 'join') {
        const code = String(body.code || '').trim().toUpperCase().slice(0, 12);
        const name = String(body.name || '').trim().slice(0, 20);
        const type = String(body.type || '').trim().toUpperCase().slice(0, 4);
        if (!code || !name || !type) return json(400, { error: 'missing fields' });

        const group = await store.get(code, { type: 'json' });
        if (!group) return json(404, { error: '초대 코드를 찾을 수 없어요' });
        if (!Array.isArray(group.members)) group.members = [];
        if (group.members.length >= 60) return json(400, { error: '그룹 인원이 가득 찼어요' });

        group.members.push({ name: name, type: type, joinedAt: Date.now() });
        await store.setJSON(code, group);
        return json(200, group);
      }

      return json(400, { error: 'unknown action' });
    }

    return json(405, { error: 'method not allowed' });
  } catch (e) {
    return json(500, { error: '[handler] ' + ((e && e.name) || 'Error') + ': ' + String((e && e.message) || e) });
  }
};
