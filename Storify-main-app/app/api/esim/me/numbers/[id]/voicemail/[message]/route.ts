import { withApi } from "@/lib/api/handler";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { connectDB } from "@/lib/db";
import { voicemailRecording } from "@/lib/esim/numbers/services";

/** One voicemail recording of one of the shopper's numbers, passed through from TopConnect. */
export const GET = withApi<{ id: string; message: string }>(
  { auth: "user", rateLimit: { action: "esim:number-voicemail", preset: "moderate" } },
  async ({ params, session }) => {
    await connectDB();
    const recording = await voicemailRecording(session.user.id, params.id, params.message);
    if (recording === null) throw new NotFoundError("Message not found");
    if (!recording.ok) throw new ValidationError(recording.message);
    return new Response(recording.body, {
      headers: { "Content-Type": recording.contentType, "Cache-Control": "private, no-store", "Content-Disposition": "inline" },
    });
  },
);
