(async function() {
    await LibAVWebCodecs.load();

    const [[stream], allPackets] =
        await sampleDemux("../sample1.opus", "opus");
    const packets = allPackets[stream.index];

    async function decode(AudioDecoder, EncodedAudioChunk) {
        // Feed them into the decoder
        const frames = [];
        const decoder = new AudioDecoder({
            output: frame => frames.push(frame),
            error: x => alert(x)
        });
        decoder.configure({
            codec: "opus",
            sampleRate: 48000,
            numberOfChannels: 2
        });
        for (const packet of packets) {
            let pts = packet.ptshi * 0x100000000 + packet.pts;
            if (pts < 0)
                pts = 0;
            const ts = Math.round(
                pts * stream.time_base_num / stream.time_base_den *
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

    const a = await decode(
        LibAVWebCodecs.AudioDecoder, LibAVWebCodecs.EncodedAudioChunk);
    let b = null;
    if (typeof AudioDecoder !== "undefined")
        b = await decode(AudioDecoder, EncodedAudioChunk);

    await sampleOutputAudio(a);
    if (a && b)
        await sampleCompareAudio(a, b);
})();
