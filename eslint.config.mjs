import next from "eslint-config-next";

const eslintConfig = [
  ...next,
  {
    ignores: [".next/**", "node_modules/**"],
  },
  {
    // The architectural rule from the plan: outside lib/, the database is only
    // reachable through a repository. One lint run is the whole audit.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    // The healthcheck is the one place that legitimately needs the raw pool:
    // its whole job is to prove the connection works.
    ignores: ["app/api/health/route.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "pg",
              message: "Do not talk to Postgres directly. Use a repository in lib/db/repo/*.",
            },
            {
              name: "@/lib/db",
              message: "Import a repository from @/lib/db/repo/* instead of the raw pool.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
