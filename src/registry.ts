export type MeshModel = {
  id: string;
  available: boolean;
  contextWindow: number;
  parameters: Set<string>;
};

export class ModelRegistry {
  private models = new Map<string, MeshModel>();

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}

  async refresh(): Promise<void> {
    const response = await fetch(
      `${this.baseUrl.replace(/\/$/, "")}/v1/models`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`FreeLLMAPI registry failed: HTTP ${response.status}`);
    }

    const body = await response.json() as {
      data?: Array<{
        id: string;
        available?: boolean;
        context_window?: number;
        supported_parameters?: string[];
      }>;
    };

    this.models.clear();

    for (const model of body.data ?? []) {
      this.models.set(model.id, {
        id: model.id,
        available: model.available !== false,
        contextWindow: model.context_window ?? 0,
        parameters: new Set(model.supported_parameters ?? []),
      });
    }
  }

  get(id: string): MeshModel | undefined {
    return this.models.get(id);
  }

  available(): MeshModel[] {
    return [...this.models.values()].filter(m => m.available);
  }

  capable(...parameters: string[]): MeshModel[] {
    return this.available().filter(model =>
      parameters.every(parameter => model.parameters.has(parameter))
    );
  }

  has(id: string): boolean {
    return this.models.get(id)?.available === true;
  }

  ranked(
    required: string[] = [],
    minimumContext = 0,
    excluded: string[] = []
  ): MeshModel[] {
    const excludedSet = new Set(excluded);

    return this.available()
      .filter(model =>
        !excludedSet.has(model.id) &&
        model.contextWindow >= minimumContext &&
        required.every(p => model.parameters.has(p))
      )
      .sort((a, b) => {
        if (b.contextWindow !== a.contextWindow) {
          return b.contextWindow - a.contextWindow;
        }

        return a.id.localeCompare(b.id);
      });
  }

  best(
    required: string[] = [],
    minimumContext = 0,
    excluded: string[] = []
  ): MeshModel | undefined {
    return this.ranked(
      required,
      minimumContext,
      excluded
    )[0];
  }
}
