import { GovAIFormUIItem, GovAIFormUIJson } from '../types';

/**
 * 表示条件(`visible_when`)で参照されている「基準フィールド」のキー一覧を返す。
 * これらのフィールドの値を監視(watch)することで、値の変化に応じて表示/非表示を切り替える。
 */
export const collectControllingFields = (uiJson: GovAIFormUIJson): string[] => {
  const fields = new Set<string>();
  for (const key of Object.keys(uiJson)) {
    const visibleWhen = (uiJson[key] as { visible_when?: { field?: string } }).visible_when;
    if (visibleWhen?.field) {
      fields.add(visibleWhen.field);
    }
  }
  return Array.from(fields);
};

/**
 * `visible_when` 条件と現在のフォーム値から、フィールドを表示すべきか判定する。
 * `visible_when` が未指定の場合は常に表示する（既存挙動と互換）。
 */
export const isFieldVisible = (
  uiConfig: GovAIFormUIItem,
  context: Record<string, unknown>,
): boolean => {
  const visibleWhen = (
    uiConfig as { visible_when?: { field: string; equals?: string; in?: string[] } }
  ).visible_when;
  if (!visibleWhen) {
    return true;
  }

  const currentValue = context[visibleWhen.field];

  if (Array.isArray(visibleWhen.in)) {
    return visibleWhen.in.includes(currentValue as string);
  }

  if (visibleWhen.equals !== undefined) {
    return currentValue === visibleWhen.equals;
  }

  return true;
};
