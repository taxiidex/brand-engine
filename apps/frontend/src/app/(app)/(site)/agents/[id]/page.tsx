import { PRODUCT_NAME } from '@gitroom/frontend/components/brand/product';
import { Metadata } from 'next';
import { Agent } from '@gitroom/frontend/components/agents/agent';
import { AgentChat } from '@gitroom/frontend/components/agents/agent.chat';
export const metadata: Metadata = {
  title: `${PRODUCT_NAME} - Agent`,
  description: '',
};
export default async function Page() {
  return (
    <AgentChat />
  );
}
