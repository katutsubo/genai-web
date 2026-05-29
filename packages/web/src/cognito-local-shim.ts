// ローカル開発用:
//  - cognito-idp.*.amazonaws.com           → cognito-local にプロキシ
//  - cognito-identity.*.amazonaws.com      → ダミー応答
//  - VITE_APP_API_ENDPOINT/(chats|...)     → localStorage モック
const cognitoEndpoint = import.meta.env.VITE_APP_COGNITO_ENDPOINT as string | undefined;
const apiEndpoint = import.meta.env.VITE_APP_API_ENDPOINT as string | undefined;

if (cognitoEndpoint) {
  const orig = window.fetch.bind(window);
  const reIdp = /^https?:\/\/cognito-idp\.[^/]+\.amazonaws\.com/;
  const reIdentity = /^https?:\/\/cognito-identity\.[^/]+\.amazonaws\.com/;
  const reLambda = /^https?:\/\/lambda\.[^/]+\.amazonaws\.com/;

  const jsonResponse = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const awsJsonResponse = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { 'Content-Type': 'application/x-amz-json-1.1' },
    });

  const handleIdentity = async (req: Request | null, init?: RequestInit) => {
    const target =
      (req?.headers.get('x-amz-target') ||
        (init?.headers && new Headers(init.headers).get('x-amz-target')) ||
        '') as string;

    console.log('[cognito-local-shim] mock identity:', target);

    if (target.endsWith('.GetId')) {
      return awsJsonResponse({
        IdentityId: 'ap-northeast-1:00000000-0000-0000-0000-000000000000',
      });
    }
    if (target.endsWith('.GetCredentialsForIdentity')) {
      return awsJsonResponse({
        IdentityId: 'ap-northeast-1:00000000-0000-0000-0000-000000000000',
        Credentials: {
          AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          SecretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          SessionToken: 'dummy',
          Expiration: Math.floor(Date.now() / 1000) + 3600,
        },
      });
    }
    return awsJsonResponse({});
  };

  // ---- localStorage を使った Chat 履歴のミニ実装 -------------------------
  type Chat = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  };
  type Message = {
    id: string;
    chatId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt: string;
  };

  const KEY_CHATS = 'genai-local:chats';
  const KEY_MSGS = 'genai-local:messages';

  const loadChats = (): Chat[] => {
    try {
      return JSON.parse(localStorage.getItem(KEY_CHATS) || '[]');
    } catch {
      return [];
    }
  };
  const saveChats = (arr: Chat[]) => localStorage.setItem(KEY_CHATS, JSON.stringify(arr));
  const loadMessages = (): Message[] => {
    try {
      return JSON.parse(localStorage.getItem(KEY_MSGS) || '[]');
    } catch {
      return [];
    }
  };
  const saveMessages = (arr: Message[]) =>
    localStorage.setItem(KEY_MSGS, JSON.stringify(arr));
  const handleApi = async (url: string, req: Request | null, init?: RequestInit) => {
    const method = (req?.method || init?.method || 'GET').toUpperCase();
    const u = new URL(url);
    const path = u.pathname;
    const body = req
      ? await req.clone().text()
      : typeof init?.body === 'string'
        ? init.body
        : '';
    const parsedBody = body ? safeJson(body) : {};

    console.log('[cognito-local-shim] mock api:', method, path);

      // ===== /chats =====================================================
    // GET /chats : Pagination<Chat> 形式
    if (method === 'GET' && path === '/chats') {
      const chats = loadChats().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return jsonResponse({
        data: chats.map((c) => ({
          chatId: `chat#${c.id}`,
          id: c.id,
          title: c.title,
          createdDate: new Date(c.createdAt).getTime(),
          updatedDate: new Date(c.updatedAt).getTime(),
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
        lastEvaluatedKey: null,
      });
    }
    // POST /chats
    if (method === 'POST' && path === '/chats') {
      const id = `${Date.now()}`;
      const now = new Date().toISOString();
      const nowMs = Date.now();
      const chat: Chat = { id, title: '新しいチャット', createdAt: now, updatedAt: now };
      const all = loadChats();
      all.push(chat);
      saveChats(all);
      return jsonResponse({
        chat: {
          chatId: `chat#${id}`,
          id,
          title: chat.title,
          createdDate: nowMs,
          updatedDate: nowMs,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
    // GET /chats/:id
    const mChat = path.match(/^\/chats\/([^/]+)$/);
    if (method === 'GET' && mChat) {
      const id = mChat[1];
      const c = loadChats().find((x) => x.id === id);
      return jsonResponse({
        chat: c
          ? {
              chatId: `chat#${id}`,
              id,
              title: c.title,
              createdDate: new Date(c.createdAt).getTime(),
              updatedDate: new Date(c.updatedAt).getTime(),
              createdAt: c.createdAt,
              updatedAt: c.updatedAt,
            }
          : null,
      });
    }
    // DELETE /chats/:id  (変更なし)
    if (method === 'DELETE' && mChat) {
      const id = mChat[1];
      saveChats(loadChats().filter((c) => c.id !== id));
      saveMessages(loadMessages().filter((m) => m.chatId !== id));
      return jsonResponse({});
    }
    // PUT /chats/:id/title  (変更なし)
    const mTitle = path.match(/^\/chats\/([^/]+)\/title$/);
    if (method === 'PUT' && mTitle) {
      const id = mTitle[1];
      const arr = loadChats();
      const i = arr.findIndex((c) => c.id === id);
      if (i >= 0) {
        arr[i].title = parsedBody.title || arr[i].title;
        arr[i].updatedAt = new Date().toISOString();
        saveChats(arr);
      }
      return jsonResponse({});
    }
    // GET /chats/:id/messages : Pagination<Message>
    const mMsgs = path.match(/^\/chats\/([^/]+)\/messages$/);
    if (method === 'GET' && mMsgs) {
      const id = mMsgs[1];
      const messages = loadMessages().filter((m) => m.chatId === id);
      return jsonResponse({
        data: messages.map((m) => ({
          ...m,
          createdDate: new Date(m.createdAt).getTime(),
        })),
        lastEvaluatedKey: null,
      });
    }
    // POST /chats/:id/messages
    if (method === 'POST' && mMsgs) {
      const id = mMsgs[1];
      const incoming: any[] = parsedBody.messages || [];
      const now = new Date().toISOString();
      const nowMs = Date.now();
      const created: Message[] = incoming.map((m: any, idx: number) => ({
        id: `msg-${nowMs}-${idx}`,
        chatId: id,
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        createdAt: now,
      }));
      const all = loadMessages();
      saveMessages([...all, ...created]);
      return jsonResponse({
        messages: created.map((m) => ({ ...m, createdDate: nowMs })),
      });
    }

    // ===== /systemcontexts ・ /sharedChats =============================
    if (method === 'GET' && path === '/systemcontexts') {
      return jsonResponse({ data: [], lastEvaluatedKey: null });
    }
    if (method === 'GET' && path === '/sharedChats') {
      return jsonResponse({ data: [], lastEvaluatedKey: null });
    }

    // ===== /predict/title =============================================
    if (method === 'POST' && path === '/predict/title') {
      return jsonResponse({ title: '新しいチャット' });
    }

    // ===== fallback ===================================================
    console.warn('[cognito-local-shim] unhandled api path, returning {}:', method, path);
    return jsonResponse({});
  };

  function safeJson(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url: string;
    let req: Request | null = null;

    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.toString();
    } else {
      req = input;
      url = input.url;
    }

    // Lambda 直接呼び出しを拒否（ローカルでは使えないので明示的に止める）
    if (reLambda.test(url)) {
      console.warn('[cognito-local-shim] blocked Lambda invoke (use LiteLLM):', url);
      return new Response(JSON.stringify({ message: 'Lambda invoke is disabled in local dev' }), {
        status: 501,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Identity Pool
    if (reIdentity.test(url)) {
      return handleIdentity(req, init);
    }

    // User Pool プロキシ
    if (reIdp.test(url)) {
      const rewritten = url.replace(reIdp, cognitoEndpoint);
      if (req) {
        const headers = new Headers(req.headers);
        const body = ['GET', 'HEAD'].includes(req.method)
          ? undefined
          : await req.clone().arrayBuffer();
        return orig(rewritten, {
          method: req.method,
          headers,
          body,
        });
      }
      return orig(rewritten, init);
    }

    // 源内 Web の REST API (LiteLLM 4000 を VITE_APP_API_ENDPOINT に流用しているため
    // /chats, /systemcontexts などが 404 になる) を localStorage モックする
    if (apiEndpoint && url.startsWith(apiEndpoint)) {
      const after = url.substring(apiEndpoint.length);
      // LiteLLM が本来処理する OpenAI 互換系はモックしない
      // LiteLLM が処理する OpenAI 互換系のみ素通し（chats などと誤マッチしないよう境界を明示）
      const openaiCompat =
          /^\/?v1(\/|$)/.test(after) ||
          /^\/?(models|chat|embeddings|completions)(\/|$|\?)/.test(after);
      if (!openaiCompat) {
        return handleApi(url, req, init);
      }
    }

    return orig(input as RequestInfo, init);
  };

  console.log(
    '[cognito-local-shim] enabled. idp →',
    cognitoEndpoint,
    '/ identity → mocked / api →',
    apiEndpoint,
    '(REST mocked, /v1/* passthrough)',
  );
}

export {};