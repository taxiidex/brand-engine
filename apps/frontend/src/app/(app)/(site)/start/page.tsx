export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { StartWizard } from '@gitroom/frontend/components/brand/start.wizard';
import { PRODUCT_NAME } from '@gitroom/frontend/components/brand/product';
export const metadata: Metadata = {
  title: `${PRODUCT_NAME} - Get started`,
  description: '',
};
export default async function Index() {
  return <StartWizard />;
}
