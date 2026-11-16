'use client';

import React, { FC, useCallback } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { AddProviderComponent } from '@gitroom/frontend/components/launches/add.provider.component';
import { Card } from '@gitroom/frontend/components/brand/ui';

export interface ConnectedChannel {
  id: string;
  name: string;
  identifier: string;
  picture?: string;
  disabled: boolean;
  refreshNeeded: boolean;
  inBetweenSteps: boolean;
}

// same key and shape as the calendar uses, so both stay in sync
export const useConnectedChannels = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/integrations/list')).json();
  }, []);
  const swr = useSWR('/integrations/list', load);
  const channels: ConnectedChannel[] = swr.data?.integrations || [];
  return { ...swr, channels };
};

const useAvailableChannels = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/integrations')).json();
  }, []);
  return useSWR('/integrations', load);
};

export const ChannelAvatar: FC<{ channel: ConnectedChannel; size?: number }> = ({
  channel,
  size = 44,
}) => (
  <div className="relative shrink-0" style={{ width: size, height: size }}>
    <img
      src={channel.picture || '/no-picture.jpg'}
      onError={(e) => {
        (e.target as HTMLImageElement).src = '/no-picture.jpg';
      }}
      alt=""
      className="rounded-full w-full h-full object-cover"
    />
    <img
      src={`/icons/platforms/${channel.identifier}.png`}
      alt={channel.identifier}
      className="absolute -bottom-[2px] -end-[2px] w-[18px] h-[18px] rounded-full border-2 border-newBgColorInner"
    />
  </div>
);

// Connected accounts of the current project, then every network the client
// can connect with one click. After the network's login page the client is
// sent back to `returnTo`.
export const ChannelsPanel: FC<{ returnTo: string }> = ({ returnTo }) => {
  const { channels, mutate } = useConnectedChannels();
  const { data: available } = useAvailableChannels();

  return (
    <div className="flex flex-col gap-[16px]">
      <Card
        title="Your connected accounts"
        hint="Posts from this project go to these accounts. Each project has its own."
      >
        {!channels.length ? (
          <div className="text-[14px] text-textItemBlur">
            Nothing connected yet. Pick a network below: you log in to it,
            choose the page or account, and you are back here.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-[12px] tablet:grid-cols-2 mobile:grid-cols-1">
            {channels.map((c) => (
              <div
                key={c.id}
                className={clsx(
                  'flex items-center gap-[12px] p-[12px] rounded-[10px] border border-newTableBorder',
                  c.disabled && 'opacity-60'
                )}
              >
                <ChannelAvatar channel={c} />
                <div className="flex flex-col min-w-0">
                  <div className="text-[14px] font-[600] truncate">{c.name}</div>
                  <div
                    className={clsx(
                      'text-[12px]',
                      c.refreshNeeded || c.inBetweenSteps
                        ? 'text-[#F97066]'
                        : 'text-[#32D583]'
                    )}
                  >
                    {c.refreshNeeded
                      ? 'Needs to be connected again'
                      : c.inBetweenSteps
                      ? 'Setup not finished'
                      : c.disabled
                      ? 'Paused'
                      : 'Connected'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Connect an account"
        hint="One click per network. You can connect as many as you like."
      >
        {available ? (
          <AddProviderComponent
            social={available.social || []}
            article={available.article || []}
            invite={false}
            update={() => mutate()}
            redirectUrl={returnTo}
          />
        ) : (
          <div className="text-[14px] text-textItemBlur">Loading networks...</div>
        )}
      </Card>
    </div>
  );
};
