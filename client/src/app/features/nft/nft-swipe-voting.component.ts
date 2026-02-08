import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * NFTSwipeVotingComponent — handles the community voting step with swipe cards.
 *
 * Displays approved NFT proposals as swipe cards. Users swipe right to
 * vote in favour or left to pass. Only proposals that cleared initial
 * review (`/nft/review`) appear here.
 *
 * Route: `/nft/voting`
 */
@Component({
    selector: 'app-nft-swipe-voting',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink],
    template: `
        <div class="page">
            <div class="page__header">
                <h2>NFT Voting</h2>
                <a class="btn btn--secondary" routerLink="/nft/review">Go to Review</a>
            </div>
            <p class="page__desc">Vote on approved NFT proposals. Swipe right to vote in favour, left to pass.</p>
            <div class="empty">No NFT proposals ready for voting.</div>
        </div>
    `,
    styles: `
        .page { padding: 1.5rem; }
        .page__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
        .page__header h2 { margin: 0; color: var(--text-primary); }
        .page__desc { color: var(--text-secondary); font-size: 0.85rem; margin: 0 0 1.5rem; }
        .empty { color: var(--text-tertiary); font-size: 0.85rem; }
        .btn {
            padding: 0.5rem 1rem; border-radius: var(--radius); text-decoration: none; font-size: 0.8rem; font-weight: 600;
            cursor: pointer; border: 1px solid; font-family: inherit; text-transform: uppercase; letter-spacing: 0.05em;
            transition: background 0.15s, box-shadow 0.15s;
        }
        .btn--secondary { background: transparent; color: var(--text-secondary); border-color: var(--border-bright); }
        .btn--secondary:hover { background: var(--bg-hover); color: var(--text-primary); }
    `,
})
export class NFTSwipeVotingComponent {}
