'use client';

import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { sortTopics, useTopics } from '@gitroom/frontend/components/brand/topics';

const FORMATS = [
  {
    value: 'auto',
    label: 'Auto (recommended)',
    hint: 'We pick the design that suits the post best',
  },
  { value: 'photo', label: 'Photo', hint: 'A matching photo with your words on it' },
  { value: 'graphic', label: 'Graphic', hint: 'A bold design in your colours, no photo' },
  { value: 'carousel', label: 'Carousel', hint: 'Several slides people swipe through' },
  { value: 'video', label: 'Short video', hint: 'A moving clip for Reels and Stories' },
  { value: 'text', label: 'Text only', hint: 'Just the words, no image' },
];
const DESIGNED = ['auto', 'photo', 'graphic', 'carousel'];

const VIBES = [
  { value: 'auto', label: 'Mix it up' },
  { value: 'professional', label: 'Professional' },
  { value: 'bold', label: 'Bold' },
  { value: 'funny', label: 'Funny' },
  { value: 'aesthetic', label: 'Aesthetic' },
  { value: 'inspiring', label: 'Inspiring' },
];
const VIBE_LABEL: Record<string, string> = Object.fromEntries(
  VIBES.map((v) => [v.value, v.label])
);

const SIZES = [
  { value: 'feed', label: 'Feed (4:5)' },
  { value: 'square', label: 'Square' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'story', label: 'Story (9:16)' },
];

// designs that carry a stock photo, which the client can swap
const PHOTO_LAYOUTS = ['photo-full', 'photo-split', 'photo-frame', 'meme'];

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

const NETWORKS = [
  { value: 'facebook', label: 'Main' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'short', label: 'X & Threads' },
];

// what the server is doing while the client waits for the text
const WRITING_STEPS = [
  'Picking an idea and an angle...',
  'Writing five different hooks...',
  'Choosing the one that stops the scroll...',
  'Writing the caption...',
  'Checking it against your website...',
  'Almost there...',
];

interface Composed {
  id: string;
  topic: string;
  angleLabel: string;
  vibe: string;
  style: string;
  layout: string;
  size: string;
  headline: string;
  subtext: string;
  caption: string;
  hashtags: string[];
  altText: string;
  flags: string[];
  photoQueries: string[];
  slots: { items?: string[]; subtext?: string; kicker?: string };
}

interface Design {
  layout: string;
  images: string[];
  width: number;
  height: number;
  photoCredit: { name: string; link: string } | null;
}

interface Video {
  url: string;
  size: string;
  seconds: number;
  credits: { name: string; link: string }[];
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

const plain = (text: string) => text.replace(/\*/g, '');

// a server error or a dropped connection is worth one more try; a refusal
// (a 4xx with a reason) is not
const worthRetry = (res: Response | null) => !res || res.status >= 500;

const Waiting: FC<{ steps: string[]; note?: string }> = ({ steps, note }) => {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setStep((s) => Math.min(s + 1, steps.length - 1)),
      2800
    );
    return () => clearInterval(timer);
  }, [steps.length]);
  return (
    <div className="flex flex-col items-center gap-[10px] py-[32px] text-center">
      <div className="w-[36px] h-[36px] rounded-full border-[3px] border-newTableBorder border-t-forth animate-spin" />
      <div className="text-[15px] font-[600]">{steps[step]}</div>
      {note && <div className="text-[13px] text-textItemBlur">{note}</div>}
    </div>
  );
};

