import { Resend } from 'resend';
import { env } from '@/env.js';
import { logger } from '@/setup/logger.js';

const FROM = 'Blink <noreply@blink.wolkenassistent.de>';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Transactional email via Resend. Registered as a DI singleton and injected into the
 * clients that send mail (today the {@link AuthClient} for verification codes).
 */
export class EmailClient {
  private readonly resend: Resend;

  constructor() {
    this.resend = new Resend(env.RESEND_API_KEY);
  }

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.resend.emails.send({ from: FROM, ...message });
    if (error) {
      logger.error({ to: message.to, err: error }, 'Failed to send email');
      throw new Error(`could not send email: ${error.message}`);
    }
  }
}
