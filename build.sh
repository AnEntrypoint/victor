#!/bin/sh
set -e
cargo +nightly build --release --target wasm32-unknown-unknown --manifest-path crate/Cargo.toml
wasm-bindgen --target web --out-dir docs/pkg --no-typescript crate/target/wasm32-unknown-unknown/release/victor.wasm
