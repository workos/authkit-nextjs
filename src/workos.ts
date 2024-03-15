import WorkOS from "@workos-inc/node";
import { WORKOS_API_KEY } from "./env-variables";

// Initialize the WorkOS client
const workos = new WorkOS(WORKOS_API_KEY);

export { workos };
