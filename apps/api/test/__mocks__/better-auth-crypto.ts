export async function hashPassword(password: string): Promise<string> {
  return `mock-hash:${password}`;
}

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  return hash === `mock-hash:${password}`;
}
