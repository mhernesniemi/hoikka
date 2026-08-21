import { auth } from "@hoikka/core/server/auth";
import type { RequestHandler } from "@sveltejs/kit";

const handler: RequestHandler = ({ request }) => auth.handler(request);

export const GET = handler;
export const POST = handler;
