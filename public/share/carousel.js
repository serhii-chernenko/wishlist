(() => {
    const on = (type, listener, options = true) => {
        document.addEventListener(type, listener, options);
    };
    const isStage = element => {
        return element.classList.contains('wish-stage');
    };
    const indexOf = strip => {
        return Math.round(
            Math.abs(strip.scrollLeft) / (strip.clientWidth || 1)
        );
    };
    const markDot = strip => {
        const dots = strip.nextElementSibling?.children ?? [];

        [...dots].forEach((dot, position) => {
            dot.classList.toggle(
                'photo-dot-active',
                position === indexOf(strip)
            );
        });
    };

    on(
        'scroll',
        ({ target }) => {
            if (target.matches?.('.carousel')) {
                markDot(target);
            }
        },
        { capture: true, passive: true }
    );

    if (!('showPopover' in HTMLElement.prototype)) {
        return;
    }

    on('beforetoggle', ({ target }) => {
        const strip = isStage(target) && target.querySelector('.carousel');

        if (strip) {
            strip.dataset.slide = indexOf(strip);
        }
    });

    on('toggle', ({ target, newState }) => {
        if (!isStage(target)) {
            return;
        }

        const strip = target.querySelector('.carousel');

        if (strip) {
            strip.scrollLeft = strip.dataset.slide * strip.clientWidth;
            markDot(strip);
        }

        if (newState === 'open') {
            target.querySelector('button').focus();
        }
    });

    on('click', event => {
        const invoker = event.target.closest('[popovertarget]');
        const isOpenSlide = invoker?.closest(':popover-open');

        if (isOpenSlide && !invoker.hasAttribute('popovertargetaction')) {
            event.preventDefault();
        }
    });

    on(
        'keydown',
        event => {
            if (event.key !== 'Tab') {
                return;
            }

            const stage = document.querySelector('.wish-stage:popover-open');
            const items = [
                ...(stage?.querySelectorAll('button, .carousel') ?? [])
            ];
            const step = event.shiftKey ? -1 : 1;
            const next = items.indexOf(document.activeElement) + step;

            if (stage) {
                event.preventDefault();
                items[(next + items.length) % items.length].focus();
            }
        },
        false
    );
})();
