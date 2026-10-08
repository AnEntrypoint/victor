export class Options {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        OptionsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_options_free(ptr, 0);
    }
    /**
     * @returns {boolean}
     */
    get binary() {
        const ret = wasm.__wbg_get_options_binary(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get color_precision() {
        const ret = wasm.__wbg_get_options_color_precision(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get corner_threshold() {
        const ret = wasm.__wbg_get_options_corner_threshold(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get filter_speckle() {
        const ret = wasm.__wbg_get_options_filter_speckle(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get gradient_gain() {
        const ret = wasm.__wbg_get_options_gradient_gain(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    get gradients() {
        const ret = wasm.__wbg_get_options_gradients(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get layer_difference() {
        const ret = wasm.__wbg_get_options_layer_difference(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get length_threshold() {
        const ret = wasm.__wbg_get_options_length_threshold(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get max_iterations() {
        const ret = wasm.__wbg_get_options_max_iterations(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get path_precision() {
        const ret = wasm.__wbg_get_options_path_precision(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get refine_gain() {
        const ret = wasm.__wbg_get_options_refine_gain(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    get refine_gradients() {
        const ret = wasm.__wbg_get_options_refine_gradients(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get refine_iters() {
        const ret = wasm.__wbg_get_options_refine_iters(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get refine_ms() {
        const ret = wasm.__wbg_get_options_refine_ms(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    get refine_solid() {
        const ret = wasm.__wbg_get_options_refine_solid(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    get refine() {
        const ret = wasm.__wbg_get_options_refine(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get smooth() {
        const ret = wasm.__wbg_get_options_smooth(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get splice_threshold() {
        const ret = wasm.__wbg_get_options_splice_threshold(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    get spline() {
        const ret = wasm.__wbg_get_options_spline(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    get stacked() {
        const ret = wasm.__wbg_get_options_stacked(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get threshold() {
        const ret = wasm.__wbg_get_options_threshold(this.__wbg_ptr);
        return ret;
    }
    constructor() {
        const ret = wasm.options_new();
        this.__wbg_ptr = ret;
        OptionsFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {boolean} arg0
     */
    set binary(arg0) {
        wasm.__wbg_set_options_binary(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set color_precision(arg0) {
        wasm.__wbg_set_options_color_precision(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set corner_threshold(arg0) {
        wasm.__wbg_set_options_corner_threshold(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set filter_speckle(arg0) {
        wasm.__wbg_set_options_filter_speckle(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set gradient_gain(arg0) {
        wasm.__wbg_set_options_gradient_gain(this.__wbg_ptr, arg0);
    }
    /**
     * @param {boolean} arg0
     */
    set gradients(arg0) {
        wasm.__wbg_set_options_gradients(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set layer_difference(arg0) {
        wasm.__wbg_set_options_layer_difference(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set length_threshold(arg0) {
        wasm.__wbg_set_options_length_threshold(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set max_iterations(arg0) {
        wasm.__wbg_set_options_max_iterations(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set path_precision(arg0) {
        wasm.__wbg_set_options_path_precision(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set refine_gain(arg0) {
        wasm.__wbg_set_options_refine_gain(this.__wbg_ptr, arg0);
    }
    /**
     * @param {boolean} arg0
     */
    set refine_gradients(arg0) {
        wasm.__wbg_set_options_refine_gradients(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set refine_iters(arg0) {
        wasm.__wbg_set_options_refine_iters(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set refine_ms(arg0) {
        wasm.__wbg_set_options_refine_ms(this.__wbg_ptr, arg0);
    }
    /**
     * @param {boolean} arg0
     */
    set refine_solid(arg0) {
        wasm.__wbg_set_options_refine_solid(this.__wbg_ptr, arg0);
    }
    /**
     * @param {boolean} arg0
     */
    set refine(arg0) {
        wasm.__wbg_set_options_refine(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set smooth(arg0) {
        wasm.__wbg_set_options_smooth(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set splice_threshold(arg0) {
        wasm.__wbg_set_options_splice_threshold(this.__wbg_ptr, arg0);
    }
    /**
     * @param {boolean} arg0
     */
    set spline(arg0) {
        wasm.__wbg_set_options_spline(this.__wbg_ptr, arg0);
    }
    /**
     * @param {boolean} arg0
     */
    set stacked(arg0) {
        wasm.__wbg_set_options_stacked(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set threshold(arg0) {
        wasm.__wbg_set_options_threshold(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) Options.prototype[Symbol.dispose] = Options.prototype.free;

/**
 * @param {Uint8Array} rgba
 * @param {number} width
 * @param {number} height
 * @param {Options} o
 * @returns {string}
 */
export function vectorize(rgba, width, height, o) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passArray8ToWasm0(rgba, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        _assertClass(o, Options);
        const ret = wasm.vectorize(ptr0, len0, width, height, o.__wbg_ptr);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_now_10dfb829d34c0d52: function() {
            const ret = performance.now();
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./victor_bg.js": import0,
    };
}

const OptionsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_options_free(ptr, 1));

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('victor_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
