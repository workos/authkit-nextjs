export default async function globalTeardown() {
  await globalThis.__emulator?.close();
}
