'use client';

import React, { FC, useCallback, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const field =
  'bg-input h-[42px] px-[16px] outline-none border-fifth border rounded-[4px] text-inputText placeholder-inputText w-full';

type Photo = {
  id: string;
  thumb: string;
  url: string;
  credit: { name: string; link: string };
};

const errorMessage = async (res: Response, fallback: string) => {
  const body = await res.json().catch(() => ({}));
  return Array.isArray(body?.message)
    ? body.message.join(', ')
    : body?.message || fallback;
};

export const BrandImageStudio: FC<{ niche: string }> = ({ niche }) => {
  const fetch = useFetch();
  const t = useT();
  const toaster = useToaster();

  const [hook, setHook] = useState('');
  const [subtext, setSubtext] = useState('');
  const [template, setTemplate] = useState('photo-hook');
  const [size, setSize] = useState('feed');
  const [query, setQuery] = useState(niche || '');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Photo | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState<'' | 'search' | 'preview' | 'save'>('');

  const findPhotos = useCallback(async () => {
    if (query.trim().length < 2) {
      return;
    }
    setBusy('search');
    try {
      const res = await fetch(
        `/brand/stock?query=${encodeURIComponent(query.trim())}&size=${size}`
      );
      if (!res.ok) {
        toaster.show(
          await errorMessage(
            res,
            t('brand_photo_search_failed', 'We could not search for photos')
          ),
          'warning'
        );
        return;
      }
      const data = await res.json();
      setConfigured(!!data.configured);
      setPhotos(data.photos || []);
      setSelected(null);
    } finally {
      setBusy('');
    }
  }, [query, size, t]);

  const generate = useCallback(
    async (save: boolean) => {
      if (!hook.trim()) {
        toaster.show(
          t('brand_hook_required', 'Write the headline for your image first'),
          'warning'
        );
        return;
      }
      setBusy(save ? 'save' : 'preview');
      try {
        const res = await fetch('/brand/image', {
          method: 'POST',
          body: JSON.stringify({
            hook,
            subtext: subtext.trim() || undefined,
            template,
            size,
            photoQuery: query.trim() || undefined,
            photoUrl: selected?.url,
            save,
          }),
        });
        if (!res.ok) {
          toaster.show(
            await errorMessage(
              res,
              t('brand_image_failed', 'We could not create the image')
            ),
            'warning'
          );
          return;
        }
        const data = await res.json();
        setPreview(data.preview);
        if (template === 'photo-hook' && data.template !== 'photo-hook') {
          toaster.show(
            t(
              'brand_image_no_photo',
              'No photo was available, so a brand card was made instead.'
            ),
            'warning'
          );
        } else if (save) {
          toaster.show(
            t(
              'brand_image_saved',
              'Image saved to your media library. You can attach it to any post.'
            ),
            'success'
          );
        }
      } finally {
        setBusy('');
      }
    },
    [hook, subtext, template, size, query, selected, t]
  );

  return (
    <div className="mt-[24px] flex flex-col">
      <h3 className="text-[20px]">{t('brand_images', 'Branded images')}</h3>
      <div className="text-customColor18 mt-[4px]">
        {t(
          'brand_images_description',
          'Turn a headline into an on-brand image using your colours, font and logo.'
        )}
      </div>

      <div className="my-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[16px]">
        <div className="flex flex-col gap-[6px]">
          <div className="text-[14px]">{t('brand_headline', 'Headline')}</div>
          <input
            value={hook}
            maxLength={220}
            onChange={(e) => setHook(e.target.value)}
            placeholder={t(
              'brand_headline_placeholder',
              'Never miss a flight again'
            )}
            className={field}
          />
        </div>
        <div className="flex flex-col gap-[6px]">
          <div className="text-[14px]">
            {t('brand_subtext', 'Supporting line (optional)')}
          </div>
          <input
            value={subtext}
            maxLength={200}
            onChange={(e) => setSubtext(e.target.value)}
            className={field}
          />
        </div>

        <div className="grid grid-cols-2 gap-[16px] mobile:grid-cols-1">
          <div className="flex flex-col gap-[6px]">
            <div className="text-[14px]">{t('brand_template', 'Style')}</div>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className={field}
            >
              <option value="photo-hook">
                {t('brand_template_photo', 'Photo with headline')}
              </option>
              <option value="quote-card">
                {t('brand_template_quote', 'Quote card')}
              </option>
              <option value="brand-card">
                {t('brand_template_card', 'Brand card')}
              </option>
            </select>
          </div>
          <div className="flex flex-col gap-[6px]">
            <div className="text-[14px]">{t('brand_size', 'Size')}</div>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className={field}
            >
              <option value="feed">
                {t('brand_size_feed', 'Feed post, 4:5')}
              </option>
              <option value="square">
                {t('brand_size_square', 'Square, 1:1')}
              </option>
              <option value="landscape">
                {t('brand_size_landscape', 'Landscape, for LinkedIn and X')}
              </option>
              <option value="story">
                {t('brand_size_story', 'Story or Reel cover, 9:16')}
              </option>
            </select>
          </div>
        </div>

        {template === 'photo-hook' && (
          <div className="flex flex-col gap-[8px]">
            <div className="text-[14px]">
              {t('brand_photo_search', 'Find a free photo')}
            </div>
            <div className="flex gap-[12px] items-center">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && findPhotos()}
                placeholder="airport taxi"
                className={field}
              />
              <Button
                onClick={findPhotos}
                loading={busy === 'search'}
                disabled={busy !== ''}
              >
                {t('brand_find_photos', 'Search')}
              </Button>
            </div>
            {configured === false && (
              <div className="text-[13px] text-customColor18">
                {t(
                  'brand_photos_not_configured',
                  'Stock photos are not switched on yet. Ask your administrator to add a Pexels key. You can still use the quote and brand cards.'
                )}
              </div>
            )}
            {configured && photos.length === 0 && (
              <div className="text-[13px] text-customColor18">
                {t('brand_no_photos', 'No photos found, try different words.')}
              </div>
            )}
            {photos.length > 0 && (
              <>
                <div className="grid grid-cols-4 gap-[8px] mobile:grid-cols-2">
                  {photos.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setSelected(p)}
                      className={clsx(
                        'rounded-[4px] overflow-hidden border-[3px] aspect-[4/5]',
                        selected?.id === p.id
                          ? 'border-[#FFFFFF]'
                          : 'border-transparent opacity-80 hover:opacity-100'
                      )}
                    >
                      <img
                        src={p.thumb}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
                <div className="text-[12px] text-customColor18">
                  {selected ? (
                    <>
                      {t('brand_photo_by', 'Photo by')}{' '}
                      <a
                        href={selected.credit.link}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {selected.credit.name}
                      </a>{' '}
                      {t('brand_photo_on_pexels', 'on Pexels')}
                    </>
                  ) : (
                    t(
                      'brand_photo_pick',
                      'Pick one, or leave it and we will use the first result.'
                    )
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex gap-[12px]">
          <Button
            onClick={() => generate(false)}
            loading={busy === 'preview'}
            disabled={busy !== ''}
          >
            {t('brand_preview_image', 'Preview')}
          </Button>
          <Button
            secondary={true}
            onClick={() => generate(true)}
            loading={busy === 'save'}
            disabled={busy !== '' || !hook.trim()}
          >
            {t('brand_save_image', 'Save to media library')}
          </Button>
        </div>

        {!!preview && (
          <img
            src={preview}
            alt=""
            className="max-w-[420px] w-full rounded-[8px] border border-fifth"
          />
        )}
      </div>
    </div>
  );
};
