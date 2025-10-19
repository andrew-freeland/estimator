// @module: estimator_page
// Estimator Assistant main page
// Simplified chat interface for contractors

"use client";

import { useState } from "react";
import SimplifiedChatBot from "@/components/simplified-chat-bot";
import { generateUUID } from "@/lib/utils";

export default function EstimatorPage() {
  const [threadId] = useState(() => generateUUID());

  return (
    <div className="flex h-screen">
      {/* Main Chat Interface */}
      <div className="flex-1 flex flex-col">
        <SimplifiedChatBot threadId={threadId} initialMessages={[]} />
      </div>
    </div>
  );
}
