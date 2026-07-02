import { stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Marker written by `/opc init` (opc-init.mjs) into a project's `.opc/` dir.
 * Its presence is the opt-in signal: the project has been onboarded to OPC.
 *
 * Enabling the plugin alone never writes `.opc/` into a project — only
 * `/opc init` does. MCP servers started by the plugin must respect this: if
 * the marker is absent, the project is NOT an OPC project and the servers must
 * not create `.opc/`, build indexes, or otherwise write into it. See the
 * `/opc init` command contract: "the marker is the opt-in signal".
 */
export const MARKER_NAME = ".project-init";

/** `.opc/.project-init` — lives one level below the project root. */
export function markerPath(projectRoot: string): string {
  return join(projectRoot, ".opc", MARKER_NAME);
}

/**
 * True iff the project ran `/opc init` (marker present). Resolves `false` for
 * any fs error (missing marker, missing `.opc/`, permission). Never throws.
 */
export async function isOptedIn(projectRoot: string): Promise<boolean> {
  try {
    await stat(markerPath(projectRoot));
    return true;
  } catch {
    return false;
  }
}

/**
 * Standard guidance returned to the caller when a tool is invoked in a project
 * that never ran `/opc init`. Kept here so all three servers emit identical
 * wording, and callers can match on the stable `opt_in_required` code.
 */
export function optInGuidance(): {
  error: string;
  code: "opt_in_required";
  required_action: string;
} {
  return {
    error:
      "OPC is not initialized in this project. Run /opc init to scaffold .opc/ before using OPC tools.",
    code: "opt_in_required",
    required_action: "run /opc init",
  };
}
