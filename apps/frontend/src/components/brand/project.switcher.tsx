'use client';

import React, { FC, useCallback, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { errorMessage, inputClass } from '@gitroom/frontend/components/brand/ui';

// Shows the current project and lets the client switch projects or start a
// new one. A project is a Postiz organization; switching reuses Postiz's own
// /user/change-org.
export const ProjectSwitcher: FC = () => {
  const fetch = useFetch();
  const toaster = useToaster();
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    return (await fetch('/user/organizations')).json();
  }, []);
  const { data } = useSWR('organizations', load);
  const projects: { id: string; name: string }[] = Array.isArray(data)
    ? data
    : [];
  const current = projects.find((p) => p.id === user?.orgId);

  const switchTo = useCallback(async (id: string, path: string) => {
    setBusy(true);
    await fetch('/user/change-org', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    window.location.href = path;
  }, []);

  const create = useCallback(async () => {
    if (name.trim().length < 2) {
      toaster.show('Give the new project a name.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/projects', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        toaster.show(
          await errorMessage(res, 'We could not create the project.'),
          'warning'
        );
        setBusy(false);
        return;
      }
      const project = await res.json();
      // a new project starts with the guided setup
      await switchTo(project.id, '/start');
    } catch (err) {
      setBusy(false);
    }
  }, [name, switchTo]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-[8px] h-[40px] px-[12px] rounded-[8px] border border-newTableBorder text-newTextColor max-w-[240px] hover:border-forth"
      >
        <span className="text-[12px] text-textItemBlur mobile:hidden">
          Project
        </span>
        <span className="text-[14px] font-[600] truncate">
          {current?.name || '...'}
        </span>
        <span className="text-[10px]">▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[499]" onClick={() => setOpen(false)} />
          <div className="absolute end-0 top-[48px] z-[500] w-[300px] bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[8px] shadow-lg flex flex-col gap-[4px]">
            <div className="px-[8px] py-[4px] text-[12px] text-textItemBlur">
              Your projects
            </div>
            {projects.map((p) => (
              <button
                type="button"
                key={p.id}
                disabled={busy}
                onClick={() =>
                  p.id === user?.orgId ? setOpen(false) : switchTo(p.id, '/create')
                }
                className={clsx(
                  'text-start px-[8px] py-[8px] rounded-[8px] text-[14px] hover:bg-boxHover flex justify-between',
                  p.id === user?.orgId && 'font-[600]'
                )}
              >
                <span className="truncate">{p.name}</span>
                {p.id === user?.orgId && <span>✓</span>}
              </button>
            ))}
            <div className="border-t border-newTableBorder mt-[4px] pt-[8px] flex flex-col gap-[8px] px-[4px]">
              <div className="text-[12px] text-textItemBlur px-[4px]">
                New project
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder="Business name"
                className={inputClass}
              />
              <button
                type="button"
                onClick={create}
                disabled={busy}
                className="h-[40px] rounded-[8px] bg-forth text-white text-[14px] disabled:opacity-50"
              >
                {busy ? 'Please wait...' : 'Create project'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
