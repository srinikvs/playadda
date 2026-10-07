import { assertStorageState, jenkinsSessionInjected } from "./session-env.ts";

/** Loads Jenkins-injected session if set. Does not mint cookies and does not log secrets. */
export default async function globalSetup(): Promise<void> {
  if (!jenkinsSessionInjected()) return;
  assertStorageState();
}
