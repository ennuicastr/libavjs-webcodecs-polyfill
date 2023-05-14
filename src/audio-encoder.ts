/*
 * This file is part of the libav.js WebCodecs Polyfill implementation. The
 * interface implemented is derived from the W3C standard. No attribution is
 * required when using this library.
 *
 * Copyright (c) 2021-2023 Yahweasel
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
import * as libavs from "./libav";
import * as misc from "./misc";

import type * as LibAVJS from "libav.js";

export class AudioEncoder {
    constructor(init: AudioEncoderInit) {
        this._output = init.output;
        this._error = init.error;

        this.state = "unconfigured";
        this.encodeQueueSize = 0;

        this._p = Promise.all([]);
        this._libav = null;
        this._codec = this._c = this._frame = this._pkt = 0;
        this._filter_in_ctx = this._filter_out_ctx = null;
        this._filter_graph = this._buffersrc_ctx = this._buffersink_ctx = 0;
    }

    /* NOTE: These should technically be readonly, but I'm implementing them as
     * plain fields, so they're writable */
    state: misc.CodecState;
    encodeQueueSize: number;

    private _output: EncodedAudioChunkOutputCallback;
    private _error: misc.WebCodecsErrorCallback;

    // Metadata argument for output
    private _outputMetadata: EncodedAudioChunkMetadata;
    private _outputMetadataFilled: boolean;

    // Event queue
    private _p: Promise<unknown>;

    // LibAV state
    private _libav: LibAVJS.LibAV;
    private _codec: number;
    private _c: number;
    private _frame: number;
    private _pkt: number;
    private _pts: number;
    private _filter_in_ctx: LibAVJS.FilterIOSettings;
    private _filter_out_ctx: LibAVJS.FilterIOSettings;
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

            /* 2. If supported is true, assign [[codec implementation]] with an
             * implementation supporting config. */
            if (supported) {
                const libav = self._libav = await libavs.get();

                // And initialize
                let frame_size: number;
                [self._codec, self._c, self._frame, self._pkt, frame_size] =
                    await libav.ff_init_encoder(supported.codec, supported);
                self._pts = 0;
                await libav.AVCodecContext_time_base_s(self._c, 1, supported.ctx.sample_rate);

                // Be ready to set up the filter
                self._filter_out_ctx = {
                    sample_rate: supported.ctx.sample_rate,
                    sample_fmt: supported.ctx.sample_fmt,
                    channel_layout: supported.ctx.channel_layout,
                    frame_size
                };
            }

            /* 3. Otherwise, run the Close AudioEncoder algorithm with
             * NotSupportedError and abort these steps. */
            else {
                self._closeAudioEncoder(new DOMException("Unsupported codec", "NotSupportedError"));
            }
            
        }).catch(this._error);
    }

    // Our own algorithm, close libav
    private async _free() {
        if (this._filter_graph) {
            await this._libav.avfilter_graph_free_js(this._filter_graph);
            this._filter_in_ctx = this._filter_out_ctx = null;
            this._filter_graph = this._buffersrc_ctx = this._buffersink_ctx =
                0;
        }
        if (this._c) {
            await this._libav.ff_free_encoder(this._c, this._frame, this._pkt);
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

        /* 4. If exception is not an AbortError DOMException, queue a task on
         * the control thread event loop to invoke the [[error callback]] with
         * exception. */
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
        const self = this;

        /* 1. If the value of data’s [[Detached]] internal slot is true, throw
         * a TypeError. */
        if (data._libavGetData() === null)
            throw new TypeError("Detached");

        // 2. If [[state]] is not "configured", throw an InvalidStateError.
        if (this.state !== "configured")
            throw new DOMException("Unconfigured", "InvalidStateError");

        /* 3. Let dataClone hold the result of running the Clone AudioData
         * algorithm with data. */
        const dataClone = data.clone();

        // 4. Increment [[encodeQueueSize]].
        this.encodeQueueSize++;

        // 5. Queue a control message to encode dataClone.
        this._p = this._p.then(async function() {
            const libav = self._libav;
            const c = self._c;
            const pkt = self._pkt;
            const framePtr = self._frame;

            let encodedOutputs: LibAVJS.Packet[] = null;

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
                const pts = ptsFull % 0x100000000;
                const ptshi = ~~(ptsFull / 0x100000000);

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
                let preOutputs: LibAVJS.Packet[] = null;
                if (self._filter_in_ctx) {
                    const filter_ctx = self._filter_in_ctx;
                    if (filter_ctx.sample_fmt !== frame.format ||
                        filter_ctx.channel_layout !== frame.channel_layout ||
                        filter_ctx.sample_rate !== frame.sample_rate) {
                        // Need a new filter! First, get anything left in the filter
                        const fframes = await self._filter([], true);
                        preOutputs =
                            await libav.ff_encode_multi(c, framePtr, pkt, fframes);

                        await libav.avfilter_graph_free_js(self._filter_graph);
                        self._filter_in_ctx = null;
                        self._filter_graph = self._buffersrc_ctx =
                            self._buffersink_ctx = 0;
                    }
                }

                // Set up the filter
                if (!self._filter_graph) {
                    const filter_ctx = self._filter_in_ctx = {
                        sample_rate: frame.sample_rate,
                        sample_fmt: frame.format,
                        channel_layout: frame.channel_layout
                    };
                    [self._filter_graph, self._buffersrc_ctx, self._buffersink_ctx] =
                        await libav.ff_init_filter_graph("aresample", filter_ctx,
                            self._filter_out_ctx);
                }

                // Filter
                const fframes = await self._filter([frame]);

                // And encode
                encodedOutputs =
                    await libav.ff_encode_multi(c, framePtr, pkt, fframes);
                if (preOutputs)
                    encodedOutputs = preOutputs.concat(encodedOutputs);
                if (encodedOutputs.length && !self._outputMetadataFilled &&
                    fframes && fframes.length)
                    await self._getOutputMetadata(fframes[0]);

            /* 2. If encoding results in an error, queue a task on the control
             * thread event loop to run the Close AudioEncoder algorithm with
             * EncodingError. */
            } catch (ex) {
                self._p = self._p.then(() => {
                    self._closeAudioEncoder(ex);
                });
            }

            /* 3. Queue a task on the control thread event loop to decrement
             * [[encodeQueueSize]]. */
            self.encodeQueueSize--;

            /* 4. Let encoded outputs be a list of encoded audio data outputs
             * emitted by [[codec implementation]]. */
            /* 5. If encoded outputs is not empty, queue a task on the control
             * thread event loop to run the Output EncodedAudioChunks algorithm
             * with encoded outputs. */
            if (encodedOutputs)
                self._outputEncodedAudioChunks(encodedOutputs);

        }).catch(this._error);
    }

    // Internal: Filter the given audio
    private async _filter(frames: LibAVJS.Frame[], fin: boolean = false) {
        const fframes =
            await this._libav.ff_filter_multi(this._buffersrc_ctx,
                this._buffersink_ctx, this._frame, frames, fin);
        for (const frame of fframes) {
            frame.pts = this._pts;
            frame.ptshi = 0;
            this._pts += frame.nb_samples;
        }
        return fframes;
    }

    // Internal: Get output metadata
    private async _getOutputMetadata(frame: LibAVJS.Frame) {
        const libav = this._libav;
        const c = this._c;
        const extradataPtr = await libav.AVCodecContext_extradata(c);
        const extradata_size = await libav.AVCodecContext_extradata_size(c);
        let extradata: Uint8Array = null;
        if (extradataPtr && extradata_size)
            extradata = await libav.copyout_u8(extradataPtr, extradata_size);

        this._outputMetadata.decoderConfig.sampleRate = frame.sample_rate;
        this._outputMetadata.decoderConfig.numberOfChannels = frame.channels;
        if (extradata)
            this._outputMetadata.decoderConfig.description = extradata;

        this._outputMetadataFilled = true;
    }

    private _outputEncodedAudioChunks(packets: LibAVJS.Packet[]) {
        const libav = this._libav;
        const sampleRate = this._filter_out_ctx.sample_rate;

        for (const packet of packets) {
            // 1. type
            const type: eac.EncodedAudioChunkType =
                (packet.flags & 1) ? "key" : "delta";

            // 2. timestamp
            let timestamp = Math.floor((packet.ptshi * 0x100000000 + packet.pts) / sampleRate * 1000000);
            if (timestamp < 0) timestamp = 0;

            const chunk = new eac.EncodedAudioChunk({
                type, timestamp,
                data: packet.data
            });

            if (this._outputMetadataFilled)
                this._output(chunk, this._outputMetadata);
            else
                this._output(chunk);
        }
    }

    flush(): Promise<void> {
        const self = this;

        const ret = this._p.then(async function() {
            if (!self._c)
                return;

            // Make sure any last data is flushed
            const libav = self._libav;
            const c = self._c;
            const frame = self._frame;
            const pkt = self._pkt;
            const buffersrc_ctx = self._buffersrc_ctx;
            const buffersink_ctx = self._buffersink_ctx;

            let encodedOutputs: LibAVJS.Packet[] = null;

            try {
                let fframes: LibAVJS.Frame[] = null;
                if (buffersrc_ctx)
                    fframes = await self._filter([], true);
                encodedOutputs =
                    await libav.ff_encode_multi(c, frame, pkt, fframes || [],
                        true);
                if (!self._outputMetadataFilled && fframes && fframes.length)
                    await self._getOutputMetadata(fframes[0]);
            } catch (ex) {
                self._p = self._p.then(() => {
                    self._closeAudioEncoder(ex);
                });
            }

            if (encodedOutputs)
                self._outputEncodedAudioChunks(encodedOutputs);
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
