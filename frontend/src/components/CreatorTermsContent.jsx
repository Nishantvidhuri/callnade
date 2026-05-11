/**
 * Creator-account-specific Terms & Conditions, rendered as the
 * scrollable body of ConsentForm when `isCreator === true`. Kept in
 * its own file so the user-facing T&C in ConsentForm.jsx stays
 * focused — these two documents drift independently as the platform's
 * legal posture evolves.
 *
 * Tone: plain English, India-jurisdictional, no boilerplate fog. Each
 * section is short enough that a creator scrolling on their phone can
 * actually read it.
 *
 * If you change material terms (fees, jurisdiction, payout window),
 * bump the consent version string in Signup.jsx so the backend has a
 * record of which revision the creator accepted.
 */
export default function CreatorTermsContent() {
  return (
    <>
      <p>
        By creating a Creator account on <b>CallNade</b>, you confirm that you have read,
        understood, and agreed to the terms below. These supplement (and where they conflict,
        override) any general user terms.
      </p>

      <Section n={1} title="Eligibility & Identity Verification">
        <List
          items={[
            'You must be at least 18 years old to register as a creator.',
            'You agree to submit valid government-issued identification (passport, Aadhaar, PAN, driving licence) and a live selfie when requested.',
            'All information you provide must be accurate. Fake identities, impersonation, stolen documents, or fraudulent verification are grounds for permanent ban and reporting to authorities.',
            'CallNade may run periodic re-verification, including liveness checks and screening against public sanctions / fraud lists.',
          ]}
        />
      </Section>

      <Section n={2} title="Independent Creator Status">
        <p>
          Creators on CallNade operate <b>independently</b>. You are not an employee, agent,
          partner, joint-venturer, franchisee, or representative of CallNade.
        </p>
        <List
          items={[
            'You set your own availability, pricing, and hours.',
            'You may accept or reject any interaction at your discretion.',
            'You are not entitled to wages, employment benefits, leaves, insurance, or provident fund.',
            'You are solely responsible for your equipment, internet, lighting, electricity, and workspace.',
            'You are solely responsible for income tax, GST, TDS, and any other taxes applicable to your earnings under Indian law (or the law of your jurisdiction).',
          ]}
        />
      </Section>

      <Section n={3} title="One Creator, One Account">
        <List
          items={[
            'Each verified individual may operate only one creator account.',
            'Sharing, selling, transferring, or jointly operating a creator account is prohibited.',
            'Creating duplicate / alternate accounts to evade bans, accumulate referral bonuses, or split earnings is grounds for permanent termination and forfeiture of pending balance.',
          ]}
        />
      </Section>

      <Section n={4} title="Content & Conduct — Prohibited">
        <p>You agree not to upload, transmit, request, or engage in:</p>
        <List
          items={[
            'Any content involving minors or anyone under 18.',
            'Non-consensual, exploitative, trafficked, or coerced content.',
            'Illegal, violent, or abusive material.',
            'Prostitution or solicitation of physical meetups.',
            'Threats, blackmail, extortion, stalking, or harassment.',
            'Hate speech, discriminatory conduct, or targeted abuse.',
            'Impersonation of another individual or public figure.',
            'Copyrighted, pirated, or otherwise stolen content.',
            'Scams, phishing, deceptive financial activity, or fake giveaways.',
            'Drugs, weapons, or other unlawful goods or services.',
            'Self-harm content or content encouraging self-harm in others.',
          ]}
        />
        <p>
          Violations may result in immediate suspension, permanent ban, forfeiture of pending
          earnings, and reporting to law-enforcement authorities.
        </p>
      </Section>

      <Section n={5} title="Anti-Circumvention (No Off-Platform)">
        <p>
          To protect both creators and users, all paid interactions must take place on CallNade.
          You agree not to:
        </p>
        <List
          items={[
            'Solicit or accept payments outside the platform (UPI, bank transfer, gift cards, cash, crypto, etc.).',
            'Share or request personal contact details — phone number, WhatsApp, Telegram, Instagram, Snapchat, email — during calls, chats, or visit interactions.',
            'Promote external services, websites, or alternate platforms.',
            'Direct users to alternative payment methods or accounts.',
          ]}
        />
        <p>
          First offence: warning + temporary suspension. Repeat or coordinated offences: permanent
          ban and forfeiture of pending earnings.
        </p>
      </Section>

      <Section n={6} title="User Privacy & Confidentiality">
        <List
          items={[
            'Do not publicly expose any user information you become aware of through the platform.',
            'Do not leak, redistribute, or screenshot user chats, calls, media, or profile data.',
            'Do not record interactions without proper authorization where prohibited by law.',
            'Treat anything a user shares with you on the platform as confidential.',
          ]}
        />
      </Section>

      <Section n={7} title="Recording, Screenshots & Distribution">
        <p>
          CallNade strictly prohibits unauthorised recording, screenshotting, redistribution, or
          sharing of creator or user content. You acknowledge, however, that:
        </p>
        <List
          items={[
            'No internet platform can guarantee complete prevention of recording or screenshots.',
            'Users may attempt unauthorised capture using external devices, screen recorders, or modified clients.',
            'CallNade cannot guarantee absolute protection against third-party misuse.',
            'CallNade may apply watermarks, screenshot-blocking flags (where the OS allows), blur on background tabs, AI moderation, and other security measures. You agree not to remove, obscure, or attempt to defeat any platform-applied protection on content you upload or stream.',
          ]}
        />
      </Section>

      <Section n={8} title="Face & Identity Disclosure Is Voluntary">
        <p>
          CallNade never requires you to show your face, body, or any
          identifiable feature on camera. How much of your appearance you reveal
          on calls, photos, or videos is entirely your choice — the platform
          will not instruct, pressure, or condition any feature on you removing
          a mask, blur, costume, or filter.
        </p>
        <List
          items={[
            'You may use voice-only audio packages, blurred or partial video, masks, costume, framing, or lighting to protect your visual identity at any time.',
            'CallNade staff and automated systems will never ask you to "show your face", "turn the camera fully on", or otherwise expose identifiable features as a condition of using the platform or being paid.',
            'If a user attempts to threaten, blackmail, dox, harass, or coerce you over showing or not showing your face or identity, stop the interaction immediately and report it to info@callnade.site. Such conduct is grounds for permanent ban of the offending user.',
            'CallNade accepts no responsibility for exploitation, harassment, or misuse arising from voluntary disclosure of your face, voice, or identity to viewers — protecting your privacy in what you choose to display is your own decision.',
          ]}
        />
      </Section>

      <Section n={9} title="Platform Moderation & Safety">
        <List
          items={[
            'CallNade may review reports, sample-record, spectate, or otherwise moderate calls and chats for safety, abuse investigation, fraud control, and legal compliance.',
            'Recordings made for moderation are handled confidentially and only used for the purposes above or as required by law.',
            'You agree to cooperate with any moderation investigation involving your account, including providing context for flagged interactions.',
            'False or malicious reports filed by you may themselves result in penalties.',
          ]}
        />
      </Section>

      <Section n={10} title="Earnings, Fees & Payouts">
        <List
          items={[
            'You may earn credits through paid calls, gifts, and other monetised interactions on the platform.',
            'CallNade applies a platform fee on each paid interaction (currently a 20% margin on the caller’s spend, configurable by the platform).',
            'Withdrawals from your creator earnings wallet are subject to a withdrawal fee (currently 20%); the referral wallet is paid out at full value (no fee).',
            'Minimum withdrawal thresholds, payout schedules, KYC checks, and processing timelines may apply and may change at CallNade’s discretion with reasonable notice.',
            'Payouts are issued only to a UPI handle that matches the verified creator’s identity. Mismatched, third-party, or unverified handles will be rejected.',
            'CallNade may withhold or delay payouts (up to 60 days) pending review of suspected fraud, chargebacks, KYC failures, or unresolved user disputes.',
            'You are solely responsible for declaring and paying any applicable taxes on your earnings.',
          ]}
        />
      </Section>

      <Section n={11} title="Refunds, Chargebacks & Clawbacks">
        <List
          items={[
            'If a user successfully disputes or charges back a payment that funded earnings already credited to you, CallNade may debit (claw back) the corresponding amount from your earnings wallet, referral wallet, or pending payouts.',
            'If your wallet balance is insufficient to cover a clawback, the deficit may be deducted from future earnings before any further payout.',
            'You agree to respond promptly to any dispute notice or evidence request from CallNade.',
          ]}
        />
      </Section>

      <Section n={12} title="Referral Program">
        <List
          items={[
            'Creators may participate in CallNade’s referral program. Current terms: a creator who joins via your code generates 10% of their per-call earnings as a bonus to your referral wallet, for 30 days from the referred creator’s signup.',
            'Top-up referrals (when a regular user you referred recharges) credit 10% of the top-up to your referral wallet on each approved top-up.',
            'Referral rates, durations, and eligibility may change at CallNade’s discretion. Current terms apply prospectively only.',
            'Referral fraud — self-referral, fake accounts, collusion, or KYC bypass — results in forfeiture of all referral earnings, clawback of past credits, and potential account termination.',
          ]}
        />
      </Section>

      <Section n={13} title="Suspension, Forfeiture & Termination">
        <p>CallNade may suspend, restrict, freeze payouts, or permanently terminate a creator account for reasons including but not limited to:</p>
        <List
          items={[
            'Fraud, scams, or money-laundering activity.',
            'Abuse, harassment, threats, or other violations of these terms.',
            'Repeated user complaints or low conduct ratings.',
            'Fake, expired, or revoked KYC.',
            'Multi-accounting or ban evasion.',
            'Off-platform solicitation.',
            'Activity harmful to platform reputation, safety, or legal standing.',
            'Account dormancy: accounts with no login or activity for 12 consecutive months may be deactivated and any pending creator-wallet balance forfeited (KYC re-verification required to restore).',
          ]}
        />
        <p>
          Where termination is for cause (fraud, illegal conduct, ban evasion, repeated violations),
          pending earnings may be forfeited in whole or in part.
        </p>
      </Section>

      <Section n={14} title="Intellectual Property & License">
        <p>
          You retain ownership of original content you create and upload. By uploading content to
          CallNade you grant the platform a non-exclusive, worldwide, royalty-free licence to host,
          store, transmit, display, optimise, moderate, and promote that content within the
          CallNade ecosystem and its official marketing channels.
        </p>
        <p>
          CallNade may use your displayName, username, and avatar in non-personalised, aggregate
          promotional contexts (e.g. "creators featured this week") without further consent. You
          may opt out of promotional features in your account settings.
        </p>
      </Section>

      <Section n={15} title="Indemnification">
        <p>
          You agree to indemnify, defend, and hold harmless CallNade, its directors, officers,
          employees, and contractors from any claim, demand, loss, liability, or expense
          (including reasonable legal fees) arising out of:
        </p>
        <List
          items={[
            'Your conduct or content on the platform.',
            'Your breach of these terms or applicable law.',
            'Your interactions with users (on or off the platform).',
            'Tax authority claims relating to your earnings.',
          ]}
        />
      </Section>

      <Section n={16} title="Limitation of Liability">
        <p>
          CallNade is a technology platform that enables interactions between users and creators.
          To the maximum extent permitted by law, CallNade is not responsible for:
        </p>
        <List
          items={[
            'The acts, omissions, or content of individual users or other creators.',
            'Off-platform interactions you choose to engage in.',
            'External recordings, screenshots, or third-party redistribution.',
            'Financial disputes that fall outside CallNade’s stated payout policy.',
            'Indirect, incidental, or consequential damages.',
          ]}
        />
        <p>
          CallNade’s aggregate liability to you under any theory shall not exceed the platform
          fees CallNade has retained from your earnings in the six (6) months preceding the
          claim.
        </p>
      </Section>

      <Section n={17} title="Compliance With Laws">
        <List
          items={[
            'You are responsible for ensuring your activity complies with all applicable local, national, and international laws — including tax, consumer protection, content regulation, and data-protection laws.',
            'You may not use CallNade from any country, region, or in any manner restricted by Indian or international sanctions, export controls, or anti-money-laundering regulations.',
            'Suspicious transaction patterns may be reported to financial-intelligence authorities as required by law.',
          ]}
        />
      </Section>

      <Section n={18} title="DMCA / IP Takedown">
        <p>
          If you believe content on CallNade infringes your intellectual property rights, write to
          <b> info@callnade.site </b> with: a description of the work, the URL of the infringing
          content, your contact details, a good-faith statement, and a signed declaration of
          accuracy. CallNade will action valid notices and forward counter-notices to the
          uploader.
        </p>
      </Section>

      <Section n={19} title="Service Availability">
        <List
          items={[
            'CallNade is provided "as is" without uptime guarantees. Maintenance, outages, and connectivity issues may interrupt the service.',
            'CallNade is not liable for losses caused by force-majeure events: natural disasters, ISP outages, government action, war, civil disorder, or third-party service failures.',
            'Geographic, device, or network restrictions may apply at CallNade’s discretion.',
          ]}
        />
      </Section>

      <Section n={20} title="Modifications">
        <p>
          CallNade may update these terms from time to time. Material changes will be communicated
          via the email or phone number on file at least seven (7) days before they take effect
          where reasonably possible. Continued use of the platform after the effective date
          constitutes acceptance.
        </p>
      </Section>

      <Section n={21} title="Governing Law & Dispute Resolution">
        <List
          items={[
            'These terms are governed by the laws of the Republic of India.',
            'Any dispute is first subject to good-faith negotiation between you and CallNade.',
            'Unresolved disputes will be referred to binding arbitration under the Arbitration and Conciliation Act, 1996, by a sole arbitrator appointed by CallNade. The seat of arbitration is New Delhi, India, and the proceedings will be conducted in English.',
            'Subject to the arbitration clause, the courts at New Delhi, India shall have exclusive jurisdiction.',
          ]}
        />
      </Section>

      <Section n={22} title="Notice, Assignment, Severability">
        <List
          items={[
            'Notices to you may be sent to the email address or phone number on your account; notices to CallNade must go to info@callnade.site.',
            'You may not assign or transfer these terms or your account. CallNade may assign its rights and obligations to a successor entity without your consent.',
            'If any provision is found unenforceable, the remainder of these terms remains in full force.',
            'Sections 4–19 (and any clause that by its nature should survive) survive termination of your account.',
          ]}
        />
      </Section>

      <Section n={23} title="Acceptance">
        <p>By registering as a creator on CallNade, you confirm that:</p>
        <List
          items={[
            'You are at least 18 years old.',
            'You voluntarily participate on the platform as an independent creator.',
            'You understand the inherent risks of online interactions and online income.',
            'You agree to comply with all platform rules, payout policies, and applicable laws.',
          ]}
        />
      </Section>
    </>
  );
}

function Section({ n, title, children }) {
  return (
    <section>
      <h3 className="text-sm font-bold text-ink mb-1.5">
        {n}. {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function List({ items }) {
  return (
    <ul className="list-disc pl-5 space-y-1 marker:text-tinder">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}
