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

importScripts("../worker-util.js");

(async function() {
    await LibAVWebCodecs.load();

    const [[videoStream, audioStream], allPackets] =
        await sampleDemux("../sample2.webm", "webm");
    const packets = allPackets[videoStream.index];

    async function decodeVideo(VideoDecoder, EncodedVideoChunk) {
        // Feed them into the decoder
        const frames = [];
        const decoder = new VideoDecoder({
            output: frame => frames.push(frame),
            error: x => console.error
        });
        decoder.configure({
            codec: "vp8",
            codedWidth: 1920,
            codedHeight: 1080
        });
        for (const packet of packets) {
            let pts = packet.ptshi * 0x100000000 + packet.pts;
            if (pts < 0)
                pts = 0;
            const ts = Math.round(
                pts * videoStream.time_base_num / videoStream.time_base_den *
                1000000);
            decoder.decode(new EncodedVideoChunk({
                type: (packet.flags & 1) ? "key" : "delta",
                timestamp: ts,
                data: packet.data
            }));
        }

        // Wait for it to finish
        await decoder.flush();
        decoder.close();

        return frames;
    }

    // First decode it
    let preDecode = performance.now();
    const frames = await decodeVideo(
        LibAVWebCodecs.VideoDecoder, LibAVWebCodecs.EncodedVideoChunk);
    let postDecode = performance.now();

    // Then encode it as VP8
    async function encode(VideoEncoder, VideoFrame) {
        const packets = [];
        const encoder = new VideoEncoder({
            output: packet => packets.push(packet),
            error: x => { throw new Error(x); }
        });
        encoder.configure({
            codec: "vp8",
            width: 1920,
            height: 1080,
            framerate: 25,
            latencyMode: "realtime"
        });

        /* NOTE: This direct-copy (_libavGetData) is here only because built-in
         * WebCodecs can't use our VideoData. Do not use it in production code. */
        for (const frame of frames) {
            encoder.encode(new VideoFrame(frame._libavGetData(), {
                layout: frame._libavGetLayout(),
                format: frame.format,
                codedWidth: frame.codedWidth,
                codedHeight: frame.codedHeight,
                timestamp: frame.timestamp
            }));
        }

        await encoder.flush();
        encoder.close();

        return await sampleMux("tmp.webm", "libvpx", packets);
    }

    let preEncode = performance.now();
    const a = await encode(LibAVWebCodecs.VideoEncoder, LibAVWebCodecs.VideoFrame);
    let postEncode = performance.now();
    let b = null;
    if (typeof VideoEncoder !== "undefined") {
        try {
            b = await encode(VideoEncoder, VideoFrame);
        } catch (ex) { console.error(ex); }
    }
    let postEncode2 = performance.now();

    postMessage({
        a, b,
        report: "Decode time: " + ~~(postDecode - preDecode) +
        "ms. Encode time: " + ~~(postEncode - preEncode) +
        "ms. Encode time (browser implementation): " +
        ~~(postEncode2 - postEncode) + "ms."
    });
})();
