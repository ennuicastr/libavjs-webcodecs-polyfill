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
import * as vf from "./video-frame";

import * as LibAVJS from "@libav.js/types";

export class VideoDecoder extends et.DequeueEventTarget {
    constructor(init: VideoDecoderInit) {
        super();

        // 1. Let d be a new VideoDecoder object.

        // 2. Assign a new queue to [[control message queue]].
        this._p = Promise.all([]);

        // 3. Assign false to [[message queue blocked]].
        // (unneeded in polyfill)

        // 4. Assign null to [[codec implementation]].
        this._libav = null;
        this._codec = this._c = this._pkt = this._frame = 0;

        /* 5. Assign the result of starting a new parallel queue to
         *    [[codec work queue]]. */
        // (shared queue)

        // 6. Assign false to [[codec saturated]].
        // (saturation not needed)

        // 7. Assign init.output to [[output callback]].
        this._output = init.output;

        // 8. Assign init.error to [[error callback]].
        this._error = init.error;

        // 9. Assign null to [[active decoder config]].
        // (part of codec)

        // 10. Assign true to [[key chunk required]].
        // (part of codec)

        // 11. Assign "unconfigured" to [[state]]
        this.state = "unconfigured";

        // 12. Assign 0 to [[decodeQueueSize]].
        this.decodeQueueSize = 0;

        // 13. Assign a new list to [[pending flush promises]].
        // (shared queue)

        // 14. Assign false to [[dequeue event scheduled]].
        // (not needed in polyfill)

        // 15. Return d.
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
    private _libav: LibAVJS.LibAV | null;
    private _codec: number;
    private _c: number;
    private _pkt: number;
    private _frame: number;

    configure(config: VideoDecoderConfig): void {
        // 1. If config is not a valid VideoDecoderConfig, throw a TypeError.
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
        // (part of the codec)

        // 5. Queue a control message to configure the decoder with config.
        this._p = this._p.then(async () => {
            /* 1. Let supported be the result of running the Check
             * Configuration Support algorithm with config. */
            const supported = libavs.decoder(config.codec, config);

            /* 2. If supported is false, queue a task to run the Close
             *    VideoDecoder algorithm with NotSupportedError and abort these
             *    steps. */
            if (!supported) {
                this._closeVideoDecoder(new DOMException("Unsupported codec", "NotSupportedError"));
                return;
            }

            /* 3. If needed, assign [[codec implementation]] with an
             *    implementation supporting config. */
            // 4. Configure [[codec implementation]] with config.
            const libav = this._libav = await libavs.get();

            // Initialize
            [this._codec, this._c, this._pkt, this._frame] =
                await libav.ff_init_decoder(supported.codec);
            await libav.AVCodecContext_time_base_s(this._c, 1, 1000);

            // 5. queue a task to run the following steps:
                // 1. Assign false to [[message queue blocked]].
                // 2. Queue a task to Process the control message queue.

        }).catch(this._error);
    }

    // Our own algorithm, close libav
    private async _free() {
        if (this._c) {
            await this._libav!.ff_free_decoder(this._c, this._pkt, this._frame);
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
        this.state = "closed";

        /* 3. Clear [[codec implementation]] and release associated system
         * resources. */
        this._p = this._p.then(() => this._free());

        /* 4. If exception is not an AbortError DOMException, invoke the
         *    [[error callback]] with exception. */
        if (exception.name !== "AbortError")
            this._p = this._p.then(() => { this._error(exception); });
    }

    private _resetVideoDecoder(exception: DOMException) {
        // 1. If [[state]] is "closed", throw an InvalidStateError.
        if (this.state === "closed")
            throw new DOMException("Decoder closed", "InvalidStateError");

        // 2. Set [[state]] to "unconfigured".
        this.state = "unconfigured";

        // ... really, we're just going to free it now
        this._p = this._p.then(() => this._free());
    }

    decode(chunk: evc.EncodedVideoChunk): void {
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
            const libav = self._libav!;
            const c = self._c;
            const pkt = self._pkt;
            const frame = self._frame;

            let decodedOutputs: LibAVJS.Frame[] | null = null;

            /* 3. Decrement [[decodeQueueSize]] and run the Schedule Dequeue
             *    Event algorithm. */
            self.decodeQueueSize--;
            self.dispatchEvent(new CustomEvent("dequeue"));

            // 1. Attempt to use [[codec implementation]] to decode the chunk.
            try {
                // Convert to a libav packet
                const ptsFull = Math.floor(chunk.timestamp / 1000);
                const [pts, ptshi] = libav.f64toi64(ptsFull);
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
             * thread event loop to run the Close VideoDecoder algorithm with
             * EncodingError. */
            } catch (ex) {
                self._p = self._p.then(() => {
                    self._closeVideoDecoder(<DOMException> ex);
                });
            }


            /* 3. If [[codec saturated]] equals true and
             *    [[codec implementation]] is no longer saturated, queue a task
             *    to perform the following steps: */
                // 1. Assign false to [[codec saturated]].
                // 2. Process the control message queue.
            // (unneeded)

            /* 4. Let decoded outputs be a list of decoded video data outputs
             *    emitted by [[codec implementation]] in presentation order. */

            /* 5. If decoded outputs is not empty, queue a task to run the
             *    Output VideoFrame algorithm with decoded outputs. */
            if (decodedOutputs)
                self._outputVideoFrames(decodedOutputs);

        }).catch(this._error);
    }

