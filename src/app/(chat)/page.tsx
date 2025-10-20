import ChatBot from "@/components/chat-bot";
import SimplifiedChatBot from "@/components/simplified-chat-bot";
import { generateUUID } from "lib/utils";
import { TemporaryWorkNotice } from "@/components/temporary-work-notice";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const id = generateUUID();

  return (
    <div className="flex flex-col h-full">
      <TemporaryWorkNotice />
      <SimplifiedChatBot initialMessages={[]} threadId={id} key={id} />
    </div>
  );
}
