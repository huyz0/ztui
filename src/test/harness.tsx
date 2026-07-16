import { afterEach } from "vitest";
import { cleanupMountedApps } from "../testing.ts";

/**
 * The repo's internal test harness. It re-exports the public, runner-agnostic
 * harness (`src/testing.ts` → `@huyz0/ztui/testing`) so the framework dogfoods
 * exactly the API it ships, and adds the one Vitest-specific bit: an `afterEach`
 * that tears down everything mounted via `mountApp` (so individual tests never
 * need their own teardown).
 */
export {
  findWidgetByType,
  flush,
  type MountOptions,
  type MountResult,
  mountApp,
  mountTestApp,
  VTEDriver,
  waitFor,
} from "../testing.ts";

afterEach(cleanupMountedApps);
