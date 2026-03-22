/**
 * FlockDirectory — On-chain agent registry for the Flock Directory.
 *
 * TEALScript smart contract that provides:
 * - Agent registration with stake requirement
 * - Heartbeat liveness tracking
 * - Metadata updates
 * - Reputation attestations between agents
 * - Stale agent sweeping
 * - Challenge-based evaluation protocol
 *
 * Uses box storage for per-agent records (scalable to 1000+ agents).
 * Emits ARC-28 events for all state changes.
 *
 * @see https://github.com/CorvidLabs/corvid-agent/issues/895
 */
import { Contract } from '@algorandfoundation/tealscript';

// ─── Types ──────────────────────────────────────────────────────────────────

type AgentRecord = {
    /** Display name of the agent. */
    name: string;
    /** Agent's A2A/HTTP endpoint URL. */
    endpoint: string;
    /** JSON-encoded metadata (description, capabilities). */
    metadata: string;
    /** Reputation tier: 1=Registered, 2=Tested, 3=Established, 4=Trusted. */
    tier: uint64;
    /** Cumulative score from test results. */
    totalScore: uint64;
    /** Maximum possible score from test results. */
    totalMaxScore: uint64;
    /** Number of tests completed. */
    testCount: uint64;
    /** Last heartbeat round number. */
    lastHeartbeatRound: uint64;
    /** Round when the agent was registered. */
    registrationRound: uint64;
    /** Stake amount in microAlgos. */
    stake: uint64;
};

type TestResult = {
    /** Score achieved. */
    score: uint64;
    /** Maximum possible score. */
    maxScore: uint64;
    /** Category of the test. */
    category: string;
    /** Round when the result was recorded. */
    round: uint64;
};

type Challenge = {
    /** Category of the challenge (e.g. "responsiveness", "accuracy"). */
    category: string;
    /** Human-readable description. */
    description: string;
    /** Maximum score for this challenge. */
    maxScore: uint64;
    /** Whether the challenge is active (1) or deactivated (0). */
    active: uint64;
};

type Attestation = {
    /** Address of the attester. */
    from: Address;
    /** Reputation score given (0-100). */
    score: uint64;
    /** Category of the attestation. */
    category: string;
    /** Round when the attestation was submitted. */
    round: uint64;
};

// ─── ARC-28 Event Signatures ────────────────────────────────────────────────

const EVENT_AGENT_REGISTERED = 'AgentRegistered(address,string)';
const EVENT_AGENT_DEREGISTERED = 'AgentDeregistered(address)';
const EVENT_HEARTBEAT_RECEIVED = 'HeartbeatReceived(address,uint64)';
const EVENT_METADATA_UPDATED = 'MetadataUpdated(address,string)';
const EVENT_ATTESTATION_SUBMITTED = 'AttestationSubmitted(address,address,uint64,string)';
const EVENT_AGENT_MARKED_STALE = 'AgentMarkedStale(address)';
const EVENT_CHALLENGE_CREATED = 'ChallengeCreated(string,string,uint64)';
const EVENT_CHALLENGE_DEACTIVATED = 'ChallengeDeactivated(string)';
const EVENT_TEST_RESULT_RECORDED = 'TestResultRecorded(address,string,uint64)';

// ─── Tier Constants ─────────────────────────────────────────────────────────

const TIER_REGISTERED = 1;
const TIER_TESTED = 2;
const TIER_ESTABLISHED = 3;
const TIER_TRUSTED = 4;

// ─── Tier Thresholds ────────────────────────────────────────────────────────

/** Tests needed to reach Tested tier. */
const TESTED_THRESHOLD = 1;
/** Tests needed to reach Established tier. */
const ESTABLISHED_THRESHOLD = 5;
/** Tests needed to reach Trusted tier. */
const TRUSTED_THRESHOLD = 10;

// ─── Stale Threshold ────────────────────────────────────────────────────────

/** Rounds without heartbeat before an agent is considered stale (~24h at 3.3s/round). */
const STALE_ROUNDS = 26_182;

// ─── Contract ───────────────────────────────────────────────────────────────

export class FlockDirectory extends Contract {
    programVersion = 10;

    // ─── Global State ───────────────────────────────────────────────────────

    /** Number of registered agents. */
    agentCount = GlobalStateKey<uint64>({ key: 'agent_count' });

    /** Minimum stake required for registration (microAlgos). */
    minStake = GlobalStateKey<uint64>({ key: 'min_stake' });

