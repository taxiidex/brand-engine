'use client';

import { productInitials } from '@gitroom/frontend/components/ui/logo-text.component';
import { PRODUCT_NAME } from '@gitroom/frontend/components/brand/product';

// The product mark at the top of the menu
export const Logo = () => {
  return (
    <div
      aria-label={PRODUCT_NAME}
      title={PRODUCT_NAME}
      className="mt-[8px] w-[48px] h-[48px] rounded-[14px] bg-gradient-to-br from-[#7C4DFF] to-[#FF5C8A] flex items-center justify-center text-white text-[18px] font-[800] tracking-[0.02em]"
    >
      {productInitials()}
    </div>
  );
};
