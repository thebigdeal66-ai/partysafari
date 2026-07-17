"use client";

import { useState } from "react";

type Conversation = {
  id: string;
  name: string;
  lastMessage: string;
  unread: boolean;
};

type Message = {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
};

const mockConversations: Conversation[] = [
  {
    id: "1",
    name: "DJ Shadow",
    lastMessage: "Looking forward to the event!",
    unread: true,
  },
  {
    id: "2",
    name: "Singer Luna",
    lastMessage: "Can we discuss the setlist?",
    unread: false,
  },
  {
    id: "3",
    name: "Band Echo",
    lastMessage: "Confirmed for Saturday night.",
    unread: false,
  },
];

const mockMessages: Record<string, Message[]> = {
  "1": [
    {
      id: "1",
      sender: "DJ Shadow",
      text: "Hi, I'm interested in your party request.",
      timestamp: "2023-10-01 10:00",
    },
    {
      id: "2",
      sender: "You",
      text: "Great! Let's discuss details.",
      timestamp: "2023-10-01 10:05",
    },
    {
      id: "3",
      sender: "DJ Shadow",
      text: "Looking forward to the event!",
      timestamp: "2023-10-01 10:10",
    },
  ],
  "2": [
    {
      id: "1",
      sender: "Singer Luna",
      text: "Hello, I saw your request.",
      timestamp: "2023-10-02 14:00",
    },
    {
      id: "2",
      sender: "You",
      text: "Hi Luna, yes, we'd love to have you.",
      timestamp: "2023-10-02 14:05",
    },
    {
      id: "3",
      sender: "Singer Luna",
      text: "Can we discuss the setlist?",
      timestamp: "2023-10-02 14:10",
    },
  ],
  "3": [
    {
      id: "1",
      sender: "Band Echo",
      text: "We're available for your event.",
      timestamp: "2023-10-03 16:00",
    },
    {
      id: "2",
      sender: "You",
      text: "Perfect, confirmed for Saturday night.",
      timestamp: "2023-10-03 16:05",
    },
  ],
};

export default function MessagesPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    mockConversations[0]?.id || null
  );

  const selectedConversation = mockConversations.find(
    (conv) => conv.id === selectedConversationId
  );

  const messages = selectedConversationId
    ? mockMessages[selectedConversationId] || []
    : [];

  return (
    <main className="min-h-screen bg-[#07070B] px-6 py-6 text-white">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[.4fr_1fr]">
        {/* Sidebar */}
        <section className="space-y-4">
          <h1 className="text-2xl font-bold">💬 Messages</h1>
          <div className="space-y-2">
            {mockConversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => setSelectedConversationId(conversation.id)}
                className={`block w-full rounded-2xl border p-4 text-left transition ${
                  selectedConversationId === conversation.id
                    ? "border-violet-400/40 bg-violet-500/10"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{conversation.name}</h3>
                  {conversation.unread && (
                    <span className="h-2 w-2 rounded-full bg-violet-500"></span>
                  )}
                </div>
                <p className="mt-1 text-sm text-white/60">
                  {conversation.lastMessage}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* Main Chat Area */}
        <section className="space-y-6">
          {selectedConversation ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-xl font-semibold">
                  Chat with {selectedConversation.name}
                </h2>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-xl p-4 ${
                        message.sender === "You"
                          ? "bg-violet-600/20 ml-auto max-w-xs"
                          : "bg-white/10 mr-auto max-w-xs"
                      }`}
                    >
                      <p className="text-sm font-medium">{message.sender}</p>
                      <p className="mt-1">{message.text}</p>
                      <p className="mt-2 text-xs text-white/50">
                        {message.timestamp}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mock input area - not functional */}
              <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-6">
                <textarea
                  placeholder="Type your message..."
                  className="min-h-[80px] w-full rounded bg-white p-3 text-black"
                  disabled
                />
                <button
                  className="mt-4 w-full rounded bg-violet-600 p-3 font-medium"
                  disabled
                >
                  Send Message (Mock)
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/60">
              Select a conversation to start chatting.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}