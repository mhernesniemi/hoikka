import { auth } from "$lib/server/auth.js";
import type { RequestHandler } from "./$types";

const handler: RequestHandler = ({ request }) => auth.handler(request);

export const GET = handler;
export const POST = handler;
