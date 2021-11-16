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

import type * as LibAVJS from "../libav.types";
declare let LibAV: LibAVJS.LibAVWrapper;

// Currently available libav instances
const libavs: LibAVJS.LibAV[] = [];

// Options required to create a LibAV instance
let libavOptions: any = {};

/**
 * Supported decoders.
 */
export let decoders: string[] = null;

/**
 * Supported encoders.
 */
export let encoders: string[] = null;

/**
 * Set the libav loading options.
 */
export function setLibAVOptions(to: any) {
    libavOptions = to;
}

/**
 * Get a libav instance.
 */
export async function get(): Promise<LibAVJS.LibAV> {
    if (libavs.length)
        return libavs.shift();
    return await LibAV.LibAV(libavOptions);
}

/**
 * Free a libav instance for later reuse.
 */
export function free(libav: LibAVJS.LibAV) {
    libavs.push(libav);
}

/**
 * Get the list of encoders/decoders supported by libav (which are also
 * supported by this polyfill)
 * @param encoders  Check for encoders instead of decoders
 */
async function codecs(encoders: boolean): Promise<string[]> {
    const libav = await get();
    const ret: string[] = [];

    for (const [avname, codec] of [
        ["flac", "flac"],
        ["libopus", "opus"],
        ["libvorbis", "vorbis"],
        ["libvpx_vp9", "vp09"],
        ["libvpx_vp8", "vp8"],
        ["libvpx", "vp8"]
    ]) {
        if (encoders) {
            if (await libav.avcodec_find_encoder_by_name(avname))
                ret.push(codec);
        } else {
            if (await libav.avcodec_find_decoder_by_name(avname))
                ret.push(codec);
        }
    }

    free(libav);
    return ret;
}

/**
 * Load the lists of supported decoders and encoders.
 */
export async function load() {
    decoders = await codecs(false);
    encoders = await codecs(true);
}
