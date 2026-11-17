"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError("Accesso non riuscito. Riprova.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={signIn}
        disabled={loading}
        className="brutal-btn w-full bg-white disabled:opacity-60"
      >
        {loading ? "Reindirizzamento…" : "Continua con Google"}
      </button>
      {error && (
        <p role="alert" className="border-[3px] border-ink bg-brand-red p-2 text-sm font-bold">
          {error}
        </p>
      )}
    </div>
  );
}
