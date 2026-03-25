import { expect } from '@playwright/test';
/**
 * Extended test fixtures that provide emulator reset between tests
 * and a convenience `signIn` helper for tests needing authenticated state.
 */
export declare const test: import("@playwright/test").TestType<import("@playwright/test").PlaywrightTestArgs & import("@playwright/test").PlaywrightTestOptions & {
    signIn: () => Promise<void>;
}, import("@playwright/test").PlaywrightWorkerArgs & import("@playwright/test").PlaywrightWorkerOptions>;
export { expect };
