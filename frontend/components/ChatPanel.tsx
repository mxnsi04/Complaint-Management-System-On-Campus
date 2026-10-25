"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageCircle } from "lucide-react";

interface ChatMessage {
  message_id: number;
  complaint_id: number;
  sender_id: number;
  sender_role: "student" | "staff" | "admin";
  message: string;
  sent_at: string;
}

interface ChatPanelProps {
  complaintId: number | string;
}

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

export default function ChatPanel({ complaintId }: ChatPanelProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Load chat history and connect to socket
  useEffect(() => {
    if (!user || !complaintId) return;

    // Fetch existing chat history
    api.get(`/chat/${complaintId}/messages`).then((res) => {
      setMessages(Array.isArray(res.data) ? res.data : []);
    });

    // Connect to Socket.IO
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join_complaint", complaintId);
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("receive_message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.emit("leave_complaint", complaintId);
      socket.disconnect();
    };
  }, [complaintId, user]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!newMessage.trim() || !user || !socketRef.current) return;

    socketRef.current.emit("send_message", {
      complaint_id: Number(complaintId),
      sender_id: user.id,
      sender_role: user.role,
      message: newMessage.trim(),
    });

    setNewMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageCircle className="w-4 h-4" />
          Live Chat
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${connected ? "bg-green-500/20 text-green-600" : "bg-muted text-muted-foreground"}`}>
          {connected ? "● Connected" : "○ Connecting..."}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ maxHeight: "320px" }}>
        {messages.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground pt-4">
            No messages yet. Start the conversation!
          </p>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === user?.id && msg.sender_role === user?.role;
            return (
              <div key={msg.message_id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                <div className={`rounded-xl px-3 py-2 text-sm max-w-[80%] ${isMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                  {msg.message}
                </div>
                <span className="text-[10px] text-muted-foreground mt-1 px-1">
                  {msg.sender_role === "student" ? "Student" : "Staff"} ·{" "}
                  {new Date(msg.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 p-3 border-t border-border">
        <Input
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 text-sm"
        />
        <Button size="icon" onClick={handleSend} disabled={!newMessage.trim() || !connected}>
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
