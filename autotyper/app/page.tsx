"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";

type Mode = "paste" | "type";

const SECRET_KEY = "ar-secret";

export default function Home() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("type");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SECRET_KEY);
      if (saved) setSecret(saved);
    } catch {
      /* ignore */
    }
  }, []);

  function persistSecret(value: string) {
    setSecret(value);
    try {
      localStorage.setItem(SECRET_KEY, value);
    } catch {
      /* ignore */
    }
  }

  function onSend() {
    setMessage(null);
    setError(null);

    if (!text.trim()) {
      setError("Add some text first.");
      return;
    }
    if (!secret.trim()) {
      setError("Set the shared secret (same as AR_SECRET on the server / CLI).");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-ar-secret": secret.trim(),
          },
          body: JSON.stringify({ text, mode }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || `Send failed (${res.status})`);
          return;
        }
        setMessage(
          mode === "paste"
            ? `Queued for fast keyboard type · ${data.job?.id ?? ""}`
            : `Queued for typing mimic · ${data.job?.id ?? ""}`,
        );
        setText("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      }
    });
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col px-4 py-4 sm:px-6 sm:py-5">
      <header className="mb-3 flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <p
            className="mb-1 font-mono text-[10px] uppercase tracking-[0.28em]"
            style={{ color: "var(--muted)" }}
          >
            remote → local
          </p>
          <h1
            className="text-3xl font-extrabold tracking-tight sm:text-4xl"
            style={{ letterSpacing: "-0.04em" }}
          >
            AutoTyper
          </h1>
        </div>

        <div className="flex min-w-[220px] flex-1 flex-col sm:max-w-xs">
          <label
            className="mb-1 font-mono text-[10px] uppercase tracking-wider"
            style={{ color: "var(--muted)" }}
          >
            Shared secret
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => persistSecret(e.target.value)}
            placeholder="AR_SECRET"
            className="w-full rounded-md border px-3 py-2 font-mono text-sm outline-none transition focus:border-[var(--accent)]"
            style={{
              background: "var(--bg-elevated)",
              borderColor: "var(--line)",
              color: "var(--ink)",
            }}
          />
        </div>
      </header>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste or type the content your machine should output…"
        className="min-h-0 w-full flex-1 resize-none rounded-md border px-4 py-4 font-mono text-sm leading-relaxed outline-none transition focus:border-[var(--accent)]"
        style={{
          background: "var(--bg-elevated)",
          borderColor: "var(--line)",
          color: "var(--ink)",
        }}
      />

      <div className="mt-3 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="inline-flex rounded-md border p-1"
            style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
            role="group"
            aria-label="Delivery mode"
          >
            <ModeButton active={mode === "type"} onClick={() => setMode("type")}>
              Typing mimic
            </ModeButton>
            <ModeButton active={mode === "paste"} onClick={() => setMode("paste")}>
              Fast type
            </ModeButton>
          </div>
          <p
            className="min-h-[1.25rem] font-mono text-sm"
            style={{ color: error ? "var(--danger)" : "var(--accent)" }}
          >
            {error || message || ""}
          </p>
        </div>

        <button
          type="button"
          onClick={onSend}
          disabled={pending}
          className="rounded-md px-6 py-2.5 font-semibold tracking-wide transition disabled:opacity-50"
          style={{
            background: "var(--accent)",
            color: "#0b120c",
          }}
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition"
      style={{
        background: active ? "var(--accent-dim)" : "transparent",
        color: active ? "var(--ink)" : "var(--muted)",
      }}
    >
      {children}
    </button>
  );
}
