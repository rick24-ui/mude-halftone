import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // @tensorflow-models/pose-detection statically imports `Pose` from
      // @mediapipe/pose for its BlazePose-MediaPipe runtime. We only use
      // MoveNet, and the real package isn't ESM-compatible, so we alias it
      // to a local stub to satisfy Turbopack's bundler.
      "@mediapipe/pose": "./src/lib/_mediapipe-pose-stub.ts",
      "@tensorflow/tfjs-backend-webgpu": "./src/lib/_tfjs-backend-webgpu-stub.ts",
    },
  },
};

export default nextConfig;