    /** Admin address (creator by default). */
    admin = GlobalStateKey<Address>({ key: 'admin' });

    /** Number of challenges created. */
    challengeCount = GlobalStateKey<uint64>({ key: 'chal_count' });

    /** Whether registration is open (1) or closed (0). */
    registrationOpen = GlobalStateKey<uint64>({ key: 'reg_open' });

    // ─── Box Maps ───────────────────────────────────────────────────────────

    /** Per-agent records, keyed by agent address. */
    agents = BoxMap<Address, AgentRecord>({ prefix: 'a' });

    /** Test results, keyed by (agent address, challenge ID). */
    testResults = BoxMap<[Address, string], TestResult>({ prefix: 't' });

    /** Challenges, keyed by challenge ID. */
    challenges = BoxMap<string, Challenge>({ prefix: 'c' });

    /** Attestations, keyed by (from address, to address). */
    attestations = BoxMap<[Address, Address], Attestation>({ prefix: 'r' });

    // ─── Application Creation ───────────────────────────────────────────────

    createApplication(): void {
        this.admin.value = this.txn.sender;
        this.agentCount.value = 0;
        this.minStake.value = 1_000_000; // 1 ALGO default
        this.challengeCount.value = 0;
        this.registrationOpen.value = 1;
    }

    // ─── Agent Registration ─────────────────────────────────────────────────

    /**
     * Register an agent in the directory.
     * Requires a payment transaction for the stake (>= minStake).
     *
     * @param name - Display name of the agent
     * @param endpoint - Agent's A2A/HTTP endpoint URL
     * @param metadata - JSON-encoded metadata (description, capabilities)
     * @param payment - Payment transaction for the stake
     */
    registerAgent(name: string, endpoint: string, metadata: string, payment: PayTxn): void {
        assert(this.registrationOpen.value === 1);
        assert(payment.amount >= this.minStake.value);
        assert(payment.receiver === this.app.address);
        assert(!this.agents(this.txn.sender).exists);

        this.agents(this.txn.sender).value = {
            name: name,
            endpoint: endpoint,
            metadata: metadata,
            tier: TIER_REGISTERED,
            totalScore: 0,
            totalMaxScore: 0,
            testCount: 0,
            lastHeartbeatRound: globals.round,
            registrationRound: globals.round,
            stake: payment.amount,
        };

        this.agentCount.value = this.agentCount.value + 1;

        log(EVENT_AGENT_REGISTERED);
    }

    // ─── Agent Deregistration ───────────────────────────────────────────────

    /**
     * Deregister the calling agent and return their stake.
     * Only the registered agent can deregister themselves.
     */
    deregister(): void {
        assert(this.agents(this.txn.sender).exists);

        const agent = this.agents(this.txn.sender).value;
        const stakeReturn = agent.stake;

        this.agents(this.txn.sender).delete();
        this.agentCount.value = this.agentCount.value - 1;

        // Return stake to the agent
        sendPayment({
            receiver: this.txn.sender,
            amount: stakeReturn,
        });

        log(EVENT_AGENT_DEREGISTERED);
    }

    // ─── Heartbeat ──────────────────────────────────────────────────────────

    /**
     * Record a heartbeat for the calling agent, updating their last
     * heartbeat round to the current round.
     */
    heartbeat(): void {
        assert(this.agents(this.txn.sender).exists);

        const agent = this.agents(this.txn.sender).value;
        this.agents(this.txn.sender).value = {
            name: agent.name,
            endpoint: agent.endpoint,
            metadata: agent.metadata,
            tier: agent.tier,
            totalScore: agent.totalScore,
            totalMaxScore: agent.totalMaxScore,
            testCount: agent.testCount,
            lastHeartbeatRound: globals.round,
            registrationRound: agent.registrationRound,
            stake: agent.stake,
        };

        log(EVENT_HEARTBEAT_RECEIVED);
    }

    // ─── Metadata Update ────────────────────────────────────────────────────

    /**
     * Update the calling agent's metadata.
     * Only the registered agent can update their own metadata.
     *
     * @param name - New display name
     * @param endpoint - New endpoint URL
     * @param metadata - New JSON-encoded metadata
     */
    updateAgent(name: string, endpoint: string, metadata: string): void {
        assert(this.agents(this.txn.sender).exists);

        const agent = this.agents(this.txn.sender).value;
        this.agents(this.txn.sender).value = {
            name: name,
            endpoint: endpoint,
            metadata: metadata,
            tier: agent.tier,
            totalScore: agent.totalScore,
            totalMaxScore: agent.totalMaxScore,
            testCount: agent.testCount,
            lastHeartbeatRound: globals.round,
            registrationRound: agent.registrationRound,
            stake: agent.stake,
        };

        log(EVENT_METADATA_UPDATED);
    }

