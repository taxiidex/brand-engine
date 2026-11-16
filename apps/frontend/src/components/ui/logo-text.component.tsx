import React from 'react';
import { PRODUCT_NAME } from '@gitroom/frontend/components/brand/product';

// the product's initials, e.g. "Brand Engine" -> "BE"
export const productInitials = () =>
  PRODUCT_NAME.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

// The mark and the name, on the sign-in pages
export const LogoTextComponent = () => {
  return (
    <div className="flex items-center gap-[10px]">
      <div className="w-[34px] h-[34px] rounded-[9px] bg-gradient-to-br from-[#7C4DFF] to-[#FF5C8A] flex items-center justify-center text-white text-[14px] font-[800] tracking-[0.02em]">
        {productInitials()}
      </div>
      <div className="text-[20px] font-[700] text-white">{PRODUCT_NAME}</div>
    </div>
  );
};
