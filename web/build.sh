#!/usr/bin/env bash
# Build the PORAL WebAssembly module (web/poral.js + web/poral.wasm).
# Requires emcc on PATH, e.g.:  export PATH=~/miniconda3/envs/poral-wasm/bin:$PATH
#
# Sources are compiled with -O2 but linked with -O0: the conda-forge emscripten
# package ships a binaryen whose wasm-opt is too old for the link-time optimizer.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build
for f in ../arith.c ../core.c ../patterns.c ../por.c ../simp.c api.c; do
  emcc -O2 -c "$f" -o "build/$(basename "${f%.c}").o"
done
emcc -O0 build/*.o \
  -o poral.js \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createPoral \
  -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=web,node \
  -sEXPORTED_FUNCTIONS=_api_init,_api_constant,_api_binary,_api_unary,_api_normalize \
  -sEXPORTED_RUNTIME_METHODS=cwrap
echo "Built web/poral.js and web/poral.wasm"
