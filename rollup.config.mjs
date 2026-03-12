import pkg from './package.json' with { type: 'json' };

// Get all dependencies from package.json to mark them as external
const dependencies = Object.keys(pkg.dependencies || {});
const peerDependencies = Object.keys(pkg.peerDependencies || {});
const externals = [
    ...dependencies,
    ...peerDependencies,
    'fs',
    'fs/promises',
    'path',
    'os',
    'url'
];

export default {
    input: './dist/lib/extract-cbd-shape.js',
    output: {
        file: './dist/lib/extract-cbd-shape.cjs',
        format: 'cjs',
    },
    external: (id) => {
        // Mark as external if it's in the list or starts with a dependency name (handling subpaths)
        return externals.some(dep => id === dep || id.startsWith(`${dep}/`));
    },
};
