/**
 * Shared transactional email seam (Resend). All store emails go through
 * sendEmail so "not configured" behaves the same everywhere: the send is
 * skipped and logged instead of failing the calling flow.
 */
import { Resend } from "resend";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import config from "$hoikka/config";

/**
 * Send one email. Returns { sent: false } when RESEND_API_KEY is missing. In
 * development the full content is logged so OTPs etc. can be read from the
 * console; in production only the failure is logged — message bodies carry
 * one-time codes and personal data and must never reach the logs. Throws when
 * Resend accepts the request but reports an error, so outbox handlers get
 * their retry.
 */
export async function sendEmail(
	to: string,
	subject: string,
	html: string
): Promise<{
	sent: boolean;
}> {
	if (!env.RESEND_API_KEY) {
		if (dev) {
			console.log(`[email] RESEND_API_KEY not set — skipping "${subject}" to ${to}\n${html}`);
		} else {
			console.error(`[email] RESEND_API_KEY is not set — "${subject}" was not sent`);
		}
		return { sent: false };
	}
	const resend = new Resend(env.RESEND_API_KEY);
	const { error } = await resend.emails.send({
		from: env.RESEND_FROM_EMAIL || config.store.emailFrom,
		to,
		subject,
		html
	});
	if (error) throw new Error(error.message);
	return { sent: true };
}
