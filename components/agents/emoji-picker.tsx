// components/agents/emoji-picker.tsx
// Emoji 选择器 — 暗色终端风格

"use client";

import React, { useState } from "react";

const EMOJI_LIST = [
  "📋", "📝", "🔍", "🎭", "✏️", "🎨", "💬", "🎪", "🔎", "🤖",
  "🧠", "⚡", "🎯", "🔬", "📊", "🛠️", "🌐", "📡", "🧩", "🎲",
  "⭐", "🌟", "💡", "🔮", "🗂️", "📁", "📎", "🔗", "⚙️", "🧪",
  "🔭", "🛡️", "⚖️", "📜", "🗺️", "🎵", "🎬", "🏗️", "🧬", "🔐",
];

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 h-8 px-2 border border-border bg-background text-lg hover:border-border transition-colors"
      >
        {value}
        <span className="text-[11px] font-mono text-muted-foreground/60">▼</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 right-0 z-50 bg-card border border-border p-2 min-w-[260px]">
            <div className="grid grid-cols-7 gap-1">
              {EMOJI_LIST.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => { onChange(em); setOpen(false); }}
                  className={`w-8 h-8 flex items-center justify-center text-base transition-colors ${
                    value === em
                      ? "bg-[#00cc66]/20 border border-[#00cc66]"
                      : "hover:bg-muted"
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
