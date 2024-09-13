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

import type * as LibAVJS from "@libav.js/variant-webm-vp9";

import "@ungap/global-this";

// A canvas element used to convert CanvasImageSources to buffers
let offscreenCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

export class VideoFrame {
    constructor(data: HTMLVideoElement | VideoFrame, init?: VideoFrameInit);
    constructor(data: CanvasImageSource, init: VideoFrameInit);
    constructor(data: BufferSource, init: VideoFrameBufferInit);
    constructor(
        data: CanvasImageSource | BufferSource | VideoFrame,
        init?: VideoFrameInit | VideoFrameBufferInit
    ) {

        if (data instanceof ArrayBuffer ||
            (<any>data).buffer instanceof ArrayBuffer) {
            this._constructBuffer(<BufferSource>data, <VideoFrameBufferInit>init);

        } else if (
            data instanceof VideoFrame ||
            (globalThis.VideoFrame && data instanceof globalThis.VideoFrame)
        ) {
            const array = new Uint8Array(data.allocationSize());
            data.copyTo(array);

            this._constructBuffer(array, <VideoFrameBufferInit> {
                transfer: [array.buffer],
                // 1. Let format be otherFrame.format.
                /* 2. FIXME: If init.alpha is discard, assign
                 * otherFrame.format's equivalent opaque format format. */
                format: data.format,
                /* 3. Let validInit be the result of running the Validate
                 * VideoFrameInit algorithm with format and otherFrame’s
                 * [[coded width]] and [[coded height]]. */
                // 4. If validInit is false, throw a TypeError.
                /* 7. Assign the following attributes from otherFrame to frame:
                 * codedWidth, codedHeight, colorSpace. */
                codedHeight: data.codedHeight,
                codedWidth: data.codedWidth,
                colorSpace: data.colorSpace,
                /* 8. Let defaultVisibleRect be the result of performing the
                 * getter steps for visibleRect on otherFrame. */
                /* 9. Let defaultDisplayWidth, and defaultDisplayHeight be
                 * otherFrame’s [[display width]], and [[display height]]
                 * respectively. */
                /* 10. Run the Initialize Visible Rect and Display Size
                 * algorithm with init, frame, defaultVisibleRect,
                 * defaultDisplayWidth, and defaultDisplayHeight. */
                visibleRect: init?.visibleRect || data.visibleRect,
                displayHeight: init?.displayHeight || data.displayHeight,
                displayWidth: init?.displayWidth || data.displayWidth,
                /* 11. If duration exists in init, assign it to frame’s
                 * [[duration]]. Otherwise, assign otherFrame.duration to
                 * frame’s [[duration]]. */
                duration: init?.duration || data.duration,
                /* 12. If timestamp exists in init, assign it to frame’s
                 * [[timestamp]]. Otherwise, assign otherFrame’s timestamp to
                 * frame’s [[timestamp]]. */
                timestamp: init?.timestamp || data.timestamp,
                /* Assign the result of calling Copy VideoFrame metadata with
                 * init’s metadata to frame.[[metadata]]. */
                metadata: JSON.parse(JSON.stringify(init?.metadata))
            });

        } else if (data instanceof HTMLVideoElement) {
            /* Check the usability of the image argument. If this throws an
             * exception or returns bad, then throw an InvalidStateError
             * DOMException. */
            if (data.readyState === HTMLVideoElement.prototype.HAVE_NOTHING
                || data.readyState === HTMLVideoElement.prototype.HAVE_METADATA) {
                throw new DOMException("Video is not ready for reading frames", "InvalidStateError");
            }

            // If image’s networkState attribute is NETWORK_EMPTY, then throw an InvalidStateError DOMException.
            if (data.networkState === data.NETWORK_EMPTY) {
                throw new DOMException("Video network state is empty", "InvalidStateError");
            }

            this._constructCanvas(data, <VideoFrameInit>{
                ...init,
                timestamp: init?.timestamp || data.currentTime * 1e6,
            });

        } else {
            this._constructCanvas(<CanvasImageSource>data, <VideoFrameInit>init);
        }
    }

