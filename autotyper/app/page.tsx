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
    <div className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-10 sm:px-8">
        <header className="mb-8">
          <p
            className="mb-3 font-mono text-[11px] uppercase tracking-[0.28em]"
            style={{ color: "var(--muted)" }}
          >
            remote → local
          </p>
          <h1
            className="text-5xl font-extrabold tracking-tight sm:text-6xl"
            style={{ letterSpacing: "-0.04em" }}
          >
            AutoTyper
          </h1>
          <p className="mt-3 max-w-md text-base leading-relaxed" style={{ color: "var(--muted)" }}>
            Drop text here. Your local <span className="font-mono text-[var(--ink)]">ar start</span>{" "}
            agent types it via keyboard only (no clipboard) — works even when paste is blocked.
          </p>
        </header>

        <label className="mb-2 block font-mono text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Shared secret
        </label>
        <input
          type="password"
          value={secret}
          onChange={(e) => persistSecret(e.target.value)}
          placeholder="AR_SECRET"
          className="mb-5 w-full rounded-md border px-3 py-2.5 font-mono text-sm outline-none transition focus:border-[var(--accent)]"
          style={{
            background: "var(--bg-elevated)",
            borderColor: "var(--line)",
            color: "var(--ink)",
          }}
        />

        <label className="mb-2 block font-mono text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Text to deliver
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste or type the content your machine should output…"
          rows={10}
          className="w-full resize-y rounded-md border px-3 py-3 font-mono text-sm leading-relaxed outline-none transition focus:border-[var(--accent)]"
          style={{
            background: "var(--bg-elevated)",
            borderColor: "var(--line)",
            color: "var(--ink)",
            minHeight: "220px",
          }}
        />

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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

          <button
            type="button"
            onClick={onSend}
            disabled={pending}
            className="rounded-md px-5 py-2.5 font-semibold tracking-wide transition disabled:opacity-50"
            style={{
              background: "var(--accent)",
              color: "#0b120c",
            }}
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </div>

        <p className="mt-4 min-h-[1.25rem] font-mono text-sm" style={{ color: error ? "var(--danger)" : "var(--accent)" }}>
          {error || message || ""}
        </p>

        <footer className="mt-10 border-t pt-4 font-mono text-xs leading-relaxed" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
          Output goes into whatever window has your typing cursor. Local:{" "}
          <code className="text-[var(--ink)]">ar start</code>. On Vercel, set Upstash Redis env vars so jobs persist.
        </footer>
      </main>
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
