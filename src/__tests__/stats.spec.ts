/// <reference types="@rbxts/testez/globals" />

import { StatusContainer, defineStatus } from "..";

export = () => {
	describe("getStat", () => {
		it("folds flat, then increased, then more modifiers", () => {
			const container = new StatusContainer("target");
			container.apply(defineStatus({ id: "Whetstone", modifiers: [{ stat: "damage", kind: "flat", value: 4 }] }));
			container.apply(
				defineStatus({
					id: "Rage",
					modifiers: [
						{ stat: "damage", kind: "increased", value: 0.5 },
						{ stat: "damage", kind: "more", value: 0.2 },
					],
				}),
			);
			container.apply(
				defineStatus({ id: "Focus", modifiers: [{ stat: "damage", kind: "increased", value: 0.25 }] }),
			);
			container.apply(
				defineStatus({ id: "Weakened", modifiers: [{ stat: "damage", kind: "more", value: -0.1 }] }),
			);

			// (16 + 4) * (1 + 0.5 + 0.25) * 1.2 * 0.9
			expect(container.getStat("damage", 16)).to.be.near(37.8);
		});

		it("only touches the stat it names", () => {
			const container = new StatusContainer("target");
			container.apply(
				defineStatus({ id: "Fleet", modifiers: [{ stat: "speed", kind: "increased", value: 0.3 }] }),
			);

			expect(container.getStat("damage", 10)).to.equal(10);
			expect(container.getStat("speed", 16)).to.be.near(20.8);
		});

		it("scales flat and increased with stacks and compounds more per stack", () => {
			const Frenzy = defineStatus({
				id: "Frenzy",
				duration: 5,
				stacking: { kind: "stack", maxStacks: 5 },
				modifiers: [
					{ stat: "attackSpeed", kind: "flat", value: 2 },
					{ stat: "attackSpeed", kind: "increased", value: 0.1 },
					{ stat: "attackSpeed", kind: "more", value: 0.1 },
				],
			});
			const container = new StatusContainer("target");
			container.apply(Frenzy, { stacks: 3 });

			expect(container.getStat("attackSpeed", 10)).to.be.near(16 * 1.3 * 1.331);
		});

		it("never lets increased modifiers push a stat below zero", () => {
			const container = new StatusContainer("target");
			container.apply(
				defineStatus({ id: "Crippled", modifiers: [{ stat: "speed", kind: "increased", value: -1.5 }] }),
			);

			expect(container.getStat("speed", 16)).to.equal(0);
		});

		it("drops modifiers when their effect ends", () => {
			const container = new StatusContainer("target");
			container.apply(
				defineStatus({ id: "Bulwark", duration: 2, modifiers: [{ stat: "armor", kind: "flat", value: 50 }] }),
			);

			expect(container.getStat("armor", 10)).to.equal(60);
			container.update(2.5);
			expect(container.getStat("armor", 10)).to.equal(10);
		});
	});
};
