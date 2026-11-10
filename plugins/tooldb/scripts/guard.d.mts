export interface HookInput {
  tool_name: string;
  tool_input?: Record<string, unknown>;
  cwd?: string;
}

export function addedPackages(input: HookInput, readFile?: (path: string) => string): string[];
export function check(input: HookInput, toolsMdText: string, readFile?: (path: string) => string): string | null;
