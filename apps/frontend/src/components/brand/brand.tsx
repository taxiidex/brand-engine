'use client';

import React, { FC, useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { FormProvider, useForm } from 'react-hook-form';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { Select } from '@gitroom/react/form/select';
import { Textarea } from '@gitroom/react/form/textarea';
import { ColorPicker } from '@gitroom/react/form/color.picker';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const TONES = [
  'professional',
  'friendly',
  'bold',
  'playful',
  'luxury',
  'technical',
  'inspirational',
  'authoritative',
];

const DEFAULTS = {
  businessName: '',
  websiteUrl: '',
  niche: '',
  description: '',
  tone: 'friendly',
  language: 'en',
  topics: '',
  keywords: '',
  hashtags: '',
  primaryColor: '#000000',
  accentColor: '#FF5733',
  fontFamily: 'Inter',
  logoUrl: '',
  ctaText: '',
  ctaUrl: '',
};

const toList = (text: string) =>
  text
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);

const useBrand = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/brand')).json();
  }, []);
  return useSWR('brand', load);
};

const errorMessage = async (res: Response, fallback: string) => {
  const body = await res.json().catch(() => ({}));
  return Array.isArray(body?.message)
    ? body.message.join(', ')
    : body?.message || fallback;
};

export const BrandSettings: FC = () => {
  const fetch = useFetch();
  const t = useT();
  const toaster = useToaster();
  const { data, mutate } = useBrand();
  const form = useForm({ defaultValues: DEFAULTS });
  const [website, setWebsite] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!data) {
      return;
    }
    form.reset({
      businessName: data.businessName || '',
      websiteUrl: data.websiteUrl || '',
      niche: data.niche || '',
      description: data.description || '',
      tone: data.tone || 'friendly',
      language: data.language || 'en',
      topics: (data.targetTopics || []).join('\n'),
      keywords: (data.keywords || []).join('\n'),
      hashtags: (data.hashtags || []).join(', '),
      primaryColor: data.primaryColor || DEFAULTS.primaryColor,
      accentColor: data.accentColor || DEFAULTS.accentColor,
      fontFamily: data.fontFamily || DEFAULTS.fontFamily,
      logoUrl: data.logoUrl || '',
      ctaText: data.ctaText || '',
      ctaUrl: data.ctaUrl || '',
    });
    setWebsite(data.websiteUrl || '');
  }, [data]);

  const analyze = useCallback(async () => {
    if (!website.trim()) {
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch('/brand/analyze', {
        method: 'POST',
        body: JSON.stringify({ url: website }),
      });
      if (!res.ok) {
        toaster.show(
          await errorMessage(
            res,
            t('brand_analyze_failed', 'We could not read that website')
          ),
          'warning'
        );
        return;
      }
      const draft = await res.json();
      const set = (name: keyof typeof DEFAULTS, value?: string) => {
        if (value) {
          form.setValue(name, value, { shouldDirty: true });
        }
      };
      set('businessName', draft.businessName);
      set('websiteUrl', draft.websiteUrl);
      set('niche', draft.niche);
      set('description', draft.description);
      set('tone', draft.tone);
      set('language', draft.language);
      set('topics', (draft.targetTopics || []).join('\n'));
      set('keywords', (draft.keywords || []).join('\n'));
      set('hashtags', (draft.hashtags || []).join(', '));
      set('primaryColor', draft.primaryColor);
      set('accentColor', draft.accentColor);
      set('fontFamily', draft.fontFamily);
      set('logoUrl', draft.logoUrl);
      set('ctaText', draft.ctaText);
      set('ctaUrl', draft.ctaUrl);
      if (draft.aiGenerated) {
        toaster.show(
          t(
            'brand_analyzed',
            'Brand details filled in from your website. Review them, then save.'
          ),
          'success'
        );
      } else {
        toaster.show(
          t(
            'brand_analyzed_without_ai',
            'We read your colours, font and logo, but the AI summary is unavailable. Fill in the rest by hand.'
          ),
          'warning'
        );
      }
    } finally {
      setAnalyzing(false);
    }
  }, [website, form, t]);

  const save = useCallback(
    async (values: typeof DEFAULTS) => {
      const res = await fetch('/brand', {
        method: 'POST',
        body: JSON.stringify({
          businessName: values.businessName,
          websiteUrl: values.websiteUrl || undefined,
          niche: values.niche,
          description: values.description || undefined,
          tone: values.tone,
          language: values.language,
          targetTopics: toList(values.topics),
          keywords: toList(values.keywords),
          hashtags: toList(values.hashtags).map((h) =>
            h.replace(/^#/, '').replace(/\s+/g, '')
          ),
          primaryColor: values.primaryColor,
          accentColor: values.accentColor,
          fontFamily: values.fontFamily,
          logoUrl: values.logoUrl || undefined,
          ctaText: values.ctaText || undefined,
          ctaUrl: values.ctaUrl || undefined,
        }),
      });
      if (!res.ok) {
        toaster.show(
          await errorMessage(
            res,
            t('brand_save_failed', 'We could not save your brand')
          ),
          'warning'
        );
        return;
      }
      await mutate();
      toaster.show(t('brand_saved', 'Brand saved'), 'success');
    },
    [mutate, t]
  );

  const primary = form.watch('primaryColor');
  const accent = form.watch('accentColor');
  const font = form.watch('fontFamily');
  const name = form.watch('businessName');
  const logo = form.watch('logoUrl');
  const cta = form.watch('ctaText');

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">{t('brand', 'Brand')}</h3>
      <div className="text-customColor18 mt-[4px]">
        {t(
          'brand_description',
          'Tell us who you are once. Every post we create for you will use this name, tone, topics, colours and font.'
        )}
      </div>

      <div className="my-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[12px]">
        <div className="text-[14px]">
          {t('brand_fill_from_website', 'Fill in from your website')}
        </div>
        <div className="flex gap-[12px] items-center">
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://yourbusiness.com"
            className="bg-input h-[42px] px-[16px] outline-none border-fifth border rounded-[4px] text-inputText placeholder-inputText flex-1"
          />
          <Button onClick={analyze} loading={analyzing} disabled={analyzing}>
            {t('brand_read_website', 'Read my website')}
          </Button>
        </div>
      </div>

      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(save)}>
          <div className="bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[4px]">
            <Input
              label="Business name"
              translationKey="label_brand_business_name"
              {...form.register('businessName', { required: true })}
            />
            <Input
              label="Website"
              translationKey="label_brand_website"
              {...form.register('websiteUrl')}
            />
            <Input
              label="What you do (niche)"
              translationKey="label_brand_niche"
              placeholder="e.g. airport taxi service in Dublin"
              {...form.register('niche', { required: true })}
            />
            <Textarea
              label="Short description"
              translationKey="label_brand_description"
              {...form.register('description')}
            />
            <Select
              label="Tone of voice"
              translationKey="label_brand_tone"
              {...form.register('tone')}
            >
              {TONES.map((tone) => (
                <option key={tone} value={tone}>
                  {tone}
                </option>
              ))}
            </Select>
            <Input
              label="Language code"
              translationKey="label_brand_language"
              placeholder="en"
              {...form.register('language')}
            />
            <Textarea
              label="Topics to post about (one per line)"
              translationKey="label_brand_topics"
              {...form.register('topics')}
            />
            <Textarea
              label="SEO keywords (one per line)"
              translationKey="label_brand_keywords"
              {...form.register('keywords')}
            />
            <Input
              label="Hashtags (comma separated)"
              translationKey="label_brand_hashtags"
              {...form.register('hashtags')}
            />
            <div className="grid grid-cols-2 gap-[24px] mobile:grid-cols-1">
              <ColorPicker
                name="primaryColor"
                label="Main colour"
                translationKey="label_brand_primary_color"
                enabled={true}
                canBeCancelled={false}
              />
              <ColorPicker
                name="accentColor"
                label="Accent colour"
                translationKey="label_brand_accent_color"
                enabled={true}
                canBeCancelled={false}
              />
            </div>
            <Input
              label="Font"
              translationKey="label_brand_font"
              {...form.register('fontFamily')}
            />
            <Input
              label="Logo address"
              translationKey="label_brand_logo"
              placeholder="https://yourbusiness.com/logo.png"
              {...form.register('logoUrl')}
            />
            <div className="grid grid-cols-2 gap-[24px] mobile:grid-cols-1">
              <Input
                label="Call to action"
                translationKey="label_brand_cta_text"
                placeholder="Book now"
                {...form.register('ctaText')}
              />
              <Input
                label="Call to action link"
                translationKey="label_brand_cta_url"
                {...form.register('ctaUrl')}
              />
            </div>

            <div className="text-[14px] mt-[8px]">
              {t('brand_preview', 'Preview')}
            </div>
            <div
              className="rounded-[8px] p-[24px] flex flex-col gap-[12px] w-[320px] max-w-full"
              style={{
                background: primary,
                color: '#FFFFFF',
                fontFamily: `${font}, sans-serif`,
              }}
            >
              {!!logo && (
                <img
                  src={logo}
                  alt=""
                  className="h-[32px] w-auto self-start object-contain"
                />
              )}
              <div className="text-[22px] font-bold leading-[1.2]">
                {name || t('brand_preview_name', 'Your business')}
              </div>
              <div className="text-[14px] opacity-90">
                {t(
                  'brand_preview_hook',
                  'This is how your branded posts will look.'
                )}
              </div>
              <div
                className="h-[6px] w-[80px] rounded-[3px]"
                style={{ background: accent }}
              />
              {!!cta && (
                <div
                  className="self-start rounded-[4px] px-[12px] py-[6px] text-[13px] font-bold"
                  style={{ background: accent, color: '#FFFFFF' }}
                >
                  {cta}
                </div>
              )}
            </div>

            <div className="mt-[16px]">
              <Button
                type="submit"
                loading={form.formState.isSubmitting}
                disabled={form.formState.isSubmitting}
              >
                {t('save_brand', 'Save brand')}
              </Button>
            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
};
