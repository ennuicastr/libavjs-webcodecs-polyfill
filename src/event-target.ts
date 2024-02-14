/*
 * This file is part of the libav.js WebCodecs Polyfill implementation. The
 * interface implemented is derived from the W3C standard. No attribution is
 * required when using this library.
 *
 * Copyright (c) 2024 Yahweasel
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

export class HasAEventTarget {
    constructor() {
        const ev = this._eventer = new EventTarget();
        this.addEventListener = ev.addEventListener.bind(ev);
        this.removeEventListener = ev.removeEventListener.bind(ev);
        this.dispatchEvent = ev.dispatchEvent.bind(ev);
    }

    public addEventListener: typeof EventTarget.prototype.addEventListener;
    public removeEventListener: typeof EventTarget.prototype.removeEventListener;
    public dispatchEvent: typeof EventTarget.prototype.dispatchEvent;

    private _eventer: EventTarget;
}

export class DequeueEventTarget extends HasAEventTarget {
    constructor() {
        super();
        this.addEventListener("dequeue", ev => {
            if (this.ondequeue)
                this.ondequeue(ev);
        });
    }

    public ondequeue?: (ev: Event) => unknown;
}
