import { Contract } from '@algorandfoundation/tealscript';

// ── Structs ──────────────────────────────────────────────────────────────────

type AgentRecord = {
  name: string;
  endpoint: string;
  metadata: string;
  tier: uint64;
  totalScore: uint64;
  totalMaxScore: uint64;
  testCount: uint64;
  lastHeartbeatRound: uint64;
  registrationRound: uint64;
  stake: uint64;
};

type TestResult = {
  score: uint64;
  maxScore: uint64;
  category: string;
  round: uint64;
};

type Challenge = {
  category: string;
  description: string;
  maxScore: uint64;
  active: uint64;
};

// ── Tier constants ───────────────────────────────────────────────────────────

const TIER_REGISTERED = 1;
const TIER_TESTED = 2;
const TIER_ESTABLISHED = 3;
const TIER_TRUSTED = 4;

// ── Contract ─────────────────────────────────────────────────────────────────

class FlockDirectory extends Contract {
  // ── Global state ─────────────────────────────────────────────────────────

  admin = GlobalStateKey<Address>({ key: 'admin' });

  agentCount = GlobalStateKey<uint64>({ key: 'agent_count' });

  minStake = GlobalStateKey<uint64>({ key: 'min_stake' });

  registrationOpen = GlobalStateKey<uint64>({ key: 'reg_open' });

  challengeCount = GlobalStateKey<uint64>({ key: 'chal_count' });

  // ── Box storage ──────────────────────────────────────────────────────────

  agents = BoxMap<Address, AgentRecord>({ prefix: 'a' });

  testResults = BoxMap<[Address, string], TestResult>({ prefix: 't' });

  challenges = BoxMap<string, Challenge>({ prefix: 'c' });

  // ── Lifecycle ────────────────────────────────────────────────────────────

  createApplication(): void {
    this.admin.value = this.txn.sender;
    this.minStake.value = 1_000_000;
    this.agentCount.value = 0;
    this.challengeCount.value = 0;
    this.registrationOpen.value = 1;
  }

  // ── Agent management ─────────────────────────────────────────────────────

  registerAgent(
    name: string,
    endpoint: string,
    metadata: string,
    payment: PayTxn
  ): void {
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
  }

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
      lastHeartbeatRound: agent.lastHeartbeatRound,
      registrationRound: agent.registrationRound,
      stake: agent.stake,
    };
  }

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
  }

  deregister(): void {
    assert(this.agents(this.txn.sender).exists);

    const agent = this.agents(this.txn.sender).value;
    const stakeAmount = agent.stake;

    this.agents(this.txn.sender).delete();
    this.agentCount.value = this.agentCount.value - 1;

    sendPayment({
      receiver: this.txn.sender,
      amount: stakeAmount,
    });
  }

  // ── Challenge management ─────────────────────────────────────────────────

  createChallenge(
    challengeId: string,
    category: string,
    description: string,
    maxScore: uint64
  ): void {
    assert(this.txn.sender === this.admin.value);
    assert(!this.challenges(challengeId).exists);

    this.challenges(challengeId).value = {
      category: category,
      description: description,
      maxScore: maxScore,
      active: 1,
    };

    this.challengeCount.value = this.challengeCount.value + 1;
  }

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
  }

  // ── Test result recording ────────────────────────────────────────────────

  recordTestResult(
    agentAddress: Address,
    challengeId: string,
    score: uint64
  ): void {
    assert(this.txn.sender === this.admin.value);
    assert(this.agents(agentAddress).exists);
    assert(this.challenges(challengeId).exists);

    const challenge = this.challenges(challengeId).value;
    assert(challenge.active === 1);
    assert(score <= challenge.maxScore);

    // Store the test result
    this.testResults([agentAddress, challengeId]).value = {
      score: score,
      maxScore: challenge.maxScore,
      category: challenge.category,
      round: globals.round,
    };

    // Update agent aggregate scores
    const agent = this.agents(agentAddress).value;
    const newTotalScore = agent.totalScore + score;
    const newTotalMaxScore = agent.totalMaxScore + challenge.maxScore;
    const newTestCount = agent.testCount + 1;

    // Calculate tier based on test count
    const newTier = this.calculateTier(newTestCount);

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
  }

  // ── Read-only queries ────────────────────────────────────────────────────

  getAgentInfo(agentAddress: Address): AgentRecord {
    assert(this.agents(agentAddress).exists);
    return this.agents(agentAddress).value;
  }

  getAgentTier(agentAddress: Address): uint64 {
    assert(this.agents(agentAddress).exists);
    return this.agents(agentAddress).value.tier;
  }

  getAgentScore(agentAddress: Address): uint64 {
    assert(this.agents(agentAddress).exists);
    return this.agents(agentAddress).value.totalScore;
  }

  getAgentTestCount(agentAddress: Address): uint64 {
    assert(this.agents(agentAddress).exists);
    return this.agents(agentAddress).value.testCount;
  }

  getChallengeInfo(challengeId: string): Challenge {
    assert(this.challenges(challengeId).exists);
    return this.challenges(challengeId).value;
  }

  // ── Admin operations ─────────────────────────────────────────────────────

  updateMinStake(newMinStake: uint64): void {
    assert(this.txn.sender === this.admin.value);
    this.minStake.value = newMinStake;
  }

  transferAdmin(newAdmin: Address): void {
    assert(this.txn.sender === this.admin.value);
    this.admin.value = newAdmin;
  }

  setRegistrationOpen(open: uint64): void {
    assert(this.txn.sender === this.admin.value);
    this.registrationOpen.value = open;
  }

  adminRemoveAgent(agentAddress: Address): void {
    assert(this.txn.sender === this.admin.value);
    assert(this.agents(agentAddress).exists);

    const agent = this.agents(agentAddress).value;
    const stakeAmount = agent.stake;

    this.agents(agentAddress).delete();
    this.agentCount.value = this.agentCount.value - 1;

    sendPayment({
      receiver: agentAddress,
      amount: stakeAmount,
    });
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private calculateTier(testCount: uint64): uint64 {
    if (testCount >= 10) return TIER_TRUSTED;
    if (testCount >= 5) return TIER_ESTABLISHED;
    if (testCount >= 1) return TIER_TESTED;
    return TIER_REGISTERED;
  }
}
