// Development/CI tool only. Java 21 and unzip must already be installed.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const version = "1.30.3";
const sha256 = "b512bf24945503a33fc10738ecffc1f2dccaaf8593a448e94ee9ac86a9559a59";
const directory = resolve(".cache/verapdf-installer");
const destination = resolve(".cache/verapdf");
await mkdir(directory, { recursive:true });
const response = await fetch(`https://software.verapdf.org/releases/1.30/verapdf-greenfield-${version}-installer.zip`, { signal:AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error(`veraPDF download failed: HTTP ${response.status}`);
const bytes = new Uint8Array(await response.arrayBuffer());
if (createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error("veraPDF installer checksum mismatch");
const zip = join(directory, "installer.zip");
await writeFile(zip, bytes);
execFileSync("unzip", ["-oq", zip, "-d", directory]);
const escapeXml = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const config = join(directory, "install.xml");
await writeFile(config, `<AutomatedInstallation langpack="eng">
<com.izforge.izpack.panels.htmlhello.HTMLHelloPanel id="welcome"/>
<com.izforge.izpack.panels.target.TargetPanel id="install_dir"><installpath>${escapeXml(destination)}</installpath></com.izforge.izpack.panels.target.TargetPanel>
<com.izforge.izpack.panels.packs.PacksPanel id="sdk_pack_select"><pack index="0" name="veraPDF GUI" selected="false"/><pack index="1" name="veraPDF CLI" selected="true"/><pack index="2" name="veraPDF Documentation" selected="false"/><pack index="3" name="veraPDF Sample Plugins" selected="false"/></com.izforge.izpack.panels.packs.PacksPanel>
<com.izforge.izpack.panels.install.InstallPanel id="install"/>
<com.izforge.izpack.panels.finish.FinishPanel id="finish"/>
</AutomatedInstallation>`);
const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin", "java") : "java";
execFileSync(java, ["-jar", join(directory, `verapdf-greenfield-${version}`, `verapdf-izpack-installer-${version}.jar`), config], { stdio:"inherit" });
console.log(`Installed veraPDF ${version} in ${destination}`);
