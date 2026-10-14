export const MAX_ASSET_BYTES = 64 * 1024 * 1024;
export function copyBytes(value, name) {
    // Buffer.slice() creates a view, so use a constructor to snapshot every Uint8Array.
    if (value instanceof Uint8Array)
        return new Uint8Array(value);
    if (value instanceof ArrayBuffer)
        return new Uint8Array(value.slice(0));
    throw new TypeError(`${name} must be a Uint8Array or ArrayBuffer`);
}
export function assetBytes(value, name) {
    return typeof value === "string" ? new TextEncoder().encode(value) : copyBytes(value, name);
}
/** Load independent requests concurrently, with a byte budget shared by all batches of this render. */
export function createAssetLoader(resolver) {
    let totalBytes = 0;
    return async (urls) => {
        const results = new Array(urls.length);
        let next = 0;
        let failed = false;
        async function worker() {
            while (!failed && next < urls.length) {
                const index = next++;
                const url = urls[index];
                try {
                    let value;
                    try {
                        value = await resolver(url);
                    }
                    catch (cause) {
                        throw new Error(`Failed to load asset: ${url}`, { cause });
                    }
                    if (failed)
                        return;
                    if (value == null)
                        throw new Error(`Missing asset: ${url}. The asset resolver returned ${String(value)}`);
                    const data = assetBytes(value, `Asset resolver result for ${url}`);
                    totalBytes += data.byteLength;
                    if (totalBytes > MAX_ASSET_BYTES)
                        throw new RangeError("Assets exceed the 64 MiB limit");
                    results[index] = data;
                }
                catch (error) {
                    failed = true;
                    throw error;
                }
            }
        }
        await Promise.all(Array.from({ length: Math.min(8, urls.length) }, worker));
        return results;
    };
}
//# sourceMappingURL=assets.js.map