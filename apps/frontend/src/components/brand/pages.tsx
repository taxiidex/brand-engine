'use client';

import React, { FC } from 'react';
import { BrandForm } from '@gitroom/frontend/components/brand/brand';
import { ChannelsPanel } from '@gitroom/frontend/components/brand/channels';

export const BrandPage: FC = () => (
  <div className="flex-1 bg-newBgColorInner p-[20px] mobile:p-[12px] overflow-auto">
    <div className="max-w-[920px] mx-auto">
      <BrandForm saveLabel="Save changes" />
    </div>
  </div>
);

export const ChannelsPage: FC = () => (
  <div className="flex-1 bg-newBgColorInner p-[20px] mobile:p-[12px] overflow-auto">
    <div className="max-w-[920px] mx-auto">
      <ChannelsPanel returnTo="/channels" />
    </div>
  </div>
);
