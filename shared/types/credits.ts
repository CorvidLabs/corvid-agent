export interface CreditBalanceWire {
    walletAddress: string;
    credits: number;
    reserved: number;
    available: number;
    totalPurchased: number;
    totalConsumed: number;
}

export interface CreditTransactionWire {
    id: number;
    walletAddress: string;
    type: string;
    amount: number;
    balanceAfter: number;
    reference: string | null;
    txid: string | null;
    sessionId: string | null;
    createdAt: string;
}

export interface CreditConfigWire {
    creditsPerAlgo: number;
    lowCreditThreshold: number;
    reservePerGroupMessage: number;
    creditsPerTurn: number;
    creditsPerAgentMessage: number;
    freeCreditsOnFirstMessage: number;
}
