/// <reference types="@rbxts/testez/globals" />

import { StatusContainer, defineStatus } from "..";

export = () => {
	describe("refresh", () => {
		const Haste = defineStatus({ id: "Haste", duration: 10 });

		it("resets the timer without adding stacks", () => {
			const container = new StatusContainer("target");
			expect(container.apply(Haste).status).to.equal("applied");
			container.update(6);

			const result = container.apply(Haste);
			expect(result.status).to.equal("refreshed");
			expect(result.effect!.stacks).to.equal(1);
			expect(result.effect!.getRemaining()).to.be.near(10);

			container.update(9.9);
			expect(container.has("Haste")).to.equal(true);
			container.update(0.2);
			expect(container.has("Haste")).to.equal(false);
		});

		it("carries part of the remaining time over with pandemic", () => {
			const Corrode = defineStatus({ id: "Corrode", duration: 10, stacking: { kind: "refresh", pandemic: 0.3 } });
			const container = new StatusContainer("target");

			container.apply(Corrode);
			container.update(8);
			expect(container.apply(Corrode).effect!.getRemaining()).to.be.near(12);

			container.update(1);
			expect(container.apply(Corrode).effect!.getRemaining()).to.be.near(13);
		});
	});

	describe("stack with shared timers", () => {
		const Bleed = defineStatus({ id: "Bleed", duration: 5, stacking: { kind: "stack", maxStacks: 3 } });

		it("adds stacks up to the cap and refreshes them together", () => {
			const container = new StatusContainer("target");
			expect(container.apply(Bleed).status).to.equal("applied");
			container.update(2);
			expect(container.apply(Bleed).status).to.equal("stacked");
			container.update(2);
			expect(container.apply(Bleed, { stacks: 2 }).status).to.equal("stacked");
			expect(container.getStacks("Bleed")).to.equal(3);

			expect(container.apply(Bleed).status).to.equal("refreshed");
			expect(container.getStacks("Bleed")).to.equal(3);

			container.update(4.9);
			expect(container.getStacks("Bleed")).to.equal(3);
			container.update(0.2);
			expect(container.has("Bleed")).to.equal(false);
		});

		it("clamps a fresh application to the cap", () => {
			const container = new StatusContainer("target");
			expect(container.apply(Bleed, { stacks: 5 }).effect!.stacks).to.equal(3);
		});
	});

	describe("stack with per stack timers", () => {
		const Poison = defineStatus({
			id: "Poison",
			duration: 4,
			stacking: { kind: "stack", maxStacks: 3, timers: "perStack" },
		});

		it("lets each stack run out on its own", () => {
			const container = new StatusContainer("target");
			container.apply(Poison);
			container.update(1);
			container.apply(Poison);
			container.update(1);
			container.apply(Poison);
			expect(container.getStacks("Poison")).to.equal(3);

			container.update(2.1);
			expect(container.getStacks("Poison")).to.equal(2);
			container.update(1);
			expect(container.getStacks("Poison")).to.equal(1);
			container.update(1);
			expect(container.has("Poison")).to.equal(false);
		});

		it("pushes out the stack closest to expiring when capped", () => {
			const container = new StatusContainer("target");
			container.apply(Poison, { stacks: 3 });
			container.update(3);

			expect(container.apply(Poison).status).to.equal("refreshed");
			expect(container.getStacks("Poison")).to.equal(3);

			container.update(1.1);
			expect(container.getStacks("Poison")).to.equal(1);
			container.update(3);
			expect(container.has("Poison")).to.equal(false);
		});

		it("reports every stack change", () => {
			const container = new StatusContainer("target");
			const changes: string[] = [];
			container.onStacksChanged((effect, previous) => changes.push(`${previous}>${effect.stacks}`));

			container.apply(Poison);
			container.update(1);
			container.apply(Poison);
			container.update(1);
			container.apply(Poison);
			container.update(5);

			expect(changes.join(",")).to.equal("1>2,2>3,3>2,2>1");
		});
	});

	describe("independent", () => {
		it("keeps every application separate", () => {
			const Mark = defineStatus({ id: "Mark", duration: 3, stacking: { kind: "independent" } });
			const container = new StatusContainer("target");

			container.apply(Mark, { source: "a" });
			container.update(1);
			expect(container.apply(Mark, { source: "a" }).status).to.equal("applied");
			expect(container.getEffects("Mark").size()).to.equal(2);

			container.update(2.1);
			expect(container.getEffects("Mark").size()).to.equal(1);
		});

		it("refreshes per source when asked to", () => {
			const Burn = defineStatus({
				id: "Burn",
				duration: 3,
				stacking: { kind: "independent", perSource: true },
			});
			const container = new StatusContainer("target");

			expect(container.apply(Burn, { source: "a" }).status).to.equal("applied");
			expect(container.apply(Burn, { source: "b" }).status).to.equal("applied");
			container.update(2);
			expect(container.apply(Burn, { source: "a" }).status).to.equal("refreshed");
			expect(container.getStacks("Burn")).to.equal(2);

			container.update(1.5);
			const left = container.getEffects("Burn");
			expect(left.size()).to.equal(1);
			expect(left[0].source).to.equal("a");
		});
	});

	describe("strongest", () => {
		const Shield = defineStatus({ id: "Shield", duration: 5, stacking: { kind: "strongest" } });

		it("ignores weaker, refreshes equal and replaces with stronger applications", () => {
			const container = new StatusContainer("target");
			const removed: string[] = [];
			container.onRemoved((effect, reason) => removed.push(`${effect.strength}:${reason}`));

			container.apply(Shield, { strength: 50 });
			container.update(2);

			const weaker = container.apply(Shield, { strength: 20 });
			expect(weaker.status).to.equal("weaker");
			expect(weaker.effect!.strength).to.equal(50);
			expect(weaker.effect!.getRemaining()).to.be.near(3);

			expect(container.apply(Shield, { strength: 50 }).status).to.equal("refreshed");
			expect(container.get("Shield")!.getRemaining()).to.be.near(5);

			const stronger = container.apply(Shield, { strength: 80 });
			expect(stronger.status).to.equal("replaced");
			expect(stronger.effect!.strength).to.equal(80);
			expect(container.getEffects("Shield").size()).to.equal(1);
			expect(removed.join(",")).to.equal("50:replaced");
		});
	});
};
