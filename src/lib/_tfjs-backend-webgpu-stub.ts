// Stub for "@tensorflow/tfjs-backend-webgpu" — @tensorflow-models/pose-detection
// statically imports `webgpu_util` and `WebGPUBackend` from it, but the real
// package isn't ESM-compatible and breaks Turbopack's static analysis. We only
// use the MoveNet model with the WebGL backend, which never instantiates the
// WebGPU backend at runtime, so no-op stubs satisfy the bundler.
export class WebGPUBackend {
  constructor(..._args: unknown[]) {}
}

export const webgpu_util = {};

export default { WebGPUBackend, webgpu_util };
