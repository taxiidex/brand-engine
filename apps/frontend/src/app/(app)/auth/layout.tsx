import { getT } from '@gitroom/react/translation/get.translation.service.backend';

export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Toaster } from '@gitroom/react/toaster/toaster';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getT();

  return (
    <MantineWrapper>
      <Toaster />
      <div className="bg-[#0E0E0E] flex flex-1 p-[12px] gap-[12px] min-h-screen w-screen text-white">
        {/*<style>{`html, body {overflow-x: hidden;}`}</style>*/}
        <ReturnUrlComponent />
        <div className="flex flex-col py-[40px] px-[20px] flex-1 lg:w-[600px] lg:flex-none rounded-[12px] text-white p-[12px] bg-[#1A1919]">
          <div className="w-full max-w-[440px] mx-auto justify-center gap-[20px] h-full flex flex-col text-white">
            <LogoTextComponent />
            <div className="flex">{children}</div>
          </div>
        </div>
        <div className="flex-1 pt-[88px] px-[40px] hidden lg:flex flex-col items-center">
          <div className="max-w-[560px] flex flex-col gap-[28px]">
            <div className="text-[40px] font-[700] leading-[1.15]">
              Social posts that look{' '}
              <span className="text-[#FF5C8A]">designed</span>, written in{' '}
              <span className="text-[#9E7BFF]">your voice</span>.
            </div>
            <div className="flex flex-col gap-[18px] text-[17px] text-[#C9C9CF]">
              <div>
                <span className="text-white font-[600]">Knows your business.</span>{' '}
                We read your website and turn what you actually offer into post
                ideas.
              </div>
              <div>
                <span className="text-white font-[600]">Every post is different.</span>{' '}
                Fresh angles, hooks and designs, from bold to funny to calm.
              </div>
              <div>
                <span className="text-white font-[600]">Posted for you.</span>{' '}
                Facebook, Instagram, LinkedIn, X and more, now or on schedule.
              </div>
            </div>
          </div>
        </div>
      </div>
    </MantineWrapper>
  );
}
