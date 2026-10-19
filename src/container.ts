import { ActiveEffect, Application, EPSILON } from "./effect";
import { Listeners } from "./listeners";
import {
	ApplyOptions,
	ApplyResult,
	ApplyStatus,
	ContainerOptions,
	ControlKind,
	RemoveReason,
	Stacking,
	StatusDefinition,
	StatusEffect,
} from "./types";

const REFRESH: Stacking = { kind: "refresh" };
const DEFAULT_DIMINISHING_LEVELS = [1, 0.5, 0.25];
const DEFAULT_DIMINISHING_RESET = 18;

interface DiminishingState {
	level: number;
	resetAt: number;
}

export class StatusContainer<T = unknown> {
	private readonly effects = new Array<ActiveEffect<T>>();
	private readonly immunities = new Map<string, number>();
	private readonly diminishing = new Map<string, DiminishingState>();
	private readonly diminishingLevels: ReadonlyArray<number>;
	private readonly diminishingReset: number;
	private readonly slowStacking: "strongest" | "multiplicative";

	private readonly applied = new Listeners<[effect: StatusEffect<unknown, T>]>();
	private readonly refreshed = new Listeners<[effect: StatusEffect<unknown, T>]>();
	private readonly stacksChanged = new Listeners<[effect: StatusEffect<unknown, T>, previous: number]>();
	private readonly removed = new Listeners<[effect: StatusEffect<unknown, T>, reason: RemoveReason]>();

	private now = 0;
	private destroyed = false;

	public constructor(
		public readonly target: T,
		options: ContainerOptions = {},
	) {
		this.diminishingLevels = options.diminishingLevels ?? DEFAULT_DIMINISHING_LEVELS;
		this.diminishingReset = options.diminishingReset ?? DEFAULT_DIMINISHING_RESET;
		this.slowStacking = options.slowStacking ?? "strongest";
	}

	public getTime(): number {
		return this.now;
	}

	public apply(
		definition: StatusDefinition<undefined, T>,
		options?: ApplyOptions<undefined>,
	): ApplyResult<undefined, T>;
	public apply<P>(
		definition: StatusDefinition<P, T>,
		options: ApplyOptions<P> & { readonly params: P },
	): ApplyResult<P, T>;
	public apply<P>(definition: StatusDefinition<P, T>, options?: ApplyOptions<P>): ApplyResult<P, T> {
		if (this.destroyed) {
			throw `can't apply "${definition.id}", the container was destroyed`;
		}

		const tags = definition.tags;
		if (tags !== undefined) {
			for (const tag of tags) {
				if (this.isImmune(tag)) {
					return { status: "immune" };
				}
			}
		}

		let duration = options?.duration ?? definition.duration ?? math.huge;
		const stacks = options?.stacks ?? 1;
		if (!(duration > 0)) {
			throw `can't apply "${definition.id}" with a duration of ${duration}`;
		}
		if (!(stacks >= 1 && stacks % 1 === 0)) {
			throw `can't apply "${definition.id}" with ${stacks} stacks`;
		}

		const category = definition.diminishing;
		if (category !== undefined) {
			const multiplier = this.diminishingMultiplier(category);
			if (multiplier <= 0) {
				return { status: "diminished" };
			}
			duration *= multiplier;
		}

		const application: Application = {
			source: options?.source,
			params: options?.params,
			strength: options?.strength ?? 0,
			stacks,
			duration,
		};

		const generic = definition as unknown as StatusDefinition<unknown, T>;
		const stacking = definition.stacking ?? REFRESH;
		let effect: ActiveEffect<T> | undefined;
		let status: ApplyStatus = "applied";
		let previousStacks = 0;

		if (stacking.kind === "refresh") {
			effect = this.find(definition.id);
			if (effect !== undefined) {
				// pandemic: refreshing early keeps part of what was left instead of throwing it away
				const carried = math.min(effect.getRemaining(), (stacking.pandemic ?? 0) * duration);
				effect.renew(application, duration + carried);
				status = "refreshed";
			}
		} else if (stacking.kind === "stack") {
			effect = this.find(definition.id);
			if (effect !== undefined) {
				previousStacks = effect.stacks;
				effect.addStacks(application, stacking.maxStacks);
				status = effect.stacks !== previousStacks ? "stacked" : "refreshed";
			}
		} else if (stacking.kind === "independent") {
			effect = stacking.perSource ? this.findFromSource(definition.id, application.source) : undefined;
			if (effect !== undefined) {
				effect.renew(application, duration);
				status = "refreshed";
			}
		} else {
			const existing = this.find(definition.id);
			if (existing !== undefined) {
				if (application.strength < existing.strength) {
					return { status: "weaker", effect: existing as unknown as StatusEffect<P, T> };
				} else if (application.strength > existing.strength) {
					this.finish(existing, "replaced");
					status = "replaced";
				} else {
					existing.renew(application, duration);
					effect = existing;
					status = "refreshed";
				}
			}
		}

		if (effect === undefined) {
			effect = new ActiveEffect(generic, this.target, this, application);
			this.effects.push(effect);
		}

		if (category !== undefined) {
			this.commitDiminishing(category, effect.expiresAt);
		}

		if (status === "applied" || status === "replaced") {
			generic.onApply?.(effect);
			this.applied.fire(effect);
		} else if (status === "stacked") {
			this.stacksChanged.fire(effect, previousStacks);
		} else {
			this.refreshed.fire(effect);
		}

		return { status, effect: effect as unknown as StatusEffect<P, T> };
	}

