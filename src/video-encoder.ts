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

import type * as LibAVJS from "libav.js";

export class VideoEncoder {
    constructor(init: VideoEncoderInit) {
        this._output = init.output;
        this._error = init.error;

        this.state = misc.CodecState.UNCONFIGURED;
        this.encodeQueueSize = 0;

        this._p = Promise.all([]);
        this._libav = null;
        this._codec = this._c = this._frame = this._pkt = 0;
    }

    /* NOTE: These should technically be readonly, but I'm implementing them as
     * plain fields, so they're writable */
    state: misc.CodecState;
    encodeQueueSize: number;

    private _output: EncodedVideoChunkOutputCallback;
    private _error: misc.WebCodecsErrorCallback;

    // Event queue
    private _p: Promise<unknown>;

    // LibAV state
    private _libav: LibAVJS.LibAV;
    private _codec: number;
    private _c: number;
    private _frame: number;
    private _pkt: number;
    private _extradataSet: boolean;
    private _extradata: Uint8Array;

    configure(config: VideoEncoderConfig): void {
        const self = this;

        // 1. If config is not a valid VideoEncoderConfig, throw a TypeError.
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
                switch (codec) {
                    case "vp09":
                    case "vp9":
                        codec = "libvpx-vp9";
                        break;

                    case "vp8":
                        codec = "libvpx";
                        break;
                }

                // Map the flags
                const ctx: LibAVJS.AVCodecContextProps = {
                    pix_fmt: libav.AV_PIX_FMT_YUV420P,
                    width: config.width,
                    height: config.height
                };
                let options: Record<string, string> = null;
                // FIXME: Turn displayWidth/displayHeight into SAR
                if (config.bitrate)
                    ctx.bit_rate = config.bitrate;
                if (config.framerate) {
                    /* FIXME: We need this as a rational, not a floating-point,
                     * and this is obviously not the right way to do it */
                    ctx.framerate_num = Math.round(config.framerate);
                    ctx.framerate_den = 1;
                }
                // NOTE: CBR requests are, quite rightly, ignored

                if (config.latencyMode === LatencyMode.REALTIME) {
                    /* NOTE: These flags are specific to libvpx, and will need
                     * to change if AV1 support is added */
                    options = {
                        quality: "realtime",
                        "cpu-used": "8"
                    };
                }

                // And initialize
                let frame_size: number;
                [self._codec, self._c, self._frame, self._pkt] =
                    await libav.ff_init_encoder(codec, {ctx, options});
                self._extradataSet = false;
                self._extradata = null;
                await libav.AVCodecContext_time_base_s(self._c, 1, 1000);
            }

