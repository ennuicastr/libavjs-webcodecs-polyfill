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

import * as vf from "./video-frame";

import type * as LibAVJS from "libav.js";
declare let LibAV: LibAVJS.LibAVWrapper;

/* A non-threaded libav.js instance for scaling. This is an any because the
 * type definitions only expose the async versions, but this API requires the
 * _sync methods. */
let scaler: any = null;

// The original drawImage
let origDrawImage: (
    image: any, sx: number, sy: number, sWidth?: number, sHeight?: number, dx?:
    number, dy?: number, dWidth?: number, dHeight?: number
) => void = null;

/**
 * Load rendering capability.
 * @param polyfill  Set to polyfill CanvasRenderingContext2D.drawImage
 */
export async function load(polyfill: boolean) {
    // Get our scaler
    scaler = await LibAV.LibAV({noworker: true});

    // Polyfill drawImage
    origDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    if (polyfill)
        (<any> CanvasRenderingContext2D.prototype).drawImage = drawImagePolyfill;
}

/**
 * Draw this video frame on this canvas. FIXME: This is supposed to be
 * synchronous, but is actually asynchronous. Need a fully-synchronous version
 * of libav.js for this to "work".
 * @param ctx  CanvasRenderingContext2D to draw on
 * @param image  VideoFrame (or anything else) to draw
 * @param sx  Source X position OR destination X position
 * @param sy  Source Y position OR destination Y position
 * @param sWidth  Source width OR destination width
 * @param sHeight  Source height OR destination height
 * @param dx  Destination X position
 * @param dy  Destination Y position
 * @param dWidth  Destination width
 * @param dHeight  Destination height
 */
export function canvasDrawImage(
    ctx: CanvasRenderingContext2D, image: vf.VideoFrame, sx: number,
    sy: number, sWidth?: number, sHeight?: number, dx?: number, dy?: number,
    dWidth?: number, dHeight?: number
): void {
    if (!(image instanceof vf.VideoFrame)) {
        // Just use the original
        return origDrawImage.apply(ctx, Array.prototype.slice.call(arguments, 1));
    }

    // Normalize the arguments
    if (typeof sWidth === "undefined") {
        // dx, dy
        dx = sx;
        dy = sy;
        sx = void 0;
        sy = void 0;

    } else if (typeof dx === "undefined") {
        // dx, dy, dWidth, dHeight
        dx = sx;
        dy = sy;
        dWidth = sWidth;
        dHeight = sHeight;
        sx = void 0;
        sy = void 0;
        sWidth = void 0;
        sHeight = void 0;

    }

    if (typeof dWidth === "undefined") {
        dWidth = image.codedWidth;
        dHeight = image.codedHeight;
    }

    // Convert the format to libav.js
    let format: number = scaler.AV_PIX_FMT_RGBA;
    switch (image.format) {
        case "I420":
            format = scaler.AV_PIX_FMT_YUV420P;
            break;

        case "I420A":
            format = scaler.AV_PIX_FMT_YUVA420P;
            break;

        case "I422":
            format = scaler.AV_PIX_FMT_YUV422P;
            break;

        case "I444":
            format = scaler.AV_PIX_FMT_YUV444P;
            break;

        case "NV12":
            format = scaler.AV_PIX_FMT_NV12;
            break;

        case "RGBA":
        case "RGBX":
            format = scaler.AV_PIX_FMT_RGBA;
            break;

        case "BGRA":
        case "BGRX":
            format = scaler.AV_PIX_FMT_BGRA;
            break;
    }

    /* Convert the frame. This uses promises because of libav.js, but because
     * we're using a non-threaded version, the promises will actually all
     * resolve synchronously. */
    let frameData = new ImageData(dWidth, dHeight);

    const sctx = scaler.sws_getContext_sync(
        image.codedWidth, image.codedHeight, format,
        dWidth, dHeight, scaler.AV_PIX_FMT_RGBA,
        2, 0, 0, 0
    );
    const inFrame = scaler.av_frame_alloc_sync();
    const outFrame = scaler.av_frame_alloc_sync();

    // Convert the data (FIXME: duplication)
    const rawU8 = image._libavGetData();
    let rawIdx = 0;
    const raw: Uint8Array[][] = [];
    const planes = vf.numPlanes(image.format);
    for (let p = 0; p < planes; p++) {
        const plane: Uint8Array[] = [];
        raw.push(plane);
        const sb = vf.sampleBytes(image.format, p);
        const hssf =
            vf.horizontalSubSamplingFactor(image.format, p);
        const vssf =
            vf.verticalSubSamplingFactor(image.format, p);
        const w = ~~(image.codedWidth * sb / hssf);
        const h = ~~(image.codedHeight / vssf);
        for (let y = 0; y < h; y++) {
            plane.push(rawU8.subarray(rawIdx, rawIdx + w));
            rawIdx += w;
        }
    }

    // Copy it in
    scaler.ff_copyin_frame_sync(inFrame, {
        data: raw,
        format,
        width: image.codedWidth,
        height: image.codedHeight
    });

    // Rescale
    scaler.sws_scale_frame_sync(sctx, outFrame, inFrame);

    // Get the data back out again
    const frame = scaler.ff_copyout_frame_sync(outFrame);

    // Transfer all the data
    let idx = 0;
    for (let i = 0; i < frame.data.length; i++) {
        const plane = frame.data[i];
        for (let y = 0; y < plane.length; y++) {
            const row = plane[y];
            frameData.data.set(row, idx);
            idx += row.length
        }
    }

    // Finally, draw it
    ctx.putImageData(frameData, dx, dy);

    // And clean up
    scaler.av_frame_free_js_sync(outFrame),
    scaler.av_frame_free_js_sync(inFrame),
    scaler.sws_freeContext_sync(sctx)
}

/**
 * Polyfill version of canvasDrawImage.
 */
function drawImagePolyfill(
    image: vf.VideoFrame, sx: number, sy: number, sWidth?: number,
    sHeight?: number, dx?: number, dy?: number, dWidth?: number,
    dHeight?: number
) {
    if (image instanceof vf.VideoFrame) {
        return canvasDrawImage(
            this, image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight
        );
    }
    return origDrawImage.apply(this, arguments);
}
