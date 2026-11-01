export function prismaAdapter(prisma: unknown, options?: unknown) {
  return {
    id: "prisma",
    adapter: prisma,
    options,
  };
}
