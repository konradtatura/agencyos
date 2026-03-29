export const metadata = {
  title: 'Privacy Policy — AgencyOS',
}

export default function PrivacyPage() {
  return (
    <div
      style={{ backgroundColor: '#0a0f1e', minHeight: '100vh' }}
      className="py-16 px-6"
    >
      <article className="mx-auto max-w-3xl">

        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 mb-8">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: '#2563eb' }}
            >
              A
            </div>
            <span className="text-sm font-semibold text-[#f9fafb]">AgencyOS</span>
          </div>
          <h1 className="text-3xl font-bold text-[#f9fafb] mb-3">Privacy Policy</h1>
          <p className="text-sm text-[#4b5563]">Last updated: March 2026</p>
        </div>

        <div className="space-y-10 text-sm leading-relaxed text-[#9ca3af]">

          {/* Intro */}
          <Section>
            <p>
              This Privacy Policy describes how <strong className="text-[#f9fafb]">AgencyOS</strong> (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) collects, uses, and protects your personal information when you use our platform.
            </p>
            <p className="mt-3">
              If you have questions or concerns, please contact us at{' '}
              <a href="mailto:kvnradquotes@gmail.com" className="text-[#2563eb] hover:underline">
                kvnradquotes@gmail.com
              </a>.
            </p>
          </Section>

          {/* 1 */}
          <Section heading="1. Information We Collect">
            <p>We collect the following categories of information:</p>
            <ul className="mt-3 space-y-2 list-disc list-inside">
              <li><strong className="text-[#e5e7eb]">Account information</strong> — your name and email address when you register.</li>
              <li><strong className="text-[#e5e7eb]">Instagram account data</strong> — follower counts, post metrics, story insights, DM conversations, and content performance data pulled via the Instagram Graph API when you connect your account.</li>
              <li><strong className="text-[#e5e7eb]">Content metrics</strong> — views, reach, engagement, saves, shares, and similar analytics for your posts and reels.</li>
              <li><strong className="text-[#e5e7eb]">Sales and CRM data</strong> — lead information, pipeline stages, call outcomes, and revenue figures you enter or that are synced from connected payment platforms.</li>
              <li><strong className="text-[#e5e7eb]">Usage data</strong> — standard server logs including IP address, browser type, and pages visited, collected automatically when you use the platform.</li>
            </ul>
          </Section>

          {/* 2 */}
          <Section heading="2. How We Use Your Information">
            <p>We use the information we collect solely to:</p>
            <ul className="mt-3 space-y-2 list-disc list-inside">
              <li>Provide, operate, and improve the AgencyOS platform and its analytics features.</li>
              <li>Display your Instagram and content performance metrics within your dashboard.</li>
              <li>Power agency management features including CRM, sales tracking, and team accountability tools.</li>
              <li>Authenticate your account and maintain platform security.</li>
              <li>Send you important service notifications (e.g. integration token expiry).</li>
              <li>Comply with applicable laws and regulations.</li>
            </ul>
            <p className="mt-3">
              We process your personal information only when we have a valid legal reason to do so, including fulfilling our contractual obligations to you or with your explicit consent.
            </p>
          </Section>

          {/* 3 */}
          <Section heading="3. We Do Not Sell Your Data">
            <p>
              We do <strong className="text-[#f9fafb]">not</strong> sell, rent, trade, or otherwise share your personal information with third parties for their own marketing or commercial purposes.
            </p>
            <p className="mt-3">
              We may share data with third-party service providers (such as Supabase for database hosting, Vercel for deployment, and OpenAI for transcription) strictly to operate the platform. These providers are contractually bound to protect your data and may not use it for any other purpose.
            </p>
          </Section>

          {/* 4 */}
          <Section heading="4. Instagram Data">
            <p>
              When you connect your Instagram Business account, we access your account via the Meta Graph API using permissions you explicitly grant. We store your access tokens securely using AES-256 encryption. We use this data exclusively to display analytics within your AgencyOS dashboard.
            </p>
            <p className="mt-3">
              You can disconnect your Instagram account at any time from your Settings page. Upon disconnection, syncing stops immediately.
            </p>
          </Section>

          {/* 5 */}
          <Section heading="5. Data Retention">
            <p>
              We retain your data for as long as your account is active. If you request account deletion, we will remove your personal data within 30 days, except where retention is required by law.
            </p>
          </Section>

          {/* 6 */}
          <Section heading="6. Data Security">
            <p>
              We implement appropriate technical and organisational measures to protect your personal information, including encrypted storage, HTTPS-only access, and role-based access controls. However, no method of transmission over the internet is 100% secure.
            </p>
          </Section>

          {/* 7 */}
          <Section heading="7. Minors">
            <p>
              AgencyOS is not directed at children under 13. We do not knowingly collect personal information from anyone under 13. If we become aware that we have collected such data, we will delete it promptly.
            </p>
          </Section>

          {/* 8 */}
          <Section heading="8. Your Rights">
            <p>Depending on your location, you may have the right to:</p>
            <ul className="mt-3 space-y-2 list-disc list-inside">
              <li>Access the personal information we hold about you.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request deletion of your data.</li>
              <li>Withdraw consent where processing is based on consent.</li>
              <li>Lodge a complaint with your local data protection authority.</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:kvnradquotes@gmail.com" className="text-[#2563eb] hover:underline">
                kvnradquotes@gmail.com
              </a>.
            </p>
          </Section>

          {/* 9 */}
          <Section heading="9. Updates to This Policy">
            <p>
              We may update this Privacy Policy from time to time. When we do, we will revise the &quot;Last updated&quot; date at the top. We encourage you to review this page periodically.
            </p>
          </Section>

          {/* 10 */}
          <Section heading="10. Contact Us">
            <p>
              If you have questions about this Privacy Policy or how we handle your data, please contact:
            </p>
            <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-4">
              <p className="font-medium text-[#f9fafb]">AgencyOS</p>
              <a href="mailto:kvnradquotes@gmail.com" className="text-[#2563eb] hover:underline mt-1 block">
                kvnradquotes@gmail.com
              </a>
            </div>
          </Section>

        </div>

        <div className="mt-16 pt-8 border-t border-white/[0.06] text-xs text-[#4b5563]">
          © {new Date().getFullYear()} AgencyOS. All rights reserved.
        </div>
      </article>
    </div>
  )
}

function Section({ heading, children }: { heading?: string; children: React.ReactNode }) {
  return (
    <section>
      {heading && (
        <h2 className="text-base font-semibold text-[#f9fafb] mb-3">{heading}</h2>
      )}
      {children}
    </section>
  )
}