    private _constructCanvas(image: any, init: VideoFrameInit) {
        /* The spec essentially re-specifies “draw it”, and has specific
         * instructions for each sort of thing it might be. So, we don't
         * document all the steps here, we just... draw it. */

        // Get the width and height
        let width = 0, height = 0;
        if (image.naturalWidth) {
            width = image.naturalWidth;
            height = image.naturalHeight;
        } else if (image.videoWidth) {
            width = image.videoWidth;
            height = image.videoHeight;
        } else if (image.width) {
            width = image.width;
            height = image.height;
        }
        if (!width || !height)
            throw new DOMException("Could not determine dimensions", "InvalidStateError");

        if (offscreenCanvas === null) {
            if (typeof OffscreenCanvas !== "undefined") {
                offscreenCanvas = new OffscreenCanvas(width, height)
            } else {
                offscreenCanvas = document.createElement("canvas");
                offscreenCanvas.style.display = "none";
                document.body.appendChild(offscreenCanvas);
            }
        }

        offscreenCanvas.width = width;
        offscreenCanvas.height = height;
        const options = { desynchronized: true, willReadFrequently: true } as CanvasRenderingContext2DSettings;
        const ctx = offscreenCanvas.getContext("2d", options) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0);
        this._constructBuffer(ctx.getImageData(0, 0, width, height).data, {
            format: "RGBA",
            codedWidth: width,
            codedHeight: height,
            timestamp: init?.timestamp || 0,
            duration: init?.duration || 0,
            layout: [{offset: 0, stride: width * 4}],
            displayWidth: init?.displayWidth || width,
            displayHeight: init?.displayHeight || height
        });
    }

    private _constructBuffer(data: BufferSource, init: VideoFrameBufferInit) {
        // 1. If init is not a valid VideoFrameBufferInit, throw a TypeError.
        VideoFrame._checkValidVideoFrameBufferInit(init);

        /* 2. Let defaultRect be «[ "x:" → 0, "y" → 0, "width" →
         *    init.codedWidth, "height" → init.codedWidth ]». */
        const defaultRect = new DOMRect(0, 0, init.codedWidth, init.codedHeight);

        // 3. Let overrideRect be undefined.
        let overrideRect: DOMRect | undefined = void 0;

        // 4. If init.visibleRect exists, assign its value to overrideRect.
        if (init.visibleRect)
            overrideRect = DOMRect.fromRect(init.visibleRect);

        /* 5. Let parsedRect be the result of running the Parse Visible Rect
         *    algorithm with defaultRect, overrideRect, init.codedWidth,
         *    init.codedHeight, and init.format. */
        // 6. If parsedRect is an exception, return parsedRect.
        this.codedWidth = init.codedWidth; // (for _parseVisibleRect)
        this.codedHeight = init.codedHeight;
        const parsedRect = this._parseVisibleRect(
            defaultRect, overrideRect || null
        );

        // 7. Let optLayout be undefined.
        let optLayout: PlaneLayout[] | undefined = void 0;

        // 8. If init.layout exists, assign its value to optLayout.
        if (init.layout) {
            if (init.layout instanceof Array)
                optLayout = init.layout;
            else
                optLayout = Array.from(init.layout);
        }

        /* 9. Let combinedLayout be the result of running the Compute Layout
         *    and Allocation Size algorithm with parsedRect, init.format, and
         *    optLayout. */
        // 10. If combinedLayout is an exception, throw combinedLayout.
        this.format = init.format; // (needed for _computeLayoutAndAllocationSize)
        const combinedLayout = this._computeLayoutAndAllocationSize(
            parsedRect, optLayout || null
        );

        /* 11. If data.byteLength is less than combinedLayout’s allocationSize,
         *     throw a TypeError. */
        if (data.byteLength < combinedLayout.allocationSize)
            throw new TypeError("data is too small for layout");

        /* 12. If init.transfer contains more than one reference to the same
         *     ArrayBuffer, then throw a DataCloneError DOMException. */
        // 13. For each transferable in init.transfer:
            // 1. If [[Detached]] internal slot is true, then throw a DataCloneError DOMException.
        // (not checked in polyfill)

        /* 14. If init.transfer contains an ArrayBuffer referenced by data the
         *     User Agent MAY choose to: */
        let transfer = false;
        if (init.transfer) {

            /* 1. Let resource be a new media resource referencing pixel data
             *    in data. */
            let inBuffer: ArrayBuffer;
            if ((<any> data).buffer)
                inBuffer = (<any> data).buffer;
            else
                inBuffer = <ArrayBuffer> data;

            let t: ArrayBuffer[];
            if (init.transfer instanceof Array)
                t = init.transfer;
            else
                t = Array.from(init.transfer);
            for (const b of t) {
                if (b === inBuffer) {
                    transfer = true;
                    break;
                }
            }
        }

        // 15. Otherwise:
            /* 1. Let resource be a new media resource containing a copy of
             *    data. Use visibleRect and layout to determine where in data
             *    the pixels for each plane reside. */
            /*    The User Agent MAY choose to allocate resource with a larger
             *    coded size and plane strides to improve memory alignment.
             *    Increases will be reflected by codedWidth and codedHeight.
             *    Additionally, the User Agent MAY use visibleRect to copy only
             *    the visible rectangle. It MAY also reposition the visible
             *    rectangle within resource. The final position will be
             *    reflected by visibleRect. */

        /* NOTE: The spec seems to be missing the step where you actually use
         * the resource to define the [[resource reference]]. */
        const format = init.format;
        if (init.layout) {
            // FIXME: Make sure it's the right size
            if (init.layout instanceof Array)
                this._layout = init.layout;
            else
                this._layout = Array.from(init.layout);
        } else {
            const numPlanes_ = numPlanes(format);
            const layout: PlaneLayout[] = [];
            let offset = 0;
            for (let i = 0; i < numPlanes_; i++) {
                const sampleWidth = horizontalSubSamplingFactor(format, i);
                const sampleHeight = verticalSubSamplingFactor(format, i);
                const stride = ~~(this.codedWidth / sampleWidth);
                layout.push({offset, stride});
                offset += stride * (~~(this.codedHeight / sampleHeight));
            }
            this._layout = layout;
        }

        this._data = new Uint8Array(
            (<any> data).buffer || data,
            (<any> data).byteOffset || 0
        );
        if (!transfer) {
            const numPlanes_ = numPlanes(format);

            // Only copy the relevant part
            let layout = this._layout;
            let lo = 1/0;
            let hi = 0;
            for (let i = 0; i < numPlanes_; i++) {
                const plane = layout[i];
                let offset = plane.offset;
                if (offset < lo)
                    lo = offset;

                const sampleHeight = verticalSubSamplingFactor(format, i);
                offset += plane.stride * (~~(this.codedHeight / sampleHeight));
                if (offset > hi)
                    hi = offset;
            }

            // Fix the layout to compensate
            if (lo !== 0) {
                layout = this._layout = layout.map(x => ({
                    offset: x.offset - lo,
                    stride: x.stride
                }));
            }
            this._data = this._data.slice(lo, hi);
        }

        // 16. For each transferable in init.transfer:
            // 1. Perform DetachArrayBuffer on transferable
        // (not doable in polyfill)

        // 17. Let resourceCodedWidth be the coded width of resource.
        const resourceCodedWidth = init.codedWidth;

        // 18. Let resourceCodedHeight be the coded height of resource.
        const resourceCodedHeight = init.codedHeight;

        /* 19. Let resourceVisibleLeft be the left offset for the visible
         *     rectangle of resource. */
        const resourceVisibleLeft = parsedRect.left;

        /* 20. Let resourceVisibleTop be the top offset for the visible
         *     rectangle of resource. */
        const resourceVisibleTop = parsedRect.top;

        // 21. Let frame be a new VideoFrame object initialized as follows:
        {

            /* 1. Assign resourceCodedWidth, resourceCodedHeight,
             *    resourceVisibleLeft, and resourceVisibleTop to
             *    [[coded width]], [[coded height]], [[visible left]], and
             *    [[visible top]] respectively. */
            // (codedWidth/codedHeight done earlier)
            this.codedRect = new DOMRect(0, 0, resourceCodedWidth, resourceCodedHeight);
            this.visibleRect = parsedRect;

            // 2. If init.visibleRect exists:
            if (init.visibleRect) {

                // 1. Let truncatedVisibleWidth be the value of visibleRect.width after truncating.
                // 2. Assign truncatedVisibleWidth to [[visible width]].
                // 3. Let truncatedVisibleHeight be the value of visibleRect.height after truncating.
                // 4. Assign truncatedVisibleHeight to [[visible height]].
                this.visibleRect = DOMRect.fromRect(init.visibleRect);

            // 3. Otherwise:
            } else {

                // 1. Assign [[coded width]] to [[visible width]].
                // 2. Assign [[coded height]] to [[visible height]].
                this.visibleRect = new DOMRect(0, 0, resourceCodedWidth, resourceCodedHeight);

            }

            /* 4. If init.displayWidth exists, assign it to [[display width]].
             *    Otherwise, assign [[visible width]] to [[display width]]. */
            if (typeof init.displayWidth === "number")
                this.displayWidth = init.displayWidth;
            else
                this.displayWidth = this.visibleRect.width;

            /* 5. If init.displayHeight exists, assign it to [[display height]].
             *    Otherwise, assign [[visible height]] to [[display height]]. */
            if (typeof init.displayHeight === "number")
                this.displayHeight = init.displayHeight;
            else
                this.displayHeight = this.visibleRect.height;

            // Account for non-square pixels
            if (this.displayWidth !== this.visibleRect.width ||
                this.displayHeight !== this.visibleRect.height) {
                // Dubious (but correct) SAR calculation
                this._nonSquarePixels = true;
                this._sar_num = this.displayWidth * this.visibleRect.width;
                this._sar_den = this.displayHeight * this.visibleRect.height;
            } else {
                this._nonSquarePixels = false;
                this._sar_num = this._sar_den = 1;
            }

            /* 6. Assign init’s timestamp and duration to [[timestamp]] and
             *    [[duration]] respectively. */
            this.timestamp = init.timestamp;
            this.duration = init.duration;

            // 7. Let colorSpace be undefined.
            // 8. If init.colorSpace exists, assign its value to colorSpace.
            // (color spaces not supported)

            // 9. Assign init’s format to [[format]].
            // (done earlier)

            /* 10. Assign the result of running the Pick Color Space algorithm,
             *     with colorSpace and [[format]], to [[color space]]. */
            // (color spaces not supported)

            /* 11. Assign the result of calling Copy VideoFrame metadata with
             *     init’s metadata to frame.[[metadata]]. */
            // (no actual metadata is yet described by the spec)
        }

        // 22. Return frame.
    }

    /* NOTE: These should all be readonly, but the constructor style above
     * doesn't work with that */
    format: VideoPixelFormat = "I420";
    codedWidth: number = 0;
    codedHeight: number = 0;
    codedRect: DOMRectReadOnly = <any> null;
    visibleRect: DOMRectReadOnly = <any> null;
    displayWidth: number = 0;
    displayHeight: number = 0;
    duration?: number; // microseconds
    timestamp: number = 0; // microseconds
    colorSpace: VideoColorSpace;

    private _layout: PlaneLayout[] = <any> null;
    private _data: Uint8Array = <any> null;

    /**
     * (Internal) Does this use non-square pixels?
     */
    _nonSquarePixels: boolean = false;

    /**
     * (Internal) If non-square pixels, the SAR (sample/pixel aspect ratio)
     */
    _sar_num: number = 1; _sar_den: number = 1;

    /**
     * Convert a polyfill VideoFrame to a native VideoFrame.
     * @param opts  Conversion options
     */
    toNative(opts: {
        /**
         * Transfer the data, closing this VideoFrame.
         */
        transfer?: boolean
    } = {}) {
        const ret = new (<any> globalThis).VideoFrame(this._data, {
            layout: this._layout,
            format: this.format,
            codedWidth: this.codedWidth,
            codedHeight: this.codedHeight,
            visibleRect: this.visibleRect,
            displayWidth: this.displayWidth,
            displayHeight: this.displayHeight,
            duration: this.duration,
            timestamp: this.timestamp,
            transfer: opts.transfer ? [this._data.buffer] : []
        });
        if (opts.transfer)
            this.close();
        return ret;
    }

    /**
     * Convert a native VideoFrame to a polyfill VideoFrame. WARNING: Inefficient,
     * as the data cannot be transferred out.
     * @param from  VideoFrame to copy in
     */
    static fromNative(from: any /* native VideoFrame */) {
        const vf: VideoFrame = from;
        const data = new Uint8Array(vf.allocationSize());
        vf.copyTo(data);
        return new VideoFrame(data, {
            format: vf.format,
            codedWidth: vf.codedWidth,
            codedHeight: vf.codedHeight,
            visibleRect: vf.visibleRect,
            displayWidth: vf.displayWidth,
            displayHeight: vf.displayHeight,
            duration: vf.duration,
            timestamp: vf.timestamp
        });
    }

    // Internal
    _libavGetData() { return this._data; }
    _libavGetLayout() { return this._layout; }

    private static _checkValidVideoFrameBufferInit(
        init: VideoFrameBufferInit
    ) {
        // 1. If codedWidth = 0 or codedHeight = 0,return false.
        if (!init.codedWidth || !init.codedHeight)
            throw new TypeError("Invalid coded dimensions");

        if (init.visibleRect) {
        /* 2. If any attribute of visibleRect is negative or not finite, return
         *    false. */
            const vr = DOMRect.fromRect(init.visibleRect);
            if (vr.x < 0 || !Number.isFinite(vr.x) ||
                vr.y < 0 || !Number.isFinite(vr.y) ||
                vr.width < 0 || !Number.isFinite(vr.width) ||
                vr.height < 0 || !Number.isFinite(vr.height)) {
                throw new TypeError("Invalid visible rectangle");
            }

        // 3. If visibleRect.y + visibleRect.height > codedHeight, return false.
            if (vr.y + vr.height > init.codedHeight)
                throw new TypeError("Visible rectangle outside of coded height");

        // 4. If visibleRect.x + visibleRect.width > codedWidth, return false.
            if (vr.x + vr.width > init.codedWidth)
                throw new TypeError("Visible rectangle outside of coded width");

        // 5. If only one of displayWidth or displayHeight exists, return false.
        // 6. If displayWidth = 0 or displayHeight = 0, return false.
            if ((init.displayWidth && !init.displayHeight) ||
                (!init.displayWidth && !init.displayHeight) ||
                (init.displayWidth === 0 || init.displayHeight === 0))
                throw new TypeError("Invalid display dimensions");
        }

        // 7. Return true.
    }

    metadata(): any {
        // 1. If [[Detached]] is true, throw an InvalidStateError DOMException.
        if (this._data === null)
            throw new DOMException("Detached", "InvalidStateError");

        /* 2. Return the result of calling Copy VideoFrame metadata with
         *    [[metadata]]. */
        // No actual metadata is yet defined in the spec
        return null;
    }

    allocationSize(options: VideoFrameCopyToOptions = {}): number {
        // 1. If [[Detached]] is true, throw an InvalidStateError DOMException.
        if (this._data === null)
            throw new DOMException("Detached", "InvalidStateError");

        // 2. If [[format]] is null, throw a NotSupportedError DOMException.
        if (this.format === null)
            throw new DOMException("Not supported", "NotSupportedError");

        /* 3. Let combinedLayout be the result of running the Parse
         * VideoFrameCopyToOptions algorithm with options. */
        // 4. If combinedLayout is an exception, throw combinedLayout.
        const combinedLayout = this._parseVideoFrameCopyToOptions(options);

        // 5. Return combinedLayout’s allocationSize.
        return combinedLayout.allocationSize;
    }

    private _parseVideoFrameCopyToOptions(options: VideoFrameCopyToOptions) {
        /* 1. Let defaultRect be the result of performing the getter steps for
         * visibleRect. */
        const defaultRect = this.visibleRect;

        // 2. Let overrideRect be undefined.
        // 3. If options.rect exists, assign its value to overrideRect.
        let overrideRect: DOMRectReadOnly | null = options.rect ?
            new DOMRect(options.rect.x, options.rect.y, options.rect.width,
                options.rect.height)
            : null;

        /* 4. Let parsedRect be the result of running the Parse Visible Rect
         * algorithm with defaultRect, overrideRect, [[coded width]], [[coded
         * height]], and [[format]]. */
        // 5. If parsedRect is an exception, return parsedRect.
        const parsedRect = this._parseVisibleRect(
            defaultRect, overrideRect
        );

        // 6. Let optLayout be undefined.
        // 7. If options.layout exists, assign its value to optLayout.
        let optLayout: PlaneLayout[] | null = null;
        if (options.layout) {
            if (options.layout instanceof Array)
                optLayout = options.layout;
            else
                optLayout = Array.from(options.layout);
        }

        /* 8. Let combinedLayout be the result of running the Compute Layout
         * and Allocation Size algorithm with parsedRect, [[format]], and
         * optLayout. */
        const combinedLayout = this._computeLayoutAndAllocationSize(
            parsedRect, optLayout
        );

        // 9. Return combinedLayout.
        return combinedLayout;
    }

    private _parseVisibleRect(
        defaultRect: DOMRectReadOnly, overrideRect: DOMRectReadOnly | null
    ) {
        // 1. Let sourceRect be defaultRect
        let sourceRect = defaultRect;

        // 2. If overrideRect is not undefined:
        if (overrideRect) {
            /* 1. If either of overrideRect.width or height is 0, return a
             * TypeError. */
            if (overrideRect.width === 0 || overrideRect.height === 0)
                throw new TypeError("Invalid rectangle");

            /* 2. If the sum of overrideRect.x and overrideRect.width is
             * greater than [[coded width]], return a TypeError. */
            if (overrideRect.x + overrideRect.width > this.codedWidth)
                throw new TypeError("Invalid rectangle");

            /* 3. If the sum of overrideRect.y and overrideRect.height is
             * greater than [[coded height]], return a TypeError. */
            if (overrideRect.y + overrideRect.height > this.codedHeight)
                throw new TypeError("Invalid rectangle");

            // 4. Assign overrideRect to sourceRect.
            sourceRect = overrideRect;
        }

        /* 3. Let validAlignment be the result of running the Verify Rect Offset
         *    Alignment algorithm with format and sourceRect. */
        const validAlignment = this._verifyRectOffsetAlignment(sourceRect);

        // 4. If validAlignment is false, throw a TypeError.
        if (!validAlignment)
            throw new TypeError("Invalid alignment");

        // 5. Return sourceRect.
        return sourceRect;
    }

    private _computeLayoutAndAllocationSize(
        parsedRect: DOMRectReadOnly, layout: PlaneLayout[] | null
    ) {
        // 1. Let numPlanes be the number of planes as defined by format.
        let numPlanes_ = numPlanes(this.format);

        /* 2. If layout is not undefined and its length does not equal
         * numPlanes, throw a TypeError. */
        if (layout && layout.length !== numPlanes_)
            throw new TypeError("Invalid layout");

        // 3. Let minAllocationSize be 0.
        let minAllocationSize = 0;

        // 4. Let computedLayouts be a new list.
        let computedLayouts: ComputedPlaneLayout[] = [];

        // 5. Let endOffsets be a new list.
        let endOffsets = [];

        // 6. Let planeIndex be 0.
        let planeIndex = 0;

        // 7. While planeIndex < numPlanes:
        while (planeIndex < numPlanes_) {
            /* 1. Let plane be the Plane identified by planeIndex as defined by
             * format. */

            // 2. Let sampleBytes be the number of bytes per sample for plane.
            const sampleBytes_ = sampleBytes(this.format, planeIndex);

            /* 3. Let sampleWidth be the horizontal sub-sampling factor of each
             * subsample for plane. */
            const sampleWidth = horizontalSubSamplingFactor(this.format, planeIndex);

            /* 4. Let sampleHeight be the vertical sub-sampling factor of each
             * subsample for plane. */
            const sampleHeight = verticalSubSamplingFactor(this.format, planeIndex);

            // 5. Let computedLayout be a new computed plane layout.
            const computedLayout: ComputedPlaneLayout = {
                destinationOffset: 0,
                destinationStride: 0,


            /* 6. Set computedLayout’s sourceTop to the result of the division
             *    of truncated parsedRect.y by sampleHeight, rounded up to the
             *    nearest integer. */
                sourceTop: Math.ceil(~~parsedRect.y / sampleHeight),

            /* 7. Set computedLayout’s sourceHeight to the result of the
             *    division of truncated parsedRect.height by sampleHeight,
             *    rounded up to the nearest integer. */
                sourceHeight: Math.ceil(~~parsedRect.height / sampleHeight),

            /* 8. Set computedLayout’s sourceLeftBytes to the result of the
             *    integer division of truncated parsedRect.x by sampleWidth,
             *    multiplied by sampleBytes. */
                sourceLeftBytes: ~~(parsedRect.x / sampleWidth * sampleBytes_),

            /* 9. Set computedLayout’s sourceWidthBytes to the result of the
             *    integer division of truncated parsedRect.width by
             *    sampleHeight, multiplied by sampleBytes. */
                sourceWidthBytes: ~~(parsedRect.width / sampleWidth * sampleBytes_)
            };

            // 10. If layout is not undefined:
            if (layout) {
                /* 1. Let planeLayout be the PlaneLayout in layout at position
                 * planeIndex. */
                const planeLayout = layout[planeIndex];

                /* 2. If planeLayout.stride is less than computedLayout’s
                 * sourceWidthBytes, return a TypeError. */
                if (planeLayout.stride < computedLayout.sourceWidthBytes)
                    throw new TypeError("Invalid stride");

                /* 3. Assign planeLayout.offset to computedLayout’s
                 * destinationOffset. */
                computedLayout.destinationOffset = planeLayout.offset;

                /* 4. Assign planeLayout.stride to computedLayout’s
                 * destinationStride. */
                computedLayout.destinationStride = planeLayout.stride;

            // 11. Otherwise:
            } else {
                /* 1. Assign minAllocationSize to computedLayout’s
                 * destinationOffset. */
                computedLayout.destinationOffset = minAllocationSize;

                /* 2. Assign computedLayout’s sourceWidthBytes to
                 * computedLayout’s destinationStride. */
                computedLayout.destinationStride = computedLayout.sourceWidthBytes;
            }

            /* 12. Let planeSize be the product of multiplying computedLayout’s
             * destinationStride and sourceHeight. */
            const planeSize =
                computedLayout.destinationStride * computedLayout.sourceHeight;

            /* 13. Let planeEnd be the sum of planeSize and computedLayout’s
             * destinationOffset. */
            const planeEnd = planeSize + computedLayout.destinationOffset;

            /* 14. If planeSize or planeEnd is greater than maximum range of
             * unsigned long, return a TypeError. */
            if (planeSize >= 0x100000000 ||
                planeEnd >= 0x100000000)
                throw new TypeError("Plane too large");

            // 15. Append planeEnd to endOffsets.
            endOffsets.push(planeEnd);

            /* 16. Assign the maximum of minAllocationSize and planeEnd to
             * minAllocationSize. */
            if (planeEnd > minAllocationSize)
                minAllocationSize = planeEnd;

            // 17. Let earlierPlaneIndex be 0.
            let earlierPlaneIndex = 0;

            // 18. While earlierPlaneIndex is less than planeIndex.
            while (earlierPlaneIndex < planeIndex) {
                // 1. Let earlierLayout be computedLayouts[earlierPlaneIndex].
                const earlierLayout = computedLayouts[earlierPlaneIndex];

                /* 2. If endOffsets[planeIndex] is less than or equal to
                 * earlierLayout’s destinationOffset or if
                 * endOffsets[earlierPlaneIndex] is less than or equal to
                 * computedLayout’s destinationOffset, continue. */
                if (planeEnd <= earlierLayout.destinationOffset ||
                    endOffsets[earlierPlaneIndex] <= computedLayout.destinationOffset) {

                // 3. Otherwise, return a TypeError.
                } else
                    throw new TypeError("Invalid plane layout");

                // 4. Increment earlierPlaneIndex by 1.
                earlierPlaneIndex++;
            }

            // 19. Append computedLayout to computedLayouts.
            computedLayouts.push(computedLayout);

            // 20. Increment planeIndex by 1.
            planeIndex++;
        }

        /* 8. Let combinedLayout be a new combined buffer layout, initialized
         * as follows: */
        const combinedLayout = {
            // 1. Assign computedLayouts to computedLayouts.
            computedLayouts,

            // 2. Assign minAllocationSize to allocationSize.
            allocationSize: minAllocationSize
        };

        // 9. Return combinedLayout.
        return combinedLayout;
    }

    private _verifyRectOffsetAlignment(rect: DOMRectReadOnly) {
        // 1. If format is null, return true.
        if (!this.format)
            return true;

        // 2. Let planeIndex be 0.
        let planeIndex = 0;

        // 3. Let numPlanes be the number of planes as defined by format.
        const numPlanes_ = numPlanes(this.format);

        // 4. While planeIndex is less than numPlanes:
        while (planeIndex < numPlanes_) {
            /* 1. Let plane be the Plane identified by planeIndex as defined by
             * format. */

            /* 2. Let sampleWidth be the horizontal sub-sampling factor of each
             * subsample for plane. */
            const sampleWidth = horizontalSubSamplingFactor(this.format, planeIndex);

            /* 3. Let sampleHeight be the vertical sub-sampling factor of each
             * subsample for plane. */
            const sampleHeight = verticalSubSamplingFactor(this.format, planeIndex);

            // 4. If rect.x is not a multiple of sampleWidth, return false.
            const xw = rect.x / sampleWidth;
            if (xw !== ~~xw)
                return false;

            // 5. If rect.y is not a multiple of sampleHeight, return false.
            const yh = rect.y / sampleHeight;
            if (yh !== ~~yh)
                return false;

            // 6. Increment planeIndex by 1.
            planeIndex++;
        }

        // 5. Return true.
        return true;
    }

    async copyTo(
        destination: BufferSource, options: VideoFrameCopyToOptions = {}
    ): Promise<PlaneLayout[]> {
        const destBuf = new Uint8Array(
            (<any> destination).buffer || destination,
            (<any> destination).byteOffset || 0
        );

        // 1. If [[Detached]] is true, throw an InvalidStateError DOMException.
        if (this._data === null)
            throw new DOMException("Detached", "InvalidStateError");

        // 2. If [[format]] is null, throw a NotSupportedError DOMException.
        if (!this.format)
            throw new DOMException("No format", "NotSupportedError");

        /* 3. Let combinedLayout be the result of running the Parse
         * VideoFrameCopyToOptions algorithm with options. */
        /* 4. If combinedLayout is an exception, return a promise rejected with
         * combinedLayout. */
        const combinedLayout = this._parseVideoFrameCopyToOptions(options);

        /* 5. If destination.byteLength is less than combinedLayout’s
         * allocationSize, return a promise rejected with a TypeError. */
        if (destination.byteLength < combinedLayout.allocationSize)
            throw new TypeError("Insufficient space");

        // 6. Let p be a new Promise.
        /* 7. Let copyStepsQueue be the result of starting a new parallel
         * queue. */
        // 8. Let planeLayouts be a new list.
        let planeLayouts: PlaneLayout[] = [];

        // 9. Enqueue the following steps to copyStepsQueue:
        {

            /* 1. Let resource be the media resource referenced by [[resource
             * reference]]. */

            /* 2. Let numPlanes be the number of planes as defined by
             *    [[format]]. */
            const numPlanes_ = numPlanes(this.format);

            // 3. Let planeIndex be 0.
            let planeIndex = 0;

            // 4. While planeIndex is less than combinedLayout’s numPlanes:
            while (planeIndex < combinedLayout.computedLayouts.length) {

                /* 1. Let sourceStride be the stride of the plane in resource as
                 * identified by planeIndex. */
                const sourceStride = this._layout[planeIndex].stride;

                /* 2. Let computedLayout be the computed plane layout in
                 * combinedLayout’s computedLayouts at the position of planeIndex */
                const computedLayout = combinedLayout.computedLayouts[planeIndex];

                /* 3. Let sourceOffset be the product of multiplying
                 * computedLayout’s sourceTop by sourceStride */
                let sourceOffset =
                    computedLayout.sourceTop * sourceStride;

                // 4. Add computedLayout’s sourceLeftBytes to sourceOffset.
                sourceOffset += computedLayout.sourceLeftBytes;

                // 5. Let destinationOffset be computedLayout’s destinationOffset.
                let destinationOffset = computedLayout.destinationOffset;

                // 6. Let rowBytes be computedLayout’s sourceWidthBytes.
                const rowBytes = computedLayout.sourceWidthBytes;

                /* 7. Let layout be a new PlaneLayout, with offset set to
                 *    destinationOffset and stride set to rowBytes. */
                const layout = {
                    offset: computedLayout.destinationOffset,
                    stride: computedLayout.destinationStride
                };

                // 8. Let row be 0.
                let row = 0;

                // 9. While row is less than computedLayout’s sourceHeight:
                while (row < computedLayout.sourceHeight) {

                    /* 1. Copy rowBytes bytes from resource starting at
                     * sourceOffset to destination starting at destinationOffset. */
                    destBuf.set(
                        this._data.subarray(sourceOffset, sourceOffset + rowBytes),
                        destinationOffset
                    );

                    // 2. Increment sourceOffset by sourceStride.
                    sourceOffset += sourceStride;

                    /* 3. Increment destinationOffset by computedLayout’s
                     * destinationStride. */
                    destinationOffset += computedLayout.destinationStride;

                    // 4. Increment row by 1.
                    row++;
                }

                // 10. Increment planeIndex by 1.
                planeIndex++;

                // 11. Append layout to planeLayouts.
                planeLayouts.push(layout);
            }

            // 5. Queue a task to resolve p with planeLayouts.
        }

        // 10. Return p.
        return planeLayouts;
    }

    clone(): VideoFrame {
        return new VideoFrame(this._data, {
            format: this.format,
            codedWidth: this.codedWidth,
            codedHeight: this.codedHeight,
            timestamp: this.timestamp,
            duration: this.duration,
            layout: this._layout,
            transfer: [this._data.buffer]
        });
    }

    close(): void {
        this._data = <Uint8Array> <any> null;
    }
}

