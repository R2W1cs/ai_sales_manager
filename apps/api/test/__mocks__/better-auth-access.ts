export function createAccessControl<T extends Record<string, readonly string[]>>(statement: T) {
  return {
    statement,
    newRole<R extends Record<string, readonly string[]>>(permissions: R) {
      return {
        statements: statement,
        role: permissions,
      };
    },
  };
}
