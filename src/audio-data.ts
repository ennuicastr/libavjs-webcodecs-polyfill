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

// General type for audio typed arrays
type AudioTypedArray = Uint8Array | Int16Array | Int32Array | Float32Array;

import "@ungap/global-this";

export class AudioData {
    constructor(init: AudioDataInit) {
        // 1. If init is not a valid AudioDataInit, throw a TypeError.
        AudioData._checkValidAudioDataInit(init);

        /* 2. If init.transfer contains more than one reference to the same
         *    ArrayBuffer, then throw a DataCloneError DOMException. */
        // 3. For each transferable in init.transfer:
            // 1. If [[Detached]] internal slot is true, then throw a DataCloneError DOMException.
        // (Not worth doing in polyfill)

        // 4. Let frame be a new AudioData object, initialized as follows:
        {

            // 1. Assign false to [[Detached]].
            // (not doable in polyfill)

            // 2. Assign init.format to [[format]].
            this.format = init.format;

            // 3. Assign init.sampleRate to [[sample rate]].
            this.sampleRate = init.sampleRate;

            // 4. Assign init.numberOfFrames to [[number of frames]].
            this.numberOfFrames = init.numberOfFrames;

            // 5. Assign init.numberOfChannels to [[number of channels]].
            this.numberOfChannels = init.numberOfChannels;

            // 6. Assign init.timestamp to [[timestamp]].
            this.timestamp = init.timestamp;

            /* 7. If init.transfer contains an ArrayBuffer referenced by
             * init.data the User Agent MAY choose to: */
            let transfer = false;
            if (init.transfer) {

                // 1. Let resource be a new media resource referencing sample data in data.
                let inBuffer: ArrayBuffer;
                if ((<any> init.data).buffer)
                    inBuffer = (<any> init.data).buffer;
                else
                    inBuffer = <ArrayBuffer> init.data;

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

            // 8. Otherwise:
                // 1. Let resource be a media resource containing a copy of init.data.

            // 9. Let resourceReference be a reference to resource.
            let inData: BufferSource, byteOffset = 0;
            if (transfer) {
                inData = init.data;
                byteOffset = (<any> init.data).byteOffset || 0;
            } else {
                inData = (<any> init.data).slice(0);
            }
            const resourceReference = audioView(
                init.format, (<any> inData).buffer || inData, byteOffset
            );

            // 10. Assign resourceReference to [[resource reference]].
            this._data = resourceReference;
        }

        // 5. For each transferable in init.transfer:
            // 1. Perform DetachArrayBuffer on transferable
        // (Already done by transferring)

        // 6. Return frame.

        // Duration not calculated in spec?
        this.duration = init.numberOfFrames / init.sampleRate * 1000000;
    }

    readonly format: AudioSampleFormat;
    readonly sampleRate: number;
    readonly numberOfFrames: number;
    readonly numberOfChannels: number;
    readonly duration: number; // microseconds
    readonly timestamp: number; // microseconds

    private _data: AudioTypedArray;

    /**
     * Convert a polyfill AudioData to a native AudioData.
     * @param opts  Conversion options
     */
    toNative(opts: {
        /**
         * Transfer the data, closing this AudioData.
         */
        transfer?: boolean
    } = {}) {
        const ret = new (<any> globalThis).AudioData({
            data: this._data,
            format: this.format,
            sampleRate: this.sampleRate,
            numberOfFrames: this.numberOfFrames,
            numberOfChannels: this.numberOfChannels,
            timestamp: this.timestamp,
            transfer: opts.transfer ? [this._data.buffer] : []
        });
        if (opts.transfer)
            this.close();
        return ret;
    }

    /**
     * Convert a native AudioData to a polyfill AudioData. WARNING: Inefficient,
     * as the data cannot be transferred out.
     * @param from  AudioData to copy in
     */
    static fromNative(from: any /* native AudioData */) {
        const ad: AudioData = from;
        const isInterleaved_ = isInterleaved(ad.format);
        const planes = isInterleaved_ ? 1 : ad.numberOfChannels;
        const sizePerPlane = ad.allocationSize({
            format: ad.format,
            planeIndex: 0
        });
        const data = new Uint8Array(sizePerPlane);
        for (let p = 0; p < planes; p++) {
            ad.copyTo(data.subarray(p * sizePerPlane), {
                format: ad.format,
                planeIndex: p
            });
        }
        return new AudioData({
            data,
            format: ad.format,
            sampleRate: ad.sampleRate,
            numberOfFrames: ad.numberOfFrames,
            numberOfChannels: ad.numberOfChannels,
            timestamp: ad.timestamp,
            transfer: [data.buffer]
        });
    }

    // Internal
    _libavGetData() { return this._data; }

    private static _checkValidAudioDataInit(init: AudioDataInit) {
        // 1. If sampleRate less than or equal to 0, return false.
        if (init.sampleRate <= 0)
            throw new TypeError(`Invalid sample rate ${init.sampleRate}`);

        // 2. If numberOfFrames = 0, return false.
        if (init.numberOfFrames <= 0)
            throw new TypeError(`Invalid number of frames ${init.numberOfFrames}`);

        // 3. If numberOfChannels = 0, return false.
        if (init.numberOfChannels <= 0)
            throw new TypeError(`Invalid number of channels ${init.numberOfChannels}`);

        // 4. Verify data has enough data by running the following steps:
        {

            // 1. Let totalSamples be the product of multiplying numberOfFrames by numberOfChannels.
            const totalSamples = init.numberOfFrames * init.numberOfChannels;

            // 2. Let bytesPerSample be the number of bytes per sample, as defined by the format.
            const bytesPerSample_ = bytesPerSample(init.format);

            // 3. Let totalSize be the product of multiplying bytesPerSample with totalSamples.
            const totalSize = bytesPerSample_ * totalSamples;

            // 4. Let dataSize be the size in bytes of data.
            const dataSize = init.data.byteLength;

            // 5. If dataSize is less than totalSize, return false.
            if (dataSize < totalSize)
                throw new TypeError(`This audio data must be at least ${totalSize} bytes`);
        }

        // 5. Return true.
    }

    allocationSize(options: AudioDataCopyToOptions): number {
        // 1. If [[Detached]] is true, throw an InvalidStateError DOMException.
        if (this._data === null)
            throw new DOMException("Detached", "InvalidStateError");

        /* 2. Let copyElementCount be the result of running the Compute Copy
         * Element Count algorithm with options. */
        const copyElementCount = this._computeCopyElementCount(options);

        // 3. Let destFormat be the value of [[format]].
        let destFormat = this.format;

        // 4. If options.format exists, assign options.format to destFormat.
        if (options.format)
            destFormat = options.format;

        /* 5. Let bytesPerSample be the number of bytes per sample, as defined
         * by the destFormat. */
        const bytesPerSample_ = bytesPerSample(destFormat);

        /* 6. Return the product of multiplying bytesPerSample by
         * copyElementCount. */
        return bytesPerSample_ * copyElementCount;
    }

    private _computeCopyElementCount(options: AudioDataCopyToOptions): number {
        // 1. Let destFormat be the value of [[format]].
        let destFormat = this.format;

        // 2. If options.format exists, assign options.format to destFormat.
        if (options.format)
            destFormat = options.format;

        /* 3. If destFormat describes an interleaved AudioSampleFormat and
         * options.planeIndex is greater than 0, throw a RangeError. */
        const isInterleaved_ = isInterleaved(destFormat);
        if (isInterleaved_) {
            if (options.planeIndex > 0)
                throw new RangeError("Invalid plane");
        }

        /* 4. Otherwise, if destFormat describes a planar AudioSampleFormat and
         * if options.planeIndex is greater or equal to [[number of channels]],
         * throw a RangeError. */
        else if (options.planeIndex >= this.numberOfChannels)
            throw new RangeError("Invalid plane");

        /* 5. If [[format]] does not equal destFormat and the User Agent does
         * not support the requested AudioSampleFormat conversion, throw a
         * NotSupportedError DOMException. Conversion to f32-planar MUST always
         * be supported. */
        if (this.format !== destFormat &&
            destFormat !== "f32-planar")
            throw new DOMException("Only conversion to f32-planar is supported", "NotSupportedError");

        /* 6. Let frameCount be the number of frames in the plane identified by
         * options.planeIndex. */
        const frameCount = this.numberOfFrames; // All planes have the same number of frames

        /* 7. If options.frameOffset is greater than or equal to frameCount,
         * throw a RangeError. */
        const frameOffset = options.frameOffset || 0;
        if (frameOffset >= frameCount)
            throw new RangeError("Frame offset out of range");

        /* 8. Let copyFrameCount be the difference of subtracting
         * options.frameOffset from frameCount. */
        let copyFrameCount = frameCount - frameOffset;

        // 9. If options.frameCount exists:
        if ("frameCount" in options) {
            /* 1. If options.frameCount is greater than copyFrameCount, throw a
             * RangeError. */
            if (options.frameCount >= copyFrameCount)
                throw new RangeError("Frame count out of range");

            // 2. Otherwise, assign options.frameCount to copyFrameCount.
            copyFrameCount = options.frameCount;
        }

        // 10. Let elementCount be copyFrameCount.
        let elementCount = copyFrameCount;

        /* 11. If destFormat describes an interleaved AudioSampleFormat,
         * mutliply elementCount by [[number of channels]] */
        if (isInterleaved_)
            elementCount *= this.numberOfChannels;

        // 12. return elementCount.
        return elementCount;
    }

    copyTo(destination: BufferSource, options: AudioDataCopyToOptions): void {
        // 1. If [[Detached]] is true, throw an InvalidStateError DOMException.
        if (this._data === null)
            throw new DOMException("Detached", "InvalidStateError");

        /* 2. Let copyElementCount be the result of running the Compute Copy
         * Element Count algorithm with options. */
        const copyElementCount = this._computeCopyElementCount(options);

        // 3. Let destFormat be the value of [[format]].
        let destFormat = this.format;

        // 4. If options.format exists, assign options.format to destFormat.
        if (options.format)
            destFormat = options.format;

        /* 5. Let bytesPerSample be the number of bytes per sample, as defined
         * by the destFormat. */
        const bytesPerSample_ = bytesPerSample(destFormat);

        /* 6. If the product of multiplying bytesPerSample by copyElementCount
         * is greater than destination.byteLength, throw a RangeError. */
        if (bytesPerSample_ * copyElementCount > destination.byteLength)
            throw new RangeError("Buffer too small");

        /* 7. Let resource be the media resource referenced by [[resource
         * reference]]. */
        const resource = this._data;

        /* 8. Let planeFrames be the region of resource corresponding to
         * options.planeIndex. */
        const planeFrames = resource.subarray(
            options.planeIndex * this.numberOfFrames);

        const frameOffset = options.frameOffset || 0;
        const numberOfChannels = this.numberOfChannels;

        /* 9. Copy elements of planeFrames into destination, starting with the
         * frame positioned at options.frameOffset and stopping after
         * copyElementCount samples have been copied. If destFormat does not
         * equal [[format]], convert elements to the destFormat
         * AudioSampleFormat while making the copy. */
        if (this.format === destFormat) {
            const dest = audioView(destFormat,
                                   (<any> destination).buffer || destination,
                                   (<any> destination).byteOffset || 0);

            if (isInterleaved(destFormat)) {
                dest.set(planeFrames.subarray(
                    frameOffset * numberOfChannels,
                    frameOffset * numberOfChannels + copyElementCount
                ));
            } else {
                dest.set(planeFrames.subarray(
                    frameOffset, frameOffset + copyElementCount
                ));
            }

        } else {
            // Actual conversion necessary. Always to f32-planar.
            const out = audioView(destFormat,
                                  (<any> destination).buffer || destination,
                                  (<any> destination).byteOffset || 0);

            // First work out the conversion
            let sub = 0;
            let div = 1;
            switch (this.format) {
                case "u8":
                case "u8-planar":
                    sub = 0x80;
                    div = 0x80;
                    break;

                case "s16":
                case "s16-planar":
                    div = 0x8000;
                    break;

                case "s32":
                case "s32-planar":
                    div = 0x80000000;
                    break;
            }

            // Then do it
            if (isInterleaved(this.format)) {
                for (let i = options.planeIndex + frameOffset * numberOfChannels, o = 0;
                     o < copyElementCount;
                     i += numberOfChannels, o++)
                    out[o] = (planeFrames[i] - sub) / div;

            } else {
                for (let i = frameOffset, o = 0;
                     o < copyElementCount;
                     i++, o++)
                    out[o] = (planeFrames[i] - sub) / div;
            }

        }
    }

    clone(): AudioData {
        // 1. If [[Detached]] is true, throw an InvalidStateError DOMException.
        if (this._data === null)
            throw new DOMException("Detached", "InvalidStateError");

        /* 2. Return the result of running the Clone AudioData algorithm with
         * this. */
        return new AudioData({
            format: this.format,
            sampleRate: this.sampleRate,
            numberOfFrames: this.numberOfFrames,
            numberOfChannels: this.numberOfChannels,
            timestamp: this.timestamp,
            data: this._data
        });
    }

    close(): void {
        this._data = null;
    }
}

export interface AudioDataInit {
    format: AudioSampleFormat;
    sampleRate: number;
    numberOfFrames: number;
    numberOfChannels: number;
    timestamp: number;
    data: BufferSource;
    transfer?: ArrayLike<ArrayBuffer>;
}

export type AudioSampleFormat =
    "u8" |
    "s16" |
    "s32" |
    "f32" |
    "u8-planar" |
    "s16-planar" |
    "s32-planar" |
    "f32-planar";

export interface AudioDataCopyToOptions {
    planeIndex: number;
    frameOffset?: number;
    frameCount?: number;
    format: AudioSampleFormat;
}


/**
 * Construct the appropriate type of ArrayBufferView for the given sample
 * format and buffer.
 * @param format  Sample format
 * @param buffer  ArrayBuffer (NOT view)
 * @param byteOffset  Offset into the buffer
 */
function audioView(
    format: AudioSampleFormat, buffer: ArrayBuffer, byteOffset: number
): AudioTypedArray {
    switch (format) {
        case "u8":
        case "u8-planar":
            return new Uint8Array(buffer, byteOffset);

        case "s16":
        case "s16-planar":
            return new Int16Array(buffer, byteOffset);

        case "s32":
        case "s32-planar":
            return new Int32Array(buffer, byteOffset);

        case "f32":
        case "f32-planar":
            return new Float32Array(buffer, byteOffset);

        default:
            throw new TypeError("Invalid AudioSampleFormat");
    }
}

/**
 * Number of bytes per sample of this format.
 * @param format  Sample format
 */
function bytesPerSample(format: AudioSampleFormat): number {
switch (format) {
    case "u8":
    case "u8-planar":
        return 1;

    case "s16":
    case "s16-planar":
        return 2;

        case "s32":
        case "s32-planar":
        case "f32":
        case "f32-planar":
            return 4;

        default:
            throw new TypeError("Invalid AudioSampleFormat");
    }
}

/**
 * Is this format interleaved?
 * @param format  Sample format
 */
export function isInterleaved(format: AudioSampleFormat) {
    switch (format) {
        case "u8":
        case "s16":
        case "s32":
        case "f32":
            return true;

        case "u8-planar":
        case "s16-planar":
        case "s32-planar":
        case "f32-planar":
            return false;

        default:
            throw new TypeError("Invalid AudioSampleFormat");
    }
}