export const CreatePost: FC = () => {
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: brand } = useBrand();
  const { data: topicList } = useTopics();
  const { channels: allChannels } = useConnectedChannels();
  const channels = useMemo(
    () => allChannels.filter((c) => !c.disabled && !c.inBetweenSteps),
    [allChannels]
  );

  // '' = surprise me, 'id:<topic id>' = a saved idea, 'text:<title>' = a
  // brand topic before the website was read
  const [topicChoice, setTopicChoice] = useState('');
  const [ownTopic, setOwnTopic] = useState('');
  const [showAllTopics, setShowAllTopics] = useState(false);
  const [format, setFormat] = useState('auto');
  const [vibe, setVibe] = useState('auto');
  const [size, setSize] = useState('feed');
  const [picked, setPicked] = useState<string[] | null>(null);
  const selected = picked ?? channels.map((c) => c.id);

  const [post, setPost] = useState<Composed | null>(null);
  const [writing, setWriting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [design, setDesign] = useState<Design | null>(null);
  const [designing, setDesigning] = useState(false);
  const [designFailed, setDesignFailed] = useState(false);
  const [slide, setSlide] = useState(0);
  const [video, setVideo] = useState<Video | null>(null);
  const [versions, setVersions] = useState<Record<string, string> | null>(null);
  const [network, setNetwork] = useState('facebook');
  const [imageText, setImageText] = useState({ headline: '', subtext: '' });
  // the lines of the video's middle scenes
  const [sceneLines, setSceneLines] = useState<string[]>([]);

  const [publishing, setPublishing] = useState<'' | 'now' | 'schedule' | 'draft'>('');
  const [when, setWhen] = useState(tomorrowAtTen());
  const [published, setPublished] = useState<null | { type: string; date: string }>(
    null
  );

  const [photoQuery, setPhotoQuery] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);

  // answers that arrive after the client moved on to a new post are dropped
  const current = useRef('');

  const selectedChannels = channels.filter((c) => selected.includes(c.id));
  const draftOnly = selectedChannels.filter((c) => !QUICK.includes(c.identifier));

  const toggleChannel = (id: string) =>
    setPicked(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    );

  const call = useCallback(
    async (path: string, body?: object, retry = true) => {
      const send = () =>
        fetch(path, {
          method: 'POST',
          body: body ? JSON.stringify(body) : undefined,
        }).catch(() => null);
      let res = await send();
      if (retry && worthRetry(res)) {
        setRetrying(true);
        res = await send();
        setRetrying(false);
      }
      return res;
    },
    []
  );

  const loadVersions = useCallback(async (id: string) => {
    const res = await call(`/brand/posts/${id}/versions`);
    if (res?.ok && current.current === id) {
      setVersions(await res.json());
    }
  }, []);

  const makeDesign = useCallback(
    async (
      id: string,
      opts: {
        newDesign?: boolean;
        photoUrl?: string;
        headline?: string;
        subtext?: string;
      } = {},
      pickedCredit?: { name: string; link: string } | null
    ) => {
      setDesigning(true);
      setDesignFailed(false);
      try {
        const res = await call(`/brand/posts/${id}/render`, opts);
        if (current.current !== id) {
          return;
        }
        if (!res?.ok) {
          setDesignFailed(true);
          toaster.show(
            res
              ? await errorMessage(res, 'We could not design this post.')
              : 'We could not reach the server. Check your connection.',
            'warning'
          );
          return;
        }
        const data = await res.json();
        setDesign((old) => ({
          layout: data.layout,
          images: data.images,
          width: data.width,
          height: data.height,
          photoCredit:
            data.photoCredit ??
            pickedCredit ??
            (opts.headline !== undefined && !opts.photoUrl ? old?.photoCredit : null) ??
            null,
        }));
        setSlide(0);
      } finally {
        if (current.current === id) {
          setDesigning(false);
        }
      }
    },
    []
  );

  // The short video: scenes on stock clips with the words appearing one by
  // one, then an end card. Clips stay the same when only the words change.
  const makeVideo = useCallback(
    async (
      id: string,
      opts: {
        size?: string;
        newClips?: boolean;
        clipUrl?: string;
        headline?: string;
        subtext?: string;
        items?: string[];
      } = {},
      pickedCredit?: { name: string; link: string } | null
    ) => {
      setDesigning(true);
      setDesignFailed(false);
      try {
        const res = await call(`/brand/posts/${id}/video`, opts);
        if (current.current !== id) {
          return;
        }
        if (!res?.ok) {
          setDesignFailed(true);
          toaster.show(
            res
              ? await errorMessage(res, 'We could not make the video.')
              : 'We could not reach the server. Check your connection.',
            'warning'
          );
          return;
        }
        const data = await res.json();
        const credits: { name: string; link: string }[] = [...(data.credits || [])];
        if (pickedCredit && !credits.some((c) => c.name === pickedCredit.name)) {
          credits.unshift(pickedCredit);
        }
        setVideo({ url: data.url, size: data.size, seconds: data.seconds, credits });
      } finally {
        if (current.current === id) {
          setDesigning(false);
        }
      }
    },
    []
  );

  const write = useCallback(async () => {
    setWriting(true);
    setPublished(null);
    setResults(null);
    setPost(null);
    setDesign(null);
    setVideo(null);
    setVersions(null);
    setDesignFailed(false);
    current.current = '';
    try {
      const res = await call('/brand/compose', {
        topic: ownTopic.trim()
          ? ownTopic.trim()
          : topicChoice.startsWith('text:')
          ? topicChoice.slice(5)
          : undefined,
        topicId:
          !ownTopic.trim() && topicChoice.startsWith('id:')
            ? topicChoice.slice(3)
            : undefined,
        style: format,
        vibe,
        size,
        channels: selectedChannels.map((c) => c.identifier),
      });
      if (!res?.ok) {
        toaster.show(
          res
            ? await errorMessage(res, 'We could not write a post right now.')
            : 'We could not reach the server. Check your connection.',
          'warning'
        );
        return;
      }
      const data: Composed = await res.json();
      current.current = data.id;
      setPost(data);
      setImageText({ headline: data.headline, subtext: data.subtext || '' });
      setSceneLines((data.slots?.items || []).slice(0, 3));
      setNetwork('facebook');
      setPhotoQuery(data.photoQueries[0] || '');
      loadVersions(data.id);
      if (DESIGNED.includes(format)) {
        makeDesign(data.id);
      } else if (format === 'video') {
        makeVideo(data.id, { size });
      }
    } finally {
      setWriting(false);
    }
  }, [ownTopic, topicChoice, format, vibe, size, selectedChannels]);

  const search = useCallback(async () => {
    if (photoQuery.trim().length < 2 || !post) {
      return;
    }
    setSearching(true);
    try {
      const forVideo = post.style === 'video';
      const res = await fetch(
        `/brand/${forVideo ? 'stock-videos' : 'stock'}?query=${encodeURIComponent(
          photoQuery.trim()
        )}&size=${forVideo ? video?.size || size : post.size}`
      );
      const data = res.ok ? await res.json() : {};
      setResults((forVideo ? data.videos : data.photos) || []);
    } finally {
      setSearching(false);
    }
  }, [photoQuery, post, video, size]);

  const caption = post?.caption || '';
  const textFor = (key: string) =>
    key === 'facebook' ? caption : versions?.[key] ?? '';
  const setTextFor = (key: string, value: string) => {
    if (key === 'facebook') {
      setPost((p) => (p ? { ...p, caption: value } : p));
    } else {
      setVersions((v) => ({ ...(v || {}), [key]: value }));
    }
  };

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
            postId: post.id,
            caption: post.caption,
            captions: { ...(versions || {}), facebook: post.caption },
            hashtags: post.hashtags,
            style: post.style,
            size: video?.size || post.size,
            headline: plain(imageText.headline) || undefined,
            videoPath: post.style === 'video' ? video?.url : undefined,
          }),
        });
        if (!res.ok) {
          toaster.show(await errorMessage(res, 'We could not send this post.'), 'warning');
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
    [post, versions, selected, when, video, imageText]
  );

  if (!brand) {
    return null;
  }

  // ideas: the saved ones (pinned first, muted hidden), or the brand's
  // topics while the website is still being read
  const ideas = sortTopics(topicList || []).filter((t) => !t.muted);
  const ideaOptions = ideas.length
    ? ideas.map((t) => ({ value: `id:${t.id}`, label: t.pinned ? `★ ${t.title}` : t.title }))
    : (brand.targetTopics || []).map((t: string) => ({ value: `text:${t}`, label: t }));
  const shownIdeas = showAllTopics ? ideaOptions : ideaOptions.slice(0, 10);

  const busy = writing || !!publishing || designing;
  const isVideo = post?.style === 'video';
  const isText = post?.style === 'text';
  const hasPhoto = !!design && PHOTO_LAYOUTS.includes(design.layout);
  const savedLines = (post?.slots?.items || []).slice(0, 3);
  const imageWordsChanged =
    !!post &&
    (imageText.headline !== post.headline ||
      imageText.subtext !== (post.subtext || '') ||
      (isVideo && sceneLines.join('|') !== savedLines.join('|')));
  const shortLength = textFor('short').length;

  return (
    <div className="flex-1 bg-newBgColorInner p-[20px] mobile:p-[12px] overflow-auto">
      <div className="max-w-[1100px] mx-auto flex flex-col gap-[16px]">
        <Card
          title="What do you want to post about?"
          hint="Pick one of your ideas, write your own, or let us choose."
        >
          <ChoiceChips
            options={[{ value: '', label: 'Surprise me' }, ...shownIdeas]}
            value={ownTopic ? '__own' : topicChoice}
            onChange={(v) => {
              setTopicChoice(v);
              setOwnTopic('');
            }}
          />
          {ideaOptions.length > 10 && (
            <button
              type="button"
              onClick={() => setShowAllTopics(!showAllTopics)}
              className="text-[13px] text-forth underline w-fit"
            >
              {showAllTopics ? 'Show fewer ideas' : `Show all ${ideaOptions.length} ideas`}
            </button>
          )}
          <input
            value={ownTopic}
            onChange={(e) => setOwnTopic(e.target.value)}
            placeholder="Or say it in your own words, e.g. we now open on Sundays"
            maxLength={200}
            className={inputClass}
          />
        </Card>

        <div className="grid grid-cols-2 gap-[16px] mobile:grid-cols-1">
          <Card title="Format">
            <div className="grid grid-cols-2 gap-[8px]">
              {FORMATS.map((f) => (
                <button
                  type="button"
                  key={f.value}
                  onClick={() => {
                    setFormat(f.value);
                    // videos are mostly watched as Reels and Stories; a
                    // carousel only works in the feed
                    if (f.value === 'video' && size === 'feed') {
                      setSize('story');
                    }
                    if (f.value === 'carousel' && (size === 'story' || size === 'landscape')) {
                      setSize('feed');
                    }
                  }}
                  className={clsx(
                    'text-start p-[12px] rounded-[10px] border transition-colors',
                    format === f.value
                      ? 'border-forth bg-boxHover'
                      : 'border-newTableBorder hover:border-forth'
                  )}
                >
                  <div className="text-[14px] font-[600]">{f.label}</div>
                  <div className="text-[12px] text-textItemBlur">{f.hint}</div>
                </button>
              ))}
            </div>
            <Field label="Feel">
              <ChoiceChips options={VIBES} value={vibe} onChange={setVibe} />
            </Field>
            {format !== 'text' && (
              <Field label="Size">
                <ChoiceChips
                  options={
                    format === 'carousel'
                      ? SIZES.filter((s) => s.value === 'feed' || s.value === 'square')
                      : SIZES
                  }
                  value={size}
                  onChange={setSize}
                />
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
                      <div className="text-[14px] font-[600] truncate">{c.name}</div>
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
            onClick={write}
            loading={writing}
            disabled={busy}
            className="rounded-[10px] !h-[54px] px-[48px] text-[16px]"
          >
            {post ? 'Write another one' : 'Create my post'}
          </Button>
        </div>

        {writing && (
          <Card title="Writing your post">
            <Waiting
              steps={WRITING_STEPS}
              note={
                retrying
                  ? 'Something went wrong, so we are trying again...'
                  : 'This takes about 15 seconds.'
              }
            />
          </Card>
        )}

        {post && (
          <Card
            title="Your post"
            hint="Change anything you like, then post it, schedule it, or keep it as a draft."
          >
            <div className="flex flex-wrap gap-[6px] text-[12px]">
              <span className="px-[10px] py-[4px] rounded-full bg-boxHover">
                Idea: {post.topic}
              </span>
              <span className="px-[10px] py-[4px] rounded-full bg-boxHover">
                Angle: {post.angleLabel}
              </span>
              <span className="px-[10px] py-[4px] rounded-full bg-boxHover">
                Feel: {VIBE_LABEL[post.vibe] || post.vibe}
              </span>
            </div>

            {!!post.flags.length && (
              <div className="rounded-[10px] border border-yellow-500/50 bg-yellow-500/10 p-[12px] text-[13px] flex flex-col gap-[4px]">
                <div className="font-[600]">Check before you post</div>
                {post.flags.map((f) => (
                  <div key={f}>
                    {f.startsWith('confirm:')
                      ? `We could not find this on your website: ${f.slice(8)} Make sure it is true before you post.`
                      : f}
                  </div>
                ))}
              </div>
            )}

            <div
              className={clsx(
                'grid gap-[24px]',
                !isText
                  ? 'grid-cols-[minmax(0,420px),1fr] tablet:grid-cols-1'
                  : 'grid-cols-1'
              )}
            >
              {!isText && (
                <div className="flex flex-col gap-[12px]">
                  {/* the image, the slides or the video */}
                  {isVideo && video ? (
                    <video
                      key={video.url}
                      src={video.url}
                      controls={true}
                      autoPlay={true}
                      muted={true}
                      loop={true}
                      playsInline={true}
                      className={clsx(
                        'w-full max-h-[620px] rounded-[10px] border border-newTableBorder bg-black',
                        designing && 'opacity-50'
                      )}
                    />
                  ) : !isVideo && design ? (
                    <div className="flex flex-col gap-[8px]">
                      <img
                        src={design.images[slide] || design.images[0]}
                        alt={post.altText || 'Post image'}
                        className={clsx(
                          'w-full rounded-[10px] border border-newTableBorder',
                          designing && 'opacity-50'
                        )}
                      />
                      {design.images.length > 1 && (
                        <div className="flex gap-[6px] overflow-x-auto pb-[4px]">
                          {design.images.map((src, i) => (
                            <button
                              type="button"
                              key={src}
                              onClick={() => setSlide(i)}
                              aria-label={`Slide ${i + 1}`}
                              className={clsx(
                                'w-[56px] shrink-0 rounded-[6px] overflow-hidden border-2',
                                slide === i ? 'border-forth' : 'border-transparent'
                              )}
                            >
                              <img src={src} alt="" className="w-full" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="aspect-[4/5] w-full rounded-[10px] border border-dashed border-newTableBorder flex flex-col items-center justify-center gap-[8px] text-center p-[24px] text-textItemBlur">
                      {designing ? (
                        <Waiting
                          steps={
                            isVideo
                              ? ['Finding a clip for each scene...', 'Animating your words...', 'Adding your end card...', 'Rendering the video...']
                              : ['Choosing a design...', 'Finding the right photo...', 'Putting it together...']
                          }
                          note={
                            retrying
                              ? 'Something went wrong, so we are trying again...'
                              : isVideo
                              ? 'This takes about 30 seconds. Read the caption while you wait.'
                              : 'Read the caption while you wait.'
                          }
                        />
                      ) : (
                        designFailed && (
                          <>
                            <div className="text-[14px]">
                              The {isVideo ? 'video' : 'image'} is not ready.
                            </div>
                            <Button
                              secondary={true}
                              onClick={() =>
                                isVideo
                                  ? makeVideo(post.id, { size })
                                  : makeDesign(post.id)
                              }
                              className="rounded-[8px]"
                            >
                              Try again
                            </Button>
                          </>
                        )
                      )}
                    </div>
                  )}

                  {!isVideo && design?.photoCredit && (
                    <div className="text-[12px] text-textItemBlur">
                      Photo by{' '}
                      <a
                        href={design.photoCredit.link}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {design.photoCredit.name}
                      </a>
                    </div>
                  )}
                  {isVideo && video && (
                    <div className="text-[12px] text-textItemBlur">
                      {video.seconds} seconds.
                      {!!video.credits.length && ' Clips by '}
                      {video.credits.map((c, i) => (
                        <React.Fragment key={c.name}>
                          {i > 0 && (i === video.credits.length - 1 ? ' and ' : ', ')}
                          <a href={c.link} target="_blank" rel="noreferrer" className="underline">
                            {c.name}
                          </a>
                        </React.Fragment>
                      ))}
                    </div>
                  )}

                  {(design || video) && (
                    <div className="flex gap-[8px] flex-wrap">
                      <Button
                        secondary={true}
                        onClick={() =>
                          isVideo
                            ? makeVideo(post.id, { newClips: true })
                            : makeDesign(post.id, { newDesign: true })
                        }
                        loading={designing}
                        disabled={busy}
                        className="rounded-[8px]"
                      >
                        {isVideo ? 'Try other clips' : 'Try another design'}
                      </Button>
                      {isVideo && video ? (
                        <a
                          href={video.url}
                          download="post-video.mp4"
                          className="h-[40px] px-[16px] rounded-[8px] border border-newTableBorder flex items-center text-[14px] hover:border-forth"
                        >
                          Download
                        </a>
                      ) : (
                        design && (
                          <a
                            href={design.images[slide] || design.images[0]}
                            download={`post-${slide + 1}.png`}
                            className="h-[40px] px-[16px] rounded-[8px] border border-newTableBorder flex items-center text-[14px] hover:border-forth"
                          >
                            {design.images.length > 1 ? `Download slide ${slide + 1}` : 'Download'}
                          </a>
                        )
                      )}
                    </div>
                  )}

                  <Field
                    label={isVideo ? 'Opening line' : 'Words on the image'}
                    hint="Put *stars* around words to highlight them."
                  >
                    <input
                      value={imageText.headline}
                      onChange={(e) => setImageText({ ...imageText, headline: e.target.value })}
                      maxLength={220}
                      className={inputClass}
                    />
                  </Field>
                  {isVideo &&
                    sceneLines.map((line, i) => (
                      <Field key={i} label={`Scene ${i + 2}`}>
                        <input
                          value={line}
                          onChange={(e) =>
                            setSceneLines(sceneLines.map((l, k) => (k === i ? e.target.value : l)))
                          }
                          maxLength={120}
                          className={inputClass}
                        />
                      </Field>
                    ))}
                  <Field label={isVideo ? 'Line on the end card' : 'Smaller line (optional)'}>
                    <input
                      value={imageText.subtext}
                      onChange={(e) => setImageText({ ...imageText, subtext: e.target.value })}
                      maxLength={200}
                      className={inputClass}
                    />
                  </Field>
                  {imageWordsChanged && (
                    <Button
                      onClick={() => {
                        setPost((p) =>
                          p
                            ? {
                                ...p,
                                headline: imageText.headline,
                                subtext: imageText.subtext,
                                slots: { ...p.slots, items: sceneLines, subtext: imageText.subtext },
                              }
                            : p
                        );
                        if (isVideo) {
                          makeVideo(post.id, {
                            headline: imageText.headline,
                            subtext: imageText.subtext,
                            items: sceneLines,
                          });
                        } else {
                          makeDesign(post.id, {
                            headline: imageText.headline,
                            subtext: imageText.subtext,
                          });
                        }
                      }}
                      loading={designing}
                      disabled={busy || !imageText.headline.trim()}
                      className="rounded-[8px] w-fit"
                    >
                      Update the {isVideo ? 'video' : 'image'}
                    </Button>
                  )}

                  {(hasPhoto || (isVideo && video)) && (
                    <div className="flex flex-col gap-[8px]">
                      <div className="text-[14px] font-[500]">
                        {isVideo ? 'Pick the clip for the opening scene' : 'Change the photo'}
                      </div>
                      <div className="flex gap-[8px]">
                        <input
                          value={photoQuery}
                          onChange={(e) => setPhotoQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && search()}
                          placeholder={isVideo ? 'e.g. city traffic at night' : 'e.g. coffee on a desk'}
                          className={inputClass}
                        />
                        <Button
                          secondary={true}
                          onClick={search}
                          loading={searching}
                          disabled={searching}
                          className="rounded-[8px] !h-[44px]"
                        >
                          Search
                        </Button>
                      </div>
                      {results && !results.length && (
                        <div className="text-[13px] text-textItemBlur">
                          Nothing found, try other words.
                        </div>
                      )}
                      {!!results?.length && (
                        <div className="grid grid-cols-4 gap-[6px]">
                          {results.map((r) => (
                            <button
                              type="button"
                              key={r.id}
                              disabled={busy}
                              onClick={() =>
                                isVideo
                                  ? makeVideo(post.id, { clipUrl: r.url }, r.credit)
                                  : makeDesign(post.id, { photoUrl: r.url }, r.credit)
                              }
                              className="aspect-square rounded-[6px] overflow-hidden border-2 border-transparent hover:border-newTableBorder relative"
                            >
                              <img src={r.thumb} alt="" className="w-full h-full object-cover" />
                              {isVideo && (
                                <span className="absolute bottom-[2px] end-[4px] text-[10px] text-white bg-black/60 px-[4px] rounded">
                                  {r.duration}s
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-[12px]">
                <div className="flex flex-col gap-[8px]">
                  <div className="text-[14px] font-[500]">Caption</div>
                  <div className="flex gap-[6px] flex-wrap">
                    {NETWORKS.map((n) => (
                      <button
                        type="button"
                        key={n.value}
                        onClick={() => setNetwork(n.value)}
                        className={clsx(
                          'px-[12px] h-[32px] rounded-[8px] border text-[13px]',
                          network === n.value
                            ? 'bg-forth border-forth text-white'
                            : 'border-newTableBorder hover:border-forth'
                        )}
                      >
                        {n.label}
                      </button>
                    ))}
                  </div>
                  {network !== 'facebook' && !versions ? (
                    <div className="min-h-[220px] rounded-[10px] border border-newTableBorder flex items-center justify-center text-[13px] text-textItemBlur p-[16px] text-center">
                      Writing the {NETWORKS.find((n) => n.value === network)?.label} version...
                    </div>
                  ) : (
                    <textarea
                      value={textFor(network)}
                      onChange={(e) => setTextFor(network, e.target.value)}
                      maxLength={network === 'short' ? 280 : 5000}
                      className={clsx(textareaClass, network === 'short' ? 'min-h-[120px]' : 'min-h-[260px]')}
                    />
                  )}
                  <div className="text-[12px] text-textItemBlur">
                    {network === 'facebook'
                      ? 'Used for Facebook and every network without its own version.'
                      : network === 'short'
                      ? `${shortLength} of 280 characters. Used for X, Threads, Bluesky and Mastodon.`
                      : `Used for ${NETWORKS.find((n) => n.value === network)?.label}.`}
                  </div>
                </div>
                <Field label="Hashtags">
                  <TagInput
                    values={post.hashtags}
                    onChange={(v) =>
                      setPost((p) =>
                        p ? { ...p, hashtags: v.map((h) => h.replace(/\s+/g, '')) } : p
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
                  {!isText && !design && !video && (
                    <div className="text-[13px] text-textItemBlur">
                      You can post as soon as the {isVideo ? 'video' : 'image'} is ready.
                    </div>
                  )}
                  <div className="flex gap-[8px] flex-wrap items-center">
                    <Button
                      onClick={() => publish('now')}
                      loading={publishing === 'now'}
                      disabled={
                        busy ||
                        !selected.length ||
                        !!draftOnly.length ||
                        (!isText && !design && !video)
                      }
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
                      disabled={
                        busy ||
                        !selected.length ||
                        !!draftOnly.length ||
                        (!isText && !design && !video)
                      }
                      className="rounded-[8px] !h-[44px]"
                    >
                      Schedule
                    </Button>
                    <Button
                      secondary={true}
                      onClick={() => publish('draft')}
                      loading={publishing === 'draft'}
                      disabled={busy || !selected.length || (!isText && !design && !video)}
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
