/**
 * jest-axe v11 ships no type declarations (verified: no "types" field, no
 * .d.ts in the package), so this ambient declaration provides the exports
 * used by test/a11y/primary-flow.test.tsx.
 */

declare module "jest-axe" {
  export type AxeViolation = {
    id: string;
    impact: string;
    description: string;
    help: string;
    helpUrl: string;
    nodes: unknown[];
  };
  export type AxeResults = {
    violations: AxeViolation[];
    incomplete: unknown[];
    passes: unknown[];
  };
  export function axe(
    node: Element | null,
    options?: Record<string, unknown>
  ): Promise<AxeResults>;
  export const toHaveNoViolations: {
    toHaveNoViolations(
      received: unknown,
      ..._expected: unknown[]
    ): { pass: boolean; message: () => string } | Promise<{ pass: boolean; message: () => string }>;
  };
}
