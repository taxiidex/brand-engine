'use client';

import React, { FC, ReactNode, useState } from 'react';
import clsx from 'clsx';

// Small building blocks shared by the client screens (start, brand, channels,
// create post), so they all look and behave the same.

export const inputClass =
  'bg-newBgColorInner h-[44px] px-[14px] outline-none border-newTableBorder border rounded-[8px] text-textColor placeholder-textColor placeholder:opacity-50 w-full focus:border-forth';

export const textareaClass =
  'bg-newBgColorInner min-h-[110px] p-[14px] outline-none border-newTableBorder border rounded-[8px] text-textColor placeholder-textColor placeholder:opacity-50 w-full focus:border-forth resize-y';

export const Card: FC<{
  title?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}> = ({ title, hint, children, className }) => (
  <div
    className={clsx(
      'bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] mobile:p-[16px] flex flex-col gap-[16px]',
      className
    )}
  >
    {(!!title || !!hint) && (
      <div className="flex flex-col gap-[4px]">
        {!!title && <div className="text-[18px] font-[600]">{title}</div>}
        {!!hint && <div className="text-[14px] text-textItemBlur">{hint}</div>}
      </div>
    )}
    {children}
  </div>
);

export const Field: FC<{
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}> = ({ label, hint, children }) => (
  <label className="flex flex-col gap-[6px]">
    <span className="text-[14px] font-[500]">{label}</span>
    {children}
    {!!hint && <span className="text-[12px] text-textItemBlur">{hint}</span>}
  </label>
);

// one choice out of a few, shown as pills
export const ChoiceChips: FC<{
  options: { value: string; label: ReactNode }[];
  value: string;
  onChange: (value: string) => void;
}> = ({ options, value, onChange }) => (
  <div className="flex flex-wrap gap-[8px]">
    {options.map((o) => (
      <button
        type="button"
        key={o.value}
        onClick={() => onChange(o.value)}
        className={clsx(
          'px-[14px] h-[36px] rounded-full border text-[14px] transition-colors',
          value === o.value
            ? 'bg-forth border-forth text-white'
            : 'border-newTableBorder hover:border-forth'
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

// a list of short phrases: type and press Enter (or comma) to add
export const TagInput: FC<{
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  max?: number;
  prefix?: string;
}> = ({ values, onChange, placeholder, max = 20, prefix = '' }) => {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const items = raw
      .split(',')
      .map((v) => v.trim().replace(/^#/, ''))
      .filter(Boolean);
    const next = [...values];
    for (const item of items) {
      if (
        next.length < max &&
        !next.some((v) => v.toLowerCase() === item.toLowerCase())
      ) {
        next.push(item);
      }
    }
    onChange(next);
    setDraft('');
  };
  return (
    <div className="flex flex-col gap-[8px]">
      {!!values.length && (
        <div className="flex flex-wrap gap-[8px]">
          {values.map((v) => (
            <span
              key={v}
              className="flex items-center gap-[6px] ps-[12px] pe-[6px] h-[32px] rounded-full bg-boxHover text-[13px]"
            >
              {prefix}
              {v}
              <button
                type="button"
                aria-label={`Remove ${v}`}
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="w-[20px] h-[20px] rounded-full flex items-center justify-center hover:bg-newTableBorder"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {values.length < max && (
        <input
          value={draft}
          onChange={(e) => {
            if (e.target.value.endsWith(',')) {
              add(e.target.value);
            } else {
              setDraft(e.target.value);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
    </div>
  );
};

export const Steps: FC<{ steps: string[]; current: number }> = ({
  steps,
  current,
}) => (
  <div className="flex items-center gap-[8px] flex-wrap">
    {steps.map((label, i) => (
      <div key={label} className="flex items-center gap-[8px]">
        <div
          className={clsx(
            'w-[28px] h-[28px] rounded-full flex items-center justify-center text-[13px] font-[600]',
            i < current
              ? 'bg-forth text-white'
              : i === current
              ? 'border-2 border-forth text-forth'
              : 'border border-newTableBorder text-textItemBlur'
          )}
        >
          {i < current ? '✓' : i + 1}
        </div>
        <span
          className={clsx(
            'text-[14px] mobile:hidden',
            i === current ? 'font-[600]' : 'text-textItemBlur'
          )}
        >
          {label}
        </span>
        {i < steps.length - 1 && (
          <div className="w-[24px] h-[1px] bg-newTableBorder mobile:w-[12px]" />
        )}
      </div>
    ))}
  </div>
);

export const errorMessage = async (res: Response, fallback: string) => {
  const body = await res.json().catch(() => ({}));
  return Array.isArray(body?.message)
    ? body.message.join(', ')
    : body?.message || body?.msg || fallback;
};
