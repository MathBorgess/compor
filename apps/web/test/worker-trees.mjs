import {constants} from 'node:fs';
import {copyFile, lstat, mkdir, readdir, readlink, symlink, link} from 'node:fs/promises';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';

async function settleAll(tasks) {
  const results = await Promise.allSettled(tasks);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
}

// Sources have independent inodes. Only installed dependency files are shared;
// their directories and relative symlinks still belong to each private tree.
async function copyTree(source, target, sourceRoot, targetRoot, dependencies = false) {
  const stat = await lstat(source);
  if (stat.isSymbolicLink()) {
    const destination = resolve(dirname(source), await readlink(source));
    const within = relative(sourceRoot, destination);
    if (isAbsolute(within) || within === '..' || within.startsWith(`..${sep}`)) {
      throw Error(`Dependência fora da árvore de origem: ${source}`);
    }
    await symlink(relative(dirname(target), join(targetRoot, within)), target);
  } else if (stat.isDirectory()) {
    await mkdir(target, {recursive: true});
    const entries = await readdir(source);
    await settleAll(entries.filter(name => !['.next', '.git', '.cache', 'node_modules'].includes(name) && !name.endsWith('.tsbuildinfo')).map(name =>
      copyTree(join(source, name), join(target, name), sourceRoot, targetRoot, dependencies)));
    // Dependencies may themselves contain nested dependency directories.
    if (dependencies && entries.includes('node_modules')) {
      await copyTree(join(source, 'node_modules'), join(target, 'node_modules'), sourceRoot, targetRoot, true);
    }
  } else if (stat.isFile()) {
    if (dependencies) {
      try { await link(source, target); return; }
      catch (error) { if (!['EXDEV', 'ENOTSUP', 'EPERM'].includes(error.code)) throw error; }
    }
    await copyFile(source, target, constants.COPYFILE_FICLONE);
  } else {
    throw Error(`Tipo de arquivo não suportado na árvore de teste: ${source}`);
  }
}

async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function prepareWorkerTrees(sourceRoot, runRoot) {
  const sources = ['package.json', 'package-lock.json', 'apps/web', 'packages'];
  const dependencyDirs = ['node_modules', 'apps/web/node_modules'];
  for (const entry of await readdir(join(sourceRoot, 'packages'), {withFileTypes: true})) {
    if (entry.isDirectory()) dependencyDirs.push(`packages/${entry.name}/node_modules`);
  }
  const installed = [];
  for (const path of dependencyDirs) if (await exists(join(sourceRoot, path))) installed.push(path);
  await settleAll([0, 1].map(async slot => {
    const targetRoot = join(runRoot, 'workers', String(slot));
    await mkdir(targetRoot, {recursive: true});
    await settleAll(sources.map(path => copyTree(join(sourceRoot, path), join(targetRoot, path), sourceRoot, targetRoot)));
    await settleAll(installed.map(async path => {
      await mkdir(dirname(join(targetRoot, path)), {recursive: true});
      await copyTree(join(sourceRoot, path), join(targetRoot, path), sourceRoot, targetRoot, true);
    }));
  }));
}
