/// <reference types="@rbxts/testez/globals" />

import { StatusContainer, defineStatus } from "..";

export = () => {
	describe("defineStatus", () => {
		it("rejects broken definitions and names the status", () => {
			expect(() => defineStatus({ id: "Bad", duration: 0 })).to.throw('status "Bad": duration must be positive');
			expect(() => defineStatus({ id: "Bad", tickInterval: 0 })).to.throw("tickInterval");
			expect(() => defineStatus({ id: "Bad", stacking: { kind: "stack", maxStacks: 1.5 } })).to.throw(
				"maxStacks",
			);
			expect(() => defineStatus({ id: "Bad", stacking: { kind: "refresh", pandemic: 2 } })).to.throw("pandemic");
			expect(() => defineStatus({ id: "Bad", control: { slow: 1.5 } })).to.throw("slow");
			expect(() => defineStatus({ id: "Bad", immunityOnEnd: { tags: ["x"], duration: -1 } })).to.throw(
				"immunityOnEnd",
			);
			expect(() => defineStatus({ id: "" })).to.throw("empty");
		});

		it("rejects bad application options", () => {
			const Haste = defineStatus({ id: "Haste", duration: 4 });
			const container = new StatusContainer("target");

			expect(() => container.apply(Haste, { duration: -1 })).to.throw("duration");
			expect(() => container.apply(Haste, { stacks: 0 })).to.throw("stacks");
			expect(container.has("Haste")).to.equal(false);
		});

		it("hands callbacks a typed target", () => {
			interface Dummy {
				health: number;
			}
			const Wither = defineStatus<undefined, Dummy>({
				id: "Wither",
				duration: 3,
				tickInterval: 1,
				onTick: (effect) => {
					effect.target.health -= 10;
				},
			});
			const dummy: Dummy = { health: 100 };
			const container = new StatusContainer(dummy);

			container.apply(Wither);
			container.update(3);
			expect(dummy.health).to.equal(70);
		});

		it("passes typed params through to callbacks", () => {
			let total = 0;
			const Burn = defineStatus<{ damage: number }>({
				id: "Burn",
				duration: 2,
				tickInterval: 1,
				onTick: (effect) => {
					total += effect.params.damage * effect.stacks;
				},
			});
			const container = new StatusContainer("target");

			container.apply(Burn, { params: { damage: 7 } });
			container.update(5);
			expect(total).to.equal(14);
		});
	});
};
