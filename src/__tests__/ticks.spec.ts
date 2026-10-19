/// <reference types="@rbxts/testez/globals" />

import { StatusContainer, defineStatus } from "..";

function repeatStep(step: number, total: number): number[] {
	const steps = new Array<number>();
	for (let elapsed = 0; elapsed < total; elapsed += step) {
		steps.push(step);
	}
	return steps;
}

function countTicks(steps: number[]): number {
	let ticks = 0;
	const Dot = defineStatus({
		id: "Dot",
		duration: 3,
		tickInterval: 1,
		onTick: () => {
			ticks++;
		},
	});

	const container = new StatusContainer("target");
	container.apply(Dot);
	for (const step of steps) {
		container.update(step);
	}
	return ticks;
}

function timeline(steps: number[]): string {
	const log = new Array<string>();
	const container = new StatusContainer("target");
	const stamp = (label: string) => log.push(`${label}@${"%.4f".format(container.getTime())}`);

	const Slow = defineStatus({ id: "Slow", duration: 1.25, onExpire: () => stamp("slow-expired") });
	const Poison = defineStatus({
		id: "Poison",
		duration: 1.5,
		tickInterval: 0.5,
		stacking: { kind: "stack", maxStacks: 3, timers: "perStack" },
		onTick: (effect) => stamp(`poison-tick-x${effect.stacks}`),
		onExpire: () => stamp("poison-expired"),
	});
	const Dot = defineStatus({
		id: "Dot",
		duration: 2,
		tickInterval: 0.4,
		onTick: (effect) => {
			stamp("dot-tick");
			if (effect.ticks === 2) {
				container.apply(Poison);
			}
		},
		onExpire: () => {
			stamp("dot-expired");
			container.apply(Slow);
		},
	});

	container.apply(Dot);
	container.apply(Poison);
	for (const step of steps) {
		container.update(step);
	}
	return log.join(",");
}

export = () => {
	describe("ticks", () => {
		it("ticks once per interval, counting the tick that lands on expiry", () => {
			expect(countTicks([10])).to.equal(3);
		});

		it("gets the same count from tiny frames", () => {
			expect(countTicks(repeatStep(1 / 240, 4))).to.equal(3);
		});

		it("catches up several ticks in one large frame", () => {
			expect(countTicks([0.5, 2.6])).to.equal(3);
		});

		it("doesn't tick before the first interval has passed", () => {
			expect(countTicks([0.99])).to.equal(0);
		});

		it("keeps its tick phase when refreshed", () => {
			const times = new Array<string>();
			const container = new StatusContainer("target");
			const Dot = defineStatus({
				id: "Dot",
				duration: 3,
				tickInterval: 1,
				onTick: () => times.push("%.2f".format(container.getTime())),
			});

			container.apply(Dot);
			container.update(2.5);
			container.apply(Dot);
			container.update(10);

			expect(times.join(",")).to.equal("1.00,2.00,3.00,4.00,5.00");
		});

		it("keeps ticking an effect without a duration until it is removed", () => {
			let ticks = 0;
			const Regen = defineStatus({
				id: "Regen",
				tickInterval: 2,
				onTick: () => {
					ticks++;
				},
			});
			const container = new StatusContainer("target");

			container.apply(Regen);
			container.update(100);
			expect(ticks).to.equal(50);

			container.removeById("Regen");
			container.update(100);
			expect(ticks).to.equal(50);
		});

		it("stops ticking an effect that removes itself mid tick", () => {
			let ticks = 0;
			const container = new StatusContainer("target");
			const Fragile = defineStatus({
				id: "Fragile",
				duration: 10,
				tickInterval: 1,
				onTick: (effect) => {
					ticks++;
					if (ticks === 2) {
						container.remove(effect);
					}
				},
			});

			container.apply(Fragile);
			container.update(10);
			expect(ticks).to.equal(2);
		});
	});

	describe("event ordering", () => {
		it("runs events in time order across effects, each at its own timestamp", () => {
			expect(timeline([10])).to.equal(
				"dot-tick@0.4000,poison-tick-x1@0.5000,dot-tick@0.8000,poison-tick-x2@1.0000," +
					"dot-tick@1.2000,poison-tick-x2@1.5000,dot-tick@1.6000,dot-tick@2.0000," +
					"dot-expired@2.0000,poison-tick-x1@2.0000,poison-expired@2.3000,slow-expired@3.2500",
			);
		});

		it("produces the same timeline however the frame time is sliced", () => {
			const coarse = timeline([10]);
			expect(timeline(repeatStep(1 / 60, 10))).to.equal(coarse);
			expect(timeline([0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 8])).to.equal(coarse);
		});
	});
};
