(() => {
    const on = (type, listener, options = true) => {
        document.addEventListener(type, listener, options);
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

    on('beforetoggle', ({ target }) => {
        const strip = target.querySelector('.carousel');

        if (strip) {
            strip.dataset.slide = indexOf(strip);
        }
    });

    on('toggle', ({ target, newState }) => {
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

        if (
            invoker?.closest(':popover-open') &&
            !invoker.hasAttribute('popovertargetaction')
        ) {
            event.preventDefault();
        }
    });

    on(
        'keydown',
        event => {
            const stage = document.querySelector('.wish-stage:popover-open');
            const items = [
                ...(stage?.querySelectorAll('button, .carousel') ?? [])
            ];
            const next =
                items.indexOf(document.activeElement) +
                (event.shiftKey ? -1 : 1);

            if (event.key === 'Tab' && stage) {
                event.preventDefault();
                items[(next + items.length) % items.length].focus();
            }
        },
        false
    );
})();