	public update(deltaTime: number): void {
		if (this.destroyed) {
			return;
		}

		// events run in time order across every effect, each at its own timestamp, so the outcome
		// doesn't depend on how the frame time was sliced
		const target = this.now + deltaTime;
		while (true) {
			let due: ActiveEffect<T> | undefined;
			for (const effect of this.effects) {
				if (effect.active) {
					effect.schedule();
					if (effect.nextAt <= target + EPSILON && (due === undefined || effect.nextAt < due.nextAt)) {
						due = effect;
					}
				}
			}
			if (due === undefined) {
				break;
			}

			this.now = math.max(this.now, due.nextAt);
			this.process(due);
		}

		this.now = math.max(this.now, target);
		this.compact();
	}

	public remove(effect: StatusEffect<unknown, unknown>): boolean {
		for (const candidate of this.effects) {
			if (candidate === effect && candidate.active) {
				this.finish(candidate, "removed");
				return true;
			}
		}
		return false;
	}

	public removeById(id: string): number {
		return this.finishWhere((effect) => effect.definition.id === id, "removed");
	}

	public cleanse(tag: string): number {
		return this.finishWhere((effect) => effect.definition.tags?.includes(tag) === true, "cleansed");
	}

	public clear(): void {
		this.finishWhere(() => true, "cleared");
	}

	public destroy(): void {
		if (this.destroyed) {
			return;
		}
		this.clear();
		this.destroyed = true;
		this.applied.clear();
		this.refreshed.clear();
		this.stacksChanged.clear();
		this.removed.clear();
	}

	public has(id: string): boolean {
		return this.find(id) !== undefined;
	}

	public get(id: string): StatusEffect<unknown, T> | undefined {
		return this.find(id);
	}

	public getEffects(id?: string): StatusEffect<unknown, T>[] {
		const result = new Array<StatusEffect<unknown, T>>();
		for (const effect of this.effects) {
			if (effect.active && (id === undefined || effect.definition.id === id)) {
				result.push(effect);
			}
		}
		return result;
	}

	public getStacks(id: string): number {
		let stacks = 0;
		for (const effect of this.effects) {
			if (effect.active && effect.definition.id === id) {
				stacks += effect.stacks;
			}
		}
		return stacks;
	}

	public grantImmunity(tag: string, duration = math.huge): void {
		const expiresAt = this.now + duration;
		const current = this.immunities.get(tag);
		if (current === undefined || expiresAt > current) {
			this.immunities.set(tag, expiresAt);
		}
	}

	public revokeImmunity(tag: string): void {
		this.immunities.delete(tag);
	}

	public isImmune(tag: string): boolean {
		const expiresAt = this.immunities.get(tag);
		if (expiresAt === undefined) {
			return false;
		}
		if (this.now < expiresAt - EPSILON) {
			return true;
		}
		this.immunities.delete(tag);
		return false;
	}

	public hasControl(kind: ControlKind): boolean {
		for (const effect of this.effects) {
			if (effect.active && effect.definition.control?.[kind] === true) {
				return true;
			}
		}
		return false;
	}

	public getSlow(): number {
		let strongest = 0;
		let unslowed = 1;
		for (const effect of this.effects) {
			const slow = effect.active ? effect.definition.control?.slow : undefined;
			if (slow !== undefined) {
				const amount = math.min(slow * effect.stacks, 1);
				strongest = math.max(strongest, amount);
				unslowed *= 1 - amount;
			}
		}
		return this.slowStacking === "multiplicative" ? 1 - unslowed : strongest;
	}

	public getMoveSpeedMultiplier(): number {
		if (this.hasControl("stun") || this.hasControl("root")) {
			return 0;
		}
		return 1 - this.getSlow();
	}

