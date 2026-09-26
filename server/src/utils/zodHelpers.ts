import { z } from "zod";

/**
 * Some LLM tool-calling implementations (observed with gpt-oss:120b) fill
 * in every schema property rather than omitting unused optional ones,
 * sending "" for an optional field instead of leaving it out. That's
 * harmless for a plain optional string but breaks an optional enum/number,
 * which "" doesn't satisfy. Wrap prone fields with this so an empty string
 * is treated the same as "not provided" instead of a validation failure.
 */
export function looseOptional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((val) => (val === "" ? undefined : val), schema.optional());
}

/**
 * A zod enum that accepts any casing (e.g. "video" as well as "VIDEO") by
 * upper-casing string input before validation - observed with
 * gpt-oss:120b sending lowercase values for our UPPERCASE status/type
 * enums. Combine with looseOptional() when the field is also optional.
 */
export function caseInsensitiveEnum<U extends string, T extends readonly [U, ...U[]]>(values: T) {
  return z.preprocess((val) => (typeof val === "string" ? val.toUpperCase() : val), z.enum(values));
}

/**
 * A string field that also accepts an array of strings (joined with ", ") -
 * observed with gpt-oss:120b returning list-like fields such as soundEffects
 * as a JSON array instead of the requested string.
 */
export function stringOrList() {
  return z.preprocess((val) => (Array.isArray(val) ? val.join(", ") : val), z.string().default(""));
}
