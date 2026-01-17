#!/usr/bin/env node
/**
 * Build browser bundles for the plugin.
 * This script works around a bug in plugin-helpers where the optimizer
 * is killed before webpack finishes compiling.
 * 
 * Usage: node --require=@kbn/babel-register/install scripts/build_bundles.js
 */

const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const PLUGIN_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.resolve(PLUGIN_DIR, 'target/public');

async function buildBundles() {
  console.log('=== Building browser bundles ===');
  console.log(`Plugin: ${PLUGIN_DIR}`);
  console.log(`Output: ${OUTPUT_DIR}`);

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load required modules from Kibana (requires babel-register)
  const { OptimizerConfig } = require('@kbn/optimizer');
  const { Bundle, BundleRemotes } = require('@kbn/optimizer/src/common');

  // Read plugin manifest
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(PLUGIN_DIR, 'kibana.json'), 'utf8')
  );

  if (!manifest.ui) {
    console.log('Plugin has no UI, skipping bundle build.');
    return;
  }

  console.log(`Building bundles for plugin: ${manifest.id}`);

  // Create optimizer config
  const optimizerConfig = OptimizerConfig.create({
    repoRoot: REPO_ROOT,
    examples: false,
    testPlugins: false,
    includeCoreBundle: true,
    dist: true,
    watch: false,
  });

  // Create bundle for this plugin
  const bundle = new Bundle({
    id: manifest.id,
    contextDir: PLUGIN_DIR,
    ignoreMetrics: true,
    outputDir: OUTPUT_DIR,
    sourceRoot: PLUGIN_DIR,
    type: 'plugin',
    manifestPath: path.resolve(PLUGIN_DIR, 'kibana.json'),
    remoteInfo: {
      pkgId: 'not-importable',
      targets: ['public', 'common'],
    },
  });

  const remotes = BundleRemotes.fromBundles([...optimizerConfig.bundles, bundle]);
  const worker = optimizerConfig.getWorkerConfig('cache disabled');

  // Fork the optimizer worker
  const proc = fork(
    require.resolve('@kbn/plugin-helpers/src/tasks/optimize_worker'),
    {
      cwd: REPO_ROOT,
      execArgv: ['--require=@kbn/babel-register/install'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    }
  );

  return new Promise((resolve, reject) => {
    let compiled = false;

    proc.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line) console.log(`  ${line}`);
    });

    proc.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line) console.error(`  ERROR: ${line}`);
    });

    proc.on('message', (msg) => {
      if (msg.success) {
        compiled = true;
        console.log('✓ Browser bundles compiled successfully');
        if (msg.warnings) {
          console.log(`  Warnings: ${msg.warnings}`);
        }
        proc.kill('SIGTERM');
      } else {
        console.error(`✗ Compilation failed: ${msg.error}`);
        proc.kill('SIGTERM');
        reject(new Error(msg.error));
      }
    });

    proc.on('error', (err) => {
      console.error(`Process error: ${err.message}`);
      reject(err);
    });

    proc.on('exit', (code) => {
      // Clean up cache file
      try {
        fs.unlinkSync(path.resolve(OUTPUT_DIR, '.kbn-optimizer-cache'));
      } catch {}

      if (compiled) {
        resolve();
      } else if (code !== 0) {
        reject(new Error(`Worker exited with code ${code}`));
      } else {
        resolve();
      }
    });

    // Send configuration to worker
    proc.send({
      workerConfig: worker,
      bundles: JSON.stringify([bundle.toSpec()]),
      bundleRemotes: remotes.toSpecJson(),
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!compiled) {
        console.error('Timeout waiting for compilation');
        proc.kill('SIGKILL');
        reject(new Error('Compilation timeout'));
      }
    }, 300000);
  });
}

buildBundles()
  .then(() => {
    console.log('=== Bundle build complete ===');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Build failed:', err.message);
    process.exit(1);
  });
