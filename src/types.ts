export type RemoveReason = "expired" | "removed" | "cleansed" | "replaced" | "cleared";

export type ApplyStatus = "applied" | "refreshed" | "stacked" | "replaced" | "weaker" | "immune" | "diminished";

export type ControlKind = "stun" | "root" | "silence";

export interface StatModifier {
	readonly stat: string;
	readonly kind: "flat" | "increased" | "more";
	readonly value: number;
}

export interface CrowdControl {
	readonly stun?: boolean;
	readonly root?: boolean;
	readonly silence?: boolean;
	readonly slow?: number;
}

export type Stacking =
	| { readonly kind: "refresh"; readonly pandemic?: number }
	| { readonly kind: "stack"; readonly maxStacks: number; readonly timers?: "shared" | "perStack" }
	| { readonly kind: "independent"; readonly perSource?: boolean }
	| { readonly kind: "strongest" };

export interface StatusEffect<P = undefined, T = unknown> {
	readonly id: string;
	readonly target: T;
	readonly source: unknown;
	readonly params: P;
	readonly stacks: number;
	readonly strength: number;
	readonly ticks: number;
	readonly appliedAt: number;
	readonly duration: number;
	readonly expiresAt: number;
	readonly active: boolean;
	getRemaining(): number;
}

export interface StatusDefinition<P = undefined, T = unknown> {
	readonly id: string;
	readonly duration?: number;
	readonly tickInterval?: number;
	readonly stacking?: Stacking;
	readonly modifiers?: ReadonlyArray<StatModifier>;
	readonly control?: CrowdControl;
	/** diminishing returns category, e.g. "stun" */
	readonly diminishing?: string;
	readonly tags?: ReadonlyArray<string>;
	readonly immunityOnEnd?: { readonly tags: ReadonlyArray<string>; readonly duration: number };

	readonly onApply?: (effect: StatusEffect<P, T>) => void;
	readonly onTick?: (effect: StatusEffect<P, T>) => void;
	readonly onExpire?: (effect: StatusEffect<P, T>) => void;
	readonly onRemove?: (effect: StatusEffect<P, T>, reason: RemoveReason) => void;
}

export interface ApplyOptions<P> {
	readonly source?: unknown;
	readonly params?: P;
	readonly duration?: number;
	readonly stacks?: number;
	readonly strength?: number;
}

export interface ApplyResult<P = undefined, T = unknown> {
	readonly status: ApplyStatus;
	readonly effect?: StatusEffect<P, T>;
}

export interface ContainerOptions {
	/** duration multiplier for the 1st, 2nd, 3rd... application inside a reset window, immune after the last */
	readonly diminishingLevels?: ReadonlyArray<number>;
	readonly diminishingReset?: number;
	readonly slowStacking?: "strongest" | "multiplicative";
}
