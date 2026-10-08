/* tslint:disable */
/* eslint-disable */

export function default_options_json(): string;

export function png_to_svg_wasm(png_bytes: Uint8Array, options_json: string): string;

/**
 * Vectorize decoded RGBA pixels and return the SVG plus a summary, as JSON.
 *
 * Lets the page show node counts and accuracy next to the result, which is the
 * pair of numbers that actually describes the quality of a trace.
 */
export function vectorize_rgba_report_wasm(width: number, height: number, rgba: Uint8Array, options_json: string): string;

/**
 * Vectorize decoded RGBA pixels and return the SVG.
 *
 * Preferred over [`png_to_svg_wasm`] in the browser: the page decodes the file
 * itself, so every format it supports works and no codec is compiled into the
 * wasm.
 */
export function vectorize_rgba_wasm(width: number, height: number, rgba: Uint8Array, options_json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly default_options_json: () => [number, number];
    readonly png_to_svg_wasm: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly vectorize_rgba_report_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly vectorize_rgba_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
