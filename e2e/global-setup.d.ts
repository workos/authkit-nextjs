import { type Emulator } from 'workos/emulate';
declare global {
    var __emulator: Emulator | undefined;
}
export default function globalSetup(): Promise<void>;
