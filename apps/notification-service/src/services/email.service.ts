import nodemailer, { Transporter } from "nodemailer";
import { config } from "../config";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: config.SMTP_USER
        ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  const mail = getTransporter();
  try {
    await mail.sendMail({
      from: config.EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text ?? options.html.replace(/<[^>]+>/g, ""),
    });
    console.log(`[email] Sent to ${options.to}: ${options.subject}`);
  } catch (err) {
    console.error(`[email] Failed to send to ${options.to}:`, err);
    throw err;
  }
}

export function buildFraudAlertEmail(data: {
  tenantName: string;
  transactionId: string;
  amount: string;
  currency: string;
  rulesTriggered: string[];
  riskScore: number;
}): { subject: string; html: string } {
  return {
    subject: `[FRAUD ALERT] Suspicious transaction detected — ${data.transactionId.slice(0, 8)}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Fraud Alert Detected</h2>
        <p>A suspicious transaction has been flagged on your FinFlow account.</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Transaction ID</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.transactionId}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Amount</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.amount} ${data.currency}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Risk Score</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.riskScore}/100</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Rules Triggered</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.rulesTriggered.join(", ")}</td></tr>
        </table>
        <p>Please log in to your FinFlow dashboard to review and take action.</p>
        <p style="color: #6b7280; font-size: 12px;">This is an automated alert from FinFlow.</p>
      </div>
    `,
  };
}
