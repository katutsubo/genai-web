import { CRI_PREFIX_PATTERN, modelMetadata } from '@genai-web/common';
import type { Model } from 'genai-web';

// ===== 環境変数からの静的な初期値 ==========================================
const initialBedrockModelIds: string[] = (() => {
  try {
    return (JSON.parse(import.meta.env.VITE_APP_MODEL_IDS) as string[])
      .map((n: string) => n.trim())
      .filter((n: string) => n);
  } catch {
    return [];
  }
})();

const endpointNames: string[] = (() => {
  try {
    return (JSON.parse(import.meta.env.VITE_APP_ENDPOINT_NAMES) as string[])
      .map((n: string) => n.trim())
      .filter((n: string) => n);
  } catch {
    return [];
  }
})();

const imageGenModelIds: string[] = (() => {
  try {
    return (JSON.parse(import.meta.env.VITE_APP_IMAGE_MODEL_IDS) as string[])
      .map((n: string) => n.trim())
      .filter((n: string) => n);
  } catch {
    return [];
  }
})();

// ===== 動的に書き換える領域 ================================================
// MODELS.modelIds は参照を保ったまま中身を入れ替える方針 (push/splice)
const dynamicModelIds: string[] = [...initialBedrockModelIds, ...endpointNames];
const dynamicTextModels: Model[] = [
  ...initialBedrockModelIds.map((name) => ({ modelId: name, type: 'bedrock' }) as Model),
  ...endpointNames.map((name) => ({ modelId: name, type: 'sagemaker' }) as Model),
];

// ローカル LLM (LM Studio 等) 表示名の上書き用
const localDisplayNames: Record<string, string> = {};

let duplicateBaseModelIds = new Set<string>();
const recomputeDuplicates = () => {
  duplicateBaseModelIds = new Set(
    dynamicModelIds
      .map((m) => m.replace(CRI_PREFIX_PATTERN, ''))
      .filter((item, idx, arr) => arr.indexOf(item) !== idx),
  );
};
recomputeDuplicates();

/**
 * MODELS.modelIds をランタイムで上書きする。
 * VITE_APP_COGNITO_ENDPOINT (= ローカル開発) が設定されている時に main.tsx から呼ばれる。
 *
 * @param ids LiteLLM の /v1/models で返ってきた id 配列
 * @param displayNames id → 表示名 のマップ (オプション)
 */
export const setDynamicModelIds = (
  ids: string[],
  displayNames?: Record<string, string>,
) => {
  // dynamicModelIds の中身を入れ替え
  dynamicModelIds.splice(0, dynamicModelIds.length, ...ids);
  // dynamicTextModels も同期
  dynamicTextModels.splice(
    0,
    dynamicTextModels.length,
    ...ids.map((name) => ({ modelId: name, type: 'bedrock' }) as Model),
  );
  // 表示名
  if (displayNames) {
    for (const [k, v] of Object.entries(displayNames)) {
      localDisplayNames[k] = v;
    }
  }
  recomputeDuplicates();
};

// ===== 既存 API ===========================================================
const imageGenModels = [
  ...imageGenModelIds.map((name) => ({ modelId: name, type: 'bedrock' }) as Model),
];

export const findModelByModelId = (modelId: string) => {
  const model = dynamicTextModels.find((m) => m.modelId === modelId);
  if (!model) return undefined;
  return { ...model };
};

export const findModelDisplayNameByModelId = (modelId: string): string => {
  if (localDisplayNames[modelId]) return localDisplayNames[modelId];
  let displayName = modelMetadata[modelId]?.displayName ?? modelId;
  if (duplicateBaseModelIds.has(modelId.replace(CRI_PREFIX_PATTERN, ''))) {
    const matched = modelId.match(CRI_PREFIX_PATTERN);
    if (matched) {
      displayName += ` (${matched[1].toUpperCase()})`;
    }
  }
  return displayName;
};

export const MODELS = {
  // ↓ getter にして、いつ参照されても最新を返す
  get modelIds() {
    return dynamicModelIds;
  },
  modelMetadata,
  imageGenModelIds,
  imageGenModels,
};