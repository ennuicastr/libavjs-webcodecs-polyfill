/*
 * This (un)license applies only to this sample code, and not to
 * libavjs-webcodecs-polyfill as a whole:
 *
 * This is free and unencumbered software released into the public domain.
 *
 * Anyone is free to copy, modify, publish, use, compile, sell, or distribute
 * this software, either in source code form or as a compiled binary, for any
 * purpose, commercial or non-commercial, and by any means.
 *
 * In jurisdictions that recognize copyright laws, the author or authors of
 * this software dedicate any and all copyright interest in the software to the
 * public domain. We make this dedication for the benefit of the public at
 * large and to the detriment of our heirs and successors. We intend this
 * dedication to be an overt act of relinquishment in perpetuity of all present
 * and future rights to this software under copyright law.
 *
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
 * ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

async function sampleCompareAudio(a, b) {
    // Quick concat
    let blob = new Blob(a);
    a = new Float32Array(await blob.arrayBuffer());
    blob = new Blob(b);
    b = new Float32Array(await blob.arrayBuffer());

    let diff = Array.from(a).map((x, idx) => Math.abs(x - b[idx])).reduce((x, y) => x + y);
    const div = document.createElement("div");
    div.innerText = `Difference: ${diff}`;
    document.body.appendChild(div);
}

async function sampleOutputAudio(a) {
    // Quick concat
    const blob = new Blob(a);
    a = new Float32Array(await blob.arrayBuffer());

    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    const w = canvas.width = 1024;
    const h = canvas.height = 64;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    for (let x = 0; x < w; x++) {
        const idx = Math.floor((x / w) * a.length);
        const y = h - (h * Math.abs(a[idx]));
        ctx.fillStyle = "#fff";
        ctx.fillRect(x, 0, 1, y);
        ctx.fillStyle = "#0f0";
        ctx.fillRect(x, y, 1, h - y);
    }
}

function sampleOutputVideo(v, fps) {
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    const w = canvas.width = v[0].codedWidth;
    const h = canvas.height = v[0].codedHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    let idx = 0;
    const interval = setInterval(async () => {
        const image = await LibAVWebCodecs.createImageBitmap(v[idx++]);
        ctx.drawImage(image, 0, 0);

        if (idx >= v.length)
            idx = 0;
    }, Math.round(1000 / fps))
}
