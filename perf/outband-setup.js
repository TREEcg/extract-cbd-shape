const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const FILES_DIRECTORY = './resources/members';

const server = http.createServer((req, res) => {
    if (path.normalize(decodeURI(req.url)) !== decodeURI(req.url)) {
        res.statusCode = 403;
        res.end();
        return;
    }
    // Extract the filename from the URL
    const filename = req.url.slice(1); // Remove leading '/'
    const filePath = path.join(__dirname, FILES_DIRECTORY, filename);
    // console.log(filePath);
    // Check if the file exists
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
        } else {
            // Read the TTL file and send its content as the response
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Internal Server Error');
                } else {
                    res.writeHead(200, { 'Content-Type': 'text/turtle' });
                    res.end(data);
                }
            });
        }
    });
});

server.listen(PORT, () => {
    console.log(`member data publish at http://localhost:${PORT}//member-{x}.ttl`);
});
