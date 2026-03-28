import { animate, query, style, transition, trigger } from '@angular/animations';

/** Subtle enter-only transition on primary route outlet (transform + opacity). */
export const pageRouteAnimation = trigger('pageRoute', [
    transition('* => *', [
        query(':enter', [
            style({ opacity: 0, transform: 'translateY(8px)' }),
            animate('220ms cubic-bezier(0.22, 1, 0.36, 1)', style({ opacity: 1, transform: 'translateY(0)' })),
        ], { optional: true }),
    ]),
]);
