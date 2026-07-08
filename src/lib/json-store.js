// Flat-file JSON persistence with atomic writes (tmp + rename).
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');

const dataFile = (f) => path.join(DATA_DIR, f);

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(dataFile(file), 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  const fp = dataFile(file);
  const tmp = fp + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, fp);
}

module.exports = { readJSON, writeJSON };
