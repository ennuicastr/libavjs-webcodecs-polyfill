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
