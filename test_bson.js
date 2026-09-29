const fs = require('fs');
const path = require('path');

// Try requiring BSON or bson module
let BSON;
try {
  BSON = require('mongodb').BSON;
} catch (e) {
  try {
    BSON = require('bson');
  } catch (err) {
    console.error('Error requiring BSON:', err.message);
  }
}

const dumpDir = path.join(__dirname, 'db_dump');
console.log('Reading BSON dump files from:', dumpDir);

function readBsonFile(filename) {
  const filePath = path.join(dumpDir, filename);
  if (!fs.existsSync(filePath)) return [];
  const buffer = fs.readFileSync(filePath);
  const docs = [];
  let offset = 0;
  while (offset < buffer.length) {
    const docSize = buffer.readInt32LE(offset);
    if (docSize <= 0 || offset + docSize > buffer.length) break;
    const docBuffer = buffer.subarray(offset, offset + docSize);
    const doc = BSON.deserialize(docBuffer);
    docs.push(doc);
    offset += docSize;
  }
  return docs;
}

if (fs.existsSync(dumpDir)) {
  const files = fs.readdirSync(dumpDir).filter(f => f.endsWith('.bson'));
  console.log('BSON files found:', files);
  files.forEach(f => {
    const docs = readBsonFile(f);
    console.log(`- ${f}: ${docs.length} real production records loaded.`);
  });
}
