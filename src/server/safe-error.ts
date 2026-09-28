// Third-party error messages, custom names, causes and stacks may contain
// credentials not known to process.env. Emit only an allowlisted error class.
export function safeError(error: unknown): string {
  if (error instanceof Error) {
    const names = new Set(["Error", "TypeError", "RangeError", "AbortError", "TimeoutError", "PrismaClientKnownRequestError", "PrismaClientInitializationError"]);
    return names.has(error.name) ? error.name : "Error";
  }
  return "UnknownError";
}