	public getStat(stat: string, base: number): number {
		let flat = 0;
		let increased = 0;
		let more = 1;

		for (const effect of this.effects) {
			const modifiers = effect.active ? effect.definition.modifiers : undefined;
			if (modifiers === undefined) {
				continue;
			}
			for (const modifier of modifiers) {
				if (modifier.stat !== stat) {
					continue;
				}
				if (modifier.kind === "flat") {
					flat += modifier.value * effect.stacks;
				} else if (modifier.kind === "increased") {
					increased += modifier.value * effect.stacks;
				} else {
					more *= (1 + modifier.value) ** effect.stacks;
				}
			}
		}

		// (base + flat) * (1 + sum of increased) * product of more, increased can't flip the sign
		return (base + flat) * math.max(1 + increased, 0) * more;
	}

	public onApplied(listener: (effect: StatusEffect<unknown, T>) => void): () => void {
		return this.applied.connect(listener);
	}

	public onRefreshed(listener: (effect: StatusEffect<unknown, T>) => void): () => void {
		return this.refreshed.connect(listener);
	}

	public onStacksChanged(listener: (effect: StatusEffect<unknown, T>, previous: number) => void): () => void {
		return this.stacksChanged.connect(listener);
	}

	public onRemoved(listener: (effect: StatusEffect<unknown, T>, reason: RemoveReason) => void): () => void {
		return this.removed.connect(listener);
	}

	private process(effect: ActiveEffect<T>): void {
		if (effect.nextKind === "tick") {
			effect.ticks += 1;
			effect.definition.onTick?.(effect);
		} else if (effect.nextKind === "stack") {
			const previous = effect.stacks;
			effect.dropOldestStack();
			this.stacksChanged.fire(effect, previous);
		} else {
			this.finish(effect, "expired");
		}
	}

	private finish(effect: ActiveEffect<T>, reason: RemoveReason): void {
		if (!effect.active) {
			return;
		}
		effect.active = false;

		const definition = effect.definition;
		if (reason !== "replaced") {
			if (definition.diminishing !== undefined && reason !== "expired") {
				this.resetDiminishingFrom(definition.diminishing);
			}
			// granted before any callback runs, so a callback reapplying the effect is already blocked
			const immunity = definition.immunityOnEnd;
			if (immunity !== undefined) {
				for (const tag of immunity.tags) {
					this.grantImmunity(tag, immunity.duration);
				}
			}
		}

		if (reason === "expired") {
			definition.onExpire?.(effect);
		}
		definition.onRemove?.(effect, reason);
		this.removed.fire(effect, reason);
	}

	private finishWhere(predicate: (effect: ActiveEffect<T>) => boolean, reason: RemoveReason): number {
		let count = 0;
		// callbacks may apply new effects while this runs, so walk a snapshot
		for (const effect of [...this.effects]) {
			if (effect.active && predicate(effect)) {
				this.finish(effect, reason);
				count++;
			}
		}
		return count;
	}

	private find(id: string): ActiveEffect<T> | undefined {
		for (const effect of this.effects) {
			if (effect.active && effect.definition.id === id) {
				return effect;
			}
		}
		return undefined;
	}

	private findFromSource(id: string, source: unknown): ActiveEffect<T> | undefined {
		for (const effect of this.effects) {
			if (effect.active && effect.definition.id === id && effect.source === source) {
				return effect;
			}
		}
		return undefined;
	}

	private diminishingMultiplier(category: string): number {
		const state = this.diminishing.get(category);
		const level = state === undefined || this.now >= state.resetAt - EPSILON ? 0 : state.level;
		const levels = this.diminishingLevels;
		return level < levels.size() ? levels[level] : 0;
	}

	private commitDiminishing(category: string, expiresAt: number): void {
		let state = this.diminishing.get(category);
		if (state === undefined || this.now >= state.resetAt - EPSILON) {
			state = { level: 0, resetAt: 0 };
			this.diminishing.set(category, state);
		}
		state.level += 1;
		state.resetAt = math.max(state.resetAt, expiresAt + this.diminishingReset);
	}

	// the reset window runs from when the last effect in the category ends, so an early removal
	// pulls it in unless another effect of that category is still running
	private resetDiminishingFrom(category: string): void {
		const state = this.diminishing.get(category);
		if (state === undefined) {
			return;
		}
		let resetAt = this.now + this.diminishingReset;
		for (const effect of this.effects) {
			if (effect.active && effect.definition.diminishing === category) {
				resetAt = math.max(resetAt, effect.expiresAt + this.diminishingReset);
			}
		}
		state.resetAt = math.min(state.resetAt, resetAt);
	}

	private compact(): void {
		const effects = this.effects;
		let kept = 0;
		for (let index = 0; index < effects.size(); index++) {
			const effect = effects[index];
			if (effect.active) {
				effects[kept] = effect;
				kept++;
			}
		}
		while (effects.size() > kept) {
			effects.pop();
		}
	}
}
