'use client';

import React, { FC, useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  Card,
  ChoiceChips,
  Field,
  TagInput,
  errorMessage,
  inputClass,
  textareaClass,
} from '@gitroom/frontend/components/brand/ui';
import { TopicsManager } from '@gitroom/frontend/components/brand/topics';

export interface Brand {
  id?: string;
  businessName: string;
  websiteUrl: string;
  niche: string;
  description: string;
  tone: string;
  language: string;
  targetTopics: string[];
  keywords: string[];
  hashtags: string[];
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  logoUrl: string;
  ctaText: string;
  ctaUrl: string;
  proofPoints: string[];
  audience: string;
}

const EMPTY: Brand = {
  businessName: '',
  websiteUrl: '',
  niche: '',
  description: '',
  tone: 'friendly',
  language: 'en',
  targetTopics: [],
  keywords: [],
  hashtags: [],
  primaryColor: '#111111',
  accentColor: '#FF5733',
  fontFamily: 'Inter',
  logoUrl: '',
  ctaText: '',
  ctaUrl: '',
  proofPoints: [],
  audience: '',
};

const TONES = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'bold', label: 'Bold' },
  { value: 'playful', label: 'Playful' },
  { value: 'luxury', label: 'Luxury' },
  { value: 'inspirational', label: 'Inspiring' },
  { value: 'authoritative', label: 'Expert' },
  { value: 'technical', label: 'Technical' },
];

const LANGUAGES = [
  ['en', 'English'],
  ['ar', 'Arabic'],
  ['ur', 'Urdu'],
  ['hi', 'Hindi'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['pt', 'Portuguese'],
  ['it', 'Italian'],
  ['nl', 'Dutch'],
  ['tr', 'Turkish'],
  ['id', 'Indonesian'],
  ['sw', 'Swahili'],
];

// fonts the image renderer has installed; anything else falls back to Inter
const FONTS = [
  'Inter',
  'Noto Sans',
  'Noto Serif',
  'DejaVu Sans',
  'DejaVu Serif',
];

// white or near-black, whichever reads better on the given colour
export const readableOn = (hex: string) => {
  const n = parseInt((hex || '#000000').slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminance =
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255);
  return luminance > 0.4 ? '#111111' : '#FFFFFF';
};

export const useBrand = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    // no brand yet comes back as an empty body, which is not valid JSON
    const text = await (await fetch('/brand')).text();
    return text ? (JSON.parse(text) as Brand) : null;
  }, []);
  return useSWR('brand', load, { revalidateOnFocus: false });
};

const fromSaved = (b: Partial<Brand> | null | undefined): Brand => ({
  ...EMPTY,
  ...(Object.fromEntries(
    Object.entries(b || {}).filter(([, v]) => v !== null && v !== undefined)
  ) as Partial<Brand>),
});

