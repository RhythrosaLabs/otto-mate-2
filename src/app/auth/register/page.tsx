"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
      } else {
        router.push("/computer");
      }
    } catch {
      setError("Network error, please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🖥️</div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Create your account</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Free to start — upgrade anytime on our{" "}
            <Link href="/pricing" className="underline" style={{ color: "var(--accent)" }}>
              pricing page
            </Link>
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl p-6 border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { label: "Name", type: "text", value: name, onChange: setName, placeholder: "Ada Lovelace", autoComplete: "name" },
              { label: "Email", type: "email", value: email, onChange: setEmail, placeholder: "you@example.com", autoComplete: "email" },
              { label: "Password", type: "password", value: password, onChange: setPassword, placeholder: "••••••••", autoComplete: "new-password" },
              { label: "Confirm password", type: "password", value: confirm, onChange: setConfirm, placeholder: "••••••••", autoComplete: "new-password" },
            ].map((field) => (
              <div key={field.label}>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text)" }}>{field.label}</label>
                <input
                  type={field.type}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  required
                  autoComplete={field.autoComplete}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors"
                  style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                />
              </div>
            ))}

            {error && (
              <p className="text-sm rounded-lg px-3 py-2" style={{ background: "#3f1a1a", color: "#f87171" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-medium text-sm transition-opacity disabled:opacity-60"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-4" style={{ color: "var(--muted)" }}>
          Already have an account?{" "}
          <Link href="/auth/login" className="font-medium" style={{ color: "var(--accent)" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
