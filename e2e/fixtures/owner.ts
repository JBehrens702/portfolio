import { clerk, clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";
import { createBlobMediaStorage } from "../../src/lib/content/media-gc";
import { listAllBlobs, type BlobCredentials } from "../../src/lib/content/store";

// Shared steps of the signed-in admin specs: the owner's Clerk sign-in with the
// testing token, and the removal of a test content root from a Blob store.

async function ownerEmail(): Promise<string> {
  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(process.env.ADMIN_USER_ID ?? "")}`, {
    headers: { authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
  });
  if (!response.ok) throw new Error(`Clerk user lookup failed with status ${response.status}`);
  const user = (await response.json()) as {
    primary_email_address_id: string | null;
    email_addresses: { id: string; email_address: string }[];
  };
  const email = user.email_addresses.find((e) => e.id === user.primary_email_address_id) ?? user.email_addresses[0];
  if (!email) throw new Error("The owner's Clerk user has no email address");
  return email.email_address;
}

async function waitForClerk(target: Page) {
  for (let attempt = 1; ; attempt++) {
    try {
      await target.waitForLoadState("load");
      await target.waitForFunction(() => (window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded === true, null, {
        timeout: 20_000,
      });
      // A dev server that is still compiling reloads the page; the marker shows that it stayed put.
      await target.evaluate(() => ((window as { e2eStable?: boolean }).e2eStable = true));
      await target.waitForTimeout(1500);
      if (await target.evaluate(() => (window as { e2eStable?: boolean }).e2eStable === true)) return;
      throw new Error("the page reloaded");
    } catch (error) {
      if (attempt >= 5) throw error;
    }
  }
}

/** Signs the page in as the owner (ADMIN_USER_ID) with Clerk's testing token. */
export async function signInOwner(page: Page): Promise<void> {
  await clerkSetup({ publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, secretKey: process.env.CLERK_SECRET_KEY });
  await setupClerkTestingToken({ page });
  // Clerk's development handshake can reload the sign-in page once, which
  // removes window.Clerk between the two waits inside clerk.signIn. Wait until
  // Clerk is loaded on a settled page, and try the sign-in again on failure.
  const emailAddress = await ownerEmail();
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto("/sign-in", { waitUntil: "commit" });
      await waitForClerk(page);
      await clerk.signIn({ page, emailAddress });
      return;
    } catch (error) {
      console.log(`Clerk sign-in attempt ${attempt} failed at ${page.url()}: ${(error as Error).message.split("\n")[0]}`);
      if (attempt >= 3) throw error;
    }
  }
}

/** Deletes everything under the test root from one store. */
export async function deleteRoot(root: string, credentials: BlobCredentials): Promise<void> {
  const urls = (await listAllBlobs(`${root}/`, credentials)).map((b) => b.url);
  await createBlobMediaStorage(credentials).delete(urls);
}