export interface VideoFrameInit {
    duration?: number; // microseconds
    timestamp: number; // microseconds
    // FIXME: AlphaOption alpha = "keep";

    // Default matches image. May be used to efficiently crop. Will trigger
    // new computation of displayWidth and displayHeight using image’s pixel
    // aspect ratio unless an explicit displayWidth and displayHeight are given.
    visibleRect?: DOMRectInit;

    // Default matches image unless visibleRect is provided.
    displayWidth?: number;
    displayHeight?: number;

    // Not actually used in spec
    metadata?: any;
}

export interface VideoFrameBufferInit {
    format: VideoPixelFormat;
    codedWidth: number;
    codedHeight: number;
    timestamp: number; // microseconds
    duration?: number; // microseconds

    // Default layout is tightly-packed.
    layout?: ArrayLike<PlaneLayout>;

    // Default visible rect is coded size positioned at (0,0)
    visibleRect?: DOMRectInit;

    // Default display dimensions match visibleRect.
    displayWidth?: number;
    displayHeight?: number;

    // FIXME: Not used
    colorSpace?: VideoColorSpaceInit;

    transfer?: ArrayLike<ArrayBuffer>;

    // FIXME: Missing from spec
    metadata?: any;
}

export type VideoPixelFormat =
    // 4:2:0 Y, U, V
    "I420" |
    "I420P10" |
    "I420P12" |
    // 4:2:0 Y, U, V, A
    "I420A" |
    "I420AP10" |
    "I420AP12" |
    // 4:2:2 Y, U, V
    "I422" |
    "I422P10" |
    "I422P12" |
    // 4:2:2 Y, U, V, A
    "I422A" |
    "I422AP10" |
    "I422AP12" |
    // 4:4:4 Y, U, V
    "I444" |
    "I444P10" |
    "I444P12" |
    // 4:4:4 Y, U, V, A
    "I444A" |
    "I444AP10" |
    "I444AP12" |
    // 4:2:0 Y, UV
    "NV12" |
    // 4:4:4 RGBA
    "RGBA" |
    // 4:4:4 RGBX (opaque)
    "RGBX" |
    // 4:4:4 BGRA
    "BGRA" |
    // 4:4:4 BGRX (opaque)
    "BGRX";

