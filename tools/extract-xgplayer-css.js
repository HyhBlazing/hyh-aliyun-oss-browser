var fs = require('fs');
var path = require('path');

var src = fs.readFileSync(
    path.join(__dirname, '../node_modules/xgplayer/dist/index.js'),
    'utf8'
);
var re = /exports\.push\(\[module\.i,\s*"((?:\\.|[^"\\])*)"/g;
var css = '';
var match;

while ((match = re.exec(src))) {
  css += match[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'") + '\n';
}

var outDir = path.join(__dirname, '../app/vendor');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

var outFile = path.join(outDir, 'xgplayer-skin-default.css');

fs.writeFileSync(outFile, css);
console.log('written', outFile, css.length, 'bytes');
