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

export class AudioDecoder {
    constructor(init: AudioDecoderInit) {
        this._output = init.output;
        this._error = init.error;

        this.state = "unconfigured";
        this.decodeQueueSize = 0;

        this._p = Promise.all([]);
        this._libav = null;
        this._codec = this._c = this._pkt = this._frame = 0;
    }

    /* NOTE: These should technically be readonly, but I'm implementing them as
     * plain fields, so they're writable */
    state: misc.CodecState;
    decodeQueueSize: number;

    private _output: AudioDataOutputCallback;
    private _error: misc.WebCodecsErrorCallback;

    // Event queue
    private _p: Promise<unknown>;

    // LibAV state
    private _libav: LibAVJS.LibAV;
    private _codec: number;
    private _c: number;
    private _pkt: number;
    private _frame: number;

    configure(config: AudioDecoderConfig): void {
        const self = this;

        // 1. If config is not a valid AudioDecoderConfig, throw a TypeError.
        // NOTE: We don't support sophisticated codec string parsing (yet)

        // 2. If [[state]] is “closed”, throw an InvalidStateError DOMException.
        if (this.state === "closed")
            throw new DOMException("Decoder is closed", "InvalidStateError");

        // Free any internal state
        if (this._libav)
            this._p = this._p.then(() => this._free());

        // 3. Set [[state]] to "configured".
        this.state = "configured";

        // 4. Set [[key chunk required]] to true.
        // NOTE: Not implemented

        // 5. Queue a control message to configure the decoder with config.
        this._p = this._p.then(async function() {
            /* 1. Let supported be the result of running the Check
             * Configuration Support algorithm with config. */
            let udesc: Uint8Array;
            if (config.description) {
                if (ArrayBuffer.isView(config.description)) {
                    const descView = config.description as ArrayBufferView;
                    udesc = new Uint8Array(descView.buffer, descView.byteOffset, descView.byteLength);
                } else {
                    const descBuf = config.description as ArrayBuffer;
                    udesc = new Uint8Array(descBuf);
                }
            }
            const  supported = libavs.decoder(config.codec, config);
            /* 2. If supported is true, assign [[codec implementation]] with an
             * implementation supporting config. */
            if (supported) {
                const libav = self._libav = await libavs.get();
                const codecpara = await libav.avcodec_parameters_alloc();
                const ps = [
                   libav.AVCodecParameters_channels_s(codecpara, config.numberOfChannels),
                   libav.AVCodecParameters_sample_rate_s(codecpara, config.sampleRate),
                   libav.AVCodecParameters_codec_type_s(codecpara, 1 /*  AVMEDIA_TYPE_AUDIO */)
                ];
                let extraDataPtr = 0;
                if (!udesc) {
                    ps.push(libav.AVCodecParameters_extradata_s(codecpara, 0));
                    ps.push(libav.AVCodecParameters_extradata_size_s(codecpara, 0));
                } else {
                    ps.push(libav.AVCodecParameters_extradata_size_s(codecpara, udesc.byteLength));
                    extraDataPtr = await libav.calloc(udesc.byteLength + 64 /* AV_INPUT_BUFFER_PADDING_SIZE */, 1);
                    ps.push(libav.copyin_u8(extraDataPtr, udesc));
                    ps.push(libav.AVCodecParameters_extradata_s(codecpara, extraDataPtr))
                }
                await Promise.all(ps);

                // Initialize
                [self._codec, self._c, self._pkt, self._frame] =
                    await libav.ff_init_decoder(supported.codec, codecpara);
                const fps = [
                    libav.AVCodecContext_time_base_s(self._c, 1, 1000),
                    libav.avcodec_parameters_free_js(codecpara)
                ];
                if (extraDataPtr) fps.push(libav.free(extraDataPtr));
                await Promise.all(fps);
            }

            /* 3. Otherwise, run the Close AudioDecoder algorithm with
             * NotSupportedError DOMException. */
            else {
                self._closeAudioDecoder(new DOMException("Unsupported codec", "NotSupportedError"));
            }

        }).catch(this._error);
    }

    // Our own algorithm, close libav
    private async _free() {
        if (this._c) {
            await this._libav.ff_free_decoder(this._c, this._pkt, this._frame);
            this._codec = this._c = this._pkt = this._frame = 0;
        }
        if (this._libav) {
            libavs.free(this._libav);
            this._libav = null;
        }
    }

