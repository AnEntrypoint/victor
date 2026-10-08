# ov (Open Vectorizer core)

Vendored from https://github.com/vardirhq/open-vectorizer, path `png2svg/core`,
at commit `7b9e49a649c62758e1a1abecab9b2c46d752f1e5` (MIT, see `LICENSE`).

Standalone crate (`png2svg-core`, crate-type `rlib` + `cdylib`). The workspace
package and dependency values are inlined in `Cargo.toml`; `[workspace]` is
declared empty so this crate is its own root. The browser entry point is
`vectorize_rgba_wasm`.

Build for the browser:

    cargo +nightly build --release --target wasm32-unknown-unknown --manifest-path ov/Cargo.toml
    wasm-bindgen --target web --out-dir docs/ov-pkg ov/target/wasm32-unknown-unknown/release/png2svg_core.wasm

`Cargo.lock` pins `wasm-bindgen` to 0.2.129 so the library matches the
`wasm-bindgen` CLI used to generate `docs/ov-pkg/` (the CLI refuses a mismatched
version).
