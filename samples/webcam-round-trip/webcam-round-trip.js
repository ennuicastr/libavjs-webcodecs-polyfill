(async function() {
    await LibAVWebCodecs.load();

    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    const videoEl = document.createElement("video");
    videoEl.style.display = "none";
    document.body.appendChild(videoEl);

    // With polyfill
    const btn = document.createElement("button");
    btn.style.display = "block";
    btn.innerText = "Start";
    btn.onclick = () => { go(LibAVWebCodecs); };
    document.body.appendChild(btn);

    // Without polyfill
    let noPoly = null;
    if (typeof VideoEncoder !== "undefined") {
        noPoly = document.createElement("button");
        noPoly.style.display = "block";
        noPoly.innerText = "Start (no polyfill)";
        noPoly.onclick = () => { go(window); };
        document.body.appendChild(noPoly);
    }

    async function go(WebCodecs) {
        btn.style.display = "none";
        if (noPoly) noPoly.style.display = "none";

        // Get our input stream
        const mediaStream = await navigator.mediaDevices.getUserMedia({video: true});
        videoEl.srcObject = mediaStream;
        await videoEl.play();
        const settings = mediaStream.getVideoTracks()[0].getSettings();

        // Make our encoder
        const encoder = new WebCodecs.VideoEncoder({
            output: encoderOutput,
            error: x => alert(x)
        });
        encoder.configure({
            codec: "vp8",
            width: settings.width,
            height: settings.height,
            framerate: settings.frameRate,
            latencyMode: "realtime"
        });

        // Make our decoder
        const decoder = new WebCodecs.VideoDecoder({
            output: decoderOutput,
            error: x => alert(x)
        });
        decoder.configure({
            codec: "vp8"
        });

        function encoderOutput(data) {
            if (decoder.decodeQueueSize) {
                console.log("WARNING: Skipping decoding frame");
                return;
            }
            decoder.decode(data);
        }

        function decoderOutput(frame) {
            LibAVWebCodecs.canvasDrawImage(ctx, frame, 0, 0, 640, 360);
        }

        // And encode
        const startTime = performance.now();
        setInterval(async () => {
            if (encoder.encodeQueueSize) {
                console.log("WARNING: Skipping encoding frame!");
                return;
            }

            // Make the frame
            const frame = new WebCodecs.VideoFrame(videoEl, {
                timestamp: (performance.now() - startTime) * 1000
            });

            // And enqueue it
            encoder.encode(frame);
        }, Math.round(1000 / settings.frameRate));
    }
})();
