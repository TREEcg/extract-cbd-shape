import path from "node:path";
import { pathToFileURL } from "node:url";
import { RdfStore } from "rdf-stores";

const configuredDist = process.env.EXTRACT_CBD_SHAPE_DIST;
const distUrl = configuredDist
  ? pathToFileURL(path.resolve(configuredDist) + path.sep)
  : new URL("../dist/lib/", import.meta.url);

const packageModule = await import(new URL("extract-cbd-shape.js", distUrl));
const extractorModule = await import(new URL("CBDShapeExtractor.js", distUrl));

export const CBDShapeExtractor = extractorModule.CBDShapeExtractor;
export const createGraphIndexedRdfStore =
  packageModule.createGraphIndexedRdfStore ?? RdfStore.createDefault;
