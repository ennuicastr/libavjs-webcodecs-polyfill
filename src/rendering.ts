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

import * as libav from "./avloader";
import * as vf from "./video-frame";
import '@ungap/global-this';

import type * as LibAVJS from "@libav.js/variant-webm-vp9";

// A non-threaded libav.js instance for scaling.
let scalerSync: (LibAVJS.LibAV & LibAVJS.LibAVSync) | null = null;

// A synchronous libav.js instance for scaling.
let scalerAsync: LibAVJS.LibAV | null = null;

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
    scalerSync = await libav.LibAVWrapper!.LibAV({noworker: true});
    scalerAsync = await libav.LibAVWrapper!.LibAV(libavOptions);

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
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    image: vf.VideoFrame, ax: number, ay: number, sWidth?: number,
    sHeight?: number, dx?: number, dy?: number, dWidth?: number,
    dHeight?: number
): void {
    if (!((<any> image)._data)) {
        // Just use the original
        return origDrawImage.apply(ctx, Array.prototype.slice.call(arguments, 1));
    }

    let sx: number | undefined;
    let sy: number | undefined;

    // Normalize the arguments
    if (typeof sWidth === "undefined") {
        // dx, dy
        dx = ax;
        dy = ay;

    } else if (typeof dx === "undefined") {
        // dx, dy, dWidth, dHeight
        dx = ax;
        dy = ay;
        dWidth = sWidth;
        dHeight = sHeight;
        sx = void 0;
        sy = void 0;
        sWidth = void 0;
        sHeight = void 0;

    } else {
        sx = ax;
        sy = ay;

    }

    if (typeof dWidth === "undefined") {
        dWidth = image.codedWidth;
        dHeight = image.codedHeight;
    }

    // Convert the format to libav.js
    const format = vf.wcFormatToLibAVFormat(scalerSync!, image.format);

    // Convert the frame synchronously
    const sctx = scalerSync!.sws_getContext_sync(
        image.codedWidth, image.codedHeight, format,
        dWidth, dHeight!, scalerSync!.AV_PIX_FMT_RGBA,
        2, 0, 0, 0
    );
    const inFrame = scalerSync!.av_frame_alloc_sync();
    const outFrame = scalerSync!.av_frame_alloc_sync();

    let rawU8: Uint8Array;
    let layout: vf.PlaneLayout[];
    if (image._libavGetData) {
        rawU8 = image._libavGetData();
        layout = image._libavGetLayout();
    } else {
        // Just have to hope this is a polyfill VideoFrame copied weirdly!
        rawU8 = (<any> image)._data;
        layout = (<any> image)._layout;
    }

    // Copy it in
    scalerSync!.ff_copyin_frame_sync(inFrame, {
        data: rawU8,
        layout,
        format,
        width: image.codedWidth,
        height: image.codedHeight
    });

    // Rescale
    scalerSync!.sws_scale_frame_sync(sctx, outFrame, inFrame);

    // Get the data back out again
    const frameData = scalerSync!.ff_copyout_frame_video_imagedata_sync(outFrame);

    // Finally, draw it
    ctx.putImageData(frameData, dx, dy!);

    // And clean up
    scalerSync!.av_frame_free_js_sync(outFrame);
    scalerSync!.av_frame_free_js_sync(inFrame);
    scalerSync!.sws_freeContext_sync(sctx);
}

/**
 * Polyfill version of canvasDrawImage.
 */
function drawImagePolyfill(
    this: CanvasRenderingContext2D,
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
    this: OffscreenCanvasRenderingContext2D,
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
    const format = vf.wcFormatToLibAVFormat(scalerAsync!, image.format);

    // Normalize arguments
    const dWidth =(typeof opts.resizeWidth === "number")
        ? opts.resizeWidth : image.displayWidth;
    const dHeight =(typeof opts.resizeHeight === "number")
        ? opts.resizeHeight : image.displayHeight;

    // Convert the frame
    return (async () => {
       const [sctx, inFrame, outFrame] = await Promise.all([
           scalerAsync!.sws_getContext(
               image.codedWidth, image.codedHeight, format,
               dWidth, dHeight, scalerAsync!.AV_PIX_FMT_RGBA, 2, 0, 0, 0
           ),
           scalerAsync!.av_frame_alloc(),
           scalerAsync!.av_frame_alloc()
       ]);

       // Convert the data
       let rawU8: Uint8Array;
       let layout: vf.PlaneLayout[] | undefined = void 0;
       if (image._libavGetData) {
           rawU8 = image._libavGetData();
           layout = image._libavGetLayout();
       } else if ((<any> image)._data) {
           // Assume a VideoFrame weirdly serialized
           rawU8 = (<any> image)._data;
           layout = (<any> image)._layout;
       } else {
           rawU8 = new Uint8Array(image.allocationSize());
           await image.copyTo(rawU8);
       }

       // Copy it in
       await scalerAsync!.ff_copyin_frame(inFrame, {
           data: rawU8,
           layout,
           format,
           width: image.codedWidth,
           height: image.codedHeight
       }),

       // Rescale
       await scalerAsync!.sws_scale_frame(sctx, outFrame, inFrame);

       // Get the data back out again
       const frameData =
           await scalerAsync!.ff_copyout_frame_video_imagedata(outFrame);

       // And clean up
       await Promise.all([
           scalerAsync!.av_frame_free_js(outFrame),
           scalerAsync!.av_frame_free_js(inFrame),
           scalerAsync!.sws_freeContext(sctx)
       ]);

       // Make the ImageBitmap
       return await origCreateImageBitmap(frameData);
    })();
}
