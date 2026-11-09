import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { connectDB } from "@/lib/db";
import { numberServices, setNumberSwitch } from "@/lib/esim/numbers/services";

/** Data, texts, calls, voicemail and call forwarding on one of the shopper's numbers, read from TopConnect. */
export const GET = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:number-services", preset: "browse" } },
  async ({ params, session }) => {
    await connectDB();
    const services = await numberServices(session.user.id, params.id);
    if (!services) throw new NotFoundError("Number not found");
    return successResponse(services);
  },
);

const SwitchSchema = z.object({ service: z.enum(["data", "sms", "voice", "voicemail"]), on: z.boolean() });

/** Switches one service on or off. */
export const POST = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:number-service-change", preset: "moderate" } },
  async ({ request, params, session }) => {
    const body = await validateBody(request, SwitchSchema);
    await connectDB();
    const result = await setNumberSwitch(session.user.id, params.id, body.service, body.on);
    if (result === null) throw new NotFoundError("Number not found");
    if (!result.ok) throw new ValidationError(result.message);
    return successResponse({ service: body.service, on: result.on });
  },
);