export const BrandForm: FC<{
  // read this website as soon as the form opens (first-time setup)
  autoAnalyzeUrl?: string;
  saveLabel?: string;
  onSaved?: () => void;
}> = ({ autoAnalyzeUrl, saveLabel = 'Save', onSaved }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, mutate, isLoading } = useBrand();
  const [brand, setBrand] = useState<Brand>(EMPTY);
  const [website, setWebsite] = useState(autoAnalyzeUrl || '');
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);
  // proof points the website suggested, not added yet
  const [suggested, setSuggested] = useState<string[]>([]);
  const autoRan = useRef(false);

  const set = <K extends keyof Brand>(key: K, value: Brand[K]) =>
    setBrand((b) => ({ ...b, [key]: value }));

  useEffect(() => {
    if (data) {
      setBrand(fromSaved(data));
      setWebsite((w) => w || data.websiteUrl || '');
    }
  }, [data]);

  const readWebsite = useCallback(
    async (url: string) => {
      if (!url.trim()) {
        return;
      }
      setReading(true);
      try {
        const res = await fetch('/brand/analyze', {
          method: 'POST',
          body: JSON.stringify({ url }),
        });
        if (!res.ok) {
          toaster.show(
            await errorMessage(res, 'We could not read that website.'),
            'warning'
          );
          return;
        }
        const draft = await res.json();
        setBrand((b) => ({
          ...b,
          ...(Object.fromEntries(
            Object.entries(draft).filter(
              ([k, v]) =>
                k in EMPTY &&
                v !== null &&
                v !== undefined &&
                v !== '' &&
                !(Array.isArray(v) && !v.length)
            )
          ) as Partial<Brand>),
        }));
        toaster.show(
          draft.aiGenerated
            ? 'We filled this in from your website. Check it and change anything you like.'
            : 'We picked up your colours and logo. Please fill in the rest.',
          draft.aiGenerated ? 'success' : 'warning'
        );
      } finally {
        setReading(false);
      }
    },
    [toaster]
  );

  // first-time setup: read the website straight away, but never over a brand
  // that was already saved
  useEffect(() => {
    if (autoAnalyzeUrl && !autoRan.current && !isLoading && !data) {
      autoRan.current = true;
      readWebsite(autoAnalyzeUrl);
    }
  }, [autoAnalyzeUrl, isLoading, data, readWebsite]);

  const save = useCallback(async () => {
    if (!brand.businessName.trim() || !brand.niche.trim()) {
      toaster.show(
        'Please fill in your business name and what you do.',
        'warning'
      );
      return;
    }
    setSaving(true);
    try {
      const { id, ...rest } = brand;
      const res = await fetch('/brand', {
        method: 'POST',
        body: JSON.stringify({
          ...rest,
          websiteUrl: rest.websiteUrl || undefined,
          description: rest.description || undefined,
          logoUrl: rest.logoUrl || undefined,
          ctaText: rest.ctaText || undefined,
          ctaUrl: rest.ctaUrl || undefined,
          audience: rest.audience || undefined,
        }),
      });
      if (!res.ok) {
        toaster.show(
          await errorMessage(res, 'We could not save your brand.'),
          'warning'
        );
        return;
      }
      await mutate();
      toaster.show('Your brand is saved.', 'success');
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }, [brand, mutate, onSaved, toaster]);

  return (
    <div
      className="flex flex-col gap-[16px]"
      // no implicit form submission: Enter in a text box does nothing
      onKeyDown={(e) => {
        if (
          e.key === 'Enter' &&
          (e.target as HTMLElement).tagName === 'INPUT'
        ) {
          e.preventDefault();
        }
      }}
    >
      <Card
        title="Start from your website"
        hint="We read your website and fill in everything below for you. You can change anything afterwards."
      >
        <div className="flex gap-[12px] mobile:flex-col">
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="yourbusiness.com"
            className={inputClass}
          />
          <Button
            onClick={() => readWebsite(website)}
            loading={reading}
            disabled={reading || !website.trim()}
            className="rounded-[8px] !h-[44px] whitespace-nowrap"
          >
            Read my website
          </Button>
        </div>
        {reading && (
          <div className="text-[14px] text-textItemBlur">
            Reading your website and getting to know your business. This takes
            about 10 seconds...
          </div>
        )}
      </Card>

      <Card title="About your business">
        <div className="grid grid-cols-2 gap-[16px] mobile:grid-cols-1">
          <Field label="Business name">
            <input
              value={brand.businessName}
              onChange={(e) => set('businessName', e.target.value)}
              placeholder="e.g. Sunrise Bakery"
              className={inputClass}
            />
          </Field>
          <Field label="What you do" hint="A few words, like a tagline.">
            <input
              value={brand.niche}
              onChange={(e) => set('niche', e.target.value)}
              placeholder="e.g. Fresh bread and cakes in Leeds"
              className={inputClass}
            />
          </Field>
        </div>
        <Field
          label="Describe your business"
          hint="One or two sentences: what you offer and who it is for."
        >
          <textarea
            value={brand.description}
            onChange={(e) => set('description', e.target.value)}
            className={textareaClass}
          />
        </Field>
        <Field
          label="Who your posts speak to"
          hint="Your customers, in a few words."
        >
          <input
            value={brand.audience}
            onChange={(e) => set('audience', e.target.value)}
            placeholder="e.g. busy parents who want good bread without the queue"
            maxLength={300}
            className={inputClass}
          />
        </Field>
        <Field label="Website">
          <input
            value={brand.websiteUrl}
            onChange={(e) => set('websiteUrl', e.target.value)}
            placeholder="https://yourbusiness.com"
            className={inputClass}
          />
        </Field>
      </Card>

      <Card
        title="How you sound"
        hint="Your posts are written in this voice and language."
      >
        <ChoiceChips
          options={TONES}
          value={brand.tone}
          onChange={(v) => set('tone', v)}
        />
        <Field label="Language of your posts">
          <select
            value={brand.language}
            onChange={(e) => set('language', e.target.value)}
            className={inputClass}
          >
            {!LANGUAGES.some(([code]) => code === brand.language) && (
              <option value={brand.language}>{brand.language}</option>
            )}
            {LANGUAGES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      <Card
        title={data ? 'Main themes' : 'What you post about'}
        hint={
          data
            ? 'A few broad themes your customers care about. The specific ideas for each post are under Post ideas below.'
            : 'Topics your customers care about. Each new post picks one of these unless you choose your own.'
        }
      >
        <TagInput
          values={brand.targetTopics}
          onChange={(v) => set('targetTopics', v)}
          placeholder="Type a topic and press Enter"
          max={20}
        />
      </Card>

      <Card
        title="Proof you can stand behind"
        hint="Facts your posts may use: years in business, number of customers, awards, review scores. We never make these up, so a post can only use what is here or on your website."
      >
        <TagInput
          values={brand.proofPoints}
          onChange={(v) => set('proofPoints', v)}
          placeholder="e.g. Baking since 1998, and press Enter"
          max={12}
        />
        {!!suggested.length && (
          <div className="flex flex-col gap-[6px]">
            <div className="text-[13px] text-textItemBlur">
              Found on your website. Add the ones that are true:
            </div>
            <div className="flex flex-wrap gap-[6px]">
              {suggested.map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => {
                    if (brand.proofPoints.length < 12) {
                      set('proofPoints', [...brand.proofPoints, p]);
                    }
                    setSuggested((list) => list.filter((x) => x !== p));
                  }}
                  className="text-start text-[13px] px-[10px] py-[6px] rounded-[8px] border border-dashed border-newTableBorder hover:border-forth"
                >
                  + {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {!!data && (
        <TopicsManager
          hasWebsite={!!data.websiteUrl}
          onSuggestedProof={(points) =>
            setSuggested(
              points.filter(
                (p) =>
                  !brand.proofPoints.some((x) => x.toLowerCase() === p.toLowerCase())
              )
            )
          }
        />
      )}

      <Card title="Your look" hint="Used on every image we make for you.">
        <div className="grid grid-cols-[auto,1fr] gap-[20px] items-start mobile:grid-cols-1">
          <div className="w-[96px] h-[96px] rounded-[12px] bg-white flex items-center justify-center overflow-hidden border border-newTableBorder">
            {brand.logoUrl ? (
              <img
                src={brand.logoUrl}
                alt="Your logo"
                className="max-w-[80px] max-h-[80px] object-contain"
              />
            ) : (
              <span className="text-[12px] text-[#888]">No logo</span>
            )}
          </div>
          <Field
            label="Logo address"
            hint="A link to your logo as PNG or JPG. Reading your website usually finds it."
          >
            <input
              value={brand.logoUrl}
              onChange={(e) => set('logoUrl', e.target.value)}
              placeholder="https://yourbusiness.com/logo.png"
              className={inputClass}
            />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-[16px] mobile:grid-cols-1">
          <Field label="Main colour">
            <div className="flex gap-[8px] items-center">
              <input
                type="color"
                value={brand.primaryColor}
                onChange={(e) =>
                  set('primaryColor', e.target.value.toUpperCase())
                }
                className="w-[44px] h-[44px] shrink-0 rounded-[8px] border border-newTableBorder bg-transparent cursor-pointer"
              />
              <input
                value={brand.primaryColor}
                onChange={(e) => set('primaryColor', e.target.value)}
                className={inputClass}
              />
            </div>
          </Field>
          <Field label="Accent colour">
            <div className="flex gap-[8px] items-center">
              <input
                type="color"
                value={brand.accentColor}
                onChange={(e) =>
                  set('accentColor', e.target.value.toUpperCase())
                }
                className="w-[44px] h-[44px] shrink-0 rounded-[8px] border border-newTableBorder bg-transparent cursor-pointer"
              />
              <input
                value={brand.accentColor}
                onChange={(e) => set('accentColor', e.target.value)}
                className={inputClass}
              />
            </div>
          </Field>
          <Field label="Font">
            <select
              value={brand.fontFamily}
              onChange={(e) => set('fontFamily', e.target.value)}
              className={inputClass}
            >
              {!FONTS.includes(brand.fontFamily) && (
                <option value={brand.fontFamily}>
                  {brand.fontFamily} (images use Inter)
                </option>
              )}
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div
          className="rounded-[12px] p-[20px] flex flex-col gap-[10px] max-w-[360px]"
          style={{
            background: brand.primaryColor,
            color: readableOn(brand.primaryColor),
            fontFamily: `${brand.fontFamily}, Inter, sans-serif`,
          }}
        >
          <div className="text-[20px] font-[700] leading-[1.2]">
            {brand.businessName || 'Your business'}
          </div>
          <div className="text-[14px] opacity-90">
            This is how your brand looks on your posts.
          </div>
          <div
            className="h-[5px] w-[64px] rounded-[3px]"
            style={{ background: brand.accentColor }}
          />
        </div>
      </Card>

      <Card
        title="Call to action"
        hint="What you want people to do after reading a post."
      >
        <div className="grid grid-cols-2 gap-[16px] mobile:grid-cols-1">
          <Field label="Button text">
            <input
              value={brand.ctaText}
              onChange={(e) => set('ctaText', e.target.value)}
              placeholder="Book now"
              className={inputClass}
            />
          </Field>
          <Field label="Link">
            <input
              value={brand.ctaUrl}
              onChange={(e) => set('ctaUrl', e.target.value)}
              placeholder="https://yourbusiness.com/book"
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <div>
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          className="text-[14px] text-textItemBlur hover:text-textColor underline"
        >
          {more
            ? 'Hide more options'
            : 'More options: search keywords and hashtags'}
        </button>
      </div>
      {more && (
        <Card
          title="Search keywords and hashtags"
          hint="Words your customers search for. We work them into your posts naturally."
        >
          <Field label="Search keywords">
            <TagInput
              values={brand.keywords}
              onChange={(v) => set('keywords', v)}
              placeholder="Type a keyword and press Enter"
              max={40}
            />
          </Field>
          <Field label="Hashtags">
            <TagInput
              values={brand.hashtags}
              onChange={(v) =>
                set(
                  'hashtags',
                  v.map((h) => h.replace(/\s+/g, ''))
                )
              }
              placeholder="Type a hashtag and press Enter"
              max={20}
              prefix="#"
            />
          </Field>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          onClick={save}
          loading={saving}
          disabled={saving || reading}
          className="rounded-[8px] !h-[48px] px-[32px]"
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
};