    private _closeAudioDecoder(exception: DOMException) {
        // 1. Run the Reset AudioDecoder algorithm with exception.
        this._resetAudioDecoder(exception);

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

    private _resetAudioDecoder(exception: DOMException) {
        // 1. If [[state]] is "closed", throw an InvalidStateError.
        if (this.state === "closed")
            throw new DOMException("Decoder closed", "InvalidStateError");

        // 2. Set [[state]] to "unconfigured".
        this.state = "unconfigured";

        // ... really, we're just going to free it now
        this._p = this._p.then(() => this._free());
    }

    decode(chunk: eac.EncodedAudioChunk) {
        const self = this;

        // 1. If [[state]] is not "configured", throw an InvalidStateError.
        if (this.state !== "configured")
            throw new DOMException("Unconfigured", "InvalidStateError");

        // 2. If [[key chunk required]] is true:
        //    1. If chunk.[[type]] is not key, throw a DataError.
        /*    2. Implementers SHOULD inspect the chunk’s [[internal data]] to
         *    verify that it is truly a key chunk. If a mismatch is detected,
         *    throw a DataError. */
        //    3. Otherwise, assign false to [[key chunk required]].

        // 3. Increment [[decodeQueueSize]].
        this.decodeQueueSize++;

        // 4. Queue a control message to decode the chunk.
        this._p = this._p.then(async function() {
            const libav = self._libav;
            const c = self._c;
            const pkt = self._pkt;
            const frame = self._frame;

            let decodedOutputs: LibAVJS.Frame[] = null;

            // 1. Attempt to use [[codec implementation]] to decode the chunk.
            try {
                // Convert to a libav packet
                const ptsFull = Math.floor(chunk.timestamp / 1000);
                const pts = ptsFull % 0x100000000;
                const ptshi = ~~(ptsFull / 0x100000000);
                const packet: LibAVJS.Packet = {
                    data: chunk._libavGetData(),
                    pts,
                    ptshi,
                    dts: pts,
                    dtshi: ptshi
                };
                if (chunk.duration) {
                    packet.duration = Math.floor(chunk.duration / 1000);
                    packet.durationhi = 0;
                }

                decodedOutputs = await libav.ff_decode_multi(c, pkt, frame, [packet]);

            /* 2. If decoding results in an error, queue a task on the control
             * thread event loop to run the Close AudioDecoder algorithm with
             * EncodingError. */
            } catch (ex) {
                self._p = self._p.then(() => {
                    self._closeAudioDecoder(ex);
                });
            }

            /* 3. Queue a task on the control thread event loop to decrement
             * [[decodeQueueSize]]. */
            self.decodeQueueSize--;

            /* 4. Let decoded outputs be a list of decoded audio data outputs
             * emitted by [[codec implementation]]. */
            /* 5. If decoded outputs is not empty, queue a task on the control
             * thread event loop to run the Output AudioData algorithm with
             * decoded outputs. */
            if (decodedOutputs)
                self._outputAudioData(decodedOutputs);

        }).catch(this._error);
    }

    private _outputAudioData(frames: LibAVJS.Frame[]) {
        const libav = this._libav;

        for (const frame of frames) {
            // 1. format
            let format: ad.AudioSampleFormat;
            let planar = false;
            switch (frame.format) {
                case libav.AV_SAMPLE_FMT_U8:
                    format = "u8";
                    break;

                case libav.AV_SAMPLE_FMT_S16:
                    format = "s16";
                    break;

                case libav.AV_SAMPLE_FMT_S32:
                    format = "s32";
                    break;

                case libav.AV_SAMPLE_FMT_FLT:
                    format = "f32";
                    break;

                case libav.AV_SAMPLE_FMT_U8P:
                    format = "u8";
                    planar = true;
                    break;

                case libav.AV_SAMPLE_FMT_S16P:
                    format = "s16";
                    planar = true;
                    break;

                case libav.AV_SAMPLE_FMT_S32P:
                    format = "s32";
                    planar = true;
                    break;

                case libav.AV_SAMPLE_FMT_FLTP:
                    format = "f32";
                    planar = true;
                    break;

                default:
                    throw new DOMException("Unsupported libav format!", "EncodingError")
            }

            // 2. sampleRate
            const sampleRate = frame.sample_rate;

            // 3. numberOfFrames
            const numberOfFrames = frame.nb_samples;

            // 4. numberOfChannels
            const numberOfChannels = frame.channels;

            // 5. timestamp
            const timestamp = (frame.ptshi * 0x100000000 + frame.pts) * 1000;

            // 6. data
            let raw: any;
            if (planar) {
                let ct = 0;
                for (let i = 0; i < frame.data.length; i++)
                    ct += frame.data[i].length;
                raw = new (frame.data[0].constructor)(ct);
                ct = 0;
                for (let i = 0; i < frame.data.length; i++) {
                    const part = frame.data[i];
                    raw.set(part, ct);
                    ct += part.length;
                }
            } else {
                raw = frame.data;
            }

            const data = new ad.AudioData({
                format, sampleRate, numberOfFrames, numberOfChannels,
                timestamp, data: raw
            });

            this._output(data);
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
            const pkt = self._pkt;
            const frame = self._frame;

            let decodedOutputs: LibAVJS.Frame[] = null;

            try {
                decodedOutputs = await libav.ff_decode_multi(c, pkt, frame, [], true);
            } catch (ex) {
                self._p = self._p.then(() => {
                    self._closeAudioDecoder(ex);
                });
            }

            if (decodedOutputs)
                self._outputAudioData(decodedOutputs);
        });
        this._p = ret;
        return ret;
    }

    reset(): void {
        this._resetAudioDecoder(new DOMException("Reset", "AbortError"));
    }

    close(): void {
        this._closeAudioDecoder(new DOMException("Close", "AbortError"));
    }

    static async isConfigSupported(
        config: AudioDecoderConfig
    ): Promise<AudioDecoderSupport> {
        const dec = libavs.decoder(config.codec, config);
        let supported = false;
        if (dec) {
            const libav = await libavs.get();
            try {
                const [, c, pkt, frame] = await libav.ff_init_decoder(dec.codec);
                await libav.ff_free_decoder(c, pkt, frame);
                supported = true;
            } catch (ex) {}
            await libavs.free(libav);
        }
        return {
            supported,
            config: misc.cloneConfig(
                config,
                ["codec", "sampleRate", "numberOfChannels"]
            )
        };
    }
}

export interface AudioDecoderInit {
    output: AudioDataOutputCallback;
    error: misc.WebCodecsErrorCallback;
}

export type AudioDataOutputCallback = (output: ad.AudioData) => void;

export interface AudioDecoderConfig {
    codec: string | {libavjs: libavs.LibAVJSCodec};
    sampleRate: number;
    numberOfChannels: number;
    description?: BufferSource;
}

export interface AudioDecoderSupport {
    supported: boolean;
    config: AudioDecoderConfig;
}
