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

// General type for audio typed arrays
type AudioTypedArray = Uint8Array | Int16Array | Int32Array | Float32Array;

export class AudioData {
    constructor(init: AudioDataInit) {
        const format = this.format = init.format;
        const sampleRate = this.sampleRate = init.sampleRate;
        const numberOfFrames = this.numberOfFrames = init.numberOfFrames;
        this.numberOfChannels = init.numberOfChannels;
        this.timestamp = init.timestamp;
        const data = this._data =
            audioView(format, (<any> init.data).buffer || init.data);
        this.duration = numberOfFrames / sampleRate * 1000000;
    }

    readonly format: AudioSampleFormat;
    readonly sampleRate: number;
    readonly numberOfFrames: number;
    readonly numberOfChannels: number;
    readonly duration: number; // microseconds
    readonly timestamp: number; // microseconds

    private _data: AudioTypedArray;

    // Internal
    _libavGetData() { return this._data; }

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
            destFormat !== AudioSampleFormat.F32P)
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

        /* 8. Let planeFrames be the region of resource corresponding to
         * options.planeIndex. */
        const planeFrames = this._data.subarray(
            options.planeIndex * this.numberOfFrames);

        const frameOffset = options.frameOffset || 0;
        const numberOfChannels = this.numberOfChannels;

        /* 9. Copy elements of planeFrames into destination, starting with the
         * frame positioned at options.frameOffset and stopping after
         * copyElementCount samples have been copied. If destFormat does not
         * equal [[format]], convert elements to the destFormat
         * AudioSampleFormat while making the copy. */
        if (this.format === destFormat) {
            const dest = audioView(destFormat, (<any> destination).buffer || destination);

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
            const out = audioView(destFormat, (<any> destination).buffer || destination);

            // First work out the conversion
            let sub = 0;
            let div = 1;
            switch (this.format) {
                case AudioSampleFormat.U8:
                case AudioSampleFormat.U8P:
                    sub = 0x80;
                    div = 0x80;
                    break;

                case AudioSampleFormat.S16:
                case AudioSampleFormat.S16P:
                    div = 0x8000;
                    break;

                case AudioSampleFormat.S32:
                case AudioSampleFormat.S32P:
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
}

export const enum AudioSampleFormat {
    U8 = "u8",
    S16 = "s16",
    S32 = "s32",
    F32 = "f32",
    U8P = "u8-planar",
    S16P = "s16-planar",
    S32P = "s32-planar",
    F32P = "f32-planar"
}

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
 */
function audioView(format: AudioSampleFormat, buffer: ArrayBuffer): AudioTypedArray {
    switch (format) {
        case AudioSampleFormat.U8:
        case AudioSampleFormat.U8P:
            return new Uint8Array(buffer);

        case AudioSampleFormat.S16:
        case AudioSampleFormat.S16P:
            return new Int16Array(buffer);

        case AudioSampleFormat.S32:
        case AudioSampleFormat.S32P:
            return new Int32Array(buffer);

        case AudioSampleFormat.F32:
        case AudioSampleFormat.F32P:
            return new Float32Array(buffer);

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
    case AudioSampleFormat.U8:
    case AudioSampleFormat.U8P:
        return 1;

    case AudioSampleFormat.S16:
    case AudioSampleFormat.S16P:
        return 2;

        case AudioSampleFormat.S32:
        case AudioSampleFormat.S32P:
        case AudioSampleFormat.F32:
        case AudioSampleFormat.F32P:
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
        case AudioSampleFormat.U8:
        case AudioSampleFormat.S16:
        case AudioSampleFormat.S32:
        case AudioSampleFormat.F32:
            return true;

        case AudioSampleFormat.U8P:
        case AudioSampleFormat.S16P:
        case AudioSampleFormat.S32P:
        case AudioSampleFormat.F32P:
            return false;

        default:
            throw new TypeError("Invalid AudioSampleFormat");
    }
}
