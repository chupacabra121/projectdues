import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables React's <ViewTransition> on App Router navigations — powers the
  // agent chip → workspace-rail portrait morph. No-ops gracefully where the
  // browser lacks the View Transitions API.
  experimental: { viewTransition: true },
};

export default nextConfig;
