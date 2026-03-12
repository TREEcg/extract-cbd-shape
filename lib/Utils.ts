import type { Stream, Quad } from "@rdfjs/types";

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

/**
 * Converts a Stream into an AsyncGenerator.
 * @param stream The readable stream to be converted
 */
export async function* streamToAsyncIterable<Q extends Quad = Quad>(stream: Stream<Q>): AsyncGenerator<Q> {
    const queue: Q[] = [];
    let resolveNext: (() => void) | null = null;
    let rejectNext: ((err: unknown) => void) | null = null;
    let isEnded = false;
    let error: unknown = null;

    stream.on("data", (data: Q) => {
        queue.push(data);
        if (resolveNext) {
            resolveNext();
            resolveNext = null;
            rejectNext = null;
        }
    });

    stream.on("end", () => {
        isEnded = true;
        if (resolveNext) {
            resolveNext();
            resolveNext = null;
            rejectNext = null;
        }
    });

    stream.on("error", (err: unknown) => {
        error = err;
        if (rejectNext) {
            rejectNext(err);
            resolveNext = null;
            rejectNext = null;
        }
    });

    while (true) {
        if (queue.length > 0) {
            yield queue.shift() as Q;
        } else if (error) {
            throw error;
        } else if (isEnded) {
            break;
        } else {
            await new Promise<void>((resolve, reject) => {
                resolveNext = resolve;
                rejectNext = reject;
            });
        }
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