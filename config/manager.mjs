/**
 * The BBC micro:bit Manager extension, which this one cannot activate without,
 * unpacked into `.vscode-test/manager/` from Open VSX. Fetched again only when
 * the published version moves, so a run normally touches the network once, for
 * the small query that says what the latest version is.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ID = 'carlosperate.bbcmicrobit-manager';
const [publisher, name] = ID.split('.');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = path.join(root, '.vscode-test', 'manager');
const stamp = path.join(home, 'version.txt');
const manifest = path.join(home, 'extension', 'package.json');

const here = fs.existsSync(manifest) && fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8').trim() : undefined;
const latest = await published();

// Nothing to do, and nothing asked of the network beyond the query above.
if (latest === undefined || latest === here) {
	console.log(`[manager] ${ID} ${here ?? 'unknown'} is in .vscode-test/manager`);
	process.exit(0);
}

console.log(`[manager] fetching ${ID} ${latest} from Open VSX`);
// Unpacked beside the cache and swapped in whole, so a failed update leaves a working copy in place.
const staging = `${home}.next`;
try {
	fs.rmSync(staging, { recursive: true, force: true });
	fs.mkdirSync(staging, { recursive: true });
	// `.zip`, not `.vsix`: Windows PowerShell's Expand-Archive refuses any other extension.
	const archive = path.join(staging, 'manager.zip');
	const response = await fetch(`https://open-vsx.org/api/${publisher}/${name}/${latest}/file/${publisher}.${name}-${latest}.vsix`);
	if (!response.ok) throw new Error(`could not download ${ID} ${latest} (HTTP ${response.status})`);
	fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
	unzip(archive, staging);
	if (!fs.existsSync(path.join(staging, 'extension', 'package.json'))) {
		throw new Error(`${archive} unpacked without an extension/package.json in it`);
	}
	fs.writeFileSync(path.join(staging, 'version.txt'), `${latest}\n`);
} catch (error) {
	fs.rmSync(staging, { recursive: true, force: true });
	if (!here) throw error;
	console.log(`[manager] could not update to ${latest} (${String(error)}), keeping ${here}`);
	process.exit(0);
}
// Retried: Windows holds handles on freshly written files for a moment.
fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
fs.renameSync(staging, home);
console.log(`[manager] ${ID} ${latest} is in .vscode-test/manager`);

/** `undefined` keeps whatever is cached, so a run offline is a run, not a failure. */
async function published() {
	try {
		const response = await fetch(`https://open-vsx.org/api/${publisher}/${name}/latest`);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return (await response.json()).version;
	} catch (error) {
		if (here) {
			console.log(`[manager] could not ask Open VSX for the latest version (${String(error)}), keeping ${here}`);
			return undefined;
		}
		throw error;
	}
}

/** A VSIX is a zip, and neither node nor this repository has an unzipper. */
function unzip(from, into) {
	const run =
		process.platform === 'win32'
			? spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${from}' -DestinationPath '${into}' -Force`])
			: spawnSync('unzip', ['-q', '-o', from, '-d', into]);
	if (run.status !== 0) throw new Error(`could not unpack ${from}: ${run.stderr?.toString().trim() || `exit ${String(run.status)}`}`);
}
