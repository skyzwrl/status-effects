import { StatusDefinition } from "./types";

const MIN_TICK_INTERVAL = 1e-3;

function isPositive(value: number | undefined): boolean {
	return value === undefined || value > 0;
}

function isFraction(value: number | undefined): boolean {
	return value === undefined || (value >= 0 && value <= 1);
}

export function defineStatus<P = undefined, T = unknown>(definition: StatusDefinition<P, T>): StatusDefinition<P, T> {
	const { id, duration, tickInterval, stacking, control, immunityOnEnd } = definition;
	const fail = (problem: string) => {
		throw `status "${id}": ${problem}`;
	};

	if (id === "") {
		fail("id can't be empty");
	}
	if (!isPositive(duration)) {
		fail("duration must be positive");
	}
	if (tickInterval !== undefined && !(tickInterval >= MIN_TICK_INTERVAL)) {
		fail(`tickInterval must be at least ${MIN_TICK_INTERVAL}`);
	}
	if (stacking?.kind === "stack" && !(stacking.maxStacks >= 1 && stacking.maxStacks % 1 === 0)) {
		fail("maxStacks must be a whole number of at least 1");
	}
	if (stacking?.kind === "refresh" && !isFraction(stacking.pandemic)) {
		fail("pandemic must be between 0 and 1");
	}
	if (!isFraction(control?.slow)) {
		fail("slow must be between 0 and 1");
	}
	if (immunityOnEnd !== undefined && !isPositive(immunityOnEnd.duration)) {
		fail("immunityOnEnd duration must be positive");
	}

	return definition;
}
