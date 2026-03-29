import { animate, group, query, style, transition, trigger } from '@angular/animations';

/** Smooth crossfade route transition with exit fade-out and enter slide-up. Duration matches `:root --motion-route-ms`. */
export const pageRouteAnimation = trigger('pageRoute', [
    transition('* => *', [
        query(':enter, :leave', [
            style({ position: 'absolute', top: 0, left: 0, width: '100%' }),
        ], { optional: true }),
        group([
            query(':leave', [
                style({ opacity: 1, transform: 'translateY(0)' }),
                animate('160ms cubic-bezier(0.4, 0, 1, 1)', style({ opacity: 0, transform: 'translateY(-4px)' })),
            ], { optional: true }),
            query(':enter', [
                style({ opacity: 0, transform: 'translateY(12px)' }),
                animate('280ms 80ms cubic-bezier(0.22, 1, 0.36, 1)', style({ opacity: 1, transform: 'translateY(0)' })),
            ], { optional: true }),
        ]),
    ]),
]);
