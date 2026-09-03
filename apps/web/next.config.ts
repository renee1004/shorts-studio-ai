import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@shorts-os/config",
    "@shorts-os/contracts",
    "@shorts-os/db",
    "@shorts-os/domain",
    "@shorts-os/observability",
    "@shorts-os/providers",
    "@shorts-os/services",
  ],
  serverExternalPackages: ["postgres", "pino"],
  // typedRoutes는 아직 존재하지 않는 Phase 2+ 경로를 Link 타입으로 막아버려 끈다.
  // 각 Phase에서 라우트가 생기면 다시 켠다.
  typedRoutes: false,
};

export default nextConfig;
