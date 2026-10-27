import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { KycFormSchema, KycRulesSchema, saveKycRules } from "@/lib/esim/admin/kyc";
import { KycFormError } from "@/lib/esim/kyc/rules";
import { KycError, publishKycForm } from "@/lib/esim/kyc/service";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish"), form: KycFormSchema }),
  z.object({ action: z.literal("rules"), rules: KycRulesSchema }),
]);

/** Publish the KYC form as a new version, or save which plans need KYC. */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, BodySchema);
  const actor = session.user.email ?? session.user.id;
  if (body.action === "publish") {
    try {
      const form = await publishKycForm(body.form.fields, actor);
      await auditEsim(request, session, { resourceId: "esim:kyc-form", resourceName: "eSIM KYC form", summary: `Published KYC form version ${form.version}`, after: { version: form.version, fields: form.fields.length } });
      return successResponse(form);
    } catch (error) {
      if (error instanceof KycFormError || error instanceof KycError) throw new ValidationError(error.message);
      throw error;
    }
  }
  const { before, after } = await saveKycRules(body.rules);
  await auditEsim(request, session, { resourceId: "esim:kyc-rules", resourceName: "eSIM KYC rules", summary: "Changed which eSIM plans need KYC", before: { ...before }, after: { ...after } });
  return successResponse(after);
});
