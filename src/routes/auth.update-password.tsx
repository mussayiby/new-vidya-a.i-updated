import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/update-password")({
  component: UpdatePasswordPage,
});

function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setMessage(error.message);
    else {
      setMessage("Password updated! Redirecting...");
      setTimeout(() => (window.location.href = "/login"), 1500);
    }
    setLoading(false);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute -top-32 -right-32 size-[28rem] rounded-full bg-primary/10 blur-3xl" />
      <form onSubmit={handleUpdate} className="relative z-10 w-full max-w-sm space-y-4 rounded-2xl border border-border/80 bg-card p-6 shadow-float">
        <h1 className="text-xl font-bold">Set new password</h1>
        <input
          type="password"
          placeholder="New password (min 6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          required
          minLength={6}
        />
        <button disabled={loading} className="w-full rounded-lg bg-primary py-2 font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">
          {loading ? "Updating..." : "Update password"}
        </button>
        {message && <p className="text-sm text-center">{message}</p>}
      </form>
    </main>
  );
  }
