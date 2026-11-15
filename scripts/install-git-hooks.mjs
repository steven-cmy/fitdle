#!/usr/bin/env node
/** Enable the repository's shared Git hooks. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const hooks = path.join(ROOT, '.githooks');
const config = spawnSync('git', ['config', 'core.hooksPath', hooks], { cwd: ROOT, stdio: 'inherit' });
if (config.status !== 0) process.exit(config.status || 1);
spawnSync('git', ['update-index', '--chmod=+x', '.githooks/pre-commit'], { cwd: ROOT, stdio: 'inherit' });
console.log(`Git hooks enabled: ${hooks}`);
