use std::{env, fs, path::PathBuf};

fn main() {
    let source = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap()).join("assets/fonts");
    let output = PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("fonts");
    fs::create_dir_all(&output).unwrap();
    println!("cargo:rerun-if-changed={}", source.display());
    // Keep the original, licensed WOFF2 assets in source control. Shipping their
    // decoded SFNT bytes removes decompression from every new engine's hot path.
    for entry in fs::read_dir(source).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().is_none_or(|ext| ext != "woff2") {
            continue;
        }
        let bytes = fs::read(&path).unwrap();
        let decoded = wuff::decompress_woff2(&bytes)
            .unwrap_or_else(|error| panic!("Could not decode {}: {error:?}", path.display()));
        let mut name = path.file_stem().unwrap().to_os_string();
        name.push(".sfnt");
        fs::write(output.join(name), decoded).unwrap();
    }
}
