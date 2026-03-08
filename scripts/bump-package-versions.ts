#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';

interface PackageJson {
  name: string;
  version: string;
  [key: string]: any;
}

/**
 * Bumps the patch version of a semantic version string
 * @param version - The current version string (e.g., "0.1.2")
 * @returns The bumped version string (e.g., "0.1.3")
 */
function bumpPatchVersion(version: string): string {
  const parts = version.split('.');
  if (parts.length !== 3) {
    throw new Error(
      `Invalid version format: ${version}. Expected format: x.y.z`
    );
  }

  const [major, minor, patch] = parts.map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Compares two semver strings. Returns >0 if a > b, <0 if a < b, 0 if equal.
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

/** @bubblelab packages that create-bubblelab-app templates depend on */
const BUBBLELAB_PACKAGES = [
  '@bubblelab/bubble-core',
  '@bubblelab/bubble-runtime',
  '@bubblelab/shared-schemas',
];

/**
 * Update create-bubblelab-app template package.json files with new @bubblelab versions
 */
function updateTemplateDependencies(newVersion: string): void {
  const templatePaths = [
    'packages/create-bubblelab-app/templates/basic/package.json',
    'packages/create-bubblelab-app/templates/reddit-scraper/package.json',
  ];

  for (const templatePath of templatePaths) {
    try {
      const content = readFileSync(templatePath, 'utf-8');
      const pkg: PackageJson = JSON.parse(content);

      if (!pkg.dependencies) continue;

      let updated = false;
      for (const name of BUBBLELAB_PACKAGES) {
        if (name in pkg.dependencies) {
          pkg.dependencies[name] = `^${newVersion}`;
          updated = true;
        }
      }
      if (updated) {
        writeFileSync(templatePath, JSON.stringify(pkg, null, 2) + '\n');
        console.log(`   📝 Updated ${templatePath}`);
      }
    } catch (err) {
      console.warn(`   ⚠️  Could not update ${templatePath}:`, err);
    }
  }
}

/**
 * Main function to bump versions for all packages
 */
async function bumpPackageVersions(): Promise<void> {
  console.log('🚀 Starting package patch version bump...\n');

  try {
    // Find all package.json files in the packages directory
    const packagePaths = await glob('packages/*/package.json', {
      cwd: process.cwd(),
      absolute: false,
    });

    if (packagePaths.length === 0) {
      console.log('❌ No packages found in packages/ directory');
      return;
    }

    // Collect all non-private packages and find the highest current version
    const packages: Array<{ name: string; dir: string; oldVersion: string }> =
      [];
    let highestVersion = '0.0.0';

    for (const packageJsonPath of packagePaths) {
      const packageDir = packageJsonPath.replace('/package.json', '');
      const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
      const packageJson: PackageJson = JSON.parse(packageJsonContent);

      if (packageJson.private) {
        console.log(`⏭️  Skipping private package: ${packageJson.name}`);
        continue;
      }

      packages.push({
        name: packageJson.name,
        dir: packageDir,
        oldVersion: packageJson.version,
      });

      // Track the highest version across all packages
      if (compareVersions(packageJson.version, highestVersion) > 0) {
        highestVersion = packageJson.version;
      }
    }

    if (packages.length === 0) {
      console.log('\n⚠️  No packages were updated (all packages are private)');
      return;
    }

    // Bump once from the highest version — all packages get the same new version
    const newVersion = bumpPatchVersion(highestVersion);
    console.log(
      `\n📌 Highest current version: ${highestVersion} → unified bump to ${newVersion}\n`
    );

    const updates: Array<{
      name: string;
      oldVersion: string;
      newVersion: string;
      path: string;
    }> = [];

    for (const pkg of packages) {
      const packageJsonPath = join(pkg.dir, 'package.json');
      const packageJson: PackageJson = JSON.parse(
        readFileSync(packageJsonPath, 'utf-8')
      );
      packageJson.version = newVersion;
      writeFileSync(
        packageJsonPath,
        JSON.stringify(packageJson, null, 2) + '\n'
      );

      updates.push({
        name: pkg.name,
        oldVersion: pkg.oldVersion,
        newVersion,
        path: pkg.dir,
      });
      console.log(`✅ ${pkg.name}: ${pkg.oldVersion} → ${newVersion}`);
    }

    console.log('\n📦 Updating create-bubblelab-app template dependencies...');
    updateTemplateDependencies(newVersion);

    console.log(`\n🎉 Successfully bumped ${updates.length} package(s):`);
    updates.forEach((update) => {
      console.log(
        `   ${update.name}: ${update.oldVersion} → ${update.newVersion}`
      );
    });

    console.log('\n📝 Next steps:');
    console.log('   1. Review the changes');
    console.log('   2. Commit the version updates');
    console.log(
      '   3. Run pnpm publish:packages (or use bump-and-publish for both)'
    );
  } catch (error) {
    console.error('❌ Error bumping package versions:', error);
    process.exit(1);
  }
}

// Run the script if called directly
if (require.main === module) {
  bumpPackageVersions().catch(console.error);
}

export { bumpPackageVersions, bumpPatchVersion };
