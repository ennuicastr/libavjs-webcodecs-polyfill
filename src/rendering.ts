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

import * as libav from "./avloader";
import * as vf from "./video-frame";
import '@ungap/global-this';

import type * as LibAVJS from "libav.js";

/* A non-threaded libav.js instance for scaling. This is an any because the
 * type definitions only expose the async versions, but this API requires the
 * _sync methods. */
let scalerSync: any = null;

// A synchronous libav.js instance for scaling.
let scalerAsync: LibAVJS.LibAV = null;

// The original drawImage
let origDrawImage: any = null;

// The original drawImage Offscreen
let origDrawImageOffscreen: any = null;

// The original createImageBitmap
let origCreateImageBitmap: any = null;

/**
 * Load rendering capability.
 * @param libavOptions  Options to use while loading libav, only asynchronous
 * @param polyfill  Set to polyfill CanvasRenderingContext2D.drawImage
 */
export async function load(libavOptions: any, polyfill: boolean) {
    // Get our scalers
    if ("importScripts" in globalThis) {
        // Make sure the worker code doesn't run
        (<any> libav.LibAVWrapper).nolibavworker = true;
    }
    scalerSync = await libav.LibAVWrapper.LibAV({noworker: true});
    scalerAsync = await libav.LibAVWrapper.LibAV(libavOptions);

    // Polyfill drawImage
    if ('CanvasRenderingContext2D' in globalThis) {
        origDrawImage = CanvasRenderingContext2D.prototype.drawImage;
        if (polyfill)
            (<any> CanvasRenderingContext2D.prototype).drawImage = drawImagePolyfill;
    }
    if ('OffscreenCanvasRenderingContext2D' in globalThis) {
        origDrawImageOffscreen = OffscreenCanvasRenderingContext2D.prototype.drawImage;
        if (polyfill)
            (<any> OffscreenCanvasRenderingContext2D.prototype).drawImage = drawImagePolyfillOffscreen;
    }

    // Polyfill createImageBitmap
    origCreateImageBitmap = globalThis.createImageBitmap;
    if (polyfill)
        (<any> globalThis).createImageBitmap = createImageBitmap;
}

/**
 * Draw this video frame on this canvas, synchronously.
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
    if (!((<any> image)._data)) {
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
    let format: number = scalerSync.AV_PIX_FMT_RGBA;
    switch (image.format) {
        case "I420":
            format = scalerSync.AV_PIX_FMT_YUV420P;
            break;

        case "I420A":
            format = scalerSync.AV_PIX_FMT_YUVA420P;
            break;

        case "I422":
            format = scalerSync.AV_PIX_FMT_YUV422P;
            break;

        case "I444":
            format = scalerSync.AV_PIX_FMT_YUV444P;
            break;

        case "NV12":
            format = scalerSync.AV_PIX_FMT_NV12;
            break;

        case "RGBA":
        case "RGBX":
            format = scalerSync.AV_PIX_FMT_RGBA;
            break;

        case "BGRA":
        case "BGRX":
            format = scalerSync.AV_PIX_FMT_BGRA;
            break;
    }

    // Convert the frame synchronously
    const sctx = scalerSync.sws_getContext_sync(
        image.codedWidth, image.codedHeight, format,
        dWidth, dHeight, scalerSync.AV_PIX_FMT_RGBA,
        2, 0, 0, 0
    );
    const inFrame = scalerSync.av_frame_alloc_sync();
    const outFrame = scalerSync.av_frame_alloc_sync();

    // Convert the data (FIXME: duplication)
    const rawU8 = image._libavGetData ? image._libavGetData() : (<any> image)._data;
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
    scalerSync.ff_copyin_frame_sync(inFrame, {
        data: raw,
        format,
        width: image.codedWidth,
        height: image.codedHeight
    });

    // Rescale
    scalerSync.sws_scale_frame_sync(sctx, outFrame, inFrame);

    // Get the data back out again
    const frameData = scalerSync.ff_copyout_frame_video_imagedata_sync(outFrame);

    // Finally, draw it
    ctx.putImageData(frameData, dx, dy);

    // And clean up
    scalerSync.av_frame_free_js_sync(outFrame);
    scalerSync.av_frame_free_js_sync(inFrame);
    scalerSync.sws_freeContext_sync(sctx);
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

/**
 * Polyfill version of offscreenCanvasDrawImage.
 */
