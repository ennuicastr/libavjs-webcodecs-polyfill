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

export class EncodedAudioChunk {
    constructor(init: EncodedAudioChunkInit) {
        /* 1. If init.transfer contains more than one reference to the same
         *    ArrayBuffer, then throw a DataCloneError DOMException. */
        // 2. For each transferable in init.transfer:
            /* 1. If [[Detached]] internal slot is true, then throw a
             *    DataCloneError DOMException. */
        // (not worth checking in a polyfill)

        /* 3. Let chunk be a new EncodedAudioChunk object, initialized as
         *    follows */
        {

            // 1. Assign init.type to [[type]].
            this.type = init.type;

            // 2. Assign init.timestamp to [[timestamp]].
            this.timestamp = init.timestamp;

            /* 3. If init.duration exists, assign it to [[duration]], or assign
             *    null otherwise. */
            if (typeof init.duration === "number")
                this.duration = init.duration;
            else
                this.duration = null;

            // 4. Assign init.data.byteLength to [[byte length]];
            this.byteLength = init.data.byteLength;

            /* 5. If init.transfer contains an ArrayBuffer referenced by
             *    init.data the User Agent MAY choose to: */
            let transfer = false;
            if (init.transfer) {

                /* 1. Let resource be a new media resource referencing sample
                 *    data in init.data. */
                let inBuffer: ArrayBuffer;
                if ((<any> init.data).buffer)
                    inBuffer = (<any> init.data).buffer;
                else
                    inBuffer = init.data;

                const t = Array.from(init.transfer);
                for (const b of t) {
                    if (b === inBuffer) {
                        transfer = true;
                        break;
                    }
                }
            }

            // 6. Otherwise:
                // 1. Assign a copy of init.data to [[internal data]].
            
            const data = new Uint8Array(
                (<any> init.data).buffer || init.data,
                (<any> init.data).byteOffset || 0,
                (<any> init.data).BYTES_PER_ELEMENT
                    ? ((<any> init.data).BYTES_PER_ELEMENT * (<any> init.data).length)
                    : init.data.byteLength
            );
            if (transfer)
                this._data = data;
            else
                this._data = data.slice(0);
        }

        // 4. For each transferable in init.transfer:
            // 1. Perform DetachArrayBuffer on transferable
        // (already done by transferring)

        // 5. Return chunk.
    }

    readonly type: EncodedAudioChunkType;
    readonly timestamp: number; // microseconds
    readonly duration: number | null; // microseconds
    readonly byteLength: number;

    private _data: Uint8Array;

    // Internal
    _libavGetData() { return this._data; }

    copyTo(destination: BufferSource) {
        (new Uint8Array(
            (<any> destination).buffer || destination,
            (<any> destination).byteOffset || 0
        )).set(this._data);
    }
}

export interface EncodedAudioChunkInit {
    type: EncodedAudioChunkType;
    timestamp: number; // microseconds
    duration?: number; // microseconds
    data: BufferSource;
    transfer?: ArrayLike<ArrayBuffer>;
}

export type EncodedAudioChunkType =
    "key" |
    "delta";
