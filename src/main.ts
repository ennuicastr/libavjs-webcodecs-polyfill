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

import * as eac from "./encoded-audio-chunk";
import * as ad from "./audio-data";
import * as adec from "./audio-decoder";
import * as aenc from "./audio-encoder";

import * as evc from "./encoded-video-chunk";
import * as vf from "./video-frame";
import * as vdec from "./video-decoder";
import * as venc from "./video-encoder";

import * as libav from "./libav";
import * as misc from "./misc";

import type * as LibAVJS from "libav.js";
declare let LibAV: LibAVJS.LibAVWrapper;

/**
 * Load LibAV-WebCodecs-Polyfill.
 */
export async function load(options: {
    polyfill?: boolean,
    libavOptions?: any
} = {}) {
    // Set up libavOptions
    let libavOptions: any = {};
    if (options.libavOptions)
        Object.assign(libavOptions, options.libavOptions);

    // Maybe load libav
    if (typeof LibAV === "undefined") {
        await new Promise((res, rej) => {
            // Can't load workers from another origin
            libavOptions.noworker = true;

            // Load libav
            LibAV = <any> {base: "https://unpkg.com/libav.js@3.3.4"};
            const scr = document.createElement("script");
            scr.src = "https://unpkg.com/libav.js@3.3.4/libav-3.3.4.4-webm-opus-flac.js";
            scr.onload = res;
            scr.onerror = rej;
            document.body.appendChild(scr);
        });
    }

    // And load the libav handler
    libav.setLibAVOptions(libavOptions);
    await libav.load();

    if (options.polyfill) {
        for (const exp of [
            "EncodedAudioChunk", "AudioData", "AudioDecoder", "AudioEncoder",
            "EncodedVideoChunk", "VideoFrame", "VideoDecoder"
        ]) {
            if (!window[exp])
                window[exp] = this[exp];
        }
    }
}

/**
 * Get an AudioDecoder environment that supports this configuration.
 * @param config  Audio decoder configuration
 */
export async function getAudioDecoder(
    config: adec.AudioDecoderConfig
): Promise<{
    AudioDecoder: typeof adec.AudioDecoder,
    EncodedAudioChunk: typeof eac.EncodedAudioChunk,
    AudioData: typeof ad.AudioData
}> {
    if (typeof (<any> window).AudioDecoder !== "undefined" &&
        (await (<any> window).AudioDecoder.isConfigSupported(config)).supported) {
        return {
            AudioDecoder: (<any> window).AudioDecoder,
            EncodedAudioChunk: (<any> window).EncodedAudioChunk,
            AudioData: (<any> window).AudioData
        };
    }

    if ((await adec.AudioDecoder.isConfigSupported(config)).supported) {
        return {
            AudioDecoder: adec.AudioDecoder,
            EncodedAudioChunk: eac.EncodedAudioChunk,
            AudioData: ad.AudioData
        };
    }

    return null;
}

/**
 * Get an VideoDecoder environment that supports this configuration.
 * @param config  Video decoder configuration
 */
export async function getVideoDecoder(
    config: vdec.VideoDecoderConfig
): Promise<{
    VideoDecoder: typeof vdec.VideoDecoder,
    EncodedVideoChunk: typeof evc.EncodedVideoChunk,
    VideoFrame: typeof vf.VideoFrame
}> {
    if (typeof (<any> window).VideoDecoder !== "undefined" &&
        (await (<any> window).VideoDecoder.isConfigSupported(config)).supported) {
        return {
            VideoDecoder: (<any> window).VideoDecoder,
            EncodedVideoChunk: (<any> window).EncodedVideoChunk,
            VideoFrame: (<any> window).VideoFrame
        };
    }

    if ((await vdec.VideoDecoder.isConfigSupported(config)).supported) {
        return {
            VideoDecoder: vdec.VideoDecoder,
            EncodedVideoChunk: evc.EncodedVideoChunk,
            VideoFrame: vf.VideoFrame
        };
    }

    return null;
}

/**
 * Get an AudioEncoder environment that supports this configuration.
 * @param config  Audio encoder configuration
 */
export async function getAudioEncoder(
    config: aenc.AudioEncoderConfig
): Promise<{
    AudioEncoder: typeof aenc.AudioEncoder,
    EncodedAudioChunk: typeof eac.EncodedAudioChunk,
    AudioData: typeof ad.AudioData
}> {
    if (typeof (<any> window).AudioEncoder !== "undefined" &&
        (await (<any> window).AudioEncoder.isConfigSupported(config)).supported) {
        return {
            AudioEncoder: (<any> window).AudioEncoder,
            EncodedAudioChunk: (<any> window).EncodedAudioChunk,
            AudioData: (<any> window).AudioData
        };
    }

    if ((await aenc.AudioEncoder.isConfigSupported(config)).supported) {
        return {
            AudioEncoder: aenc.AudioEncoder,
            EncodedAudioChunk: eac.EncodedAudioChunk,
            AudioData: ad.AudioData
        };
    }

    return null;
}

// EncodedAudioChunk
export type EncodedAudioChunk = eac.EncodedAudioChunk;
export const EncodedAudioChunk = eac.EncodedAudioChunk;
export type EncodedAudioChunkInit = eac.EncodedAudioChunkInit;

// AudioData
export type AudioData = ad.AudioData;
export const AudioData = ad.AudioData;
export type AudioDataInit = ad.AudioDataInit;
export type AudioDataCopyToOptions = ad.AudioDataCopyToOptions;

// AudioDecoder
export type AudioDecoder = adec.AudioDecoder;
export const AudioDecoder = adec.AudioDecoder;
export type AudioDecoderInit = adec.AudioDecoderInit;
export type AudioDataOutputCallback = adec.AudioDataOutputCallback;
export type AudioDecoderConfig = adec.AudioDecoderConfig;
export type AudioDecoderSupport = adec.AudioDecoderSupport;

// AudioEncoder
export type AudioEncoder = aenc.AudioEncoder;
export const AudioEncoder = aenc.AudioEncoder;
export type AudioEncoderInit = aenc.AudioEncoderInit;
export type EncodedAudioChunkOutputCallback = aenc.EncodedAudioChunkOutputCallback;
export type AudioEncoderConfig = aenc.AudioEncoderConfig;
export type AudioEncoderSupport = aenc.AudioEncoderSupport;

// EncodedVideoChunk
export type EncodedVideoChunk = evc.EncodedVideoChunk;
export const EncodedVideoChunk = evc.EncodedVideoChunk;
export type EncodedVideoChunkInit = evc.EncodedVideoChunkInit;

// VideoFrame
export type VideoFrame = vf.VideoFrame;
export const VideoFrame = vf.VideoFrame;
export type VideoFrameInit = vf.VideoFrameInit;
export type VideoFrameBufferInit = vf.VideoFrameBufferInit;
export type PlaneLayout = vf.PlaneLayout;
export type VideoFrameCopyToOptions = vf.VideoFrameCopyToOptions;

// VideoDecoder
export type VideoDecoder = vdec.VideoDecoder;
export const VideoDecoder = vdec.VideoDecoder;
export type VideoDecoderInit = vdec.VideoDecoderInit;
export type VideoFrameOutputCallback = vdec.VideoFrameOutputCallback;
export type VideoDecoderConfig = vdec.VideoDecoderConfig;
export type VideoDecoderSupport = vdec.VideoDecoderSupport;
