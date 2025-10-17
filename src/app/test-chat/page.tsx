// @module: test_chat_page
// Simple test page for the minimal chat interface

import SimpleChat from "@/components/simple-chat";

export default function TestChatPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto py-8">
        <SimpleChat className="h-[600px]" />
      </div>
    </div>
  );
}
