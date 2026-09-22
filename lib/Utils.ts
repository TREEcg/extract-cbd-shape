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
    // Below this size the pairwise comparison is cheaper than building keys
    if (quads.length < 32) {
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
    // String concatenation rather than array joins: this runs per extracted quad
    return (
        termKey(quad.subject) +
        "\u0001" +
        quad.predicate.value +
        "\u0001" +
        termKey(quad.object) +
        "\u0001" +
        termKey(quad.graph)
    );
}

function termKey(term: Term): string {
    switch (term.termType) {
        case "NamedNode":
            return "N" + term.value;
        case "BlankNode":
            return "B" + term.value;
        case "DefaultGraph":
            return "D";
        case "Literal":
            return (
                "L" + term.datatype.value + "\0" + term.language + "\0" + term.value
            );
        case "Quad":
            return (
                "Q" +
                termKey(term.subject) +
                "\0" +
                termKey(term.predicate) +
                "\0" +
                termKey(term.object) +
                "\0" +
                termKey(term.graph)
            );
        default:
            return term.termType + "\0" + term.value;
    }
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
