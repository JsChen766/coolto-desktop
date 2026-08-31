import { randomUUID } from "node:crypto";

export interface CreditRequestMetadata {
  operationType: string;
  scenarioRunId?: string;
  operationRunId: string;
  requestId: string;
}

export interface CreditOperationSelection {
  operationType?: string;
  scenarioRunId?: string;
  operationRunId?: string;
}

interface ActiveCreditOperation {
  operationType: string;
  scenarioRunId?: string;
  operationRunId: string;
}

export class CreditOperationContext {
  #active: ActiveCreditOperation | undefined;

  public constructor(
    private readonly fallbackOperationType: string,
    private readonly createId: () => string = randomUUID,
    private readonly defaultScenarioRunId?: string,
  ) {}

  public begin(selection: CreditOperationSelection = {}): void {
    this.#active = this.#createActive(selection);
  }

  public nextRequestMetadata(): CreditRequestMetadata {
    this.#active ??= this.#createActive({});
    return {
      ...this.#active,
      requestId: this.createId(),
    };
  }

  #createActive(selection: CreditOperationSelection): ActiveCreditOperation {
    const scenarioRunId =
      selection.scenarioRunId ?? this.defaultScenarioRunId;
    return {
      operationType: selection.operationType ?? this.fallbackOperationType,
      ...(scenarioRunId ? { scenarioRunId } : {}),
      operationRunId: selection.operationRunId ?? this.createId(),
    };
  }
}
