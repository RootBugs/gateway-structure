"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function TermsAcceptPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check if user is authenticated
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) {
          router.push("/login");
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          // If already accepted, redirect to dashboard
          if (data.user.termsAcceptedAt) {
            router.push("/dashboard");
          }
        }
        setChecking(false);
      })
      .catch(() => {
        router.push("/login");
        setChecking(false);
      });
  }, [router]);

  async function handleAccept() {
    if (!accepted) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/accept-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to accept terms");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* Minimal Nav */}
      <nav className="border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">Kw</span>
            </div>
            <span className="font-semibold">Kwen Gateway</span>
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 sm:p-10">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/20">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold">Terms &amp; Conditions</h1>
              <p className="text-zinc-400 mt-2 text-sm">
                Please review and accept our terms to continue using Kwen Gateway
              </p>
              {user && (
                <p className="text-zinc-500 text-xs mt-2">
                  Signed in as <span className="text-zinc-300">{user.email}</span>
                </p>
              )}
            </div>

            {/* Terms Content */}
            <div className="mb-8 max-h-80 overflow-y-auto rounded-xl border border-white/5 bg-black/20 p-5 text-sm text-zinc-400 space-y-4 leading-relaxed custom-scrollbar">
              <h3 className="text-zinc-200 font-semibold text-base">1. Acceptance of Terms</h3>
              <p>
                By accessing or using Kwen Gateway (&ldquo;the Service&rdquo;), you agree to be bound by these 
                Terms &amp; Conditions. If you do not agree, do not use the Service.
              </p>

              <h3 className="text-zinc-200 font-semibold text-base">2. Description of Service</h3>
              <p>
                Kwen Gateway provides an AI API gateway that routes requests to multiple third-party AI providers. 
                We act as an intermediary and are not responsible for the output, accuracy, or availability of 
                third-party AI models.
              </p>

              <h3 className="text-zinc-200 font-semibold text-base">3. User Responsibilities</h3>
              <ul className="list-disc list-inside space-y-1">
                <li>You must keep your API keys confidential</li>
                <li>You are responsible for all activity under your API keys</li>
                <li>You must not use the Service for any illegal or unauthorized purpose</li>
                <li>You must not attempt to circumvent rate limits or access controls</li>
              </ul>

              <h3 className="text-zinc-200 font-semibold text-base">4. API Key Management</h3>
              <p>
                API keys are hashed using bcrypt before storage. Full keys are displayed only once at creation. 
                You may create, revoke, and rename keys from your dashboard. Revoked keys cannot be reactivated.
              </p>

              <h3 className="text-zinc-200 font-semibold text-base">5. Rate Limiting &amp; Fair Use</h3>
              <p>
                Usage is subject to rate limits per API key per time window. Excessive usage may result in 
                temporary suspension. We reserve the right to adjust rate limits to ensure fair access for all users.
              </p>

              <h3 className="text-zinc-200 font-semibold text-base">6. Data &amp; Privacy</h3>
              <p>
                We log request metadata (model, tokens, latency, status) for auditing and optimization. 
                Request content is not stored permanently. See our Privacy Policy for full details.
              </p>

              <h3 className="text-zinc-200 font-semibold text-base">7. Third-Party Providers</h3>
              <p>
                Kwen Gateway routes requests to third-party AI providers. Each provider has its own terms of 
                service and privacy policy. By using the Service, you also agree to be bound by the terms of 
                the providers your requests are routed to.
              </p>

              <h3 className="text-zinc-200 font-semibold text-base">8. Limitation of Liability</h3>
              <p>
                Kwen Gateway is provided &ldquo;as is&rdquo; without any warranty. We are not liable for any 
                damages arising from the use or inability to use the Service, including but not limited to 
                downtime, data loss, or third-party provider failures.
              </p>

              <h3 className="text-zinc-200 font-semibold text-base">9. Modifications</h3>
              <p>
                We reserve the right to modify these terms at any time. Users will be notified of material 
                changes via email or in-app notification. Continued use after changes constitutes acceptance.
              </p>

              <h3 className="text-zinc-200 font-semibold text-base">10. Termination</h3>
              <p>
                We may suspend or terminate access to the Service at any time for violation of these terms 
                or for any other reason at our discretion.
              </p>
            </div>

            {/* Accept Checkbox */}
            <div className="flex items-start gap-3 mb-6">
              <input
                type="checkbox"
                id="accept-terms"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-white/10 bg-white/5 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
              />
              <label htmlFor="accept-terms" className="text-sm text-zinc-300 cursor-pointer select-none">
                I have read and agree to the{" "}
                <Link href="/terms" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                  Terms &amp; Conditions
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                  Privacy Policy
                </Link>
                .
              </label>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 mb-4">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleAccept}
              disabled={!accepted || loading}
              className="w-full py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/20"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Processing...
                </span>
              ) : (
                "Accept & Continue"
              )}
            </button>
          </div>

          <p className="text-center text-xs text-zinc-600 mt-6">
            You must accept the Terms &amp; Conditions to use Kwen Gateway
          </p>
        </div>
      </div>
    </div>
  );
}
