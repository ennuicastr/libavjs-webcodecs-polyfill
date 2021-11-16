(async function() {
    await LibAVWebCodecs.load();

    const [[videoStream, audioStream], allPackets] =
        await sampleDemux("../sample2.webm", "webm");
    const videoPackets = allPackets[videoStream.index];
    const audioPackets = allPackets[audioStream.index];

    async function decodeAudio(AudioDecoder, EncodedAudioChunk) {
        // Feed them into the decoder
        const frames = [];
        const decoder = new AudioDecoder({
            output: frame => frames.push(frame),
            error: x => alert(x)
        });
        decoder.configure({
            codec: "opus",
            sampleRate: 48000,
            numberOfChannels: 1
        });
        for (const packet of audioPackets) {
            let pts = packet.ptshi * 0x100000000 + packet.pts;
            if (pts < 0)
                pts = 0;
            const ts = Math.round(
                pts * audioStream.time_base_num / audioStream.time_base_den *
                1000000);
            decoder.decode(new EncodedAudioChunk({
                type: "key",
                timestamp: ts,
                data: packet.data
            }));
        }

        // Wait for it to finish
        await decoder.flush();
        decoder.close();

        // And output
        const out = [];
        const opts = {
            planeIndex: 0,
            format: "f32-planar"
        };
        for (const frame of frames) {
            const ab = new ArrayBuffer(frame.allocationSize(opts));
            frame.copyTo(ab, opts);
            out.push(new Float32Array(ab));
        }

        return out;
    }

    async function decodeVideo(VideoDecoder, EncodedVideoChunk) {
        // Feed them into the decoder
        const frames = [];
        const decoder = new VideoDecoder({
            output: frame => frames.push(frame),
            error: x => alert(x)
        });
        decoder.configure({
            codec: "vp8",
            codedWidth: 640,
            codedHeight: 360
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
        LibAVWebCodecs.AudioDecoder, LibAVWebCodecs.EncodedAudioChunk);
    let b = null;
    if (typeof AudioDecoder !== "undefined")
        b = await decodeAudio(AudioDecoder, EncodedAudioChunk);
    const c = await decodeVideo(
        LibAVWebCodecs.VideoDecoder, LibAVWebCodecs.EncodedVideoChunk);
    let d = null;
    if (typeof VideoDecoder !== "undefined")
        d = await decodeVideo(VideoDecoder, EncodedVideoChunk);

    await sampleOutputAudio(a);
    if (b)
        await sampleCompareAudio(a, b);

    await sampleOutputVideo(c[c.length - 1]);
    if (d)
        await sampleOutputVideo(d[d.length - 1]);
})();