export const dynamic = 'force-dynamic';
import { PRODUCT_NAME } from '@gitroom/frontend/components/brand/product';
import { Metadata } from 'next';
import { AfterActivate } from '@gitroom/frontend/components/auth/after.activate';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${PRODUCT_NAME} - Activate your account`,
  description: '',
};
export default async function Auth() {
  return <AfterActivate />;
}
