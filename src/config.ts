import type { ProviderName, Role } from "./types.js";

export const config = {
  roles: {
    ARCHITECT: "freellmapi",
    IMPLEMENTER: "freellmapi",
    REVIEWER: "freellmapi",
    ALTERNATIVE_REVIEWER: "freellmapi",
    VALIDATOR: "freellmapi",
    REPAIRER: "freellmapi"
  } satisfies Record<Role, ProviderName>,

  validationCommand:
    process.env.DEVMESH_VALIDATION_COMMAND ?? "npm run check"
};

export function env(name: string, required = false): string {
  const value = process.env[name]?.trim() ?? "";

  if (required && !value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}
