import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouteErrorComponent } from './route-error.component';
import { beforeEach, describe, it, expect, vi } from 'vitest';

describe('RouteErrorComponent', () => {
    let fixture: ComponentFixture<RouteErrorComponent>;
    let component: RouteErrorComponent;
    let hostEl: HTMLElement;
    let router: Router;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [RouteErrorComponent],
            providers: [provideRouter([])],
        });

        fixture = TestBed.createComponent(RouteErrorComponent);
        component = fixture.componentInstance;
        hostEl = fixture.nativeElement as HTMLElement;
        router = TestBed.inject(Router);
        fixture.detectChanges();
    });

    // ──────────────────────────────────────────────
    // Rendering
    // ──────────────────────────────────────────────
    it('should render the error container with role="alert"', () => {
        const container = hostEl.querySelector('.route-error');
        expect(container).toBeTruthy();
        expect(container!.getAttribute('role')).toBe('alert');

        fixture.destroy();
    });

    it('should render the title text', () => {
        const title = hostEl.querySelector('.route-error__title');
        expect(title).toBeTruthy();
        expect(title!.textContent).toContain('Route failed to load');

        fixture.destroy();
    });

    it('should render the ASCII icon', () => {
        const icon = hostEl.querySelector('.route-error__icon');
        expect(icon).toBeTruthy();
        expect(icon!.textContent).toContain('\u2554'); // ╔

        fixture.destroy();
    });

    it('should render the error hint', () => {
        const hint = hostEl.querySelector('.route-error__hint');
        expect(hint).toBeTruthy();
        expect(hint!.textContent).toContain('ERR::CHUNK_LOAD_FAILED');

        fixture.destroy();
    });

    // ──────────────────────────────────────────────
    // Retry button
    // ──────────────────────────────────────────────
    it('should call router.navigateByUrl with current URL on retry', () => {
        const spy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

        const retryBtn = hostEl.querySelector<HTMLButtonElement>('.route-error__btn--primary');
        expect(retryBtn).toBeTruthy();
        retryBtn!.click();

        expect(spy).toHaveBeenCalledWith(router.url);

        fixture.destroy();
    });

    it('should have correct aria-label on retry button', () => {
        const retryBtn = hostEl.querySelector('.route-error__btn--primary');
        expect(retryBtn!.getAttribute('aria-label')).toBe('Retry loading this route');

        fixture.destroy();
    });

    // ──────────────────────────────────────────────
    // Go Home link
    // ──────────────────────────────────────────────
    it('should have a Go Home link pointing to /chat', () => {
        const homeLink = hostEl.querySelector<HTMLAnchorElement>('.route-error__btn--secondary');
        expect(homeLink).toBeTruthy();
        expect(homeLink!.getAttribute('href')).toBe('/chat');

        fixture.destroy();
    });

    it('should have correct aria-label on Go Home link', () => {
        const homeLink = hostEl.querySelector('.route-error__btn--secondary');
        expect(homeLink!.getAttribute('aria-label')).toBe('Go back to home');

        fixture.destroy();
    });
});
