'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
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
import { useBrand } from '@gitroom/frontend/components/brand/brand';
import {
  ChannelAvatar,
  useConnectedChannels,
} from '@gitroom/frontend/components/brand/channels';

const STYLES = [
  {
    value: 'photo-hook',
    label: 'Photo with headline',
    hint: 'A matching photo with your headline on it',
  },
  {
    value: 'quote-card',
    label: 'Quote card',
    hint: 'Your words, big, in your colours',
  },
  {
    value: 'brand-card',
    label: 'Brand card',
    hint: 'A clean graphic in your colours',
  },
  {
    value: 'video',
    label: 'Short video',
    hint: 'A moving clip with your headline, for Reels and Stories',
  },
  { value: 'text', label: 'Text only', hint: 'No image, just the words' },
];

const SIZES = [
  { value: 'feed', label: 'Feed (4:5)' },
  { value: 'square', label: 'Square' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'story', label: 'Story (9:16)' },
];

// networks that can be posted to straight from here; the others need extra
// details (a board, a video title, ...) and are saved as a draft to finish in
// the calendar. Keep in line with QUICK_PUBLISH on the server.
const QUICK = [
  'facebook',
  'instagram',
  'instagram-standalone',
  'linkedin',
  'linkedin-page',
  'x',
  'threads',
  'bluesky',
  'mastodon',
  'telegram',
  'nostr',
  'vk',
];
const SHORT = ['x', 'threads', 'bluesky', 'mastodon', 'nostr'];

interface Generated {
  topic: string;
  headline: string;
  subtext: string;
  caption: string;
  shortCaption: string;
  hashtags: string[];
  photoQuery: string;
  style: string;
  image: null | {
    preview: string;
    size: string;
    photoUrl: string | null;
    photoCredit: { name: string; link: string } | null;
  };
  video?: null | {
    url: string;
    size: string;
    videoUrl: string;
    credit: { name: string; link: string } | null;
  };
}

