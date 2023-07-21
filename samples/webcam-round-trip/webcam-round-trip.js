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

        async function decoderOutput(frame) {
            const image = await LibAVWebCodecs.createImageBitmap(frame,
                {resizeWidth: 640, resizeHeight: 360});
            ctx.drawImage(image, 0, 0);
            image.close();
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
