export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { CreatePost } from '@gitroom/frontend/components/brand/create.post';
import { PRODUCT_NAME } from '@gitroom/frontend/components/brand/product';
export const metadata: Metadata = {
  title: `${PRODUCT_NAME} - Create a post`,
  description: '',
};
export default async function Index() {
  return <CreatePost />;
}
