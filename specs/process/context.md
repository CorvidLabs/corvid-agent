# Process (Approval) — Context

## Why This Module Exists

Some agent actions require human approval — destructive operations, expensive API calls, or irreversible changes. The approval manager provides a structured way for agents to request and receive owner approval, with the question manager handling more complex multi-option queries.

## Architectural Role

The process module broadly manages agent session lifecycle. The approval sub-module specifically handles the **human-in-the-loop pattern** — pausing agent execution until an owner responds.

## Key Design Decisions

- **Escalation queue**: Approval requests are stored in a database queue (`escalation_queue`) so they survive server restarts and can be answered asynchronously.
- **Multi-channel delivery**: Approval requests are sent via notifications to whichever channel the owner is active on (Discord, AlgoChat, etc.).
- **Owner questions**: For more complex interactions ("which of these 3 approaches should I take?"), the question manager presents numbered options.
- **Fail-closed**: If approval can't be obtained (timeout, error), the action is denied. Never defaults to allowing.

## Relationship to Other Modules

- **Notifications**: Approval requests are delivered via the notification service.
- **AlgoChat**: Approval responses can come via on-chain messages.
- **DB**: Requests stored in `escalation_queue` and `owner_questions`.
- **Process Manager**: Agent sessions block on approval and resume when answered.
