import ChatBot from "@/components/chat-bot";
import SimplifiedChatBot from "@/components/simplified-chat-bot";
import { generateUUID } from "lib/utils";
import { getSession } from "auth/server";
import { TemporaryWorkNotice } from "@/components/temporary-work-notice";
import { isGuestMode } from "lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  const id = generateUUID();

  // In guest mode, always use SimplifiedChatBot without session check
  if (isGuestMode) {
    console.log("HomePage: Guest mode enabled - using SimplifiedChatBot");
    return (
      <div className="flex flex-col h-full">
        <SimplifiedChatBot initialMessages={[]} threadId={id} key={id} />
      </div>
    );
  }

  // Normal auth mode - check session
  const session = await getSession();

  return (
    <div className="flex flex-col h-full">
      {!session && <TemporaryWorkNotice />}
      {session ? (
        <ChatBot initialMessages={[]} threadId={id} key={id} />
      ) : (
        <SimplifiedChatBot initialMessages={[]} threadId={id} key={id} />
      )}
    </div>
  );
}
