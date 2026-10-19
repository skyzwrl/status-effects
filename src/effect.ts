import { StatusDefinition, StatusEffect } from "./types";

export const EPSILON = 1e-6;

export interface Clock {
	getTime(): number;
}

export interface Application {
	readonly source: unknown;
	readonly params: unknown;
	readonly strength: number;
	readonly stacks: number;
	readonly duration: number;
}

export type EventKind = "tick" | "stack" | "end";

export class ActiveEffect<T> implements StatusEffect<unknown, T> {
	public readonly id: string;
	public active = true;
	public ticks = 0;
	public stacks: number;
	public source: unknown;
	public params: unknown;
	public strength: number;
	public duration: number;
	public expiresAt: number;
	public readonly appliedAt: number;

	// per stack timers only, sorted ascending; the last entry is the effect's own expiry
	public stackExpiries?: number[];

	public nextAt = math.huge;
	public nextKind: EventKind = "end";

	public constructor(
		public readonly definition: StatusDefinition<unknown, T>,
		public readonly target: T,
		private readonly clock: Clock,
		application: Application,
	) {
		const now = clock.getTime();
		const stacking = definition.stacking;

		this.id = definition.id;
		this.source = application.source;
		this.params = application.params;
		this.strength = application.strength;
		this.duration = application.duration;
		this.appliedAt = now;
		this.expiresAt = now + application.duration;
		this.stacks = stacking?.kind === "stack" ? math.min(application.stacks, stacking.maxStacks) : 1;

		if (stacking?.kind === "stack" && stacking.timers === "perStack") {
			const expiries = new Array<number>();
			for (let i = 0; i < this.stacks; i++) {
				expiries.push(this.expiresAt);
			}
			this.stackExpiries = expiries;
		}
	}

	public getRemaining(): number {
		return math.max(this.expiresAt - this.clock.getTime(), 0);
	}

	public renew(application: Application, duration: number): void {
		this.source = application.source;
		this.params = application.params;
		this.strength = application.strength;
		this.duration = duration;
		this.expiresAt = this.clock.getTime() + duration;
	}

	public addStacks(application: Application, maxStacks: number): void {
		this.renew(application, application.duration);

		const expiries = this.stackExpiries;
		if (expiries === undefined) {
			this.stacks = math.min(this.stacks + application.stacks, maxStacks);
			return;
		}

		const expiresAt = this.expiresAt;
		for (let added = 0; added < application.stacks; added++) {
			let index = expiries.size();
			while (index > 0 && expiries[index - 1] > expiresAt) {
				index--;
			}
			expiries.insert(index, expiresAt);
		}
		// at the cap a new stack pushes out the one closest to running out
		while (expiries.size() > maxStacks) {
			expiries.shift();
		}

		this.stacks = expiries.size();
		this.expiresAt = expiries[expiries.size() - 1];
	}

	public dropOldestStack(): void {
		this.stackExpiries?.shift();
		this.stacks -= 1;
	}

	public schedule(): void {
		const interval = this.definition.tickInterval;
		const expiresAt = this.expiresAt;
		// tick times come from multiplying, not accumulating, so long effects don't drift
		const nextTick = interval !== undefined ? this.appliedAt + (this.ticks + 1) * interval : math.huge;
		const expiries = this.stackExpiries;
		const nextStack = expiries !== undefined && expiries.size() > 1 ? expiries[0] : math.huge;

		// a tick due at the same moment as an expiry still counts, so 3s with 1s ticks is 3 ticks
		if (nextTick <= expiresAt + EPSILON && nextTick <= nextStack + EPSILON) {
			this.nextAt = nextTick;
			this.nextKind = "tick";
		} else if (nextStack < expiresAt) {
			this.nextAt = nextStack;
			this.nextKind = "stack";
		} else {
			this.nextAt = expiresAt;
			this.nextKind = "end";
		}
	}
}
