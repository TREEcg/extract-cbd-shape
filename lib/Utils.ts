import type { Stream, Quad, Term } from "@rdfjs/types";
import { DataFactory } from "rdf-data-factory";
import {
    RdfStore,
    RdfStoreIndexNestedMapQuoted,
    TermDictionaryNumberRecordFullTerms,
    TermDictionaryQuotedIndexed,
} from "rdf-stores";

export function createGraphIndexedRdfStore(): RdfStore<number> {
    return new RdfStore<number>({
        indexCombinations: [
            ["graph", "subject", "predicate", "object"],
            ["graph", "predicate", "object", "subject"],
            ["graph", "object", "subject", "predicate"],
            ["subject", "predicate", "object", "graph"],
            ["predicate", "object", "subject", "graph"],
        ],
        indexConstructor: (subOptions) => new RdfStoreIndexNestedMapQuoted(subOptions),
        dictionary: new TermDictionaryQuotedIndexed(new TermDictionaryNumberRecordFullTerms()),
        dataFactory: new DataFactory(),
    });
}

/**
 * Converts a Stream into an Array.
 * @param stream The readable stream to be converted
 */
export function streamToArray(stream: Stream<Quad>): Promise<Quad[]> {
    return new Promise((resolve, reject) => {
        const result: Quad[] = [];
        stream.on("data", (quad) => {
            result.push(quad);
        });
        stream.on("end", () => {
            resolve(result);
        });
        stream.on("error", (error) => {
            reject(error);
        });
    });
}

export function uniqueQuads(quads: Quad[]): Quad[] {
    if (quads.length < 256) {
        return quads.filter((value, index, array) => {
            return index === array.findIndex((x) => x.equals(value));
        });
    }

    const seen = new Set<string>();
    const result: Quad[] = [];

    for (const quad of quads) {
        const key = quadKey(quad);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(quad);
    }

    return result;
}

function quadKey(quad: Quad): string {
    return [
        termKey(quad.subject),
        termKey(quad.predicate),
        termKey(quad.object),
        termKey(quad.graph),
    ].join(" ");
}

function termKey(term: Term): string {
    if (term.termType === "Quad") {
        return [
            term.termType,
            termKey(term.subject),
            termKey(term.predicate),
            termKey(term.object),
            termKey(term.graph),
        ].join("\0");
    }
    if (term.termType === "Literal") {
        return [
            term.termType,
            term.value,
            term.language,
            term.datatype.value,
        ].join("\0");
    }

    return [term.termType, term.value].join("\0");
}

/**
 * This function removes < and > from a label.
 * It also adds the invisible character ‎ after 'http(s):' and after 'www' to avoid
 * the path being interpreted as a link. See https://github.com/orgs/community/discussions/106690.  
 * @param path - The path from which to remove the < and >.
 */
export function clean(path: string): string {
    return path.replace(/</g, '')
        .replace(/http:/g, 'http:‎')
        .replace(/https:/g, 'https:‎')
        .replace(/www/g, 'www‎')
        .replace(/>/g, '');
}
