(async function() {
    await LibAVWebCodecs.load();

    const [[stream], allPackets] =
        await sampleDemux("../sample1.flac", "flac");
    const packets = allPackets[stream.index];

    const init = {
        codec: "flac",
        sampleRate: 48000,
        numberOfChannels: 2
    };

    // First decode it
    const frames = await decodeAudio(
        init, packets, stream, LibAVWebCodecs.AudioDecoder,
        LibAVWebCodecs.EncodedAudioChunk, {noextract: true});

    // Then encode it as Opus
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

        const opus = await sampleMux("tmp.flac", "flac", packets, extradata);
        const audio = document.createElement("audio");
        audio.src = URL.createObjectURL(new Blob([opus]));
        audio.controls = true;
        document.body.appendChild(audio);
    }

    await encode(LibAVWebCodecs.AudioEncoder, LibAVWebCodecs.AudioData);
    if (typeof AudioEncoder !== "undefined") {
        try {
            await encode(AudioEncoder, AudioData);
        } catch (ex) { console.error(ex); }
    }
})();
