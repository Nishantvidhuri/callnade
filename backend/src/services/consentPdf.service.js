import PDFDocument from 'pdfkit';

const TERMS = [
  ['1. Eligibility Requirements',
    'By using this platform you confirm that you are at least 18 years old, are legally permitted to use online social and communication platforms in your country or region, that all information provided during registration is accurate and truthful, and that you will not impersonate another person or create fake identities for fraudulent or harmful purposes. The platform reserves the right to suspend or permanently terminate accounts suspected of violating age or identity requirements.'],
  ['2. User Responsibility',
    'You are fully responsible for: all content you upload, share, transmit, or display; your conversations, interactions, and behavior with other users; any media, messages, or communications exchanged through the platform; and protecting your account credentials and login information. The platform does not guarantee the identity, honesty, intentions, or conduct of any user. Users interact with others at their own risk.'],
  ['3. Consent to Interaction',
    'By accepting a follow request or initiating communication, you voluntarily consent to interact with another user. Profile access, image visibility, and communication features may become available after mutual acceptance. Accepting a connection does not create any obligation for further communication, personal meetings, or continued interaction. You may block or remove connections at any time.'],
  ['4. Video Calling Consent',
    'The platform may provide private video calling functionality between mutually connected users. Participation is fully voluntary. You are solely responsible for your conduct during calls and will not engage in harassment, threats, exploitation, coercion, blackmail, or illegal activity. Online interactions involve inherent risks. The platform does not actively monitor private calls in real time unless legally required or necessary for safety investigations.'],
  ['5. Prohibited Content & Conduct',
    'Strictly prohibited: any content involving minors or individuals under 18; exploitative, abusive, violent, or criminal material; human trafficking, coercion, or non-consensual activity; threats, intimidation, hate speech, stalking, blackmail, or harassment; recording video calls without explicit consent; sharing private images or conversations without permission; publishing another user\'s personal information; catfishing, impersonation, scam activity, or financial fraud. Violations may result in immediate suspension, permanent bans, or reporting to law enforcement.'],
  ['6. Content Ownership & License',
    'You retain ownership of the content you upload. By uploading, you grant the platform a limited, non-exclusive license to store, process, display, optimize, and moderate your content solely for operating and improving the service. You must have the legal right to upload any content you share.'],
  ['7. Privacy & Data Usage',
    'The platform may collect and process account info, uploaded media, device and usage data, and interaction records. This may be used for security, fraud prevention, moderation, platform functionality, and legal compliance.'],
  ['8. Reporting & Moderation',
    'Users may report abuse, harassment, illegal content, fake profiles, or safety concerns. The platform reserves the right to review and remove content, restrict features, suspend or terminate accounts, and cooperate with legal authorities.'],
  ['9. No Guarantee of Safety',
    'Online interactions carry inherent risks. The platform cannot guarantee the behavior or intentions of other users. Users are responsible for exercising judgment and caution.'],
  ['10. Limitation of Liability',
    'To the maximum extent permitted by law, the platform shall not be liable for user-generated content, user conduct, private interactions, damages arising from communications between users, or losses resulting from misuse of the platform.'],
  ['11. Account Suspension & Termination',
    'The platform may suspend or terminate accounts without prior notice for violations, illegal activity, abuse, security risks, or attempts to bypass moderation.'],
  ['12. Changes to Terms',
    'The platform may update these terms at any time. Continued use constitutes acceptance of revised terms.'],
];

const DECLARATIONS = [
  'I confirm that I am at least 18 years old.',
  'I understand that I am solely responsible for my interactions and conduct on the platform.',
  'I agree to comply with all platform rules and applicable laws.',
  'I consent to the platform\'s privacy, moderation, and safety policies.',
];

/**
 * Generates a PDF Buffer of the consent agreement filled out for the given
 * user. Returned as a Promise<Buffer>. Pure function — no I/O beyond the
 * in-memory PDF stream.
 */
export function buildConsentPdf({ user, consent }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 56 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc
        .font('Helvetica-Bold')
        .fontSize(18)
        .fillColor('#0f172a')
        .text('callnade — User Consent & Community Guidelines', { align: 'left' });
      doc
        .moveDown(0.3)
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#64748b')
        .text(`Document version: ${consent.version || '2026-05-06'}`)
        .text(`Accepted at: ${new Date(consent.acceptedAt).toUTCString()}`)
        .text(`Account: @${user.username}  ·  ${user.email}`)
        .text(`User ID: ${user._id}`);
      if (consent.ip) doc.text(`Recorded IP: ${consent.ip}`);

      doc.moveDown(0.8);

      // Body — terms
      doc.font('Helvetica').fontSize(11).fillColor('#0f172a');
      for (const [heading, body] of TERMS) {
        doc.font('Helvetica-Bold').fontSize(11).text(heading);
        doc
          .moveDown(0.15)
          .font('Helvetica')
          .fontSize(10)
          .fillColor('#334155')
          .text(body, { align: 'justify' });
        doc.moveDown(0.5).fillColor('#0f172a');
      }

      // Declarations
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text('User Declaration');
      doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor('#475569')
        .text('The following declarations were checked and confirmed by the user at the time of registration:');
      doc.moveDown(0.6);

      for (const d of DECLARATIONS) {
        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#16a34a')
          .text('[x] ', { continued: true })
          .font('Helvetica')
          .fillColor('#0f172a')
          .text(d);
        doc.moveDown(0.25);
      }

      doc.moveDown(1);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text('Identification', { underline: false });
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(11).fillColor('#0f172a');
      doc.text(`Full name:   ${consent.fullName}`);
      doc.text(`Date:        ${new Date(consent.acceptedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`);

      // Signature block — render signature in a script-like font.
      doc.moveDown(1);
      doc.font('Helvetica-Bold').fontSize(11).text('Signature:');
      doc.moveDown(0.3);
      doc
        .font('Helvetica-Oblique')
        .fontSize(20)
        .fillColor('#0f172a')
        .text(consent.signature || '—', { width: 380 });
      doc.moveDown(0.4);
      doc
        .moveTo(doc.x, doc.y)
        .lineTo(doc.x + 380, doc.y)
        .lineWidth(0.6)
        .strokeColor('#94a3b8')
        .stroke();

      // Footer
      doc.moveDown(2);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#94a3b8')
        .text(
          'Generated by callnade. Captured electronically at the time of account creation. ' +
            'This record is retained for compliance and audit purposes.',
          { align: 'center' },
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
