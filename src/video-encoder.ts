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

import * as evc from "./encoded-video-chunk";
import * as et from "./event-target";
import * as libavs from "./avloader";
import * as misc from "./misc";
import * as vd from "./video-decoder";
import * as vf from "./video-frame";

import type * as LibAVJS from "@libav.js/variant-webm-vp9";

export class VideoEncoder extends et.DequeueEventTarget {
    constructor(init: VideoEncoderInit) {
        super();

        // 1. Let e be a new VideoEncoder object.

        // 2. Assign a new queue to [[control message queue]].
        this._p = Promise.all([]);

        // 3. Assign false to [[message queue blocked]].
        // (unneeded in polyfill)

        // 4. Assign null to [[codec implementation]].
        this._libav = null;
        this._codec = this._c = this._frame = this._pkt = 0;

        /* 5. Assign the result of starting a new parallel queue to
         *    [[codec work queue]]. */
        // (shared queue)

        // 6. Assign false to [[codec saturated]].
        // (saturation unneeded)

        // 7. Assign init.output to [[output callback]].
        this._output = init.output;

        // 8. Assign init.error to [[error callback]].
        this._error = init.error;

        // 9. Assign null to [[active encoder config]].
        // (part of codec)

        // 10. Assign null to [[active output config]].
        this._metadata = null;

        // 11. Assign "unconfigured" to [[state]]
        this.state = "unconfigured";

        // 12. Assign 0 to [[encodeQueueSize]].
        this.encodeQueueSize = 0;

        // 13. Assign a new list to [[pending flush promises]].
        // (shared queue)

        // 14. Assign false to [[dequeue event scheduled]].
        // (shared queue)

        // 15. Return e.
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
    private _libav: LibAVJS.LibAV | null;
    private _codec: number;
    private _c: number;
    private _frame: number;
    private _pkt: number;
    private _extradataSet: boolean = false;
    private _extradata: Uint8Array | null = null;
    private _metadata: EncodedVideoChunkMetadata | null;

    // Software scaler state, if used
    private _sws?: number;
    private _swsFrame?: number;
    private _swsIn?: SWScaleState;
    private _swsOut?: SWScaleState;

    // If our output uses non-square pixels, that information
    private _nonSquarePixels: boolean = false;
    private _sar_num: number = 1;
    private _sar_den: number = 1;

    configure(config: VideoEncoderConfig): void {
        // 1. If config is not a valid VideoEncoderConfig, throw a TypeError.
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
        this._p = this._p.then(async () => {
            /* 1. Let supported be the result of running the Check
             * Configuration Support algorithm with config. */
            const supported = libavs.encoder(config.codec, config);

            /* 2. If supported is false, queue a task to run the Close
             *    VideoEncoder algorithm with NotSupportedError and abort these
             *    steps. */
            if (!supported) {
                this._closeVideoEncoder(new DOMException("Unsupported codec", "NotSupportedError"));
                return;
            }

            /* 3. If needed, assign [[codec implementation]] with an
             *    implementation supporting config. */
            // 4. Configure [[codec implementation]] with config.
            const libav = this._libav = await libavs.get();
            this._metadata = {
                decoderConfig: {
                    codec: supported.codec
                }
            };

            // And initialize
            [this._codec, this._c, this._frame, this._pkt] =
                await libav.ff_init_encoder(supported.codec, supported);
            this._extradataSet = false;
            this._extradata = null;
            await libav.AVCodecContext_time_base_s(this._c, 1, 1000);

            const width = config.width;
            const height = config.height;

            this._sws = 0;
            this._swsFrame = 0;
            this._swsOut = {
                width, height,
                format: supported.ctx!.pix_fmt!
            };

            // Check for non-square pixels
            const dWidth = config.displayWidth || width;
            const dHeight = config.displayHeight || height;
            if (dWidth !== width || dHeight !== height) {
                this._nonSquarePixels = true;
                this._sar_num = dWidth * height;
                this._sar_den = dHeight * width;
            } else {
                this._nonSquarePixels = false;
            }

            // 5. queue a task to run the following steps:
                // 1. Assign false to [[message queue blocked]].
                // 2. Queue a task to Process the control message queue.

        }).catch(this._error);
    }

    // Our own algorithm, close libav
    private async _free() {
        if (this._sws) {
            await this._libav!.av_frame_free_js(this._swsFrame!);
            await this._libav!.sws_freeContext(this._sws);
            this._sws = this._swsFrame = 0;
            this._swsIn = this._swsOut = void 0;
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

    private _closeVideoEncoder(exception: DOMException) {
        // 1. Run the Reset VideoEncoder algorithm with exception.
        this._resetVideoEncoder(exception);

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

    private _resetVideoEncoder(exception: DOMException) {
        // 1. If [[state]] is "closed", throw an InvalidStateError.
        if (this.state === "closed")
            throw new DOMException("Encoder closed", "InvalidStateError");

        // 2. Set [[state]] to "unconfigured".
        this.state = "unconfigured";

        // ... really, we're just going to free it now
        this._p = this._p.then(() => this._free());
    }

    encode(frame: vf.VideoFrame, options: VideoEncoderEncodeOptions = {}) {
        /* 1. If the value of frame’s [[Detached]] internal slot is true, throw
         * a TypeError. */
        if (frame._libavGetData() === null)
            throw new TypeError("Detached");

        // 2. If [[state]] is not "configured", throw an InvalidStateError.
        if (this.state !== "configured")
            throw new DOMException("Unconfigured", "InvalidStateError");

        /* 3. Let frameClone hold the result of running the Clone VideoFrame
         * algorithm with frame. */
        const frameClone = frame.clone();

        // 4. Increment [[encodeQueueSize]].
        this.encodeQueueSize++;

        // 5. Queue a control message to encode frameClone.
        this._p = this._p.then(async () => {
            const libav = this._libav!;
            const c = this._c;
            const pkt = this._pkt;
            const framePtr = this._frame;
            const swsOut = this._swsOut!;

            let encodedOutputs: LibAVJS.Packet[] | null = null;

            /* 3. Decrement [[encodeQueueSize]] and run the Schedule Dequeue
             *    Event algorithm. */
            this.encodeQueueSize--;
            this.dispatchEvent(new CustomEvent("dequeue"));

            /* 1. Attempt to use [[codec implementation]] to encode frameClone
             * according to options. */
            try {

                // Convert the format
                const format = vf.wcFormatToLibAVFormat(libav, frameClone.format);

                // Convert the data
                const rawU8 = frameClone._libavGetData();
                const layout = frameClone._libavGetLayout();

                // Convert the timestamp
                const ptsFull = Math.floor(frameClone.timestamp / 1000);
                const [pts, ptshi] = libav.f64toi64(ptsFull);

                // Make the frame
                const frame: LibAVJS.Frame = {
                    data: rawU8, layout,
                    format, pts, ptshi,
                    width: frameClone.codedWidth,
                    height: frameClone.codedHeight,
                    crop: {
                        left: frameClone.visibleRect.left,
                        right: frameClone.visibleRect.right,
                        top: frameClone.visibleRect.top,
                        bottom: frameClone.visibleRect.bottom
                    },
                    key_frame: options.keyFrame ? 1 : 0,
                    pict_type: options.keyFrame ? 1 : 0
                };

                // Possibly scale
                if (frame.width !== swsOut.width ||
                    frame.height !== swsOut.height ||
                    frame.format !== swsOut.format) {
                    if (frameClone._nonSquarePixels) {
                        frame.sample_aspect_ratio = [
                            frameClone._sar_num,
                            frameClone._sar_den
                        ];
                    }

                    // Need a scaler
                    let sws = this._sws, swsIn = this._swsIn!,
                        swsFrame = this._swsFrame!;
                    if (!sws ||
                        frame.width !== swsIn.width ||
                        frame.height !== swsIn.height ||
                        frame.format !== swsIn.format) {
                        // Need to allocate the scaler
                        if (sws)
                            await libav.sws_freeContext(sws);
                        swsIn = {
                            width: frame.width!,
                            height: frame.height!,
                            format: frame.format
                        };
                        sws = await libav.sws_getContext(
                            swsIn.width, swsIn.height, swsIn.format,
                            swsOut.width, swsOut.height, swsOut.format,
                            2, 0, 0, 0);
                        this._sws = sws;
                        this._swsIn = swsIn;

                        // Maybe need a frame
                        if (!swsFrame)
                            this._swsFrame = swsFrame = await libav.av_frame_alloc()
                    }

                    // Scale and encode the frame
                    const [, swsRes, , , , , , encRes] =
                    await Promise.all([
                        libav.ff_copyin_frame(framePtr, frame),
                        libav.sws_scale_frame(sws, swsFrame, framePtr),
                        this._nonSquarePixels ?
                            libav.AVFrame_sample_aspect_ratio_s(swsFrame,
                                this._sar_num, this._sar_den) :
                            null,
                        libav.AVFrame_pts_s(swsFrame, pts),
                        libav.AVFrame_ptshi_s(swsFrame, ptshi),
                        libav.AVFrame_key_frame_s(swsFrame, options.keyFrame ? 1 : 0),
                        libav.AVFrame_pict_type_s(swsFrame, options.keyFrame ? 1 : 0),
                        libav.avcodec_send_frame(c, swsFrame)
                    ]);
                    if (swsRes < 0 || encRes < 0)
                        throw new Error("Encoding failed!");
                    encodedOutputs = [];
                    while (true) {
                        const recv =
                            await libav.avcodec_receive_packet(c, pkt);
                        if (recv === -libav.EAGAIN)
                            break;
                        else if (recv < 0)
                            throw new Error("Encoding failed!");
                        encodedOutputs.push(
                            await libav.ff_copyout_packet(pkt));
                    }

                } else {
                    if (this._nonSquarePixels) {
                        frame.sample_aspect_ratio = [
                            this._sar_num,
                            this._sar_den
                        ];
                    }

                    // Encode directly
                    encodedOutputs =
                        await libav.ff_encode_multi(c, framePtr, pkt, [frame]);

                }

                if (encodedOutputs.length && !this._extradataSet)
                    await this._getExtradata();

            /* 2. If encoding results in an error, queue a task to run the
             *    Close VideoEncoder algorithm with EncodingError and return. */
            } catch (ex) {
                this._p = this._p.then(() => {
                    this._closeVideoEncoder(<DOMException> ex);
                });
                return;
            }

            /* 3. If [[codec saturated]] equals true and
             *    [[codec implementation]] is no longer saturated, queue a task
             *    to perform the following steps: */
                // 1. Assign false to [[codec saturated]].
                // 2. Process the control message queue.
            // (unneeded in polyfill)

            /* 4. Let encoded outputs be a list of encoded video data outputs
             *    emitted by [[codec implementation]]. */

            /* 5. If encoded outputs is not empty, queue a task to run the
             *    Output EncodedVideoChunks algorithm with encoded outputs. */
            if (encodedOutputs)
                this._outputEncodedVideoChunks(encodedOutputs);

        }).catch(this._error);
    }

    // Internal: Get extradata
    private async _getExtradata() {
        const libav = this._libav!;
        const c = this._c;
        const extradata = await libav.AVCodecContext_extradata(c);
        const extradata_size = await libav.AVCodecContext_extradata_size(c);
        if (extradata && extradata_size) {
            this._metadata!.decoderConfig!.description = this._extradata =
                await libav.copyout_u8(extradata, extradata_size);
        }
        this._extradataSet = true;
    }

    private _outputEncodedVideoChunks(packets: LibAVJS.Packet[]) {
        const libav = this._libav!;

        for (const packet of packets) {
            // 1. type
            const type: evc.EncodedVideoChunkType =
                (packet.flags! & 1) ? "key" : "delta";

            // 2. timestamp
            const timestamp = libav.i64tof64(packet.pts!, packet.ptshi!) * 1000;

            const chunk = new evc.EncodedVideoChunk({
                type: <any> type, timestamp,
                data: packet.data
            });

            if (this._extradataSet)
                this._output(chunk, this._metadata || void 0);
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
        const ret = this._p.then(async () => {
            /* 1. Signal [[codec implementation]] to emit all internal pending
             *    outputs. */
            if (!this._c)
                return;

            // Make sure any last data is flushed
            const libav = this._libav!;
            const c = this._c;
            const frame = this._frame;
            const pkt = this._pkt;

            let encodedOutputs: LibAVJS.Packet[] | null = null;

            try {
                encodedOutputs =
                    await libav.ff_encode_multi(c, frame, pkt, [], true);
                if (!this._extradataSet)
                    await this._getExtradata();
            } catch (ex) {
                this._p = this._p.then(() => {
                    this._closeVideoEncoder(<DOMException> ex);
                });
            }

            /* 2. Let encoded outputs be a list of encoded video data outputs
             *    emitted by [[codec implementation]]. */

            // 3. Queue a task to perform these steps:
            {
                /* 1. If encoded outputs is not empty, run the Output
                 *    EncodedVideoChunks algorithm with encoded outputs. */
                if (encodedOutputs)
                    this._outputEncodedVideoChunks(encodedOutputs);

                // 2. Remove promise from [[pending flush promises]].
                // 3. Resolve promise.
            }

        });
        this._p = ret;

        // 6. Return promise.
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
                ["codec", "width", "height", "bitrate", "framerate", "latencyMode"]
            )
        };
    }
};

export interface VideoEncoderInit {
    output: EncodedVideoChunkOutputCallback;
    error: misc.WebCodecsErrorCallback;
}

export type EncodedVideoChunkOutputCallback =
    (chunk: evc.EncodedVideoChunk,
    metadata?: EncodedVideoChunkMetadata) => void;

export interface EncodedVideoChunkMetadata {
    decoderConfig?: vd.VideoDecoderConfig;
    svc?: any; // Unused
    alphaSideData?: any; // Unused
}

export interface VideoEncoderConfig {
    codec: string | {libavjs: libavs.LibAVJSCodec};
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

export type LatencyMode =
    "quality" |
    "realtime";

export interface VideoEncoderSupport {
    supported: boolean;
    config: VideoEncoderConfig;
}

// Used internally
interface SWScaleState {
    width: number;
    height: number;
    format: number;
}
