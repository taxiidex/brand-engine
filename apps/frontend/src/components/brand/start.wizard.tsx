'use client';

import React, { FC, useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import {
  Card,
  Field,
  Steps,
  errorMessage,
  inputClass,
} from '@gitroom/frontend/components/brand/ui';
import { BrandForm, useBrand } from '@gitroom/frontend/components/brand/brand';
import {
  ChannelsPanel,
  useConnectedChannels,
} from '@gitroom/frontend/components/brand/channels';
import { PRODUCT_NAME } from '@gitroom/frontend/components/brand/product';

type Step = 'project' | 'brand' | 'channels' | 'done';
const STEPS: Step[] = ['project', 'brand', 'channels', 'done'];
const LABELS = ['Your project', 'Your brand', 'Your accounts', 'Ready'];

const useProjects = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/user/organizations')).json();
  }, []);
  return useSWR('organizations', load);
};

// The guided start every new client (and every new project) goes through:
// name the project, describe the brand, connect accounts, make a post.
export const StartWizard: FC = () => {
  const fetch = useFetch();
  const router = useRouter();
  const search = useSearchParams();
  const toaster = useToaster();
  const user = useUser();
  const { data: brand } = useBrand();
  const { channels } = useConnectedChannels();
  const { data: projects, mutate: mutateProjects } = useProjects();

  // coming back from a network's login page lands on the accounts step
  const [step, setStep] = useState<Step>(
    search.get('added') || search.get('step') === 'channels'
      ? 'channels'
      : 'project'
  );
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [saving, setSaving] = useState(false);

  const current = Array.isArray(projects)
    ? projects.find((p: any) => p.id === user?.orgId)
    : undefined;

  useEffect(() => {
    if (current?.name && !name) {
      setName(current.name);
    }
  }, [current?.name]);

  useEffect(() => {
    const added = search.get('added');
    if (added) {
      toaster.show('Account connected.', 'success');
    }
  }, []);

  const go = (next: Step) => {
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveProject = useCallback(async () => {
    if (name.trim().length < 2) {
      toaster.show('Give your project a name.', 'warning');
      return;
    }
    setSaving(true);
    try {
      if (name.trim() !== current?.name) {
        const res = await fetch('/projects/current', {
          method: 'PUT',
          body: JSON.stringify({ name: name.trim() }),
        });
        if (!res.ok) {
          toaster.show(
            await errorMessage(res, 'We could not save the project name.'),
            'warning'
          );
          return;
        }
        mutateProjects();
      }
      go('brand');
    } finally {
      setSaving(false);
    }
  }, [name, current?.name]);

  const index = STEPS.indexOf(step);

  return (
    <div className="w-full max-w-[920px] mx-auto flex flex-col gap-[24px] py-[24px] px-[16px]">
      <div className="flex items-center justify-between gap-[16px] flex-wrap">
        <div className="text-[22px] font-[700]">{PRODUCT_NAME}</div>
        <Steps steps={LABELS} current={index} />
      </div>

      {step === 'project' && (
        <Card
          title="Let's set up your project"
          hint="A project is one business: its brand, its social accounts and its posts. You can add more projects later."
        >
          <Field label="What is your business called?">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Green Cab Co"
              className={inputClass}
              autoFocus
            />
          </Field>
          <Field
            label="Your website (optional)"
            hint="If you have one, we read it and fill in your brand details for you."
          >
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="yourbusiness.com"
              className={inputClass}
              onKeyDown={(e) => e.key === 'Enter' && saveProject()}
            />
          </Field>
          <div className="flex justify-end">
            <Button
              onClick={saveProject}
              loading={saving}
              disabled={saving}
              className="rounded-[8px] !h-[48px] px-[32px]"
            >
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === 'brand' && (
        <div className="flex flex-col gap-[16px]">
          <div className="flex flex-col gap-[4px]">
            <div className="text-[24px] font-[700]">Tell us about your brand</div>
            <div className="text-textItemBlur">
              Every post we write and every image we make follows this.
            </div>
          </div>
          <BrandForm
            autoAnalyzeUrl={!brand ? website.trim() || undefined : undefined}
            saveLabel="Save and continue"
            onSaved={() => go('channels')}
          />
          <div>
            <button
              type="button"
              className="text-[14px] text-textItemBlur underline"
              onClick={() => go('project')}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {step === 'channels' && (
        <div className="flex flex-col gap-[16px]">
          <div className="flex flex-col gap-[4px]">
            <div className="text-[24px] font-[700]">
              Connect your social accounts
            </div>
            <div className="text-textItemBlur">
              Choose where your posts go. Click a network, log in, pick your
              page, and you are back here.
            </div>
          </div>
          <ChannelsPanel returnTo="/start" />
          <div className="flex justify-between items-center gap-[12px]">
            <span className="text-[14px] text-textItemBlur">
              {channels.length
                ? ''
                : 'You can connect accounts later from the Accounts page.'}
            </span>
            <Button
              onClick={() => go(brand ? 'done' : 'brand')}
              className="rounded-[8px] !h-[48px] px-[32px]"
            >
              {channels.length ? 'Continue' : 'Continue without accounts'}
            </Button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <Card className="items-center text-center py-[48px]">
          <div className="w-[64px] h-[64px] rounded-full bg-forth text-white text-[32px] flex items-center justify-center">
            ✓
          </div>
          <div className="text-[26px] font-[700]">You are all set</div>
          <div className="text-textItemBlur max-w-[520px]">
            Your brand is saved
            {channels.length
              ? ` and ${channels.length} account${
                  channels.length > 1 ? 's are' : ' is'
                } connected`
              : ''}
            . Now let us write your first post: pick a topic and we do the
            rest.
          </div>
          <Button
            onClick={() => router.push('/create')}
            className="rounded-[8px] !h-[52px] px-[40px] text-[16px]"
          >
            Create my first post
          </Button>
        </Card>
      )}
    </div>
  );
};
