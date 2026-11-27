"use client";

import { useEffect, useState } from "react";

export type AddressFieldVisibility = "required" | "optional" | "hidden";

/** The fields checkout always requires, whatever the settings. */
const ALWAYS = ["street", "city", "country"] as const;

/**
 * The address fields as the store's checkout asks for them (GET
 * /api/esim/address-fields); null until loaded, when the form shows every
 * field and requires only street, city and country, as before.
 */
export function useStoreAddressFields(): Record<string, AddressFieldVisibility> | null {
  const [fields, setFields] = useState<Record<string, AddressFieldVisibility> | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/esim/address-fields")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { fields?: Record<string, { visibility: AddressFieldVisibility }> } | null) => {
        if (live && body?.fields) setFields(Object.fromEntries(Object.entries(body.fields).map(([key, value]) => [key, value.visibility])));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return fields;
}

/** The required fields left empty, in the form's order. */
export function missingAddressFields(address: Record<string, unknown>, fields: Record<string, AddressFieldVisibility> | null): string[] {
  const required = [...ALWAYS, ...Object.entries(fields ?? {}).filter(([, visibility]) => visibility === "required").map(([key]) => key)];
  return required.filter((key) => !String(address[key] ?? "").trim());
}
