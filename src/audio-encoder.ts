/*
 * This file is part of the libav.js WebCodecs Polyfill implementation. The
 * interface implemented is derived from the W3C standard. No attribution is
 * required when using this library.
 *
 * Copyright (c) 2021 Yahweasel
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
import * as eac from "./encoded-audio-chunk";
import * as libavs from "./libav";
import * as misc from "./misc";

import type * as LibAVJS from "libav.js";

export class AudioEncoder {
    constructor(init: AudioEncoderInit) {
        this._output = init.output;
        this._error = init.error;

        this.state = misc.CodecState.UNCONFIGURED;
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

    // Event queue
    private _p: Promise<unknown>;

    // LibAV state
    private _libav: LibAVJS.LibAV;
    private _codec: number;
    private _c: number;
    private _frame: number;
    private _pkt: number;
    private _pts: number;
    private _extradataSet: boolean;
    private _extradata: Uint8Array;
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
        if (this.state === misc.CodecState.CLOSED)
            throw new DOMException("Encoder is closed", "InvalidStateError");

        // Free any internal state
        if (this._libav)
            this._p = this._p.then(() => this._free());

        // 3. Set [[state]] to "configured".
        this.state = misc.CodecState.CONFIGURED;

        // 4. Queue a control message to configure the encoder using config.
        this._p = this._p.then(async function() {
            /* 1. Let supported be the result of running the Check
             * Configuration Support algorithm with config. */
            const inCodec = config.codec.replace(/\..*/, "");
            const supported = (libavs.encoders.indexOf(inCodec) >= 0);

            /* 2. If supported is true, assign [[codec implementation]] with an
             * implementation supporting config. */
            if (supported) {
                const libav = self._libav = await libavs.get();

                // Map the codec to a libav name
                let codec = inCodec;
                let sample_fmt: number = libav.AV_SAMPLE_FMT_FLT;
                switch (codec) {
                    case "flac":
                        sample_fmt = libav.AV_SAMPLE_FMT_S32;
                        break;

                    case "opus":
                        codec = "libopus";
                        break;

                    case "vorbis":
                        codec = "libvorbis";
                        sample_fmt = libav.AV_SAMPLE_FMT_FLTP;
                        break;
                }

                // Map the flags
                const ctx: LibAVJS.AVCodecContextProps = {sample_fmt};
                if (codec === "opus")
                    ctx.sample_rate = 48000;
                else if (config.sampleRate)
                    ctx.sample_rate = config.sampleRate;
                else
                    ctx.sample_rate = 48000;
                if (config.numberOfChannels) {
                    const cc = ctx.channels = config.numberOfChannels;
                    ctx.channel_layout = (cc === 1) ? 4 : ((1<<cc)-1);
                } else {
                    ctx.channel_layout = 4;
                }
                if (config.bitrate && codec !== "flac")
                    ctx.bit_rate = config.bitrate;

                // And initialize
                let frame_size: number;
                [self._codec, self._c, self._frame, self._pkt, frame_size] =
                    await libav.ff_init_encoder(codec, {ctx});
                self._pts = 0;
                self._extradataSet = false;
                self._extradata = null;
                await libav.AVCodecContext_time_base_s(self._c, 1, ctx.sample_rate);

                // Be ready to set up the filter
                self._filter_out_ctx = {
                    sample_rate: ctx.sample_rate,
                    sample_fmt,
                    channel_layout: ctx.channel_layout,
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
            await this._libav.avfilter_graph_free(this._filter_graph);
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
        this.state = misc.CodecState.CLOSED;

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
        if (this.state === misc.CodecState.CLOSED)
            throw new DOMException("Encoder closed", "InvalidStateError");

        // 2. Set [[state]] to "unconfigured".
        this.state = misc.CodecState.UNCONFIGURED;

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
        if (this.state !== misc.CodecState.CONFIGURED)
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
                    case ad.AudioSampleFormat.U8:
                        format = libav.AV_SAMPLE_FMT_U8;
                        break;

                    case ad.AudioSampleFormat.S16:
                        format = libav.AV_SAMPLE_FMT_S16;
                        break;

                    case ad.AudioSampleFormat.S32:
                        format = libav.AV_SAMPLE_FMT_S32;
                        break;

                    case ad.AudioSampleFormat.F32:
                        format = libav.AV_SAMPLE_FMT_FLT;
                        break;

                    case ad.AudioSampleFormat.U8P:
                        format = libav.AV_SAMPLE_FMT_U8P;
                        break;

                    case ad.AudioSampleFormat.S16P:
                        format = libav.AV_SAMPLE_FMT_S16P;
                        break;

                    case ad.AudioSampleFormat.S32P:
                        format = libav.AV_SAMPLE_FMT_S32P;
                        break;

                    case ad.AudioSampleFormat.F32P:
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

                        await libav.avfilter_graph_free(self._filter_graph);
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
                        await libav.ff_init_filter_graph("anull", filter_ctx,
                            self._filter_out_ctx);
                }

                // Filter
                const fframes = await self._filter([frame]);

                // And encode
                encodedOutputs =
                    await libav.ff_encode_multi(c, framePtr, pkt, fframes);
                if (preOutputs)
                    encodedOutputs = preOutputs.concat(encodedOutputs);
                if (encodedOutputs.length && !self._extradataSet)
                    await self._getExtradata();

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

    // Internal: Get extradata
    private async _getExtradata() {
        const libav = this._libav;
        const c = this._c;
        const extradata = await libav.AVCodecContext_extradata(c);
        const extradata_size = await libav.AVCodecContext_extradata_size(c);
        if (extradata && extradata_size)
            this._extradata = await libav.copyout_u8(extradata, extradata_size);
        this._extradataSet = true;
    }

    private _outputEncodedAudioChunks(packets: LibAVJS.Packet[]) {
        const libav = this._libav;
        const sampleRate = this._filter_out_ctx.sample_rate;

        for (const packet of packets) {
            // 1. type
            const type: eac.EncodedAudioChunkType =
                (packet.flags & 1) ? eac.EncodedAudioChunkType.KEY : eac.EncodedAudioChunkType.DELTA;

            // 2. timestamp
            let timestamp = Math.floor((packet.ptshi * 0x100000000 + packet.pts) / sampleRate * 1000000);
            if (timestamp < 0) timestamp = 0;

            const chunk = new eac.EncodedAudioChunk({
                type, timestamp,
                data: packet.data
            });

            if (this._extradata)
                this._output(chunk, this._extradata);
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
                if (!self._extradataSet)
                    await self._getExtradata();
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
        return {
            supported: (libavs.encoders.indexOf(config.codec.replace(/\..*/, "")) >= 0),
            config
        };
    }
}

export interface AudioEncoderInit {
    output: EncodedAudioChunkOutputCallback;
    error: misc.WebCodecsErrorCallback;
}

export type EncodedAudioChunkOutputCallback =
    (output: eac.EncodedAudioChunk, metadata?: BufferSource) => void;

export interface AudioEncoderConfig {
    codec: string;
    sampleRate?: number;
    numberOfChannels?: number;
    bitrate?: number;
}

export interface AudioEncoderSupport {
    supported: boolean;
    config: AudioEncoderConfig;
}
