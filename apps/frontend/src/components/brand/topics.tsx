'use client';

import React, { FC, useCallback, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  Card,
  errorMessage,
  inputClass,
} from '@gitroom/frontend/components/brand/ui';

export interface Topic {
  id: string;
  title: string;
  kind: string;
  sourceUrl?: string | null;
  facts: string[];
  pinned: boolean;
  muted: boolean;
}

export const useTopics = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const res = await fetch('/brand/topics');
    return res.ok ? ((await res.json()) as Topic[]) : [];
  }, []);
  return useSWR('brand-topics', load, { revalidateOnFocus: false });
};

// pinned first, then the rest, muted last
export const sortTopics = (list: Topic[]) =>
  [...list].sort(
    (a, b) =>
      Number(a.muted) - Number(b.muted) ||
      Number(b.pinned) - Number(a.pinned) ||
      a.title.localeCompare(b.title)
  );

// The ideas posts are written about: read from the client's website, plus
// their own. Pin to post about it more often, mute to stop.
export const TopicsManager: FC<{
  // proof points the website read suggested, offered to the brand form
  onSuggestedProof?: (points: string[]) => void;
  hasWebsite: boolean;
}> = ({ onSuggestedProof, hasWebsite }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: topics, mutate, isLoading } = useTopics();
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const add = useCallback(async () => {
    const t = title.trim();
    if (t.length < 3) {
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/brand/topics', {
        method: 'POST',
        body: JSON.stringify({ title: t }),
      });
      if (!res.ok) {
        toaster.show(await errorMessage(res, 'We could not add this idea.'), 'warning');
        return;
      }
      setTitle('');
      mutate();
    } finally {
      setAdding(false);
    }
  }, [title]);

  const change = useCallback(
    async (topic: Topic, data: { pinned?: boolean; muted?: boolean }) => {
      mutate(
        (list) => (list || []).map((t) => (t.id === topic.id ? { ...t, ...data } : t)),
        { revalidate: false }
      );
      const res = await fetch(`/brand/topics/${topic.id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        toaster.show('We could not save that change.', 'warning');
        mutate();
      }
    },
    []
  );

  const remove = useCallback(async (topic: Topic) => {
    mutate((list) => (list || []).filter((t) => t.id !== topic.id), {
      revalidate: false,
    });
    const res = await fetch(`/brand/topics/${topic.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toaster.show('We could not remove this idea.', 'warning');
      mutate();
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/brand/topics/refresh', { method: 'POST' });
      if (!res.ok) {
        toaster.show(
          await errorMessage(res, 'We could not read your website right now.'),
          'warning'
        );
        return;
      }
      const data = await res.json();
      mutate(data.topics, { revalidate: false });
      toaster.show(
        `Found ${data.topics.length} ideas on ${data.pagesRead} pages of your website.`,
        'success'
      );
      if (data.suggestedProof?.length) {
        onSuggestedProof?.(data.suggestedProof);
      }
    } finally {
      setRefreshing(false);
    }
  }, [onSuggestedProof]);

  const list = sortTopics(topics || []);
  const visible = showAll ? list : list.slice(0, 12);

  return (
    <Card
      title="Post ideas"
      hint="What your posts are about. We read them from your website, and you can add your own. Pin an idea to post about it more often, mute it to stop."
    >
      <div className="flex gap-[8px] mobile:flex-col">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          maxLength={120}
          placeholder="Add an idea, e.g. our weekend opening hours"
          className={inputClass}
        />
        <Button
          secondary={true}
          onClick={add}
          loading={adding}
          disabled={adding || title.trim().length < 3}
          className="rounded-[8px] !h-[44px] shrink-0"
        >
          Add idea
        </Button>
      </div>

      {isLoading ? (
        <div className="text-[13px] text-textItemBlur">Loading your ideas...</div>
      ) : !list.length ? (
        <div className="text-[13px] text-textItemBlur">
          {hasWebsite
            ? 'No ideas yet. Read your website to find some, or add your own.'
            : 'Add your website above to find ideas automatically, or add your own.'}
        </div>
      ) : (
        <div className="flex flex-col gap-[6px]">
          {visible.map((t) => (
            <div
              key={t.id}
              className={clsx(
                'rounded-[10px] border border-newTableBorder px-[12px] py-[8px]',
                t.muted && 'opacity-50'
              )}
            >
              <div className="flex items-center gap-[8px]">
                <button
                  type="button"
                  onClick={() => setOpen(open === t.id ? null : t.id)}
                  className="flex-1 min-w-0 text-start"
                >
                  <div className="text-[14px] font-[500] truncate">
                    {t.pinned && <span className="text-forth me-[6px]">★</span>}
                    {t.title}
                  </div>
                  <div className="text-[12px] text-textItemBlur">
                    {t.kind === 'custom'
                      ? 'Your idea'
                      : `From your website${t.facts.length ? `, ${t.facts.length} fact${t.facts.length > 1 ? 's' : ''}` : ''}`}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => change(t, { pinned: !t.pinned, muted: false })}
                  className="text-[12px] px-[8px] h-[28px] rounded-[6px] border border-newTableBorder hover:border-forth"
                >
                  {t.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  type="button"
                  onClick={() => change(t, { muted: !t.muted, pinned: false })}
                  className="text-[12px] px-[8px] h-[28px] rounded-[6px] border border-newTableBorder hover:border-forth"
                >
                  {t.muted ? 'Unmute' : 'Mute'}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${t.title}`}
                  onClick={() => remove(t)}
                  className="text-[14px] w-[28px] h-[28px] rounded-[6px] border border-newTableBorder hover:border-red-500"
                >
                  ×
                </button>
              </div>
              {open === t.id && !!t.facts.length && (
                <ul className="mt-[6px] ps-[16px] list-disc text-[13px] text-textItemBlur flex flex-col gap-[2px]">
                  {t.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {list.length > 12 && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="text-[13px] text-forth underline w-fit"
            >
              {showAll ? 'Show fewer' : `Show all ${list.length} ideas`}
            </button>
          )}
        </div>
      )}

      {hasWebsite && (
        <div className="flex items-center gap-[12px] flex-wrap">
          <Button
            secondary={true}
            onClick={refresh}
            loading={refreshing}
            disabled={refreshing}
            className="rounded-[8px]"
          >
            Find new ideas on my website
          </Button>
          {refreshing && (
            <span className="text-[13px] text-textItemBlur">
              Reading your website. This takes about 30 seconds...
            </span>
          )}
        </div>
      )}
    </Card>
  );
};
