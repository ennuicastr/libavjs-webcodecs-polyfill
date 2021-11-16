async function sampleDemux(filename, suffix) {
    const inF = new Uint8Array(await (await fetch(filename)).arrayBuffer());
    const libav = await LibAV.LibAV({noworker: true});
    await libav.writeFile("tmp." + suffix, inF);
    const [fmt_ctx, streams] = await libav.ff_init_demuxer_file("tmp." + suffix);
    const pkt = await libav.av_packet_alloc();
    const [, packets] = await libav.ff_read_multi(fmt_ctx, pkt);
    libav.terminate();
    return [streams, packets];
}

async function sampleCompareAudio(a, b) {
    // Quick concat
    let blob = new Blob(a);
    a = new Float32Array(await blob.arrayBuffer());
    blob = new Blob(b);
    b = new Float32Array(await blob.arrayBuffer());

    let diff = Array.from(a).map((x, idx) => x - b[idx]).reduce((x, y) => x + y);
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

async function sampleOutputVideo(v) {
    const ab = new ArrayBuffer(v.allocationSize());
    v.copyTo(ab);
    const u8 = new Uint8Array(ab);
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    const w = canvas.width = v.codedWidth;
    const h = canvas.height = v.codedHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    let idx = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const g = u8[idx++];
            ctx.fillStyle = `rgb(${g},${g},${g})`;
            ctx.fillRect(x, y, 1, 1);
        }
    }
}
