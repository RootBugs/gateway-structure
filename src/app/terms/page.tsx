import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions — Kwen Gateway",
  description: "Terms and Conditions for using Kwen Gateway — AI API Gateway service.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Nav */}
      <nav className="border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <span className="text-white font-bold text-xs">Kw</span>
              </div>
              <span className="font-semibold">Kwen Gateway</span>
              <span className="text-xs text-zinc-600 ml-1">/ Terms</span>
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-bold mb-3">Terms &amp; Conditions</h1>
        <p className="text-zinc-500 text-sm mb-10">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

        <div className="space-y-8 text-zinc-400 text-sm sm:text-base leading-relaxed">
          <section>
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-200 mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Kwen Gateway (&ldquo;the Service&rdquo;), you agree to be bound by these 
              Terms &amp; Conditions. If you do not agree to all the terms, you may not access or use the Service.
              These terms apply to all users, visitors, and others who access or use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-200 mb-3">2. Description of Service</h2>
            <p>
              Kwen Gateway provides an AI API gateway that routes requests to multiple third-party AI providers.
              The Service includes smart routing, circuit breaking, rate limiting, API key management, 
              request logging, and provider health monitoring.
            </p>
            <p className="mt-3">
              Kwen Gateway acts as an intermediary between users and third-party AI providers. We do not 
              control, endorse, or assume responsibility for the content, accuracy, or availability of 
              third-party AI models accessed through the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-200 mb-3">3. User Accounts &amp; API Keys</h2>
            <p>You are responsible for:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Maintaining the confidentiality of your account credentials and API keys</li>
              <li>All activities that occur under your account or API keys</li>
              <li>Notifying us immediately of any unauthorized use of your account</li>
              <li>Ensuring your use complies with applicable laws and regulations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-200 mb-3">4. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Use the Service for any illegal or unauthorized purpose</li>
              <li>Attempt to circumvent rate limits, access controls, or security measures</li>
              <li>Reverse engineer, decompile, or disassemble the Service</li>
              <li>Interfere with or disrupt the integrity or performance of the Service</li>
              <li>Use the Service to generate harmful, abusive, or deceptive content</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-200 mb-3">5. Data &amp; Privacy</h2>
            <p>
              We collect and process certain data as described in our Privacy Policy. By using the Service,
              you consent to such processing. Key points:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Request metadata (model, tokens, latency, status, provider) is logged for auditing</li>
              <li>Request and response content is not stored permanently</li>
              <li>API keys are hashed with bcrypt — we never store raw keys</li>
              <li>Usage data is aggregated for routing optimization</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-200 mb-3">6. Third-Party Providers</h2>
            <p>
              Kwen Gateway routes requests to various third-party AI providers including but not limited to 
              Google Gemini, Groq, OpenRouter, Cerebras, SambaNova, Cohere, Hugging Face, Together AI, 
              Fireworks AI, Ollama, and vLLM.
            </p>
            <p className="mt-3">
              Each provider has its own terms of service, privacy policy, and usage guidelines. By using 
              Kwen Gateway, you acknowledge that your requests may be subject to the terms of these 
              third-party providers. We recommend reviewing their respective policies.
            </p>
          </section>

          <section>
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-200 mb-3">7. Rate Limits &amp; Fair Use</h2>
            <p>
              Usage is subject to rate limits applied per API key per time window. Limits may be adjusted 
              based on tier, usage patterns, and overall system capacity. Excessive or abusive usage may 
              result in temporary or permanent suspension of access.
            </p>
          </section>

          <section>
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-200 mb-3">8. Service Availability</h2>
            <p>
              While we strive for high availability, we do not guarantee uninterrupted access to the Service.
              Kwen Gateway includes circuit breaker and failover mechanisms to mitigate provider outages,
              but we are not responsible for downtime caused by third-party providers, infrastructure issues,
              or maintenance windows.
            </p>
          </section>

          <section>
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-200 mb-3">9. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Kwen Gateway and its operators shall not be liable 
              for any indirect, incidental, special, consequential, or punitive damages, including but not 
              limited to loss of profits, data, use, goodwill, or other intangible losses resulting from:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Your use or inability to use the Service</li>
              <li>Any conduct or content of any third party on the Service</li>
              <li>Unauthorized access to or alteration of your transmissions or data</li>
              <li>Statements or conduct of any third party on the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-200 mb-3">10. Modifications to Terms</h2>
            <p>
              We reserve the right to modify these terms at any time. We will notify users of material 
              changes via email or in-app notification. Your continued use of the Service after such 
              modifications constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-200 mb-3">11. Termination</h2>
            <p>
              We may terminate or suspend your account and access to the Service at any time, without prior 
              notice, for conduct that we believe violates these Terms or is harmful to other users, us, 
              or third parties, or for any other reason at our sole discretion.
            </p>
          </section>

          <section>
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-200 mb-3">12. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the applicable laws, 
              without regard to its conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-200 mb-3">13. Contact</h2>
            <p>
              For questions about these Terms, please contact us through our support channels or 
              reach out via the contact information provided on our website.
            </p>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Kwen Gateway</span>
          </Link>
          <div className="flex items-center gap-5 text-xs text-zinc-500">
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms</Link>
            <Link href="/docs" className="hover:text-zinc-300 transition-colors">Docs</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
