/**
 * Regular-user-side Terms & Community Guidelines body. Mirrors the
 * canonical 12 sections that the consent flow / generated PDF use,
 * extracted into a standalone component so any surface (signup,
 * standalone /terms page later, footer modals) can render them
 * without duplicating the JSX.
 *
 * Companion to CreatorTermsContent.jsx (which carries the
 * creator-specific 22-section document).
 */
export default function UserTermsContent() {
  return (
    <>
      <p>
        By creating an account, uploading content, interacting with users, or using
        any feature of this platform — including messaging, profile sharing, image
        viewing, and video calling — you agree to the following terms.
      </p>

      <Section n={1} title="Eligibility Requirements">
        <p>By using this platform you confirm that:</p>
        <List
          items={[
            'You are at least 18 years old.',
            'You are legally permitted to use online social and communication platforms in your country or region.',
            'All information provided during registration is accurate and truthful.',
            'You will not impersonate another person or create fake identities for fraudulent or harmful purposes.',
          ]}
        />
        <p>
          The platform reserves the right to suspend or permanently terminate
          accounts suspected of violating age or identity requirements.
        </p>
      </Section>

      <Section n={2} title="User Responsibility">
        <p>You are fully responsible for:</p>
        <List
          items={[
            'All content you upload, share, transmit, or display.',
            'Your conversations, interactions, and behavior with other users.',
            'Any media, messages, or communications exchanged through the platform.',
            'Protecting your account credentials and login information.',
          ]}
        />
        <p>
          The platform does not guarantee the identity, honesty, intentions, or
          conduct of any user. Users interact with others at their own risk.
        </p>
      </Section>

      <Section n={3} title="Consent to Interaction">
        <p>By accepting a follow request or initiating communication:</p>
        <List
          items={[
            'You voluntarily consent to interact with another user.',
            'Profile access, image visibility, and communication features may become available after mutual acceptance.',
            'Accepting a connection does not create any obligation for further communication, personal meetings, or continued interaction.',
            'You may block or remove connections at any time.',
          ]}
        />
      </Section>

      <Section n={4} title="Video Calling Consent">
        <p>The platform may provide private video calling functionality between mutually connected users. By using video calling features, you agree that:</p>
        <List
          items={[
            'Participation is fully voluntary.',
            'You are solely responsible for your conduct during calls.',
            'You will not engage in harassment, threats, exploitation, coercion, blackmail, or illegal activity.',
            'Online interactions involve inherent risks.',
            'The platform does not actively monitor private calls in real time unless legally required or necessary for safety investigations.',
          ]}
        />
      </Section>

      <Section n={5} title="Prohibited Content & Conduct">
        <p className="font-semibold mt-1">Illegal content</p>
        <List
          items={[
            'Any content involving minors or individuals under 18 years of age.',
            'Exploitative, abusive, violent, or criminal material.',
            'Human trafficking, coercion, or non-consensual activity.',
          ]}
        />
        <p className="font-semibold mt-2">Harassment & abuse</p>
        <List
          items={[
            'Threats or intimidation.',
            'Hate speech or discriminatory behavior.',
            'Stalking, blackmail, extortion, or harassment.',
          ]}
        />
        <p className="font-semibold mt-2">Privacy violations</p>
        <List
          items={[
            'Recording video calls without explicit consent.',
            'Sharing private images or conversations without permission.',
            "Publishing another user's personal information.",
          ]}
        />
        <p className="font-semibold mt-2">Fraud & manipulation</p>
        <List
          items={[
            'Catfishing or impersonation.',
            'Scam activity or financial fraud.',
            'Manipulative or deceptive behavior.',
          ]}
        />
        <p>Any violation may result in immediate suspension, permanent bans, or reporting to law enforcement.</p>
      </Section>

      <Section n={6} title="Content Ownership & License">
        <p>
          You retain ownership of the content you upload. By uploading, you grant
          the platform a limited, non-exclusive license to store, process, display,
          optimize, and moderate your content solely for operating and improving
          the service. You must have the legal right to upload any content you
          share.
        </p>
      </Section>

      <Section n={7} title="Privacy & Data Usage">
        <p>
          The platform may collect and process account info, uploaded media,
          device and usage data, and connection and interaction records. This may
          be used for security, fraud prevention, moderation, platform
          functionality, and legal compliance.
        </p>
      </Section>

      <Section n={8} title="Reporting & Moderation">
        <p>
          Users may report abuse, harassment, illegal content, fake profiles, or
          safety concerns. The platform reserves the right to review and remove
          content, restrict features, suspend or terminate accounts, and cooperate
          with legal authorities.
        </p>
      </Section>

      <Section n={9} title="No Guarantee of Safety">
        <p>
          Online interactions carry inherent risks. The platform cannot guarantee
          the behavior or intentions of other users. Users are responsible for
          exercising judgment and caution.
        </p>
      </Section>

      <Section n={10} title="Limitation of Liability">
        <p>
          To the maximum extent permitted by law, the platform shall not be liable
          for user-generated content, user conduct, private interactions, damages
          arising from communications between users, or losses resulting from
          misuse of the platform.
        </p>
      </Section>

      <Section n={11} title="Account Suspension & Termination">
        <p>
          The platform may suspend or terminate accounts without prior notice for
          violations, illegal activity, abuse, security risks, or attempts to
          bypass moderation.
        </p>
      </Section>

      <Section n={12} title="Changes to Terms">
        <p>
          The platform may update these terms at any time. Continued use
          constitutes acceptance of revised terms.
        </p>
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
