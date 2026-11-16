export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { ChannelsPage } from '@gitroom/frontend/components/brand/pages';
import { PRODUCT_NAME } from '@gitroom/frontend/components/brand/product';
export const metadata: Metadata = {
  title: `${PRODUCT_NAME} - Accounts`,
  description: '',
};
export default async function Index() {
  return <ChannelsPage />;
}
