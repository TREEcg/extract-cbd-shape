import { GroupedStreamParser } from 'wurtle';
import fs from 'fs';

const parser = new GroupedStreamParser({}),
      rdfStream = fs.createReadStream('kbo.ttl');

const parsedStream = rdfStream.pipe(parser);
parsedStream.on('data', (groupedQuads) => {
    console.dir(groupedQuads);
});