/**
 * Convert a WebCodecs pixel format to a libav pixel format.
 * @param libav  LibAV instance for constants
 * @param wcFormat  WebCodecs format
 */
export function wcFormatToLibAVFormat(libav: LibAVJS.LibAV, wcFormat: VideoPixelFormat) {
    let format: number = libav.AV_PIX_FMT_RGBA;
    switch (wcFormat) {
        case "I420": format = libav.AV_PIX_FMT_YUV420P; break;
        case "I420P10": format = 0x3E; /* AV_PIX_FMT_YUV420P10 */ break;
        case "I420P12": format = 0x7B; /* AV_PIX_FMT_YUV420P12 */ break;
        case "I420A": format = libav.AV_PIX_FMT_YUVA420P; break;
        case "I420AP10": format = 0x57; /* AV_PIX_FMT_YUVA420P10 */ break;
        case "I420AP12":
            throw new TypeError("YUV420P12 is not supported by libav");
            break;
        case "I422": format = libav.AV_PIX_FMT_YUV422P; break;
        case "I422P10": format = 0x40; /* AV_PIX_FMT_YUV422P10 */ break;
        case "I422P12": format = 0x7F; /* AV_PIX_FMT_YUV422P12 */ break;
        case "I422A": format = 0x4E; /* AV_PIX_FMT_YUVA422P */ break;
        case "I422AP10": format = 0x59; /* AV_PIX_FMT_YUVA422P10 */ break;
        case "I422AP10": format = 0xBA; /* AV_PIX_FMT_YUVA422P12 */ break;
        case "I444": format = libav.AV_PIX_FMT_YUV444P; break;
        case "I444P10": format = 0x44; /* AV_PIX_FMT_YUV444P10 */ break;
        case "I444P12": format = 0x83; /* AV_PIX_FMT_YUV444P12 */ break;
        case "I444A": format = 0x4F; /* AV_PIX_FMT_YUVA444P */ break;
        case "I444AP10": format = 0x5B; /* AV_PIX_FMT_YUVA444P10 */ break;
        case "I444AP12": format = 0xBC; /* AV_PIX_FMT_YUVA444P10 */ break;
        case "NV12": format = libav.AV_PIX_FMT_NV12; break;
        case "RGBA": format = libav.AV_PIX_FMT_RGBA; break;
        case "RGBX": format = 0x77; /* AV_PIX_FMT_RGB0 */ break;
        case "BGRA": format = libav.AV_PIX_FMT_BGRA; break;
        case "BGRX": format = 0x79; /* AV_PIX_FMT_BGR0 */ break;

        default:
            throw new TypeError("Invalid VideoPixelFormat");
    }
    return format;
}

