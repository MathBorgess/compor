const path = require('node:path');
const { buildSync } = require('esbuild');

const webRoot = path.resolve(__dirname, '..');
const studioSchema = path.join(webRoot, 'lib', 'schema.ts');

module.exports = function compileBrowserSchema(source) {
  if (this.getOptions().reuseStudioFacade === true) {
    // Studio and Agile Deliberation use the same Zod constructors and locale.
    const relative = path.relative(path.dirname(this.resourcePath), studioSchema);
    return 'export * from ' + JSON.stringify(relative.split(path.sep).join('/')) + ';';
  }

  const result = buildSync({
    absWorkingDir: webRoot,
    stdin: { contents: source, loader: 'ts', resolveDir: path.dirname(studioSchema) },
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'esnext',
    metafile: true,
    write: false,
  });
  for (const input of Object.keys(result.metafile.inputs)) {
    if (input !== '<stdin>') this.addDependency(path.resolve(webRoot, input));
  }
  return result.outputFiles[0].text;
};
