// Stub for "@mediapipe/pose" — the real package isn't ESM-compatible and breaks
// Turbopack's static analysis. We only use the MoveNet model from
// @tensorflow-models/pose-detection, which never instantiates `Pose` at runtime,
// so a no-op class satisfies the bundler without shipping the MediaPipe runtime.
export class Pose {
  constructor(..._args: unknown[]) {}
  setOptions(..._args: unknown[]) {}
  onResults(..._args: unknown[]) {}
  send(..._args: unknown[]) {
    return Promise.resolve();
  }
  close() {}
}

export const VERSION = "0.0.0-stub";
export default { Pose, VERSION };