/**
 * Number of planes in the given format.
 * @param format  The format
 */
export function numPlanes(format: VideoPixelFormat) {
    switch (format) {
        case "I420":
        case "I420P10":
        case "I420P12":
        case "I422":
        case "I422P10":
        case "I422P12":
        case "I444":
        case "I444P10":
        case "I444P12":
            return 3;

        case "I420A":
        case "I420AP10":
        case "I420AP12":
        case "I422A":
        case "I422AP10":
        case "I422AP12":
        case "I444A":
        case "I444AP10":
        case "I444AP12":
            return 4;

        case "NV12":
            return 2;

        case "RGBA":
        case "RGBX":
        case "BGRA":
        case "BGRX":
            return 1;

        default:
            throw new DOMException("Unsupported video pixel format", "NotSupportedError");
    }
}

/**
 * Number of bytes per sample in the given format and plane.
 * @param format  The format
 * @param planeIndex  The plane index
 */
export function sampleBytes(format: VideoPixelFormat, planeIndex: number) {
    switch (format) {
        case "I420":
        case "I420A":
        case "I422":
        case "I422A":
        case "I444":
        case "I444A":
            return 1;

        case "I420P10":
        case "I420AP10":
        case "I422P10":
        case "I422AP10":
        case "I444P10":
        case "I444AP10":
        case "I420P12":
        case "I420AP12":
        case "I422P12":
        case "I422AP12":
        case "I444P12":
        case "I444AP12":
            return 2;

        case "NV12":
            if (planeIndex === 1)
                return 2;
            else
                return 1;

        case "RGBA":
        case "RGBX":
        case "BGRA":
        case "BGRX":
            return 4;

        default:
            throw new DOMException("Unsupported video pixel format", "NotSupportedError");
    }
}

