// Node 22 (V8 11.4+) ships these; TypeScript's ES2023 lib does not know them yet.
export {};
declare global {
  interface JSON {
    parse(
      text: string,
      reviver: (
        this: unknown,
        key: string,
        value: unknown,
        context: { source?: string },
      ) => unknown,
    ): unknown;
    rawJSON(text: string): unknown;
  }
}
