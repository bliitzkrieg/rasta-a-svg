declare module "/vendor/vtracer/vtracer_wasm.js" {
  export default function init(
    input?: RequestInfo | URL | Response,
  ): Promise<unknown>;

  export function trace_rgba_to_json(
    width: number,
    height: number,
    pixels: Uint8Array,
    optionsJson: string,
  ): string;

  export function trace_rgba_to_json_with_originals(
    width: number,
    height: number,
    pixels: Uint8Array,
    originalPixels: Uint8Array,
    optionsJson: string,
  ): string;
}

declare module "@/public/vendor/vtracer/vtracer_wasm.js" {
  export function initSync(options?: {
    module?: ArrayBuffer | WebAssembly.Module;
  }): unknown;

  export function trace_rgba_to_json(
    width: number,
    height: number,
    pixels: Uint8Array,
    optionsJson: string,
  ): string;

  export function trace_rgba_to_json_with_originals(
    width: number,
    height: number,
    pixels: Uint8Array,
    originalPixels: Uint8Array,
    optionsJson: string,
  ): string;
}
