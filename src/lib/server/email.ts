/**
 * Shared transactional email seam (Resend). All store emails go through
 * sendEmail so "not configured" behaves the same everywhere: the send is
 * skipped and logged instead of failing the calling flow.
 */
import { Resend } from "resend";
import { env } from "$env/dynamic/private";

/**
 * Send one email. Returns { sent: false } when RESEND_API_KEY is missing
 * (the full content is logged so local dev can read OTPs etc. from the
 * console). Throws when Resend accepts the request but reports an error, so
 * outbox handlers get their retry.
 */
export async function sendEmail(
	to: string,
	subject: string,
	html: string
): Promise<{
	sent: boolean;
}> {
	if (!env.RESEND_API_KEY) {
		console.log(`[email] RESEND_API_KEY not set — skipping "${subject}" to ${to}\n${html}`);
		return { sent: false };
	}
	const resend = new Resend(env.RESEND_API_KEY);
	const { error } = await resend.emails.send({
		from: env.RESEND_FROM_EMAIL || "noreply@example.com",
		to,
		subject,
		html
	});
	if (error) throw new Error(error.message);
	return { sent: true };
}
