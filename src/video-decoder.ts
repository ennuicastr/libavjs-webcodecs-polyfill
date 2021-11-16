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

import * as evc from "./encoded-video-chunk";
import * as libavs from "./libav";
import * as misc from "./misc";
import * as vf from "./video-frame";

import * as LibAVJS from "../libav.types";

export class VideoDecoder {
    constructor(init: VideoDecoderInit) {
        this._output = init.output;
        this._error = init.error;

        this.state = misc.CodecState.UNCONFIGURED;
        this.decodeQueueSize = 0;

        this._p = Promise.all([]);
        this._libav = null;
        this._codec = this._c = this._pkt = this._frame = 0;
    }

    /* NOTE: These should technically be readonly, but I'm implementing them as
     * plain fields, so they're writable */
    state: misc.CodecState;
    decodeQueueSize: number;

    private _output: VideoFrameOutputCallback;
    private _error: misc.WebCodecsErrorCallback;

    // Event queue
    private _p: Promise<unknown>;

    // LibAV state
    private _libav: LibAVJS.LibAV;
    private _codec: number;
    private _c: number;
    private _pkt: number;
    private _frame: number;

    configure(config: VideoDecoderConfig): void {
        const self = this;

        // 1. If config is not a valid VideoDecoderConfig, throw a TypeError.
        // NOTE: We don't support sophisticated codec string parsing (yet)

        // 2. If [[state]] is “closed”, throw an InvalidStateError DOMException.
        if (this.state === misc.CodecState.CLOSED)
            throw new DOMException("Decoder is closed", "InvalidStateError");

        // Free any internal state
        if (this._libav)
            this._p = this._p.then(() => this._free());

        // 3. Set [[state]] to "configured".
        this.state = misc.CodecState.CONFIGURED;

        // 4. Set [[key chunk required]] to true.
        // NOTE: Not implemented

        // 5. Queue a control message to configure the decoder with config.
        this._p = this._p.then(async function() {
            /* 1. Let supported be the result of running the Check
             * Configuration Support algorithm with config. */
            const inCodec = config.codec.replace(/\..*/, "");
            const supported = (libavs.decoders.indexOf(inCodec) >= 0);

            /* 2. If supported is true, assign [[codec implementation]] with an
             * implementation supporting config. */
            if (supported) {
                const libav = self._libav = await libavs.get();

                // Map the codec to a libav name
                let codec = inCodec;
                switch (codec) {
                    case "vp09":
                        codec = "libvpx-vp9";
                        break;
                    case "vp8":
                        codec = "libvpx";
                        break;
                }

                // And initialize
                [self._codec, self._c, self._pkt, self._frame] =
                    await libav.ff_init_decoder(codec);
            }

            /* 3. Otherwise, run the Close VideoDecoder algorithm with
             * NotSupportedError DOMException. */
            else {
                self._closeVideoDecoder(new DOMException("Unsupported codec", "NotSupportedError"));
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

    private _closeVideoDecoder(exception: DOMException) {
        // 1. Run the Reset VideoDecoder algorithm with exception.
        this._resetVideoDecoder(exception);

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

    private _resetVideoDecoder(exception: DOMException) {
        // 1. If [[state]] is "closed", throw an InvalidStateError.
        if (this.state === misc.CodecState.CLOSED)
            throw new DOMException("Decoder closed", "InvalidStateError");

        // 2. Set [[state]] to "unconfigured".
        this.state = misc.CodecState.UNCONFIGURED;

        // ... really, we're just going to free it now
        this._p = this._p.then(() => this._free());
    }

    decode(chunk: evc.EncodedVideoChunk): void {
        const self = this;

        // 1. If [[state]] is not "configured", throw an InvalidStateError.
        if (this.state !== misc.CodecState.CONFIGURED)
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
                const packet: any = {
                    data: chunk.libavGetData(),
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
             * thread event loop to run the Close VideoDecoder algorithm with
             * EncodingError. */
            } catch (ex) {
                self._p = self._p.then(() => {
                    self._closeVideoDecoder(ex);
                });
            }

            /* 3. Queue a task on the control thread event loop to decrement
             * [[decodeQueueSize]]. */
            self.decodeQueueSize--;

            /* 4. Let decoded outputs be a list of decoded audio data outputs
             * emitted by [[codec implementation]]. */
            /* 5. If decoded outputs is not empty, queue a task on the control
             * thread event loop to run the Output VideoData algorithm with
             * decoded outputs. */
            if (decodedOutputs)
                self._outputVideoFrames(decodedOutputs);

        }).catch(this._error);
    }

    private _outputVideoFrames(frames: LibAVJS.Frame[]) {
        const libav = this._libav;

        for (const frame of frames) {
            // 1. format
            let format: vf.VideoPixelFormat;
            switch (frame.format) {
                case libav.AV_PIX_FMT_YUV420P:
                    format = vf.VideoPixelFormat.I420;
                    break;

                case libav.AV_PIX_FMT_YUVA420P:
                    format = vf.VideoPixelFormat.I420A;
                    break;

                case libav.AV_PIX_FMT_YUV422P:
                    format = vf.VideoPixelFormat.I422;
                    break;

                case libav.AV_PIX_FMT_YUV444P:
                    format = vf.VideoPixelFormat.I444;
                    break;

                case libav.AV_PIX_FMT_NV12:
                    format = vf.VideoPixelFormat.NV12;
                    break;

                case libav.AV_PIX_FMT_RGBA:
                    format = vf.VideoPixelFormat.RGBA;
                    break;

                case libav.AV_PIX_FMT_BGRA:
                    format = vf.VideoPixelFormat.BGRA;
                    break;

                default:
                    throw new DOMException("Unsupported libav format!", "EncodingError")
            }

            // 2. width and height
            const codedWidth = frame.width;
            const codedHeight = frame.height;

            // 3. timestamp (FIXME)
            const timestamp = (frame.ptshi * 0x100000000 + frame.pts) * 1000;

            // 4. data
            let raw: Uint8Array;
            {
                let ct = 0;
                for (let i = 0; i < frame.data.length; i++) {
                    const fd = frame.data[i];
                    for (let j = 0; j < fd.length; j++)
                        ct += fd[j].length;
                }
                raw = new Uint8Array(ct);
                ct = 0;
                for (let i = 0; i < frame.data.length; i++) {
                    const fd = frame.data[i];
                    for (let j = 0; j < fd.length; j++) {
                        const part = fd[j];
                        raw.set(part, ct);
                        ct += part.length;
                    }
                }
            }

            const data = new vf.VideoFrame(raw, {
                format, codedWidth, codedHeight, timestamp
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
                    self._closeVideoDecoder(ex);
                });
            }

            if (decodedOutputs)
                self._outputVideoFrames(decodedOutputs);
        });
        this._p = ret;
        return ret;
    }

    reset(): void {
        this._resetVideoDecoder(new DOMException("Reset", "AbortError"));
    }

    close(): void {
        this._closeVideoDecoder(new DOMException("Close", "AbortError"));
    }

    static async isConfigSupported(
        config: VideoDecoderConfig
    ): Promise<VideoDecoderSupport> {
        return {
            supported: (libavs.decoders.indexOf(config.codec.replace(/\..*/, "")) >= 0),
            config
        };
    }
}

export interface VideoDecoderInit {
    output: VideoFrameOutputCallback;
    error: misc.WebCodecsErrorCallback;
}

export type VideoFrameOutputCallback = (output: vf.VideoFrame) => void;

export interface VideoDecoderConfig {
    codec: string;
    description?: BufferSource;
    codedWidth?: number;
    codedHeight?: number;
    displayAspectWidth?: number;
    displayAspectHeight?: number;
    colorSpace?: vf.VideoColorSpaceInit;
    hardwareAcceleration?: string; // Ignored
    optimizeForLatency?: boolean;
}

export interface VideoDecoderSupport {
    supported: boolean;
    config: VideoDecoderConfig;
}
