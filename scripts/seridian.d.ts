/**
 * Minimal ambient declaration for the "bun:sqlite" built-in used by
 * scripts/seridian.ts. Deliberately hand-scoped to only the members used
 * here, rather than pulling in the full `bun-types` package — that package
 * also globally overrides `fetch`'s type (adding Bun-specific static
 * methods), which broke an unrelated file's `fetch` mock the one time this
 * was tried. Ambient module declarations like this one, unlike triple-slash
 * `types` references, don't leak global augmentations into the rest of the
 * program.
 */
declare module "bun:sqlite" {
  export class Database {
    constructor(filename: string, options?: { readonly?: boolean; create?: boolean });
    query<T = unknown>(sql: string): {
      get(...params: unknown[]): T | null;
      all(...params: unknown[]): T[];
      run(...params: unknown[]): void;
    };
    close(): void;
  }
}
