import { NextResponse } from "next/server";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { notFoundResponse } from "@/lib/api/response";
import { getStorageService } from "@/lib/storage";
import { isKycFileKey } from "@/lib/esim/kyc/service";
import { ESIM_READ } from "@/lib/esim/admin/route";

const DOWNLOAD_URL_TTL_SECONDS = 300;

/**
 * A KYC document for the admin reviewing it: a short-lived signed URL on
 * S3/R2, the bytes on local storage. The key must lie in the KYC folder —
 * the boundary that keeps this route from reaching other private files.
 */
export const GET = withApi(ESIM_READ, async ({ request }) => {
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!isKycFileKey(key)) throw new ValidationError("Invalid document key");
  const storage = await getStorageService();
  const filename = key.split("/").pop() || "document";
  let download;
  try {
    download = await storage.getPrivateDownload(key, { expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS, filename });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return notFoundResponse("Document");
    throw error;
  }
  if (download.kind === "redirect") return NextResponse.redirect(download.url, 302);
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const headers = new Headers({
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "private, no-store",
  });
  if (download.size) headers.set("Content-Length", String(download.size));
  return new Response(download.body, { headers });
});