    // ─── Attestation ────────────────────────────────────────────────────────

    /**
     * Submit a reputation attestation for another agent.
     * The caller must be a registered agent. Cannot attest to self.
     * Overwrites any previous attestation from the same sender.
     *
     * @param targetAgent - Address of the agent being attested
     * @param score - Reputation score (0-100)
     * @param category - Category of the attestation (e.g. "reliability", "quality")
     */
    attest(targetAgent: Address, score: uint64, category: string): void {
        assert(this.agents(this.txn.sender).exists);
        assert(this.agents(targetAgent).exists);
        assert(this.txn.sender !== targetAgent);
        assert(score <= 100);

        this.attestations([this.txn.sender, targetAgent]).value = {
            from: this.txn.sender,
            score: score,
            category: category,
            round: globals.round,
        };

        log(EVENT_ATTESTATION_SUBMITTED);
    }

    // ─── Sweep Stale ────────────────────────────────────────────────────────

    /**
     * Mark agents as stale if their last heartbeat exceeds the stale threshold.
     * Callable by anyone. Reduces tier to REGISTERED for stale agents.
     *
     * @param agentAddress - Address of the agent to check
     */
    sweepStale(agentAddress: Address): void {
        assert(this.agents(agentAddress).exists);

        const agent = this.agents(agentAddress).value;
        const roundsSinceHeartbeat = globals.round - agent.lastHeartbeatRound;

        assert(roundsSinceHeartbeat > STALE_ROUNDS);

        // Demote stale agent to Registered tier
        this.agents(agentAddress).value = {
            name: agent.name,
            endpoint: agent.endpoint,
            metadata: agent.metadata,
            tier: TIER_REGISTERED,
            totalScore: agent.totalScore,
            totalMaxScore: agent.totalMaxScore,
            testCount: agent.testCount,
            lastHeartbeatRound: agent.lastHeartbeatRound,
            registrationRound: agent.registrationRound,
            stake: agent.stake,
        };

        log(EVENT_AGENT_MARKED_STALE);
    }

    // ─── Challenge Protocol ─────────────────────────────────────────────────

    /**
     * Create a new challenge (admin only).
     *
     * @param challengeId - Unique identifier for the challenge
     * @param category - Challenge category
     * @param description - Human-readable description
     * @param maxScore - Maximum score for this challenge
     */
    createChallenge(challengeId: string, category: string, description: string, maxScore: uint64): void {
        assert(this.txn.sender === this.admin.value);
        assert(!this.challenges(challengeId).exists);

        this.challenges(challengeId).value = {
            category: category,
            description: description,
            maxScore: maxScore,
            active: 1,
        };

        this.challengeCount.value = this.challengeCount.value + 1;

        log(EVENT_CHALLENGE_CREATED);
    }

    /**
     * Deactivate a challenge (admin only).
     *
     * @param challengeId - ID of the challenge to deactivate
     */
    deactivateChallenge(challengeId: string): void {
        assert(this.txn.sender === this.admin.value);
        assert(this.challenges(challengeId).exists);

        const challenge = this.challenges(challengeId).value;
        this.challenges(challengeId).value = {
            category: challenge.category,
            description: challenge.description,
            maxScore: challenge.maxScore,
            active: 0,
        };

        log(EVENT_CHALLENGE_DEACTIVATED);
    }

