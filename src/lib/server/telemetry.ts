import { trace, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("hoikka");

export async function withSpan<T>(
	name: string,
	fn: () => Promise<T>,
	attrs?: Record<string, string | number>
): Promise<T> {
	return tracer.startActiveSpan(name, async (span) => {
		if (attrs) span.setAttributes(attrs);
		try {
			const result = await fn();
			return result;
		} catch (e) {
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: e instanceof Error ? e.message : String(e)
			});
			throw e;
		} finally {
			span.end();
		}
	});
}
