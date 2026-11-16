import { PRODUCT_NAME } from '@gitroom/frontend/components/brand/product';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} - Agent`,
  description: '',
};

export default async function Page() {
  return redirect('/agents/new');
}
