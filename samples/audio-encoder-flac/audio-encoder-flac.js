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

    const [[stream], allPackets] =
        await sampleDemux("../sample1.flac", "flac");
    const packets = allPackets[stream.index];

    const init = {
        codec: "flac",
        sampleRate: 48000,
        numberOfChannels: 2,
        description: stream.extradata
    };

    // First decode it
    const frames = await decodeAudio(
        init, packets, stream, LibAVWebCodecs.AudioDecoder,
        LibAVWebCodecs.EncodedAudioChunk, {noextract: true});

    // Then encode it as FLAC
    async function encode(AudioEncoder, AudioData) {
        const packets = [];
        let extradata = null;
        const encoder = new AudioEncoder({
            output: (packet, metadata) => {
                packets.push(packet);
                if (!extradata && metadata && metadata.decoderConfig && metadata.decoderConfig.description) {
                    const desc = metadata.decoderConfig.description;
                    extradata = new Uint8Array(desc.buffer || desc);
                }
            },
            error: x => alert(x)
        });
        encoder.configure({
            codec: "flac",
            sampleRate: 48000,
            numberOfChannels: 2
        });

        /* NOTE: This direct-copy (_libavGetData) is here only because built-in
         * WebCodecs can't use our AudioData. Do not use it in production code. */
        for (const frame of frames) {
            encoder.encode(new AudioData({
                format: frame.format,
                sampleRate: frame.sampleRate,
                numberOfFrames: frame.numberOfFrames,
                numberOfChannels: frame.numberOfChannels,
                timestamp: frame.timestamp,
                data: frame._libavGetData()
            }));
        }

        await encoder.flush();
        encoder.close();

        const flac = await sampleMux("tmp.flac", "flac", packets, extradata);
        return flac;
    }

    const a = await encode(LibAVWebCodecs.AudioEncoder, LibAVWebCodecs.AudioData);
    let b = null;
    if (typeof AudioEncoder !== "undefined") {
        try {
            b = await encode(AudioEncoder, AudioData);
        } catch (ex) { console.error(ex); }
    }
    postMessage({a, b});
})();
