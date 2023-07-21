/*
 * This file is part of the libav.js WebCodecs Polyfill implementation. The
 * interface implemented is derived from the W3C standard. No attribution is
 * required when using this library.
 *
 * Copyright (c) 2021-2023 Yahweasel
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

import * as rendering from "./rendering";

import * as config from "./config";
import * as libav from "./libav";
import * as misc from "./misc";

import type * as LibAVJS from "libav.js";
import '@ungap/global-this';
declare let LibAV: LibAVJS.LibAVWrapper;

/**
 * Load LibAV-WebCodecs-Polyfill.
 */
export async function load(options: {
    polyfill?: boolean,
    LibAV?: LibAVJS.LibAVWrapper,
    libavOptions?: any
} = {}) {
    // Set up libavOptions
    let libavOptions: any = {};
    if (options.libavOptions)
        Object.assign(libavOptions, options.libavOptions);

    // Maybe load libav
    if (!options.LibAV && typeof LibAV === "undefined") {
        await new Promise((res, rej) => {
            // Can't load workers from another origin
            libavOptions.noworker = true;

            // Load libav
            LibAV = <any> {base: "https://unpkg.com/libav.js@4.1.6/dist"};
            const scr = document.createElement("script");
            scr.src = "https://unpkg.com/libav.js@4.1.6/dist/libav-4.1.6.0-open-media.js";
            scr.onload = res;
            scr.onerror = rej;
            document.body.appendChild(scr);
        });
    }

    // And load the libav handler
    if (options.LibAV)
        libav.setLibAV(options.LibAV);
    libav.setLibAVOptions(libavOptions);
    await libav.load();

    if (options.polyfill) {
        for (const exp of [
            "EncodedAudioChunk", "AudioData", "AudioDecoder", "AudioEncoder",
            "EncodedVideoChunk", "VideoFrame", "VideoDecoder", "VideoEncoder"
        ]) {
            if (!(<any> globalThis)[exp])
                (<any> globalThis)[exp] = (<any> this)[exp];
        }
    }

    await rendering.load(libavOptions, !!options.polyfill);
}

// EncodedAudioChunk
export type EncodedAudioChunk = eac.EncodedAudioChunk;
export const EncodedAudioChunk = eac.EncodedAudioChunk;
export type EncodedAudioChunkInit = eac.EncodedAudioChunkInit;
export type EncodedAudioChunkType = eac.EncodedAudioChunkType;

// AudioData
export type AudioData = ad.AudioData;
export const AudioData = ad.AudioData;
export type AudioDataInit = ad.AudioDataInit;
export type AudioSampleFormat = ad.AudioSampleFormat;
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
export type VideoPixelFormat = vf.VideoPixelFormat;
export type PlaneLayout = vf.PlaneLayout;
export type VideoFrameCopyToOptions = vf.VideoFrameCopyToOptions;

// VideoDecoder
export type VideoDecoder = vdec.VideoDecoder;
export const VideoDecoder = vdec.VideoDecoder;
export type VideoDecoderInit = vdec.VideoDecoderInit;
export type VideoFrameOutputCallback = vdec.VideoFrameOutputCallback;
export type VideoDecoderConfig = vdec.VideoDecoderConfig;
export type VideoDecoderSupport = vdec.VideoDecoderSupport;

// VideoEncoder
export type VideoEncoder = venc.VideoEncoder;
export const VideoEncoder = venc.VideoEncoder;
export type VideoEncoderInit = venc.VideoEncoderInit;
export type EncodedVideoChunkOutputCallback = venc.EncodedVideoChunkOutputCallback;
export type VideoEncoderConfig = venc.VideoEncoderConfig;
export type VideoEncoderEncodeOptions = venc.VideoEncoderEncodeOptions;
export type LatencyMode = venc.LatencyMode;
export type VideoEncoderSupport = venc.VideoEncoderSupport;

// Rendering
export const canvasDrawImage = rendering.canvasDrawImage;
export const createImageBitmap = rendering.createImageBitmap;

// Misc
export type CodecState = misc.CodecState;
export type WebCodecsErrorcallback = misc.WebCodecsErrorCallback;

// Configurations/environments
export type AudioDecoderEnvironment = config.AudioDecoderEnvironment;
export type VideoDecoderEnvironment = config.VideoDecoderEnvironment;
export type AudioEncoderEnvironment = config.AudioEncoderEnvironment;
export type VideoEncoderEnvironment = config.VideoEncoderEnvironment;
export type UnsupportedException = config.UnsupportedException;
export const UnsupportedException = config.UnsupportedException;
export const getAudioDecoder = config.getAudioDecoder;
export const getVideoDecoder = config.getVideoDecoder;
export const getAudioEncoder = config.getAudioEncoder;
export const getVideoEncoder = config.getVideoEncoder;