            /* 3. Otherwise, run the Close VideoEncoder algorithm with
             * NotSupportedError and abort these steps. */
            else {
                self._closeVideoEncoder(new DOMException("Unsupported codec", "NotSupportedError"));
            }
            
        }).catch(this._error);
    }

    // Our own algorithm, close libav
    private async _free() {
        if (this._c) {
            await this._libav.ff_free_encoder(this._c, this._frame, this._pkt);
            this._codec = this._c = this._frame = this._pkt = 0;
        }
        if (this._libav) {
            libavs.free(this._libav);
            this._libav = null;
        }
    }

    private _closeVideoEncoder(exception: DOMException) {
        // 1. Run the Reset VideoEncoder algorithm with exception.
        this._resetVideoEncoder(exception);

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

    private _resetVideoEncoder(exception: DOMException) {
        // 1. If [[state]] is "closed", throw an InvalidStateError.
        if (this.state === misc.CodecState.CLOSED)
            throw new DOMException("Encoder closed", "InvalidStateError");

        // 2. Set [[state]] to "unconfigured".
        this.state = misc.CodecState.UNCONFIGURED;

        // ... really, we're just going to free it now
        this._p = this._p.then(() => this._free());
    }

    encode(frame: vf.VideoFrame, options: VideoEncoderEncodeOptions = {}) {
        const self = this;

        /* 1. If the value of frame’s [[Detached]] internal slot is true, throw
         * a TypeError. */
        if (frame._libavGetData() === null)
            throw new TypeError("Detached");

        // 2. If [[state]] is not "configured", throw an InvalidStateError.
        if (this.state !== misc.CodecState.CONFIGURED)
            throw new DOMException("Unconfigured", "InvalidStateError");

        /* 3. Let frameClone hold the result of running the Clone VideoFrame
         * algorithm with frame. */
        const frameClone = frame.clone();

        // 4. Increment [[encodeQueueSize]].
        this.encodeQueueSize++;

        // 5. Queue a control message to encode frameClone.
        this._p = this._p.then(async function() {
            const libav = self._libav;
            const c = self._c;
            const pkt = self._pkt;
            const framePtr = self._frame;

            let encodedOutputs: LibAVJS.Packet[] = null;

            /* 1. Attempt to use [[codec implementation]] to encode frameClone
             * according to options. */
            try {

                // Convert the format
                let format: number;
                switch (frameClone.format) {
                    case vf.VideoPixelFormat.I420:
                        format = libav.AV_PIX_FMT_YUV420P;
                        break;

                    case vf.VideoPixelFormat.I420A:
                        format = libav.AV_PIX_FMT_YUVA420P;
                        break;

                    case vf.VideoPixelFormat.I422:
                        format = libav.AV_PIX_FMT_YUV422P;
                        break;

                    case vf.VideoPixelFormat.I444:
                        format = libav.AV_PIX_FMT_YUV444P;
                        break;

                    case vf.VideoPixelFormat.NV12:
                        format = libav.AV_PIX_FMT_NV12;
                        break;

                    case vf.VideoPixelFormat.RGBA:
                    case vf.VideoPixelFormat.RGBX:
                        format = libav.AV_PIX_FMT_RGBA;
                        break;

                    case vf.VideoPixelFormat.BGRA:
                    case vf.VideoPixelFormat.BGRX:
                        format = libav.AV_PIX_FMT_BGRA;
                        break;

                    default:
                        throw new TypeError("Invalid VideoPixelFormat");
                }

                // Convert the data
                const rawU8 = frameClone._libavGetData();
                let rawIdx = 0;
                const raw: Uint8Array[][] = [];
                const planes = vf.numPlanes(frameClone.format);
                for (let p = 0; p < planes; p++) {
                    const plane: Uint8Array[] = [];
                    raw.push(plane);
                    const sb = vf.sampleBytes(frameClone.format, p);
                    const hssf =
                        vf.horizontalSubSamplingFactor(frameClone.format, p);
                    const vssf =
                        vf.verticalSubSamplingFactor(frameClone.format, p);
                    const w = ~~(frameClone.codedWidth / hssf);
                    const h = ~~(frameClone.codedHeight / vssf);
                    for (let y = 0; y < h; y++) {
                        plane.push(rawU8.subarray(rawIdx, rawIdx + w));
                        rawIdx += w;
                    }
                }

                // Convert the timestamp
                const ptsFull = Math.floor(frameClone.timestamp / 1000);
                const pts = ptsFull % 0x100000000;
                const ptshi = ~~(ptsFull / 0x100000000);

                // Make the frame
                const frame: LibAVJS.Frame = {
                    data: raw,
                    format, pts, ptshi,
                    width: frameClone.codedWidth,
                    height: frameClone.codedHeight,
                    key_frame: options.keyFrame ? 1 : 0,
                    pict_type: options.keyFrame ? 1 : 0
                };

                // And encode
                encodedOutputs =
                    await libav.ff_encode_multi(c, framePtr, pkt, [frame]);
                if (encodedOutputs.length && !self._extradataSet)
                    await self._getExtradata();

            /* 2. If encoding results in an error, queue a task on the control
             * thread event loop to run the Close VideoEncoder algorithm with
             * EncodingError. */
            } catch (ex) {
                self._p = self._p.then(() => {
                    self._closeVideoEncoder(ex);
                });
            }

            /* 3. Queue a task on the control thread event loop to decrement
             * [[encodeQueueSize]]. */
            self.encodeQueueSize--;

            /* 4. Let encoded outputs be a list of encoded video data outputs
             * emitted by [[codec implementation]]. */
            /* 5. If encoded outputs is not empty, queue a task on the control
             * thread event loop to run the Output EncodedVideoChunks algorithm
             * with encoded outputs. */
            if (encodedOutputs)
                self._outputEncodedVideoChunks(encodedOutputs);

        }).catch(this._error);
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

    private _outputEncodedVideoChunks(packets: LibAVJS.Packet[]) {
        const libav = this._libav;

        for (const packet of packets) {
            // 1. type
            const type: evc.EncodedVideoChunkType =
                (packet.flags & 1) ? evc.EncodedVideoChunkType.KEY : evc.EncodedVideoChunkType.DELTA;

            // 2. timestamp
            let timestamp = Math.floor((packet.ptshi * 0x100000000 + packet.pts) * 1000);
            if (timestamp < 0) timestamp = 0;

            const chunk = new evc.EncodedVideoChunk({
                type: <any> type, timestamp,
                data: packet.data
            });

            /*if (this._extradata)
                this._output(chunk, this._extradata);
            else*/
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

            let encodedOutputs: LibAVJS.Packet[] = null;

            try {
                encodedOutputs =
                    await libav.ff_encode_multi(c, frame, pkt, [], true);
                if (!self._extradataSet)
                    await self._getExtradata();
            } catch (ex) {
                self._p = self._p.then(() => {
                    self._closeVideoEncoder(ex);
                });
            }

            if (encodedOutputs)
                self._outputEncodedVideoChunks(encodedOutputs);
        });
        this._p = ret;
        return ret;
    }

    reset(): void {
        this._resetVideoEncoder(new DOMException("Reset", "AbortError"));
    }

    close(): void {
        this._closeVideoEncoder(new DOMException("Close", "AbortError"));
    }

    static async isConfigSupported(
        config: VideoEncoderConfig
    ): Promise<VideoEncoderSupport> {
        return {
            supported: (libavs.encoders.indexOf(config.codec.replace(/\..*/, "")) >= 0),
            config
        };
    }
};

export interface VideoEncoderInit {
    output: EncodedVideoChunkOutputCallback;
    error: misc.WebCodecsErrorCallback;
}

// NOTE: Metadata is not currently supported
export type EncodedVideoChunkOutputCallback =
    (chunk: evc.EncodedVideoChunk, metadata?: any) => void;

export interface VideoEncoderConfig {
    codec: string;
    width: number;
    height: number;
    displayWidth?: number;
    displayHeight?: number;
    bitrate?: number;
    framerate?: number;
    hardwareAcceleration?: string; // Ignored, of course
    alpha?: string; // Ignored
    scalabilityMode?: string; // Ignored
    BitrateMode?: string; // Ignored
    latencyMode?: LatencyMode;
}

export interface VideoEncoderEncodeOptions {
    keyFrame?: boolean;
}

export const enum LatencyMode {
    QUALITY = "quality",
    REALTIME ="realtime"
}

export interface VideoEncoderSupport {
    supported: boolean;
    config: VideoEncoderConfig;
}
