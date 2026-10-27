/**
 * Customer KYC (KYC-01/03). Pure.
 *
 * The form is a list of fields an admin builds and publishes; each publish is
 * a new version that never changes, and a submission records the version it
 * answered. Whether a plan needs KYC: the plan's own setting when an admin
 * set one; otherwise yes when it covers a country the store lists; otherwise
 * its supplier's default.
 */

export const KYC_FIELD_TYPES = ["text", "textarea", "select", "date", "file"] as const;
export type KycFieldType = (typeof KYC_FIELD_TYPES)[number];

export interface KycField {
  key: string;
  label: string;
  type: KycFieldType;
  required: boolean;
  /** select only. */
  options: string[];
  help: string | null;
}

export const KYC_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const KYC_FILE_MAX_MB = 10;
const MAX_FIELDS = 30;

export class KycFormError extends Error {}

/** A form an admin wants to publish, checked and tidied; throws on a form that would not work. */
export function normalizeForm(fields: ReadonlyArray<Partial<KycField>>): KycField[] {
  if (!fields.length) throw new KycFormError("Add at least one field");
  if (fields.length > MAX_FIELDS) throw new KycFormError(`At most ${MAX_FIELDS} fields`);
  const seen = new Set<string>();
  return fields.map((field, index) => {
    const label = String(field.label ?? "").trim().slice(0, 120);
    if (!label) throw new KycFormError(`Field ${index + 1} needs a label`);
    const type = KYC_FIELD_TYPES.includes(field.type as KycFieldType) ? (field.type as KycFieldType) : null;
    if (!type) throw new KycFormError(`"${label}" has no known type`);
    const key = (String(field.key ?? "").trim() || label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || `field_${index + 1}`;
    if (seen.has(key)) throw new KycFormError(`Two fields share the key "${key}"`);
    seen.add(key);
    const options = type === "select" ? [...new Set((field.options ?? []).map((option) => String(option).trim()).filter(Boolean))].slice(0, 50) : [];
    if (type === "select" && options.length < 2) throw new KycFormError(`"${label}" needs at least two choices`);
    return { key, label, type, required: Boolean(field.required), options, help: field.help ? String(field.help).trim().slice(0, 300) || null : null };
  });
}

export interface KycUpload {
  name: string;
  mime: string;
  size: number;
}

/**
 * A shopper's answers checked against the form: the text value of each
 * field, and which file fields carry a file. Every problem at once, by field.
 */
export function checkAnswers(
  fields: readonly KycField[],
  values: Record<string, unknown>,
  files: Record<string, KycUpload | undefined>,
): { ok: true; values: Record<string, string> } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const clean: Record<string, string> = {};
  for (const field of fields) {
    if (field.type === "file") {
      const file = files[field.key];
      if (!file) {
        if (field.required) errors[field.key] = "Add a file";
        continue;
      }
      if (!(KYC_FILE_TYPES as readonly string[]).includes(file.mime)) errors[field.key] = "Use a JPG, PNG, WebP or PDF file";
      else if (file.size > KYC_FILE_MAX_MB * 1024 * 1024) errors[field.key] = `The file is larger than ${KYC_FILE_MAX_MB} MB`;
      continue;
    }
    const value = String(values[field.key] ?? "").trim();
    if (!value) {
      if (field.required) errors[field.key] = "This is required";
      continue;
    }
    if (value.length > (field.type === "textarea" ? 2000 : 300)) errors[field.key] = "This is too long";
    else if (field.type === "select" && !field.options.includes(value)) errors[field.key] = "Choose one of the options";
    else if (field.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) errors[field.key] = "Enter a date";
    else clean[field.key] = value;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values: clean };
}

/** Whether a plan needs KYC: its own setting, else a listed country, else its supplier's default. */
export function kycRequiredFor(
  plan: { kycRequired: boolean | null; countryCodes: readonly string[] },
  supplierDefault: boolean,
  kycCountries: readonly string[],
): boolean {
  if (plan.kycRequired !== null) return plan.kycRequired;
  if (plan.countryCodes.some((code) => kycCountries.includes(code.toUpperCase()))) return true;
  return supplierDefault;
}
