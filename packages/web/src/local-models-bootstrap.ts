// ローカル開発時 (VITE_APP_COGNITO_ENDPOINT 設定時) に、
// LiteLLM (= LM Studio バックエンド) の /v1/models を呼び出して
// MODELS.modelIds を動的に上書きする。
//
// main.tsx の最上段で `await bootstrapLocalModels()` する。
import { setDynamicModelIds } from '@/models';

const FORCE_KEEP_IDS = [
  // genai-web の defaultModel 等のフォールバックとして残しておきたい ID
  // (LiteLLM の config.yaml で同名の model_name が定義されているのが前提)
  'anthropic.claude-3-5-sonnet-20240620-v1:0',
];

const guessDisplayName = (id: string): string => {
  // 表示名を少し読みやすく
  if (id === 'anthropic.claude-3-5-sonnet-20240620-v1:0') return 'Local (Claude 互換)';
  if (id.includes('embed')) return `Embedding: ${id}`;
  return `Local: ${id}`;
};

export const bootstrapLocalModels = async (): Promise<void> => {
  // 本番では何もしない
  if (!import.meta.env.VITE_APP_COGNITO_ENDPOINT) return;

  const endpoint = import.meta.env.VITE_APP_API_ENDPOINT as string;
  if (!endpoint) return;

  try {
    const res = await fetch(`${endpoint.replace(/\/$/, '')}/v1/models`, {
      headers: {
        Authorization: 'Bearer sk-localdummy',
      },
    });
    if (!res.ok) {
      console.warn('[local-models-bootstrap] /v1/models returned', res.status);
      return;
    }
    const json: { data: { id: string }[] } = await res.json();

    const allIds = (json.data || []).map((m) => m.id);

    // embedding 系はチャット用プルダウンから除外
    const chatIds = allIds.filter(
      (id) =>
        !/embed|embedding|bge|e5/i.test(id) &&
        !/whisper|tts/i.test(id),
    );

    // 必ず残したい ID を先頭に
    const ordered: string[] = [];
    for (const id of FORCE_KEEP_IDS) {
      if (allIds.includes(id) && !ordered.includes(id)) ordered.push(id);
    }
    for (const id of chatIds) {
      if (!ordered.includes(id)) ordered.push(id);
    }

    const displayNames: Record<string, string> = {};
    for (const id of ordered) displayNames[id] = guessDisplayName(id);

    setDynamicModelIds(ordered, displayNames);

    console.log(
      '[local-models-bootstrap] modelIds updated:',
      ordered,
    );
  } catch (e) {
    console.warn('[local-models-bootstrap] failed to fetch /v1/models:', e);
  }
};