const tomorrowAtTen = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const CreatePost: FC = () => {
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: brand } = useBrand();
  const { channels: allChannels } = useConnectedChannels();
  const channels = useMemo(
    () => allChannels.filter((c) => !c.disabled && !c.inBetweenSteps),
    [allChannels]
  );

  const [topic, setTopic] = useState('');
  const [ownTopic, setOwnTopic] = useState('');
  const [style, setStyle] = useState('photo-hook');
  const [size, setSize] = useState('feed');
  const [picked, setPicked] = useState<string[] | null>(null);
  const selected = picked ?? channels.map((c) => c.id);

  const [post, setPost] = useState<Generated | null>(null);
  const [generating, setGenerating] = useState(false);
  const [updatingImage, setUpdatingImage] = useState(false);
  const [publishing, setPublishing] = useState<'' | 'now' | 'schedule' | 'draft'>('');
  const [when, setWhen] = useState(tomorrowAtTen());
  const [published, setPublished] = useState<null | { type: string; date: string }>(
    null
  );

  const [photoQuery, setPhotoQuery] = useState('');
  const [photos, setPhotos] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);

  const selectedChannels = channels.filter((c) => selected.includes(c.id));
  const draftOnly = selectedChannels.filter((c) => !QUICK.includes(c.identifier));
  const needsShort = selectedChannels.some((c) =>
    SHORT.some((s) => c.identifier === s || c.identifier.startsWith(`${s}-`))
  );

  const toggleChannel = (id: string) =>
    setPicked(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id]
    );

  const update = <K extends keyof Generated>(key: K, value: Generated[K]) =>
    setPost((p) => (p ? { ...p, [key]: value } : p));

  // The image is made after the text, so the client can read the text while
  // a photo is found and the image is drawn
  const makeImage = useCallback(
    async (text: Generated, imageSize: string) => {
      setUpdatingImage(true);
      try {
        const res = await fetch('/brand/image', {
          method: 'POST',
          body: JSON.stringify({
            hook: text.headline || brand?.businessName || ' ',
            subtext: text.subtext || undefined,
            template: text.style,
            size: imageSize,
            photoQuery: text.photoQuery || undefined,
          }),
        });
        if (!res.ok) {
          toaster.show(
            await errorMessage(res, 'We could not make the image.'),
            'warning'
          );
          return;
        }
        const data = await res.json();
        setPost((p) =>
          p
            ? {
                ...p,
                style: data.template,
                image: {
                  preview: data.preview,
                  size: imageSize,
                  photoUrl: data.photoUrl,
                  photoCredit: data.photoCredit,
                },
              }
            : p
        );
        if (text.style === 'photo-hook' && data.template !== 'photo-hook') {
          toaster.show(
            'We could not get a matching photo this time, so we made a brand card. Try "Change the photo".',
            'warning'
          );
        }
      } finally {
        setUpdatingImage(false);
      }
    },
    [brand]
  );

  // A branded video takes longer (a clip is found, downloaded and rendered),
  // so it is made after the text, like the image
  const makeVideo = useCallback(
    async (text: Generated, videoSize: string, videoUrl?: string) => {
      setUpdatingImage(true);
      try {
        const res = await fetch('/brand/video', {
          method: 'POST',
          body: JSON.stringify({
            headline: text.headline || brand?.businessName || ' ',
            subtext: text.subtext || undefined,
            size: videoSize,
            videoQuery: text.photoQuery || undefined,
            videoUrl: videoUrl || undefined,
          }),
        });
        if (!res.ok) {
          toaster.show(
            await errorMessage(res, 'We could not make the video.'),
            'warning'
          );
          return;
        }
        const data = await res.json();
        setPost((p) =>
          p
            ? {
                ...p,
                video: {
                  url: data.url,
                  size: videoSize,
                  videoUrl: data.videoUrl,
                  credit: data.videoCredit,
                },
              }
            : p
        );
      } finally {
        setUpdatingImage(false);
      }
    },
    [brand]
  );

  const [clips, setClips] = useState<any[] | null>(null);
  const searchClips = useCallback(async () => {
    if (photoQuery.trim().length < 2) {
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/brand/stock-videos?query=${encodeURIComponent(
          photoQuery.trim()
        )}&size=${post?.video?.size || size}`
      );
      const data = res.ok ? await res.json() : { videos: [] };
      setClips(data.videos || []);
    } finally {
      setSearching(false);
    }
  }, [photoQuery, post, size]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setPublished(null);
    setPhotos(null);
    try {
      const res = await fetch('/brand/generate', {
        method: 'POST',
        body: JSON.stringify({
          topic: (ownTopic || topic).trim() || undefined,
          style,
          size,
          channels: selectedChannels.map((c) => c.identifier),
          skipImage: true,
        }),
      });
      if (!res.ok) {
        toaster.show(
          await errorMessage(res, 'We could not write a post right now.'),
          'warning'
        );
        return;
      }
      const data: Generated = await res.json();
      setPost({ ...data, image: null, video: null });
      setPhotoQuery(data.photoQuery);
      setClips(null);
      if (style === 'video') {
        makeVideo(data, size);
      } else if (style !== 'text') {
        makeImage(data, size);
      }
    } finally {
      setGenerating(false);
    }
  }, [ownTopic, topic, style, size, selectedChannels, makeImage, makeVideo]);

  const rerender = useCallback(
    async (photoUrl?: string | null) => {
      if (!post || post.style === 'text') {
        return;
      }
      setUpdatingImage(true);
      try {
        const res = await fetch('/brand/image', {
          method: 'POST',
          body: JSON.stringify({
            hook: post.headline || brand?.businessName || ' ',
            subtext: post.subtext || undefined,
            template: post.style,
            size: post.image?.size || size,
            photoUrl: photoUrl || undefined,
          }),
        });
        if (!res.ok) {
          toaster.show(
            await errorMessage(res, 'We could not update the image.'),
            'warning'
          );
          return;
        }
        const data = await res.json();
        setPost((p) =>
          p && p.image
            ? {
                ...p,
                style: data.template,
                image: {
                  ...p.image,
                  preview: data.preview,
                  photoUrl: data.photoUrl ?? p.image.photoUrl,
                  photoCredit: data.photoCredit ?? p.image.photoCredit,
                },
              }
            : p
        );
      } finally {
        setUpdatingImage(false);
      }
    },
    [post, size, brand]
  );

  const searchPhotos = useCallback(async () => {
    if (photoQuery.trim().length < 2) {
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/brand/stock?query=${encodeURIComponent(photoQuery.trim())}&size=${
          post?.image?.size || size
        }`
      );
      const data = res.ok ? await res.json() : { photos: [] };
      setPhotos(data.photos || []);
    } finally {
      setSearching(false);
    }
  }, [photoQuery, post, size]);

  const publish = useCallback(
    async (type: 'now' | 'schedule' | 'draft') => {
      if (!post) {
        return;
      }
      if (!selected.length) {
        toaster.show('Pick at least one account to post to.', 'warning');
        return;
      }
      setPublishing(type);
      try {
        const res = await fetch('/brand/posts', {
          method: 'POST',
          body: JSON.stringify({
            integrations: selected,
            type,
            date: type === 'now' ? undefined : new Date(when).toISOString(),
            caption: post.caption,
            shortCaption: post.shortCaption || undefined,
            hashtags: post.hashtags,
            style: post.style,
            size: post.image?.size || size,
            headline: post.headline || undefined,
            subtext: post.subtext || undefined,
            photoUrl: post.image?.photoUrl || undefined,
            videoPath: post.style === 'video' ? post.video?.url : undefined,
          }),
        });
        if (!res.ok) {
          toaster.show(
            await errorMessage(res, 'We could not send this post.'),
            'warning'
          );
          return;
        }
        const data = await res.json();
        setPublished({ type, date: data.date });
        toaster.show(
          type === 'now'
            ? 'Your post is on its way.'
            : type === 'schedule'
            ? 'Your post is scheduled.'
            : 'Saved as a draft.',
          'success'
        );
      } finally {
        setPublishing('');
      }
    },
    [post, selected, when, size]
  );

  if (!brand) {
    return null;
  }

  const topics = brand.targetTopics || [];
  const busy = generating || !!publishing || updatingImage;

  return (
    <div className="flex-1 bg-newBgColorInner p-[20px] mobile:p-[12px] overflow-auto">
      <div className="max-w-[1100px] mx-auto flex flex-col gap-[16px]">
        <Card
          title="What do you want to post about?"
          hint="Pick one of your topics, write your own, or leave it to us."
        >
          <ChoiceChips
            options={[
              { value: '', label: 'Surprise me' },
              ...topics.map((t) => ({ value: t, label: t })),
            ]}
            value={ownTopic ? '__own' : topic}
            onChange={(v) => {
              setTopic(v);
              setOwnTopic('');
            }}
          />
          <input
            value={ownTopic}
            onChange={(e) => setOwnTopic(e.target.value)}
            placeholder="Or say it in your own words, e.g. our new 24/7 airport service"
            maxLength={200}
            className={inputClass}
          />
        </Card>

        <div className="grid grid-cols-2 gap-[16px] mobile:grid-cols-1">
          <Card title="Style">
            <div className="grid grid-cols-2 gap-[8px]">
              {STYLES.map((s) => (
                <button
                  type="button"
                  key={s.value}
                  onClick={() => {
                    setStyle(s.value);
                    // videos are mostly watched as Reels and Stories
                    if (s.value === 'video' && size === 'feed') {
                      setSize('story');
                    }
                  }}
                  className={clsx(
                    'text-start p-[12px] rounded-[10px] border transition-colors',
                    style === s.value
                      ? 'border-forth bg-boxHover'
                      : 'border-newTableBorder hover:border-forth'
                  )}
                >
                  <div className="text-[14px] font-[600]">{s.label}</div>
                  <div className="text-[12px] text-textItemBlur">{s.hint}</div>
                </button>
              ))}
            </div>
            {style !== 'text' && (
              <Field label={style === 'video' ? 'Video size' : 'Image size'}>
                <ChoiceChips options={SIZES} value={size} onChange={setSize} />
              </Field>
            )}
          </Card>

          <Card title="Where should it go?">
            {!channels.length ? (
              <div className="flex flex-col gap-[12px] text-[14px] text-textItemBlur">
                You have not connected an account yet. You can still create a
                post and look at it.
                <Link href="/channels" className="text-forth underline w-fit">
                  Connect an account
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-[8px]">
                {channels.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => toggleChannel(c.id)}
                    className={clsx(
                      'flex items-center gap-[12px] p-[8px] rounded-[10px] border text-start',
                      selected.includes(c.id)
                        ? 'border-forth bg-boxHover'
                        : 'border-newTableBorder opacity-70'
                    )}
                  >
                    <ChannelAvatar channel={c} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-[600] truncate">
                        {c.name}
                      </div>
                      {!QUICK.includes(c.identifier) && (
                        <div className="text-[12px] text-textItemBlur">
                          Saved as a draft, finished in the calendar
                        </div>
                      )}
                    </div>
                    <div
                      className={clsx(
                        'w-[22px] h-[22px] rounded-[6px] border flex items-center justify-center text-[13px]',
                        selected.includes(c.id)
                          ? 'bg-forth border-forth text-white'
                          : 'border-newTableBorder'
                      )}
                    >
                      {selected.includes(c.id) ? '✓' : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex justify-center">
          <Button
            onClick={generate}
            loading={generating}
            disabled={busy}
            className="rounded-[10px] !h-[54px] px-[48px] text-[16px]"
          >
            {post ? 'Write another one' : 'Create my post'}
          </Button>
        </div>
        {generating && (
          <div className="text-center text-[14px] text-textItemBlur">
            Writing your post and making the image. This takes about 10
            seconds...
          </div>
        )}

        {post && (
          <Card
            title="Your post"
            hint="Change anything you like, then post it, schedule it, or keep it as a draft."
          >
            <div
              className={clsx(
                'grid gap-[24px]',
                post.style !== 'text'
                  ? 'grid-cols-[minmax(0,420px),1fr] tablet:grid-cols-1'
                  : 'grid-cols-1'
              )}
            >
              {post.style === 'video' && (
                <div className="flex flex-col gap-[12px]">
                  {post.video ? (
                    <video
                      key={post.video.url}
                      src={post.video.url}
                      controls={true}
                      autoPlay={true}
                      muted={true}
                      loop={true}
                      playsInline={true}
                      className={clsx(
                        'w-full max-h-[620px] rounded-[10px] border border-newTableBorder bg-black',
                        updatingImage && 'opacity-50'
                      )}
                    />
                  ) : (
                    <div className="aspect-[9/16] max-h-[520px] w-full rounded-[10px] border border-dashed border-newTableBorder flex flex-col items-center justify-center gap-[8px] text-center p-[24px] text-textItemBlur">
                      {updatingImage ? (
                        <>
                          <div className="text-[15px] font-[600] text-textColor">
                            Making your video...
                          </div>
                          <div className="text-[13px]">
                            Finding a clip and putting your headline, logo and
                            button on it. This takes about 30 seconds.
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-[14px]">
                            The video is not ready.
                          </div>
                          <Button
                            secondary={true}
                            onClick={() => makeVideo(post, size)}
                            className="rounded-[8px]"
                          >
                            Try again
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                  {post.video?.credit && (
                    <div className="text-[12px] text-textItemBlur">
                      Video by{' '}
                      <a
                        href={post.video.credit.link}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {post.video.credit.name}
                      </a>
                    </div>
                  )}
                  <Field label="Headline on the video">
                    <input
                      value={post.headline}
                      onChange={(e) => update('headline', e.target.value)}
                      maxLength={220}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Line under the headline">
                    <input
                      value={post.subtext}
                      onChange={(e) => update('subtext', e.target.value)}
                      maxLength={200}
                      className={inputClass}
                    />
                  </Field>
                  <div className="flex gap-[8px] flex-wrap">
                    <Button
                      secondary={true}
                      onClick={() =>
                        makeVideo(
                          post,
                          post.video?.size || size,
                          post.video?.videoUrl
                        )
                      }
                      loading={updatingImage}
                      disabled={busy}
                      className="rounded-[8px]"
                    >
                      Update video
                    </Button>
                    {post.video && (
                      <a
                        href={post.video.url}
                        download="post-video.mp4"
                        className="h-[40px] px-[16px] rounded-[8px] border border-newTableBorder flex items-center text-[14px] hover:border-forth"
                      >
                        Download
                      </a>
                    )}
                  </div>
                  <div className="flex flex-col gap-[8px]">
                    <div className="text-[14px] font-[500]">Change the clip</div>
                    <div className="flex gap-[8px]">
                      <input
                        value={photoQuery}
                        onChange={(e) => setPhotoQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && searchClips()}
                        placeholder="e.g. city traffic at night"
                        className={inputClass}
                      />
                      <Button
                        secondary={true}
                        onClick={searchClips}
                        loading={searching}
                        disabled={searching}
                        className="rounded-[8px] !h-[44px]"
                      >
                        Search
                      </Button>
                    </div>
                    {clips && !clips.length && (
                      <div className="text-[13px] text-textItemBlur">
                        No clips found, try other words.
                      </div>
                    )}
                    {!!clips?.length && (
                      <div className="grid grid-cols-4 gap-[6px]">
                        {clips.map((c) => (
                          <button
                            type="button"
                            key={c.id}
                            disabled={busy}
                            onClick={() =>
                              makeVideo(post, post.video?.size || size, c.url)
                            }
                            className={clsx(
                              'aspect-square rounded-[6px] overflow-hidden border-2 relative',
                              post.video?.videoUrl === c.url
                                ? 'border-forth'
                                : 'border-transparent hover:border-newTableBorder'
                            )}
                          >
                            <img
                              src={c.thumb}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                            <span className="absolute bottom-[2px] end-[4px] text-[10px] text-white bg-black/60 px-[4px] rounded">
                              {c.duration}s
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {post.style !== 'text' && post.style !== 'video' && !post.image && (
                <div className="aspect-[4/5] w-full rounded-[10px] border border-dashed border-newTableBorder flex flex-col items-center justify-center gap-[8px] text-center p-[24px] text-textItemBlur">
                  {updatingImage ? (
                    <>
                      <div className="text-[15px] font-[600] text-textColor">
                        Making your image...
                      </div>
                      <div className="text-[13px]">
                        Finding a photo and putting your headline, colours and
                        logo on it.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-[14px]">The image is not ready.</div>
                      <Button
                        secondary={true}
                        onClick={() => post && makeImage(post, size)}
                        className="rounded-[8px]"
                      >
                        Try again
                      </Button>
                    </>
                  )}
                </div>
              )}
              {post.image && (
                <div className="flex flex-col gap-[12px]">
                  <div className="relative">
                    <img
                      src={post.image.preview}
                      alt="Post image"
                      className={clsx(
                        'w-full rounded-[10px] border border-newTableBorder',
                        updatingImage && 'opacity-50'
                      )}
                    />
                  </div>
                  {post.image.photoCredit && (
                    <div className="text-[12px] text-textItemBlur">
                      Photo by{' '}
                      <a
                        href={post.image.photoCredit.link}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {post.image.photoCredit.name}
                      </a>
                    </div>
                  )}
                  <Field label="Headline on the image">
                    <input
                      value={post.headline}
                      onChange={(e) => update('headline', e.target.value)}
                      maxLength={220}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Line under the headline">
                    <input
                      value={post.subtext}
                      onChange={(e) => update('subtext', e.target.value)}
                      maxLength={200}
                      className={inputClass}
                    />
                  </Field>
                  <div className="flex gap-[8px] flex-wrap">
                    <Button
                      secondary={true}
                      onClick={() => rerender(post.image?.photoUrl)}
                      loading={updatingImage}
                      disabled={busy}
                      className="rounded-[8px]"
                    >
                      Update image
                    </Button>
                    <a
                      href={post.image.preview}
                      download="post-image"
                      className="h-[40px] px-[16px] rounded-[8px] border border-newTableBorder flex items-center text-[14px] hover:border-forth"
                    >
                      Download
                    </a>
                  </div>
                  {post.style === 'photo-hook' && (
                    <div className="flex flex-col gap-[8px]">
                      <div className="text-[14px] font-[500]">Change the photo</div>
                      <div className="flex gap-[8px]">
                        <input
                          value={photoQuery}
                          onChange={(e) => setPhotoQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && searchPhotos()}
                          placeholder="e.g. airport taxi"
                          className={inputClass}
                        />
                        <Button
                          secondary={true}
                          onClick={searchPhotos}
                          loading={searching}
                          disabled={searching}
                          className="rounded-[8px] !h-[44px]"
                        >
                          Search
                        </Button>
                      </div>
                      {photos && !photos.length && (
                        <div className="text-[13px] text-textItemBlur">
                          No photos found, try other words.
                        </div>
                      )}
                      {!!photos?.length && (
                        <div className="grid grid-cols-4 gap-[6px]">
                          {photos.map((p) => (
                            <button
                              type="button"
                              key={p.id}
                              disabled={busy}
                              onClick={() => rerender(p.url)}
                              className={clsx(
                                'aspect-square rounded-[6px] overflow-hidden border-2',
                                post.image?.photoUrl === p.url
                                  ? 'border-forth'
                                  : 'border-transparent hover:border-newTableBorder'
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
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-[12px]">
                <Field label="Caption">
                  <textarea
                    value={post.caption}
                    onChange={(e) => update('caption', e.target.value)}
                    className={clsx(textareaClass, 'min-h-[220px]')}
                  />
                </Field>
                {needsShort && (
                  <Field
                    label="Short version for X, Threads and Bluesky"
                    hint={`${post.shortCaption.length} of 280 characters`}
                  >
                    <textarea
                      value={post.shortCaption}
                      onChange={(e) => update('shortCaption', e.target.value)}
                      maxLength={280}
                      className={textareaClass}
                    />
                  </Field>
                )}
                <Field label="Hashtags">
                  <TagInput
                    values={post.hashtags}
                    onChange={(v) =>
                      update(
                        'hashtags',
                        v.map((h) => h.replace(/\s+/g, ''))
                      )
                    }
                    placeholder="Add a hashtag and press Enter"
                    max={15}
                    prefix="#"
                  />
                </Field>

                <div className="border-t border-newTableBorder pt-[16px] flex flex-col gap-[12px]">
                  {!selected.length && (
                    <div className="text-[13px] text-textItemBlur">
                      Pick at least one account above to post this.
                    </div>
                  )}
                  {!!draftOnly.length && (
                    <div className="text-[13px] text-textItemBlur">
                      {draftOnly.map((c) => c.name).join(', ')} need a few more
                      details, so this can only be saved as a draft and finished
                      in the calendar.
                    </div>
                  )}
                  <div className="flex gap-[8px] flex-wrap items-center">
                    <Button
                      onClick={() => publish('now')}
                      loading={publishing === 'now'}
                      disabled={busy || !selected.length || !!draftOnly.length}
                      className="rounded-[8px] !h-[44px]"
                    >
                      Post now
                    </Button>
                    <input
                      type="datetime-local"
                      value={when}
                      onChange={(e) => setWhen(e.target.value)}
                      className={clsx(inputClass, '!w-auto')}
                    />
                    <Button
                      onClick={() => publish('schedule')}
                      loading={publishing === 'schedule'}
                      disabled={busy || !selected.length || !!draftOnly.length}
                      className="rounded-[8px] !h-[44px]"
                    >
                      Schedule
                    </Button>
                    <Button
                      secondary={true}
                      onClick={() => publish('draft')}
                      loading={publishing === 'draft'}
                      disabled={busy || !selected.length}
                      className="rounded-[8px] !h-[44px]"
                    >
                      Save as draft
                    </Button>
                  </div>
                  {published && (
                    <div className="text-[14px]">
                      {published.type === 'now'
                        ? 'Sent. It appears on your accounts within a minute or two.'
                        : published.type === 'schedule'
                        ? `Scheduled for ${new Date(published.date).toLocaleString()}.`
                        : 'Saved as a draft.'}{' '}
                      <Link href="/launches" className="text-forth underline">
                        See it in your calendar
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
