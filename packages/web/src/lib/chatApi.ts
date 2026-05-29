import { InvokeWithResponseStreamCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import { fetchAuthSession } from 'aws-amplify/auth';
import {
  CreateChatResponse,
  CreateMessagesRequest,
  CreateMessagesResponse,
  PredictRequest,
  PredictResponse,
  PredictTitleRequest,
  PredictTitleResponse,
  UpdateTitleRequest,
  UpdateTitleResponse,
} from 'genai-web';
import { genUApi } from '@/lib/fetcher';
import { decomposeId } from '@/utils/decomposeId';

export const createChat = async () => {
  const res = await genUApi.post<CreateChatResponse>('chats', {});
  return res.data;
};

export const createMessages = async (_chatId: string, req: CreateMessagesRequest) => {
  const chatId = decomposeId(_chatId);
  const res = await genUApi.post<CreateMessagesResponse>(`chats/${chatId}/messages`, req);
  return res.data;
};

export const deleteChat = async (chatId: string) => {
  return genUApi.delete<void>(`chats/${chatId}`);
};

export const updateTitle = async (chatId: string, title: string) => {
  const req: UpdateTitleRequest = {
    title,
  };
  const res = await genUApi.put<UpdateTitleResponse>(`chats/${chatId}/title`, req);
  return res.data;
};

export const predict = async (req: PredictRequest): Promise<string> => {
  // ローカル: LiteLLM 直叩き
  if (import.meta.env.VITE_APP_COGNITO_ENDPOINT) {
    let out = '';
    for await (const chunk of predictStream(req)) {
      try {
        const obj = JSON.parse(chunk);
        if (obj.text) out += obj.text;
      } catch {
        /* ignore */
      }
    }
    return out;
  }
  const res = await genUApi.post<PredictResponse>('predict', req);
  return res.data;
};

// =========================================================================
// predictStream
//   - 本番: Cognito Identity Pool 経由で Lambda 直接 invoke
//   - ローカル (VITE_APP_COGNITO_ENDPOINT が定義): LiteLLM (OpenAI 互換) を
//     直叩きしてストリーミング。yield する形式は `{text, stopReason?}` の
//     JSON 文字列（useChat.ts 側のパーサに合わせる）
// =========================================================================
export async function* predictStream(req: PredictRequest) {
  const isLocal = !!import.meta.env.VITE_APP_COGNITO_ENDPOINT;

  if (isLocal) {
    yield* predictStreamLocal(req);
    return;
  }

  const token = (await fetchAuthSession()).tokens?.idToken?.toString();
  if (!token) {
    throw new Error('認証されていません。');
  }

  const region = import.meta.env.VITE_APP_REGION;
  const userPoolId = import.meta.env.VITE_APP_USER_POOL_ID;
  const idPoolId = import.meta.env.VITE_APP_IDENTITY_POOL_ID;
  const providerName = `cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  const lambda = new LambdaClient({
    region,
    credentials: fromCognitoIdentityPool({
      clientConfig: { region },
      identityPoolId: idPoolId,
      logins: {
        [providerName]: token,
      },
    }),
  });

  const res = await lambda.send(
    new InvokeWithResponseStreamCommand({
      FunctionName: import.meta.env.VITE_APP_PREDICT_STREAM_FUNCTION_ARN,
      Payload: JSON.stringify(req),
    }),
  );
  const events = res.EventStream!;

  for await (const event of events) {
    if (event.PayloadChunk) {
      yield new TextDecoder('utf-8').decode(event.PayloadChunk.Payload);
    }

    if (event.InvokeComplete) {
      break;
    }
  }
}

// ---- ローカル用ヘルパ -----------------------------------------------------
async function* predictStreamLocal(req: PredictRequest): AsyncGenerator<string> {
  // messages を OpenAI 互換に変換
  // PredictRequest.messages の content は string か content blocks。string 化する。
  const reqAny = req as any;
  const messages = (reqAny.messages || []).map((m: any) => {
    let content = '';
    if (typeof m.content === 'string') {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = m.content
        .map((c: any) => (typeof c === 'string' ? c : c.text || ''))
        .join('\n');
    }
    return {
      role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
      content,
    };
  });

  // モデル ID は LiteLLM の config.yaml に登録された名前と一致している必要がある
  const modelId =
    (reqAny.model && (reqAny.model.modelId || reqAny.model.modelName)) ||
    'anthropic.claude-3-5-sonnet-20240620-v1:0';

  const endpoint = import.meta.env.VITE_APP_API_ENDPOINT as string; // 例: http://localhost:4000
  const url = `${endpoint.replace(/\/$/, '')}/v1/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-localdummy',
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '');
    throw new Error(`LiteLLM error ${res.status}: ${txt}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') {
        // useChat 側の形式に合わせて stopReason を返して終了
        yield JSON.stringify({ text: '', stopReason: 'end_turn' });
        return;
      }
      try {
        const obj = JSON.parse(payload);
        const delta = obj?.choices?.[0]?.delta?.content;
        const finishReason = obj?.choices?.[0]?.finish_reason;
        if (delta) {
          yield JSON.stringify({ text: delta });
        }
        if (finishReason) {
          yield JSON.stringify({ text: '', stopReason: String(finishReason) });
        }
      } catch {
        /* ignore */
      }
    }
  }
}

export const predictTitle = async (req: PredictTitleRequest) => {
  // ローカル: LiteLLM 直叩きで適当なタイトルを生成
  if (import.meta.env.VITE_APP_COGNITO_ENDPOINT) {
    const reqAny = req as any;
    const lastUser =
      (reqAny.messages || []).filter((m: any) => m.role === 'user').slice(-1)[0]?.content || '';
    const content = typeof lastUser === 'string' ? lastUser : '新しいチャット';
    return { title: content.slice(0, 20) || '新しいチャット' } as PredictTitleResponse;
  }
  const res = await genUApi.post<PredictTitleResponse>('predict/title', req);
  return res.data;
};