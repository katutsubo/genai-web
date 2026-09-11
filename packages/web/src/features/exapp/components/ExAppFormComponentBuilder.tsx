import {
  FieldErrors,
  FieldValues,
  UseFormClearErrors,
  UseFormRegister,
  UseFormSetValue,
  UseFormTrigger,
  UseFormWatch,
} from 'react-hook-form';
import { GovAIFormUIJson } from '../types';
import { isFieldVisible } from '../utils/fieldVisibility';
import { formatValidationErrorMessage } from '../utils/formatValidationErrorMessage';
import {
  isCheckboxType,
  isFileType,
  isHiddenType,
  isNumberType,
  isRadioType,
  isSelectType,
  isTextareaType,
  isTextType,
} from '../utils/typeGuards';
import { ExAppCheckbox } from './form/ExAppCheckbox';
import { ExAppHidden } from './form/ExAppHidden';
import { ExAppInputFile } from './form/ExAppInputFile';
import { ExAppNumberTextInput } from './form/ExAppNumberTextInput';
import { ExAppRadio } from './form/ExAppRadio';
import { ExAppSelect } from './form/ExAppSelect';
import { ExAppTextarea } from './form/ExAppTextarea';
import { ExAppTextInput } from './form/ExAppTextInput';

type Props = {
  uiJson: GovAIFormUIJson;
  register: UseFormRegister<FieldValues>;
  /** useFileUpload の状態を RHF に同期するために使用（ExAppInputFileのみ必須） */
  setValue?: UseFormSetValue<FieldValues>;
  /** ファイル追加/削除時の即時バリデーション用（ExAppInputFileのみ必須） */
  trigger?: UseFormTrigger<FieldValues>;
  /** ファイル削除時のエラークリア用（ExAppInputFileのみ必須） */
  clearErrors?: UseFormClearErrors<FieldValues>;
  errors: FieldErrors<FieldValues>;
  /** バリデーションエラー時のフォーカス制御用（ExAppInputFileのみ使用） */
  submitCount?: number;
  /** visible_when 条件の評価に使う、他フィールドの現在値（未指定なら全フィールド表示） */
  visibilityContext?: Record<string, unknown>;
  /** 親子チェックボックスの選択状態を追跡するために使用 */
  watch?: UseFormWatch<FieldValues>;
};

export const ExAppFormComponentBuilder = (props: Props) => {
  const {
    uiJson,
    register,
    setValue,
    trigger,
    clearErrors,
    errors,
    submitCount,
    visibilityContext,
    watch,
  } = props;

  return (
    <>
      {Object.keys(uiJson).map((key) => {
        // keyが会話履歴用の場合はフォーム表示なし
        if (key === 'conversation_history') {
          return null;
        }

        const uiConfig = uiJson[key];

        // visible_when 条件を満たさないフィールドは描画しない
        if (visibilityContext && !isFieldVisible(uiConfig, visibilityContext)) {
          return null;
        }
        if (isTextType(uiConfig)) {
          return (
            <ExAppTextInput
              key={key}
              id={key}
              errors={errors[key] ? formatValidationErrorMessage(key, uiConfig, errors) : ''}
              uiConfig={uiConfig}
              register={register}
            />
          );
        } else if (isNumberType(uiConfig)) {
          return (
            <ExAppNumberTextInput
              key={key}
              id={key}
              errors={errors[key] ? formatValidationErrorMessage(key, uiConfig, errors) : ''}
              uiConfig={uiConfig}
              register={register}
            />
          );
        } else if (isTextareaType(uiConfig)) {
          return (
            <ExAppTextarea
              key={key}
              id={key}
              errors={errors[key] ? formatValidationErrorMessage(key, uiConfig, errors) : ''}
              uiConfig={uiConfig}
              register={register}
            />
          );
        } else if (isFileType(uiConfig)) {
          if (!setValue || !trigger || !clearErrors) {
            return (
              <p key={key} className='my-8 text-error-1'>
                ファイルコンポーネントには setValue, trigger, clearErrors が必要です。
              </p>
            );
          }
          return (
            <ExAppInputFile
              key={key}
              id={key}
              errors={errors[key] ? formatValidationErrorMessage(key, uiConfig, errors) : ''}
              uiConfig={uiConfig}
              register={register}
              setValue={setValue}
              trigger={trigger}
              clearErrors={clearErrors}
              submitCount={submitCount}
            />
          );
        } else if (isSelectType(uiConfig)) {
          return (
            <ExAppSelect
              key={key}
              id={key}
              errors={errors[key] ? formatValidationErrorMessage(key, uiConfig, errors) : ''}
              uiConfig={uiConfig}
              register={register}
            />
          );
        } else if (isCheckboxType(uiConfig)) {
          return (
            <ExAppCheckbox
              key={key}
              id={key}
              errors={errors[key] ? formatValidationErrorMessage(key, uiConfig, errors) : ''}
              uiConfig={uiConfig}
              register={register}
              setValue={setValue}
              watch={watch}
            />
          );
        } else if (isRadioType(uiConfig)) {
          return (
            <ExAppRadio
              key={key}
              id={key}
              errors={errors[key] ? formatValidationErrorMessage(key, uiConfig, errors) : ''}
              uiConfig={uiConfig}
              register={register}
            />
          );
        } else if (isHiddenType(uiConfig)) {
          return <ExAppHidden key={key} id={key} register={register} />;
        } else {
          return (
            <p key={key} className='my-8 text-error-1'>
              サポート外のコンポーネントです。
            </p>
          );
        }
      })}
    </>
  );
};
