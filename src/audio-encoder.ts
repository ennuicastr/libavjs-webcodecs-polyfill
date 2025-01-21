/*
 * This file is part of the libav.js WebCodecs Polyfill implementation. The
 * interface implemented is derived from the W3C standard. No attribution is
 * required when using this library.
 *
 * Copyright (c) 2021-2024 Yahweasel
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

import * as ad from "./audio-data";
import * as adec from "./audio-decoder";
import * as eac from "./encoded-audio-chunk";
import * as et from "./event-target";
import * as libavs from "./avloader";
import * as misc from "./misc";

import type * as LibAVJS from "@libav.js/types";

export class AudioEncoder extends et.DequeueEventTarget {
    constructor(init: AudioEncoderInit) {
        super();

        // 1. Let e be a new AudioEncoder object.

        // 2. Assign a new queue to [[control message queue]].
        this._p = Promise.all([]);

        // 3. Assign false to [[message queue blocked]].
        // (unused in polyfill)

        // 4. Assign null to [[codec implementation]].
        this._libav = null;
        this._codec = this._c = this._frame = this._pkt = 0;
        this._filter_in_ctx = this._filter_out_ctx = null;
        this._filter_graph = this._buffersrc_ctx = this._buffersink_ctx = 0;

        /* 5. Assign the result of starting a new parallel queue to
         *    [[codec work queue]]. */
        // (shared queue)

        // 6. Assign false to [[codec saturated]].
        // (saturation unneeded in the polyfill)

        // 7. Assign init.output to [[output callback]].
        this._output = init.output;

        // 8. Assign init.error to [[error callback]].
        this._error = init.error;

        // 9. Assign null to [[active encoder config]].
        // 10. Assign null to [[active output config]].
        // (both part of the codec)

        // 11. Assign "unconfigured" to [[state]]
        this.state = "unconfigured";

        // 12. Assign 0 to [[encodeQueueSize]].
        this.encodeQueueSize = 0;

        // 13. Assign a new list to [[pending flush promises]].
        // 14. Assign false to [[dequeue event scheduled]].
        // (shared queue)

        // 15. Return e.
    }

    /* NOTE: These should technically be readonly, but I'm implementing them as
     * plain fields, so they're writable */
    state: misc.CodecState;
    encodeQueueSize: number;

    private _output: EncodedAudioChunkOutputCallback;
    private _error: misc.WebCodecsErrorCallback;

    // Metadata argument for output
    private _outputMetadata: EncodedAudioChunkMetadata | null = null;
    private _outputMetadataFilled: boolean = false;

    // Event queue
    private _p: Promise<unknown>;

    // LibAV state
    private _libav: LibAVJS.LibAV | null;
    private _codec: number;
    private _c: number;
    private _frame: number;
    private _pkt: number;
    private _pts: number | null = null;
    private _filter_in_ctx: LibAVJS.FilterIOSettings | null;
    private _filter_out_ctx: LibAVJS.FilterIOSettings | null;
    private _filter_graph: number;
    private _buffersrc_ctx: number;
    private _buffersink_ctx: number;

    configure(config: AudioEncoderConfig): void {
        const self = this;

        // 1. If config is not a valid AudioEncoderConfig, throw a TypeError.
        // NOTE: We don't support sophisticated codec string parsing (yet)

        // 2. If [[state]] is "closed", throw an InvalidStateError.
        if (this.state === "closed")
            throw new DOMException("Encoder is closed", "InvalidStateError");

        // Free any internal state
        if (this._libav)
            this._p = this._p.then(() => this._free());

        // 3. Set [[state]] to "configured".
        this.state = "configured";

        // 4. Queue a control message to configure the encoder using config.
        this._p = this._p.then(async function() {
            /* 1. Let supported be the result of running the Check
             * Configuration Support algorithm with config. */
            const supported = libavs.encoder(config.codec, config);

            // Get the output metadata now
            self._outputMetadata = { decoderConfig: {
                codec: config.codec,
                // Rest will be filled in when we get data
                sampleRate: 0,
                numberOfChannels: 0
            }};
            self._outputMetadataFilled = false;

            /* 2. If supported is false, queue a task to run the Close
             *    AudioEncoder algorithm with NotSupportedError and abort these
             *    steps. */
            if (!supported) {
                self._closeAudioEncoder(new DOMException("Unsupported codec", "NotSupportedError"));
                return;
            }

            /* 3. If needed, assign [[codec implementation]] with an
             *    implementation supporting config. */
            // 4. Configure [[codec implementation]] with config.
            const libav = self._libav = await libavs.get();

            // And initialize
            let frame_size: number;
            [self._codec, self._c, self._frame, self._pkt, frame_size] =
                await libav.ff_init_encoder(supported.codec, supported);
            self._pts = null;
            await libav.AVCodecContext_time_base_s(
                self._c, 1, supported.ctx!.sample_rate!
            );

            // Be ready to set up the filter
            self._filter_out_ctx = {
                sample_rate: supported.ctx!.sample_rate,
                sample_fmt: supported.ctx!.sample_fmt,
                channel_layout: supported.ctx!.channel_layout,
                frame_size
            };

            // 5. queue a task to run the following steps:
                // 1. Assign false to [[message queue blocked]].
                // 2. Queue a task to Process the control message queue.
            // (shared queue)

        }).catch(this._error);
    }

    // Our own algorithm, close libav
    private async _free() {
        if (this._filter_graph) {
            await this._libav!.avfilter_graph_free_js(this._filter_graph);
            this._filter_in_ctx = this._filter_out_ctx = null;
            this._filter_graph = this._buffersrc_ctx = this._buffersink_ctx =
                0;
        }
        if (this._c) {
            await this._libav!.ff_free_encoder(this._c, this._frame, this._pkt);
            this._codec = this._c = this._frame = this._pkt = 0;
        }
        if (this._libav) {
            libavs.free(this._libav);
            this._libav = null;
        }
    }

    private _closeAudioEncoder(exception: DOMException) {
        // 1. Run the Reset AudioEncoder algorithm with exception.
        this._resetAudioEncoder(exception);

        // 2. Set [[state]] to "closed".
        this.state = "closed";

        /* 3. Clear [[codec implementation]] and release associated system
         * resources. */
        this._p = this._p.then(() => this._free());

        /* 4. If exception is not an AbortError DOMException, invoke the
         *    [[error callback]] with exception. */
        if (exception.name !== "AbortError")
            this._p = this._p.then(() => { this._error(exception); });
    }

    private _resetAudioEncoder(exception: DOMException) {
        // 1. If [[state]] is "closed", throw an InvalidStateError.
        if (this.state === "closed")
            throw new DOMException("Encoder closed", "InvalidStateError");

        // 2. Set [[state]] to "unconfigured".
        this.state = "unconfigured";

        // ... really, we're just going to free it now
        this._p = this._p.then(() => this._free());
    }

    encode(data: ad.AudioData): void {
        /* 1. If the value of data’s [[Detached]] internal slot is true, throw
         * a TypeError. */
        if (data._libavGetData() === null)
            throw new TypeError("Detached");

        // 2. If [[state]] is not "configured", throw an InvalidStateError.
        if (this.state !== "configured")
            throw new DOMException("Unconfigured", "InvalidStateError");

        /* 3. Let dataClone hold the result of running the Clone AudioData
         *    algorithm with data. */
        const dataClone = data.clone();

        // 4. Increment [[encodeQueueSize]].
        this.encodeQueueSize++;

        // 5. Queue a control message to encode dataClone.
        this._p = this._p.then(async () => {
            const libav = this._libav!;
            const c = this._c;
            const pkt = this._pkt;
            const framePtr = this._frame;

            let encodedOutputs: LibAVJS.Packet[] | null = null;

            /* 3. Decrement [[encodeQueueSize]] and run the Schedule Dequeue
             *    Event algorithm. */
            this.encodeQueueSize--;
            this.dispatchEvent(new CustomEvent("dequeue"));

            /* 1. Attempt to use [[codec implementation]] to encode the media
             * resource described by dataClone. */
            try {
                // Arrange the data
                let raw: any = dataClone._libavGetData();
                const nb_samples = dataClone.numberOfFrames;
                if (!ad.isInterleaved(dataClone.format)) {
                    let split = [];
                    for (let i = 0; i < dataClone.numberOfChannels; i++)
                        split.push(raw.subarray(i * nb_samples, (i + 1) * nb_samples));
                    raw = split;
                }

                // Convert the format
                let format: number;
                switch (dataClone.format) {
                    case "u8":
                        format = libav.AV_SAMPLE_FMT_U8;
                        break;

                    case "s16":
                        format = libav.AV_SAMPLE_FMT_S16;
                        break;

                    case "s32":
                        format = libav.AV_SAMPLE_FMT_S32;
                        break;

                    case "f32":
                        format = libav.AV_SAMPLE_FMT_FLT;
                        break;

                    case "u8-planar":
                        format = libav.AV_SAMPLE_FMT_U8P;
                        break;

                    case "s16-planar":
                        format = libav.AV_SAMPLE_FMT_S16P;
                        break;

                    case "s32-planar":
                        format = libav.AV_SAMPLE_FMT_S32P;
                        break;

                    case "f32-planar":
                        format = libav.AV_SAMPLE_FMT_FLTP;
                        break;

                    default:
                        throw new TypeError("Invalid AudioSampleFormat");
                }

                // Convert the timestamp
                const ptsFull = Math.floor(dataClone.timestamp / 1000);
                const [pts, ptshi] = libav.f64toi64(ptsFull);

                // Convert the channel layout
                const cc = dataClone.numberOfChannels;
                const channel_layout = (cc === 1) ? 4 : ((1<<cc)-1);

                // Make the frame
                const sample_rate = dataClone.sampleRate;
                const frame: LibAVJS.Frame = {
                    data: raw,
                    format, pts, ptshi, channel_layout, sample_rate
                };

                // Check if the filter needs to be reconfigured
                let preOutputs: LibAVJS.Packet[] | null = null;
                if (this._filter_in_ctx) {
                    const filter_ctx = this._filter_in_ctx;
                    if (filter_ctx.sample_fmt !== frame.format ||
                        filter_ctx.channel_layout !== frame.channel_layout ||
                        filter_ctx.sample_rate !== frame.sample_rate) {
                        // Need a new filter! First, get anything left in the filter
                        let fframes = await this._filter([], true);

                        // Can't send partial frames through the encoder
                        fframes = fframes.filter(x => {
                            let frame_size: number;
                            if (x.data[0].length) {
                                // Planar
                                frame_size = x.data[0].length;
                            } else {
                                frame_size = x.data.length / x.channels!;
                            }
                            return frame_size === this._filter_out_ctx!.frame_size;
                        });

                        if (fframes.length) {
                            preOutputs =
                                await libav.ff_encode_multi(c, framePtr, pkt, fframes);
                        }

                        await libav.avfilter_graph_free_js(this._filter_graph);
                        this._filter_in_ctx = null;
                        this._filter_graph = this._buffersrc_ctx =
                            this._buffersink_ctx = 0;
                    }
                }

                // Set up the filter
                if (!this._filter_graph) {
                    const filter_ctx = this._filter_in_ctx = {
                        sample_rate: frame.sample_rate!,
                        sample_fmt: frame.format,
                        channel_layout: frame.channel_layout!
                    };
                    [this._filter_graph, this._buffersrc_ctx, this._buffersink_ctx] =
                        await libav.ff_init_filter_graph("aresample", filter_ctx,
                            this._filter_out_ctx!);
                }

                // Filter
                const fframes = await this._filter([frame]);

                // And encode
                encodedOutputs =
                    await libav.ff_encode_multi(c, framePtr, pkt, fframes);
                if (preOutputs)
                    encodedOutputs = preOutputs.concat(encodedOutputs);
                if (encodedOutputs.length && !this._outputMetadataFilled &&
                    fframes && fframes.length)
                    await this._getOutputMetadata(fframes[0]);

            /* 2. If encoding results in an error, queue a task on the control
             * thread event loop to run the Close AudioEncoder algorithm with
             * EncodingError. */
            } catch (ex) {
                this._p = this._p.then(() => {
                    this._closeAudioEncoder(<DOMException> ex);
                });
            }


            /* 3. If [[codec saturated]] equals true and
             *    [[codec implementation]] is no longer saturated, queue a task
             *    to perform the following steps: */
                // 1. Assign false to [[codec saturated]].
                // 2. Process the control message queue.
            // (no saturation)

            /* 4. Let encoded outputs be a list of encoded audio data outputs
             *    emitted by [[codec implementation]]. */

            /* 5. If encoded outputs is not empty, queue a task to run the
             *    Output EncodedAudioChunks algorithm with encoded outputs. */
            if (encodedOutputs)
                this._outputEncodedAudioChunks(encodedOutputs);

        }).catch(this._error);
    }

    // Internal: Filter the given audio
    private async _filter(frames: LibAVJS.Frame[], fin: boolean = false) {
        /* The specification does not state how timestamps should be related
         * between input and output. It's obvious that the timestamps should
         * increase at the appropriate rate based on the number of samples seen,
         * but where they should start is not stated. Google Chrome starts with
         * the timestamp of the first input frame, and ignores all other input
         * frame timestamps. We follow that convention as well. */
        if (frames.length && this._pts === null)
            this._pts = (frames[0].pts || 0);

        const fframes =
            await this._libav!.ff_filter_multi(this._buffersrc_ctx,
                this._buffersink_ctx, this._frame, frames, fin);
        for (const frame of fframes) {
            frame.pts = this._pts!;
            frame.ptshi = 0;
            this._pts! += frame.nb_samples!;
        }
        return fframes;
    }

    // Internal: Get output metadata
    private async _getOutputMetadata(frame: LibAVJS.Frame) {
        const libav = this._libav!;
        const c = this._c;
        const extradataPtr = await libav.AVCodecContext_extradata(c);
        const extradata_size = await libav.AVCodecContext_extradata_size(c);
        let extradata: Uint8Array | null = null;
        if (extradataPtr && extradata_size)
            extradata = await libav.copyout_u8(extradataPtr, extradata_size);

        this._outputMetadata!.decoderConfig.sampleRate = frame.sample_rate!;
        this._outputMetadata!.decoderConfig.numberOfChannels = frame.channels!;
        if (extradata)
            this._outputMetadata!.decoderConfig.description = extradata;

        this._outputMetadataFilled = true;
    }

    private _outputEncodedAudioChunks(packets: LibAVJS.Packet[]) {
        const libav = this._libav!;
        const sampleRate = this._filter_out_ctx!.sample_rate!;

        for (const packet of packets) {
            // 1. data
            const data = packet.data
            // 2. type
            const type: eac.EncodedAudioChunkType =
                (packet.flags! & 1) ? "key" : "delta";

            // 3. timestamp
            let timestamp = libav.i64tof64(packet.pts!, packet.ptshi!);
            timestamp = Math.floor(timestamp / sampleRate * 1000000);

            // 4. duration
            let duration

            if (packet.duration !== undefined && packet.durationhi !== undefined) {
                duration = libav.i64tof64(packet.duration, packet.durationhi);
                duration = Math.floor(duration / sampleRate * 1000000);
            }

            const chunk = new eac.EncodedAudioChunk({
                data, type, timestamp, duration
            });

            if (this._outputMetadataFilled)
                this._output(chunk, this._outputMetadata || void 0);
            else
                this._output(chunk);
        }
    }

    flush(): Promise<void> {
        /* 1. If [[state]] is not "configured", return a promise rejected with
         *    InvalidStateError DOMException. */
        if (this.state !== "configured")
            throw new DOMException("Invalid state", "InvalidStateError");

        // 2. Let promise be a new Promise.
        // 3. Append promise to [[pending flush promises]].
        // 4. Queue a control message to flush the codec with promise.
        // 5. Process the control message queue.
        // 6. Return promise.
        const ret = this._p.then(async () => {
            if (!this._c)
                return;

            /* 1. Signal [[codec implementation]] to emit all internal pending
             *    outputs. */

            // Make sure any last data is flushed
            const libav = this._libav!;
            const c = this._c;
            const frame = this._frame;
            const pkt = this._pkt;
            const buffersrc_ctx = this._buffersrc_ctx;
            const buffersink_ctx = this._buffersink_ctx;

            let encodedOutputs: LibAVJS.Packet[] | null = null;

            try {
                let fframes: LibAVJS.Frame[] | null = null;
                if (buffersrc_ctx)
                    fframes = await this._filter([], true);
                encodedOutputs =
                    await libav.ff_encode_multi(c, frame, pkt, fframes || [],
                        true);
                if (!this._outputMetadataFilled && fframes && fframes.length)
                    await this._getOutputMetadata(fframes[0]);
            } catch (ex) {
                this._p = this._p.then(() => {
                    this._closeAudioEncoder(<DOMException> ex);
                });
            }

            /* 2. Let encoded outputs be a list of encoded audio data outputs
             *    emitted by [[codec implementation]]. */

            // 3. Queue a task to perform these steps:
            {

                /* 1. If encoded outputs is not empty, run the Output
                 *    EncodedAudioChunks algorithm with encoded outputs. */
                if (encodedOutputs)
                    this._outputEncodedAudioChunks(encodedOutputs);

                // 2. Remove promise from [[pending flush promises]].
                // 3. Resolve promise.
                // (shared queue)
            }

        });
        this._p = ret;
        return ret;
    }

    reset(): void {
        this._resetAudioEncoder(new DOMException("Reset", "AbortError"));
    }

    close(): void {
        this._closeAudioEncoder(new DOMException("Close", "AbortError"));
    }

    static async isConfigSupported(
        config: AudioEncoderConfig
    ): Promise<AudioEncoderSupport> {
        const enc = libavs.encoder(config.codec, config);
        let supported = false;
        if (enc) {
            const libav = await libavs.get();
            try {
                const [, c, frame, pkt] =
                    await libav.ff_init_encoder(enc.codec, enc);
                await libav.ff_free_encoder(c, frame, pkt);
                supported = true;
            } catch (ex) {}
            await libavs.free(libav);
        }

        return {
            supported,
            config: misc.cloneConfig(
                config,
                ["codec", "sampleRate", "numberOfChannels", "bitrate"]
            )
        };
    }
}

export interface AudioEncoderInit {
    output: EncodedAudioChunkOutputCallback;
    error: misc.WebCodecsErrorCallback;
}

export interface EncodedAudioChunkMetadata {
    decoderConfig: adec.AudioDecoderConfig;
}

export type EncodedAudioChunkOutputCallback =
    (output: eac.EncodedAudioChunk, metadata?: EncodedAudioChunkMetadata) => void;

export interface AudioEncoderConfig {
    codec: string | {libavjs: libavs.LibAVJSCodec};
    sampleRate?: number;
    numberOfChannels?: number;
    bitrate?: number;

    // Opus-specific
    opus?: {
        format?: "opus",
        frameDuration?: number,
        complexity?: number,
        packetlossperc?: number,
        useinbandfec?: boolean,
        usedtx?: boolean
    },

    // FLAC-specific
    flac?: {
        blockSize?: number,
        compressLevel?: number
    }
}

export interface AudioEncoderSupport {
    supported: boolean;
    config: AudioEncoderConfig;
}
