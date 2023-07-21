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
