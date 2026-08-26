const checks = {
  public: [
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_"],
  ],
  server: [
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_"],
    ["CLERK_SECRET_KEY", "sk_live_"],
  ],
};

const mode = process.argv[2];
const requiredVariables = checks[mode];

if (!requiredVariables) {
  console.error("Usage: node scripts/validate-production-clerk-env.mjs <public|server>");
  process.exit(2);
}

const invalidVariables = requiredVariables
  .filter(([name, prefix]) => !(process.env[name] ?? "").startsWith(prefix))
  .map(([name, prefix]) => `${name} (expected a ${prefix}… key)`);

if (invalidVariables.length > 0) {
  console.error(
    `Refusing to build or start a production image with non-production Clerk credentials:\n- ${invalidVariables.join("\n- ")}`,
  );
  process.exit(1);
}