/**
 * Horizontal sub-sampling factor for the given format and plane.
 * @param format  The format
 * @param planeIndex  The plane index
 */
export function horizontalSubSamplingFactor(
    format: VideoPixelFormat, planeIndex: number
) {
    // First plane (often luma) is always full
    if (planeIndex === 0)
        return 1;

    // Plane 3 (alpha if present) is always full
    if (planeIndex === 3)
        return 1;

    switch (format) {
        case "I420":
        case "I420P10":
        case "I420P12":
        case "I420A":
        case "I420AP10":
        case "I420AP12":
        case "I422":
        case "I422P10":
        case "I422P12":
        case "I422A":
        case "I422AP10":
        case "I422AP12":
            return 2;

        case "I444":
        case "I444P10":
        case "I444P12":
        case "I444A":
        case "I444AP10":
        case "I444AP12":
            return 1;

        case "NV12":
            return 2;

        case "RGBA":
        case "RGBX":
        case "BGRA":
        case "BGRX":
            return 1;

        default:
            throw new DOMException("Unsupported video pixel format", "NotSupportedError");
    }
}

/**
 * Vertical sub-sampling factor for the given format and plane.
 * @param format  The format
 * @param planeIndex  The plane index
 */
export function verticalSubSamplingFactor(
    format: VideoPixelFormat, planeIndex: number
) {
    // First plane (often luma) is always full
    if (planeIndex === 0)
        return 1;

    // Plane 3 (alpha if present) is always full
    if (planeIndex === 3)
        return 1;

    switch (format) {
        case "I420":
        case "I420P10":
        case "I420P12":
        case "I420A":
        case "I420AP10":
        case "I420AP12":
            return 2;

        case "I422":
        case "I422P10":
        case "I422P12":
        case "I422A":
        case "I422AP10":
        case "I422AP12":
        case "I444":
        case "I444P10":
        case "I444P12":
        case "I444A":
        case "I444AP10":
        case "I444AP12":
            return 1;

        case "NV12":
            return 2;

        case "RGBA":
        case "RGBX":
        case "BGRA":
        case "BGRX":
            return 1;

        default:
            throw new DOMException("Unsupported video pixel format", "NotSupportedError");
    }
}

/**
 * NOTE: Color space is not actually supported
 */
export type VideoColorSpace = any;
export type VideoColorSpaceInit = any;

export interface PlaneLayout {
    offset: number;
    stride: number;
}

export interface VideoFrameCopyToOptions {
    rect?: DOMRectInit;
    layout?: ArrayLike<PlaneLayout>;
}

interface ComputedPlaneLayout {
    destinationOffset: number;
    destinationStride: number;
    sourceTop: number;
    sourceHeight: number;
    sourceLeftBytes: number;
    sourceWidthBytes: number;
}
