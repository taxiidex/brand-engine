export const dynamic = 'force-dynamic';
import { PRODUCT_NAME } from '@gitroom/frontend/components/brand/product';
import { Forgot } from '@gitroom/frontend/components/auth/forgot';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${PRODUCT_NAME} Forgot Password`,
  description: '',
};
export default async function Auth() {
  return <Forgot />;
}
