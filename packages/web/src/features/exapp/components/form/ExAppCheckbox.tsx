import { FieldValues, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { Checkbox } from '@/components/ui/dads/Checkbox';
import { ErrorText } from '@/components/ui/dads/ErrorText';
import { Legend } from '@/components/ui/dads/Legend';
import { RequirementBadge } from '@/components/ui/dads/RequirementBadge';
import { SupportText } from '@/components/ui/dads/SupportText';
import { GovAIFormUICheckbox } from '../../types';

type Props = {
  id: string;
  classNames?: string;
  errors?: string;
  uiConfig: GovAIFormUICheckbox;
  register: UseFormRegister<FieldValues>;
  setValue?: UseFormSetValue<FieldValues>;
  watch?: UseFormWatch<FieldValues>;
};

export const ExAppCheckbox = (props: Props) => {
  const { id, classNames, errors, uiConfig, register, setValue, watch } = props;
  const fieldValue = watch?.(id);
  const selectedValues = Array.isArray(fieldValue)
    ? fieldValue.map(String)
    : fieldValue === undefined || fieldValue === ''
      ? []
      : [String(fieldValue)];

  const checkboxProps = {
    isError: !!errors,
    'aria-describedby':
      [uiConfig.desc && `${id}-support-text`, errors && `${id}-error-text`]
        .filter(Boolean)
        .join(' ') || undefined,
    ...register(id, { required: uiConfig.required ?? false }),
  };

  const renderChild = (item: { title: string; value: string }) => (
    <Checkbox key={`${id}-${item.value}`} value={item.value} {...checkboxProps}>
      {item.title}
    </Checkbox>
  );

  return (
    <fieldset className={`${classNames ?? ''}`}>
      <Legend>
        {uiConfig.title} {uiConfig.required ? <RequirementBadge>※必須</RequirementBadge> : null}
      </Legend>
      {uiConfig.desc && (
        <SupportText id={`${id}-support-text`} className='my-1.5 whitespace-pre-wrap'>
          {uiConfig.desc}
        </SupportText>
      )}
      <div className='flex flex-col'>
        {uiConfig.groups?.map((group) => {
          const childValues = group.items.map((item) => item.value);
          const allSelected = childValues.length > 0 && childValues.every((value) => selectedValues.includes(value));
          return (
            <div key={`${id}-${group.title}`} className='mt-2 first:mt-0'>
              <Checkbox
                checked={allSelected}
                isError={!!errors}
                onChange={(event) => {
                  if (!setValue) return;
                  const nextValues = event.target.checked
                    ? Array.from(new Set([...selectedValues, ...childValues]))
                    : selectedValues.filter((value) => !childValues.includes(value));
                  setValue(id, nextValues, { shouldDirty: true, shouldValidate: true });
                }}
              >
                {group.title}
              </Checkbox>
              <div className='ml-7 flex flex-col border-l border-solid-gray-300 pl-3'>
                {group.items.map(renderChild)}
              </div>
            </div>
          );
        })}
        {uiConfig.items?.map(renderChild)}
      </div>
      {errors && (
        <ErrorText className='mt-2' id={`${id}-error-text`}>
          ＊{errors}
        </ErrorText>
      )}
    </fieldset>
  );
};
