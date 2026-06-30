import { execFileSync } from 'node:child_process';

function run(command, args, options = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        ...options
      })
    };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout ? String(error.stdout) : '',
      stderr: error.stderr ? String(error.stderr) : '',
      status: error.status
    };
  }
}

function print(status, message) {
  console.log(`${status} ${message}`);
}

const developerDir = '/Applications/Xcode.app/Contents/Developer';
const env = { ...process.env, DEVELOPER_DIR: developerDir };

const identities = run('security', ['find-identity', '-v', '-p', 'codesigning']);
const hasAppleDevelopment = /Apple Development/.test(identities.stdout);
if (hasAppleDevelopment) {
  print('OK', 'Found Apple Development signing identity.');
} else {
  print('MISSING', 'No Apple Development signing identity found in the login keychain.');
}

const devices = run('xcrun', ['devicectl', 'list', 'devices'], { env });
const deviceOutput = `${devices.stdout}\n${devices.stderr}`;
if (/iPhone/.test(deviceOutput) && /connected/.test(deviceOutput)) {
  print('OK', 'Found a connected iPhone.');
} else {
  print('MISSING', 'No connected iPhone was reported by CoreDevice.');
}

if (/Developer Mode disabled/.test(deviceOutput)) {
  print('ACTION', 'Enable Developer Mode on iPhone: Settings > Privacy & Security > Developer Mode, then restart the phone.');
}

const signedBuild = run('xcodebuild', [
  '-project', 'ios/MineradioIOS/MineradioIOS.xcodeproj',
  '-scheme', 'MineradioIOS',
  '-configuration', 'Debug',
  '-destination', 'generic/platform=iOS',
  '-derivedDataPath', '.codex-tmp/DerivedData-iPhoneSignedDoctor',
  '-allowProvisioningUpdates',
  'build'
], { env });

const buildOutput = `${signedBuild.stdout}\n${signedBuild.stderr}`;
if (signedBuild.ok) {
  print('OK', 'Generic iOS signed build succeeded.');
} else if (/requires a development team/.test(buildOutput)) {
  print('ACTION', 'Select a Development Team in Xcode for target MineradioIOS.');
} else if (/No signing certificate/.test(buildOutput) || /No profiles/.test(buildOutput)) {
  print('ACTION', 'Let Xcode create/download an Apple Development certificate and provisioning profile.');
} else {
  print('FAILED', 'Signed build failed for another reason. Review xcodebuild output above.');
  process.stdout.write(signedBuild.stdout);
  process.stderr.write(signedBuild.stderr);
}

if (!hasAppleDevelopment || !devices.ok || !signedBuild.ok || /Developer Mode disabled/.test(deviceOutput)) {
  process.exitCode = 1;
}
