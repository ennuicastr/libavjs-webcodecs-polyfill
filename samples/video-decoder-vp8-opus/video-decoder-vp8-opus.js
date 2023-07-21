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
    const videoPackets = allPackets[videoStream.index];
    const audioPackets = allPackets[audioStream.index];

    const audioInit = {
        codec: "opus",
        sampleRate: 48000,
        numberOfChannels: 1
    };

    async function decodeVideo(VideoDecoder, EncodedVideoChunk) {
        // Feed them into the decoder
        const frames = [];
        const decoder = new VideoDecoder({
            output: frame => frames.push(frame),
            error: x => alert(x)
        });
        decoder.configure({
            codec: "vp8",
            codedWidth: 1920,
            codedHeight: 1080
        });
        for (const packet of videoPackets) {
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

    const a = await decodeAudio(
        audioInit, audioPackets, audioStream, LibAVWebCodecs.AudioDecoder,
        LibAVWebCodecs.EncodedAudioChunk);
    let b = null;
    if (typeof AudioDecoder !== "undefined") {
        try {
            b = await decodeAudio(
                audioInit, audioPackets, audioStream, AudioDecoder,
                EncodedAudioChunk);
        } catch (ex) {
            console.error(ex);
        }
    }
    const va = await decodeVideo(
        LibAVWebCodecs.VideoDecoder, LibAVWebCodecs.EncodedVideoChunk);
    let vb = null;
    if (typeof VideoDecoder !== "undefined") {
        try {
            vb = await decodeVideo(VideoDecoder, EncodedVideoChunk);
        } catch (ex) {
            console.error(ex);
        }
    }

    postMessage({a, b, va, vb});
})();
