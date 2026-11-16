import { PRODUCT_NAME } from '@gitroom/frontend/components/brand/product';
import { MediaLayoutComponent } from '@gitroom/frontend/components/new-layout/layout.media.component';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} Media`,
  description: '',
};

export default async function Page() {
  return <MediaLayoutComponent />
}