    private _outputVideoFrames(frames: LibAVJS.Frame[]) {
        const libav = this._libav!;

        for (const frame of frames) {
            // 1. format
            let format: vf.VideoPixelFormat;
            switch (frame.format) {
                case libav.AV_PIX_FMT_YUV420P: format = "I420"; break;
                case 0x3E: /* AV_PIX_FMT_YUV420P10 */ format = "I420P10"; break;
                case 0x7B: /* AV_PIX_FMT_YUV420P12 */ format = "I420P12"; break;
                case libav.AV_PIX_FMT_YUVA420P: format = "I420A"; break;
                case 0x57: /* AV_PIX_FMT_YUVA420P10 */ format = "I420AP10"; break;
                case libav.AV_PIX_FMT_YUV422P: format = "I422"; break;
                case 0x40: /* AV_PIX_FMT_YUV422P10 */ format = "I422P10"; break;
                case 0x7F: /* AV_PIX_FMT_YUV422P12 */ format = "I422P12"; break;
                case 0x4E: /* AV_PIX_FMT_YUVA422P */ format = "I422A"; break;
                case 0x59: /* AV_PIX_FMT_YUVA422P10 */ format = "I422AP10"; break;
                case 0xBA: /* AV_PIX_FMT_YUVA422P12 */ format = "I422AP12"; break;
                case libav.AV_PIX_FMT_YUV444P: format = "I444"; break;
                case 0x44: /* AV_PIX_FMT_YUV444P10 */ format = "I444P10"; break;
                case 0x83: /* AV_PIX_FMT_YUV444P12 */ format = "I444P12"; break;
                case 0x4F: /* AV_PIX_FMT_YUVA444P */ format = "I444A"; break;
                case 0x5B: /* AV_PIX_FMT_YUVA444P10 */ format = "I444AP10"; break;
                case 0xBC: /* AV_PIX_FMT_YUVA444P12 */ format = "I444AP12"; break;
                case libav.AV_PIX_FMT_NV12: format = "NV12"; break;
                case libav.AV_PIX_FMT_RGBA: format = "RGBA"; break;
                case 0x77: /* AV_PIX_FMT_RGB0 */ format = "RGBX"; break;
                case libav.AV_PIX_FMT_BGRA: format = "BGRA"; break;
                case 0x79: /* AV_PIX_FMT_BGR0 */ format = "BGRX"; break;

                default:
                    throw new DOMException("Unsupported libav format!", "EncodingError")
            }

            // 2. width and height
            const codedWidth = frame.width!;
            const codedHeight = frame.height!;

            // 3. cropping
            let visibleRect: DOMRect;
            if (frame.crop) {
                visibleRect = new DOMRect(
                    frame.crop.left, frame.crop.top,
                    codedWidth - frame.crop.left - frame.crop.right,
                    codedHeight - frame.crop.top - frame.crop.bottom
                );
            } else {
                visibleRect = new DOMRect(0, 0, codedWidth, codedHeight);
            }

            // Check for non-square pixels
            let displayWidth = codedWidth;
            let displayHeight = codedHeight;
            if (frame.sample_aspect_ratio && frame.sample_aspect_ratio[0]) {
                const sar = frame.sample_aspect_ratio;
                if (sar[0] > sar[1])
                    displayWidth = ~~(codedWidth * sar[0] / sar[1]);
                else
                    displayHeight = ~~(codedHeight * sar[1] / sar[0]);
            }

            // 3. timestamp
            const timestamp = libav.i64tof64(frame.pts!, frame.ptshi!) * 1000;

            const data = new vf.VideoFrame(frame.data, {
                layout: frame.layout,
                format, codedWidth, codedHeight, visibleRect, displayWidth, displayHeight,
                timestamp
            });

            this._output(data);
        }
    }

    flush(): Promise<void> {
        /* 1. If [[state]] is not "configured", return a promise rejected with
         *    InvalidStateError DOMException. */
        if (this.state !== "configured")
            throw new DOMException("Invalid state", "InvalidStateError");

        // 2. Set [[key chunk required]] to true.
        // (handled by codec)

        // 3. Let promise be a new Promise.
        // 4. Append promise to [[pending flush promises]].
        // 5. Queue a control message to flush the codec with promise.
        // 6. Process the control message queue.
        const ret = this._p.then(async () => {
            /* 1. Signal [[codec implementation]] to emit all internal pending
             *    outputs. */
            if (!this._c)
                return;

            // Make sure any last data is flushed
            const libav = this._libav!;
            const c = this._c;
            const pkt = this._pkt;
            const frame = this._frame;

            let decodedOutputs: LibAVJS.Frame[] | null = null;

            try {
                decodedOutputs = await libav.ff_decode_multi(c, pkt, frame, [], true);
            } catch (ex) {
                this._p = this._p.then(() => {
                    this._closeVideoDecoder(<DOMException> ex);
                });
            }

            /* 2. Let decoded outputs be a list of decoded video data outputs
             *    emitted by [[codec implementation]]. */
            // 3. Queue a task to perform these steps:
            {
                /* 1. If decoded outputs is not empty, run the Output VideoFrame
                 *    algorithm with decoded outputs. */
                if (decodedOutputs)
                    this._outputVideoFrames(decodedOutputs);

                // 2. Remove promise from [[pending flush promises]].
                // 3. Resolve promise.
            }

        });
        this._p = ret;

        // 7. Return promise.
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
                ["codec", "codedWidth", "codedHeight"]
            )
        };
    }
}

export interface VideoDecoderInit {
    output: VideoFrameOutputCallback;
    error: misc.WebCodecsErrorCallback;
}

export type VideoFrameOutputCallback = (output: vf.VideoFrame) => void;

export interface VideoDecoderConfig {
    codec: string | {libavjs: libavs.LibAVJSCodec};
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