function drawImagePolyfillOffscreen(
    image: vf.VideoFrame, sx: number, sy: number, sWidth?: number,
    sHeight?: number, dx?: number, dy?: number, dWidth?: number,
    dHeight?: number
) {
    if (image instanceof vf.VideoFrame) {
        return canvasDrawImage(
            this, image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight
        );
    }
    return origDrawImageOffscreen.apply(this, arguments);
}

/**
 * Create an ImageBitmap from this drawable, asynchronously. NOTE:
 * Sub-rectangles are not implemented for VideoFrames, so only options is
 * available, and there, only scaling is available.
 * @param image  VideoFrame (or anything else) to draw
 * @param options  Other options
 */
export function createImageBitmap(
    image: vf.VideoFrame, opts: {
        resizeWidth?: number,
        resizeHeight?: number
    } = {}
): Promise<ImageBitmap> {
    if (!((<any> image)._data)) {
        // Just use the original
        return origCreateImageBitmap.apply(globalThis, arguments);
    }

    // Convert the format to libav.js
    let format: number = scalerAsync.AV_PIX_FMT_RGBA;
    switch (image.format) {
        case "I420":
            format = scalerAsync.AV_PIX_FMT_YUV420P;
            break;

        case "I420A":
            format = scalerAsync.AV_PIX_FMT_YUVA420P;
            break;

        case "I422":
            format = scalerAsync.AV_PIX_FMT_YUV422P;
            break;

        case "I444":
            format = scalerAsync.AV_PIX_FMT_YUV444P;
            break;

        case "NV12":
            format = scalerAsync.AV_PIX_FMT_NV12;
            break;

        case "RGBA":
        case "RGBX":
            format = scalerAsync.AV_PIX_FMT_RGBA;
            break;

        case "BGRA":
        case "BGRX":
            format = scalerAsync.AV_PIX_FMT_BGRA;
            break;
    }

    // Normalize arguments
    const dWidth =(typeof opts.resizeWidth === "number")
        ? opts.resizeWidth : image.displayWidth;
    const dHeight =(typeof opts.resizeHeight === "number")
        ? opts.resizeHeight : image.displayHeight;

    // Convert the frame
    return (async () => {
       const [sctx, inFrame, outFrame] = await Promise.all([
           scalerAsync.sws_getContext(
               image.codedWidth, image.codedHeight, format,
               dWidth, dHeight, scalerAsync.AV_PIX_FMT_RGBA, 2, 0, 0, 0
           ),
           scalerAsync.av_frame_alloc(),
           scalerAsync.av_frame_alloc()
       ]);

       // Convert the data (FIXME: duplication)
       const rawU8 = image._libavGetData ? image._libavGetData() : (<any> image)._data;
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
       await scalerAsync.ff_copyin_frame(inFrame, {
           data: raw,
           format,
           width: image.codedWidth,
           height: image.codedHeight
       }),

       // Rescale
       await scalerAsync.sws_scale_frame(sctx, outFrame, inFrame);

       // Get the data back out again
       const frameData =
           await scalerAsync.ff_copyout_frame_video_imagedata(outFrame);

       // And clean up
       await Promise.all([
           scalerAsync.av_frame_free_js(outFrame),
           scalerAsync.av_frame_free_js(inFrame),
           scalerAsync.sws_freeContext(sctx)
       ]);

       // Make the ImageBitmap
       return await origCreateImageBitmap(frameData);
    })();
}
