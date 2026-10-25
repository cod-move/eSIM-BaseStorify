/**
 * Registers the local test shopper (CUSTOMER_TEST_EMAIL / CUSTOMER_TEST_PASSWORD
 * from .env) through the app's own sign-up endpoint, without a browser. Dev only.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs scripts/esim-dev-register.ts
 */
import { connectDB, disconnectDB } from "@/lib/db";
import { auth } from "@/lib/auth/auth";
import { User } from "@/models";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  const email = process.env.CUSTOMER_TEST_EMAIL;
  const password = process.env.CUSTOMER_TEST_PASSWORD;
  const base = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  if (!email || !password) throw new Error("Set CUSTOMER_TEST_EMAIL and CUSTOMER_TEST_PASSWORD in .env");
  await connectDB();
  if (await User.exists({ email })) {
    console.log(`${email} already exists`);
    return;
  }
  const response = await auth.handler(
    new Request(`${base}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ email, password, name: "Test Shopper" }),
    }),
  );
  if (!response.ok) throw new Error(`Sign-up refused: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
  // A local test account: its address counts as verified.
  await User.updateOne({ email }, { $set: { emailVerified: true } });
  console.log(`Registered ${email}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => disconnectDB());
