// Blink's dark-violet palette (mirrors packages/core/theme `palette`). Emails need
// inline hex — CSS vars / Tailwind / oklch don't survive mail clients — so the
// values are duplicated here on purpose.
const c = {
  bg: '#0e0b16',
  surface: '#17131f',
  surfaceElevated: '#1e1830',
  border: '#2a2340',
  text: '#ece9f5',
  textMuted: '#9b95ad',
  primaryBright: '#a78bfa',
  code: '#b8a6e8',
} as const;

const OTP_TTL_MINUTES = 5;

export interface VerificationEmail {
  subject: string;
  html: string;
  text: string;
}

/** The branded verification email carrying a one-time code. */
export function renderVerificationEmail(otp: string): VerificationEmail {
  const subject = `Your Blink verification code: ${otp}`;
  const text = `Your Blink verification code is ${otp}. Enter it to finish signing in — it expires in ${OTP_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${c.bg};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.bg};padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr>
        <td align="center">
          <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%;background:${c.surface};border:1px solid ${c.border};border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 40px 8px;">
                <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${c.primaryBright};">Blink</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px 0;">
                <h1 style="margin:0;font-size:20px;font-weight:600;color:${c.text};">Verify your email</h1>
                <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:${c.textMuted};">Enter this code in Blink to finish signing in. It expires in ${OTP_TTL_MINUTES} minutes.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 8px;">
                <div style="background:${c.surfaceElevated};border:1px solid ${c.border};border-radius:12px;padding:20px;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;font-weight:600;letter-spacing:10px;color:${c.code};">${otp}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 40px 36px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:${c.textMuted};">If you didn't request this, you can safely ignore this email — no account changes were made.</p>
              </td>
            </tr>
          </table>
          <div style="margin-top:20px;font-size:11px;color:${c.textMuted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Blink · Local-first task ingestion</div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
