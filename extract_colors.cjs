const fs = require('fs');
const { PNG } = require('pngjs');

fs.createReadStream('public/logo.png')
    .pipe(new PNG({ filterType: 4 }))
    .on('parsed', function () {
        const colors = {};
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                let idx = (this.width * y + x) << 2;
                let r = this.data[idx];
                let g = this.data[idx + 1];
                let b = this.data[idx + 2];
                let a = this.data[idx + 3];

                if (a > 50) {
                    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                    if (!colors[hex]) colors[hex] = 0;
                    colors[hex]++;
                }
            }
        }

        let sorted = Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 50);
        console.log("Dominant colors:");
        sorted.forEach(c => console.log(c[0] + ' : ' + c[1]));
    })
    .on('error', (err) => {
        console.error("Error reading PNG:", err);
    });