    /**
     * Record a test result for an agent (admin only).
     * Updates the agent's tier based on test count thresholds.
     *
     * @param agentAddress - Address of the agent being tested
     * @param challengeId - ID of the challenge
     * @param score - Score achieved
     */
    recordTestResult(agentAddress: Address, challengeId: string, score: uint64): void {
        assert(this.txn.sender === this.admin.value);
        assert(this.agents(agentAddress).exists);
        assert(this.challenges(challengeId).exists);

        const challenge = this.challenges(challengeId).value;
        assert(challenge.active === 1);
        assert(score <= challenge.maxScore);

        // Store test result
        this.testResults([agentAddress, challengeId]).value = {
            score: score,
            maxScore: challenge.maxScore,
            category: challenge.category,
            round: globals.round,
        };

        // Update agent scores and tier
        const agent = this.agents(agentAddress).value;
        const newTestCount = agent.testCount + 1;
        const newTotalScore = agent.totalScore + score;
        const newTotalMaxScore = agent.totalMaxScore + challenge.maxScore;
        const newTier = this.computeTier(newTestCount, newTotalScore, newTotalMaxScore);

        this.agents(agentAddress).value = {
            name: agent.name,
            endpoint: agent.endpoint,
            metadata: agent.metadata,
            tier: newTier,
            totalScore: newTotalScore,
            totalMaxScore: newTotalMaxScore,
            testCount: newTestCount,
            lastHeartbeatRound: agent.lastHeartbeatRound,
            registrationRound: agent.registrationRound,
            stake: agent.stake,
        };

        log(EVENT_TEST_RESULT_RECORDED);
    }

    // ─── Read Methods ───────────────────────────────────────────────────────

    /**
     * Get the full agent record.
     */
    getAgentInfo(agentAddress: Address): AgentRecord {
        assert(this.agents(agentAddress).exists);
        return this.agents(agentAddress).value;
    }

    /**
     * Get an agent's reputation tier.
     */
    getAgentTier(agentAddress: Address): uint64 {
        assert(this.agents(agentAddress).exists);
        return this.agents(agentAddress).value.tier;
    }

    /**
     * Get an agent's reputation score (0-100, based on totalScore/totalMaxScore).
     */
    getAgentScore(agentAddress: Address): uint64 {
        assert(this.agents(agentAddress).exists);
        const agent = this.agents(agentAddress).value;
        if (agent.totalMaxScore === 0) return 0;
        return (agent.totalScore * 100) / agent.totalMaxScore;
    }

    /**
     * Get an agent's test count.
     */
    getAgentTestCount(agentAddress: Address): uint64 {
        assert(this.agents(agentAddress).exists);
        return this.agents(agentAddress).value.testCount;
    }

    /**
     * Get challenge information.
     */
    getChallengeInfo(challengeId: string): Challenge {
        assert(this.challenges(challengeId).exists);
        return this.challenges(challengeId).value;
    }

    /**
     * Get an attestation between two agents.
     */
    getAttestation(from: Address, to: Address): Attestation {
        assert(this.attestations([from, to]).exists);
        return this.attestations([from, to]).value;
    }

    // ─── Admin Methods ──────────────────────────────────────────────────────

    /**
     * Update the minimum stake (admin only).
     */
    updateMinStake(newMinStake: uint64): void {
        assert(this.txn.sender === this.admin.value);
        this.minStake.value = newMinStake;
    }

    /**
     * Transfer admin role to a new address (admin only).
     */
    transferAdmin(newAdmin: Address): void {
        assert(this.txn.sender === this.admin.value);
        this.admin.value = newAdmin;
    }

    /**
     * Set whether registration is open or closed (admin only).
     */
    setRegistrationOpen(open: uint64): void {
        assert(this.txn.sender === this.admin.value);
        this.registrationOpen.value = open;
    }

    /**
     * Admin removal of an agent (returns stake, admin only).
     */
    adminRemoveAgent(agentAddress: Address): void {
        assert(this.txn.sender === this.admin.value);
        assert(this.agents(agentAddress).exists);

        const agent = this.agents(agentAddress).value;
        const stakeReturn = agent.stake;

        this.agents(agentAddress).delete();
        this.agentCount.value = this.agentCount.value - 1;

        // Return stake to the removed agent
        sendPayment({
            receiver: agentAddress,
            amount: stakeReturn,
        });

        log(EVENT_AGENT_DEREGISTERED);
    }

    // ─── Internal Helpers ───────────────────────────────────────────────────

    /**
     * Compute the reputation tier based on test count and score ratio.
     */
    private computeTier(testCount: uint64, totalScore: uint64, totalMaxScore: uint64): uint64 {
        if (testCount < TESTED_THRESHOLD) return TIER_REGISTERED;

        // Score percentage (0-100)
        let scorePct: uint64 = 0;
        if (totalMaxScore > 0) {
            scorePct = (totalScore * 100) / totalMaxScore;
        }

        if (testCount >= TRUSTED_THRESHOLD && scorePct >= 80) return TIER_TRUSTED;
        if (testCount >= ESTABLISHED_THRESHOLD && scorePct >= 60) return TIER_ESTABLISHED;
        return TIER_TESTED;
    }
}
