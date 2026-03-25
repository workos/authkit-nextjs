export default async function globalTeardown() {
    await globalThis.__emulator?.close();
}
//# sourceMappingURL=global-teardown.js.map